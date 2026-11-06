import {
  CLOSE_REASONS,
  ESCALATION_TARGETS,
  HOLD_REASONS,
  isDone,
  PAUSED_STATUSES,
  RESOLUTION_TYPES,
  SUPPORT_AGENT_NAMES,
  teamOfAgent,
} from '@/config/support-desk';
import type {
  CreateIssuePayload,
  IssueCategory,
  IssueMessage,
  IssueStatus,
  IssueTransitionPayload,
  IssueView,
  MessageKind,
  SupportTeam,
  TimelineEntry,
  UpdateIssuePayload,
} from '@/types';

import { audit, conversations, issueEvents, issues, ME, type IssueRow } from '../db';
import { inDateRange, mock, MockHttpError, paginate } from '@edutrack/web-core/mock';
import { findSchool, requireText, toIssue } from './shared';
import { isOverdue, setStatus } from './support-sla';

const findIssue = (id: string) => {
  const issue = issues.find((i) => i.id === id);
  if (!issue) throw new MockHttpError(404, 'Issue not found');
  return issue;
};

function addEvent(
  id: string,
  title: string,
  { tone = 'info', internal = false }: { tone?: TimelineEntry['tone']; internal?: boolean } = {},
) {
  issueEvents.set(id, [
    ...(issueEvents.get(id) ?? []),
    {
      id: `ev${Date.now()}${Math.random()}`,
      title,
      detail: `${ME.name} · ${internal ? 'internal' : 'school can see'}`,
      when: 'Just now',
      tone,
    },
  ]);
}

/** The conversation, starting with the school's original request. */
function messagesOf(row: IssueRow): IssueMessage[] {
  const [author = 'School', authorRole = 'School'] = row.requester.split(' · ');
  return (
    conversations.get(row.id) ?? [
      {
        id: 'm0',
        author,
        authorRole: `${authorRole} · ${toIssue(row).schoolName}`,
        when: row.createdAt,
        text: row.description ?? 'Raised by the school. See the subject for details.',
        kind: 'school',
      },
    ]
  );
}

function addMessage(id: string, kind: MessageKind, text: string) {
  conversations.set(id, [
    ...messagesOf(findIssue(id)),
    {
      id: `m${Date.now()}${Math.random()}`,
      author: ME.name,
      authorRole: kind === 'note' ? 'Internal note' : 'Support',
      when: 'Just now',
      text,
      kind,
    },
  ]);
}

const logIssue = (row: IssueRow, summary: string, previous: string, next: string) =>
  audit({
    summary: `${summary} · ${row.id}`,
    action: 'issue.update',
    entity: 'Issue',
    entityId: row.id,
    schoolName: toIssue(row).schoolName,
    previous,
    next,
  });

/** The team a new ticket is routed to, from its category. */
const routeTeam = (category: IssueCategory): SupportTeam =>
  ['Billing', 'Subscription'].includes(category)
    ? 'Billing'
    : ['Technical', 'Access'].includes(category)
      ? 'Technical'
      : 'Tier 1 Support';

const VIEWS: Record<IssueView, (i: IssueRow) => boolean> = {
  all: () => true,
  open: (i) => !isDone(i.status),
  unassigned: (i) => !i.assignee && !isDone(i.status),
  mine: (i) => i.assignee === ME.name && !isDone(i.status),
  overdue: isOverdue,
  waiting: (i) => PAUSED_STATUSES.includes(i.status),
  escalated: (i) => i.status === 'Escalated',
  resolved: (i) => i.status === 'Resolved',
  closed: (i) => i.status === 'Closed',
};

/** Which status each status can move to through POST /transitions. */
const NEXT: Record<IssueStatus, IssueStatus[]> = {
  Open: ['Closed'],
  Reopened: ['Closed'],
  Assigned: ['In Progress', 'Escalated'],
  'In Progress': ['Resolved', 'Waiting for School', 'On Hold', 'Escalated'],
  'Waiting for School': ['In Progress', 'Resolved'],
  'On Hold': ['In Progress', 'Resolved'],
  Escalated: ['In Progress', 'Resolved'],
  Resolved: ['Closed', 'Reopened'],
  Closed: ['Reopened'],
};

function pick(options: [string, string][], value: string | undefined, message: string) {
  if (!value || !options.some(([label]) => label === value)) throw new MockHttpError(422, message);
  return value;
}

mock.get('/v1/support/summary', () => {
  const rated = issues.filter((i) => i.rating);
  return {
    open: issues.filter(VIEWS.open).length,
    unassigned: issues.filter(VIEWS.unassigned).length,
    overdue: issues.filter(VIEWS.overdue).length,
    escalated: issues.filter(VIEWS.escalated).length,
    satisfaction: rated.length
      ? rated.reduce((sum, i) => sum + i.rating!.score, 0) / rated.length
      : null,
    ratings: rated.length,
    views: {
      open: issues.filter(VIEWS.open).length,
      unassigned: issues.filter(VIEWS.unassigned).length,
      mine: issues.filter(VIEWS.mine).length,
      overdue: issues.filter(VIEWS.overdue).length,
    },
    agentLoad: Object.fromEntries(
      SUPPORT_AGENT_NAMES.map((name) => [
        name,
        issues.filter((i) => i.assignee === name && !isDone(i.status)).length,
      ]),
    ),
    weeklyVolume: [
      ['Wk 45', 18],
      ['Wk 46', 22],
      ['Wk 47', 15],
      ['Wk 48', 26],
      ['Wk 49', 11],
    ].map(([label, value]) => ({ label, value })),
    byCategory: [
      ['Technical', 31],
      ['Academic', 24],
      ['Billing', 14],
      ['Access', 11],
      ['Finance', 9],
      ['Account', 6],
      ['Subscription', 5],
    ].map(([label, percent]) => ({ label, percent })),
    topSchools: [
      ['Kingsway International', 9],
      ['Brookfield Schools', 7],
      ['Unity Model College', 5],
      ['Greenfield Academy', 4],
    ].map(([label, value]) => ({ label, value })),
  };
});

mock.get('/v1/support/issues', ({ query }) => {
  const inView = VIEWS[(query.view as IssueView) ?? 'open'] ?? VIEWS.open;
  const rows = issues
    .filter(
      (i) =>
        inView(i) &&
        (!query.priority || i.priority === query.priority) &&
        (!query.category || i.category === query.category) &&
        (!query.schoolId || i.schoolId === query.schoolId) &&
        (!query.assignee ||
          (query.assignee === 'Unassigned' ? !i.assignee : i.assignee === query.assignee)) &&
        inDateRange(i.createdAt, query.dateFrom, query.dateTo),
    )
    .map(toIssue);
  return paginate(rows, query, (i) => `${i.id} ${i.subject} ${i.schoolName}`);
});

mock.get('/v1/support/issues/:id', ({ params }) => {
  const issue = findIssue(params.id!);
  const author = issue.requester.split(' · ')[0] ?? 'the school';
  const messages = messagesOf(issue);
  const events: TimelineEntry[] = [
    {
      id: 'created',
      title: 'Created',
      detail: `by ${author} · routed to ${issue.team}`,
      when: issue.createdAt,
      tone: 'info',
    },
    ...(issueEvents.get(issue.id) ?? []),
  ];
  return { ...toIssue(issue), messages, events };
});

mock.post('/v1/support/issues', ({ body }) => {
  const p = body as CreateIssuePayload;
  const school = findSchool(p.schoolId);
  const id = `SUP-${1183 + issues.filter((i) => i.createdAt === 'Just now').length}`;
  const team = teamOfAgent(p.assignee) ?? routeTeam(p.category);
  issues.unshift({
    id,
    schoolId: school.id,
    subject: requireText(p.subject, 'Add a subject'),
    description: requireText(p.description, 'Describe the issue'),
    category: p.category,
    priority: p.priority,
    status: p.assignee ? 'Assigned' : 'Open',
    assignee: p.assignee,
    team,
    requester: p.requester,
    createdAt: 'Just now',
    updatedAt: 'Just now',
    resolution: null,
    resolutionType: null,
    escalatedTo: null,
    escalatedFrom: null,
    holdReason: null,
    reopenCount: 0,
    rating: null,
    createdMs: Date.now(),
    firstReplyMs: null,
    pausedSince: null,
    pausedMs: 0,
    slaMissed: false,
  });
  audit({
    summary: `Support issue created · ${id}`,
    action: 'issue.create',
    entity: 'Issue',
    entityId: id,
    schoolName: school.name,
    next: 'Open',
  });
  return toIssue(issues[0]!);
});

/** Assign, reassign and change priority or category. */
mock.patch('/v1/support/issues/:id', ({ params, body }) => {
  const row = findIssue(params.id!);
  const p = body as UpdateIssuePayload;
  if (isDone(row.status) && p.assignee !== undefined)
    throw new MockHttpError(409, `${row.id} is ${row.status.toLowerCase()}. Reopen it first.`);

  if (p.assignee !== undefined && p.assignee !== row.assignee) {
    if (!p.assignee || !SUPPORT_AGENT_NAMES.includes(p.assignee))
      throw new MockHttpError(422, 'Choose who should own the ticket');
    const from = row.assignee;
    if (from) requireText(p.reason, 'Say why it’s being reassigned');
    const team = teamOfAgent(p.assignee) ?? row.team;
    row.assignee = p.assignee;
    row.team = team;
    if (row.status === 'Open' || row.status === 'Reopened') setStatus(row, 'Assigned');
    const self = p.assignee === ME.name && !from ? ' (self-assigned)' : '';
    addEvent(
      row.id,
      (from ? `Reassigned from ${from} to ` : 'Assigned to ') +
        `${p.assignee} · ${team}${self}${p.reason?.trim() ? ` · ${p.reason.trim()}` : ''}`,
    );
    logIssue(row, from ? 'Ticket reassigned' : 'Ticket assigned', from ?? 'Unassigned', p.assignee);
  }
  if (p.priority && p.priority !== row.priority) {
    addEvent(row.id, `Priority ${row.priority} → ${p.priority}`, {
      tone: 'warning',
      internal: true,
    });
    logIssue(row, 'Priority changed', row.priority, p.priority);
    row.priority = p.priority;
  }
  if (p.category && p.category !== row.category) {
    addEvent(row.id, `Category ${row.category} → ${p.category}`, { internal: true });
    row.category = p.category;
  }
  row.updatedAt = 'Just now';
  return toIssue(row);
});

/** A reply to the school or an internal note. The first reply picks up an unowned ticket. */
mock.post('/v1/support/issues/:id/messages', ({ params, body }) => {
  const row = findIssue(params.id!);
  const { kind, text } = body as { kind: 'agent' | 'note'; text: string };
  if (row.status === 'Closed')
    throw new MockHttpError(409, 'This ticket is closed. Reopen it to reply.');
  addMessage(row.id, kind, requireText(text, 'Write something first'));
  if (kind === 'agent') {
    row.firstReplyMs ??= Date.now();
    if (row.status === 'Open' || row.status === 'Reopened') {
      if (!row.assignee) {
        row.assignee = ME.name;
        row.team = teamOfAgent(ME.name) ?? row.team;
      }
      setStatus(row, 'In Progress');
      addEvent(row.id, `Picked up by ${row.assignee} · first reply sent`);
    }
  }
  row.updatedAt = 'Just now';
  return { ok: true };
});

mock.post('/v1/support/issues/:id/transitions', ({ params, body }) => {
  const row = findIssue(params.id!);
  const { to, note, option } = body as IssueTransitionPayload;
  const from = row.status;
  if (!NEXT[from].includes(to))
    throw new MockHttpError(409, `A ${from.toLowerCase()} ticket can’t move to ${to}.`);

  let title: string;
  let tone: TimelineEntry['tone'] = 'info';
  switch (to) {
    case 'In Progress': {
      const who = row.assignee ?? ME.name;
      row.assignee = who;
      row.firstReplyMs ??= Date.now();
      title =
        from === 'Escalated'
          ? `Escalation accepted by ${who}`
          : PAUSED_STATUSES.includes(from)
            ? 'Work resumed · SLA running'
            : `Work started by ${who}`;
      break;
    }
    case 'Waiting for School': {
      addMessage(row.id, 'agent', requireText(note, 'Write the question for the school'));
      row.firstReplyMs ??= Date.now();
      title = 'Waiting for the school · SLA paused';
      break;
    }
    case 'On Hold': {
      const reason = pick(HOLD_REASONS, option, 'Choose what it’s waiting on');
      addMessage(row.id, 'agent', requireText(note, 'Add a note for the school'));
      setStatus(row, 'On Hold');
      row.holdReason = reason;
      title = `On hold · ${reason} · SLA paused`;
      break;
    }
    case 'Escalated': {
      const target = ESCALATION_TARGETS.find((t) => t.team === option);
      if (!target) throw new MockHttpError(422, 'Choose who to escalate to');
      const why = requireText(note, 'Say why it needs escalating');
      row.escalatedFrom = row.assignee;
      row.escalatedTo = target.label;
      row.assignee = target.owner;
      row.team = target.team;
      title = `Escalated to ${target.label} (${target.owner}) by ${ME.name} · ${why}`;
      tone = 'error';
      break;
    }
    case 'Resolved': {
      const type = pick(RESOLUTION_TYPES, option, 'Choose how it was resolved');
      const summary = requireText(note, 'Add a resolution summary');
      row.resolution = summary;
      row.resolutionType = type;
      addMessage(row.id, 'agent', summary);
      title = `Resolved · ${type} · “${summary}”`;
      tone = 'success';
      break;
    }
    case 'Closed': {
      if (from === 'Resolved') {
        title = `Closed by ${ME.name}`;
      } else {
        const reason = pick(CLOSE_REASONS, option, 'Choose why it’s being closed');
        const message = requireText(note, 'Add a note for the school');
        row.resolution = message;
        row.resolutionType = reason;
        addMessage(row.id, 'agent', message);
        title = `Closed without resolving · ${reason}`;
      }
      break;
    }
    case 'Reopened': {
      title = `Reopened by ${ME.name} · ${requireText(note, 'Give a reason for reopening')}`;
      row.resolution = null;
      row.resolutionType = null;
      tone = 'warning';
      break;
    }
    default:
      throw new MockHttpError(409, `A ticket can’t move to ${to} this way.`);
  }
  if (row.status !== to) setStatus(row, to);
  addEvent(row.id, title, { tone });
  logIssue(row, `Ticket ${to.toLowerCase()}`, from, to);
  return toIssue(row);
});
