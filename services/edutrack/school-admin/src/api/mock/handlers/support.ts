import { mock, MockHttpError, paginate, type MockRequest } from '@edutrack/web-core/mock';

import {
  TICKET_CATEGORIES,
  TICKET_LIMITS,
  TICKET_PRIORITIES,
  type NewTicketPayload,
  type TicketAttachment,
  type TicketDetail,
  type TicketList,
  type TicketRow,
  type TicketStatus,
  type TicketTab,
} from '@/types';

import {
  nextMsgId,
  nextTicketId,
  slaOf,
  TEAM_OF,
  tickets,
  type TicketEventRec,
  type TicketRec,
} from '../support-db';
import { currentUser } from './shared';

const DAY = 86_400_000;
const OPEN_STATUSES: TicketStatus[] = ['Open', 'In progress', 'Waiting for School'];
const isOpen = (t: TicketRec) => OPEN_STATUSES.includes(t.status);

const STATUS_LABEL: Record<TicketStatus, string> = {
  Open: 'Awaiting support',
  'In progress': 'In progress',
  'Waiting for School': 'Waiting on you',
  Resolved: 'Resolved · confirm',
  Closed: 'Closed',
};

const nowIso = () => new Date().toISOString();

/** A resolved ticket the school hasn't answered closes by itself after the grace period. */
function autoClose(t: TicketRec, now = Date.now()) {
  if (t.status !== 'Resolved' || !t.resolvedAt) return;
  const at = Date.parse(t.resolvedAt) + TICKET_LIMITS.autoCloseDays * DAY;
  if (now < at) return;
  const iso = new Date(at).toISOString();
  t.status = 'Closed';
  t.closedAt = iso;
  t.updatedAt = iso;
  t.events.push(
    event(
      iso,
      `Closed automatically ${TICKET_LIMITS.autoCloseDays} days after it was resolved`,
      'neutral',
    ),
  );
}

function event(at: string, title: string, tone?: TicketEventRec['tone'], detail?: string) {
  return { id: nextMsgId(), at, title, tone, detail };
}

/** The signed-in user's school's tickets, after any automatic closures. */
function schoolTickets(req: MockRequest) {
  const user = currentUser(req);
  const mine = tickets.filter((t) => t.schoolId === user.schoolId);
  mine.forEach((t) => autoClose(t));
  return { user, mine, actor: `${user.firstName} ${user.lastName}` };
}

function ticketFor(req: MockRequest) {
  const ctx = schoolTickets(req);
  const t = ctx.mine.find((x) => x.id === req.params.id);
  // Another school's ticket is reported as missing, so ids can't be probed.
  if (!t) throw new MockHttpError(404, 'This ticket doesn’t exist or isn’t for your school.');
  return { ...ctx, t };
}

export const needsYou = (t: TicketRec) =>
  t.status === 'Waiting for School' || t.status === 'Resolved';

function rowOf(t: TicketRec): TicketRow {
  return {
    id: t.id,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    statusLabel: STATUS_LABEL[t.status],
    assignee: t.assignee,
    team: TEAM_OF[t.category],
    requester: t.requester,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    sla: slaOf(t),
    needsYou: needsYou(t),
  };
}

function detailOf(t: TicketRec): TicketDetail {
  const closed = t.status === 'Closed';
  return {
    ...rowOf(t),
    // Internal notes stay with the support team.
    messages: t.messages
      .filter((m) => m.kind !== 'note')
      .map((m) => ({
        id: m.id,
        author: m.author,
        authorRole: m.authorRole,
        from: m.kind === 'school' ? 'school' : 'support',
        at: m.at,
        text: m.text,
        attachments: m.attachments,
      })),
    events: [...t.events].sort((a, b) => b.at.localeCompare(a.at)),
    resolution: t.resolution,
    resolvedAt: t.resolvedAt,
    autoCloseAt:
      t.status === 'Resolved' && t.resolvedAt
        ? new Date(Date.parse(t.resolvedAt) + TICKET_LIMITS.autoCloseDays * DAY).toISOString()
        : null,
    closedAt: t.closedAt,
    rating: t.rating,
    followUpOf: t.followUpOf,
    followUps: tickets.filter((x) => x.followUpOf === t.id).map((x) => x.id),
    reopenCount: t.reopenCount,
    can: {
      reply: isOpen(t),
      confirm: t.status === 'Resolved',
      reopen: t.status === 'Resolved',
      close: isOpen(t),
      followUp: closed,
    },
  };
}

/* ---------------- Validation ---------------- */

function text(value: unknown, label: string, min: number, max: number): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) throw new MockHttpError(422, `Add ${label}.`);
  if (v.length < min)
    throw new MockHttpError(
      422,
      `Write at least ${min} characters for ${label} so support can act on it.`,
    );
  if (v.length > max)
    throw new MockHttpError(422, `Keep ${label} to ${max.toLocaleString('en-NG')} characters.`);
  return v;
}

function attachmentsOf(value: unknown): TicketAttachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new MockHttpError(422, 'Attachments must be a list of files.');
  if (value.length > TICKET_LIMITS.attachments)
    throw new MockHttpError(422, `Attach up to ${TICKET_LIMITS.attachments} files.`);
  return value.map((raw) => {
    const f = raw as Partial<TicketAttachment>;
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    if (!name) throw new MockHttpError(422, 'Each attachment needs a file name.');
    if (!(TICKET_LIMITS.attachmentTypes as readonly string[]).includes(f.type ?? ''))
      throw new MockHttpError(422, `“${name}” isn’t supported. Attach PNG, JPG or PDF files.`);
    if (typeof f.bytes !== 'number' || f.bytes <= 0)
      throw new MockHttpError(422, `“${name}” is empty.`);
    if (f.bytes > TICKET_LIMITS.attachmentBytes)
      throw new MockHttpError(422, `“${name}” is over 10 MB. Attach a smaller file.`);
    return {
      name,
      type: f.type!,
      bytes: f.bytes,
      dataUrl: typeof f.dataUrl === 'string' ? f.dataUrl : null,
    };
  });
}

function oneOf<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (!options.includes(value as T)) throw new MockHttpError(422, `Choose ${label}.`);
  return value as T;
}

/* ---------------- Endpoints ---------------- */

mock.get('/v1/support/tickets', (req): TicketList => {
  const { mine } = schoolTickets(req);
  const tab = (['open', 'closed', 'all'] as TicketTab[]).includes(req.query.tab as TicketTab)
    ? (req.query.tab as TicketTab)
    : 'open';
  const sorted = [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const inTab = sorted.filter((t) => tab === 'all' || (tab === 'open' ? isOpen(t) : !isOpen(t)));
  const { data, meta } = paginate(inTab, req.query, (t) => `${t.id} ${t.subject} ${t.category}`);
  return {
    rows: data.map(rowOf),
    meta,
    counts: {
      open: mine.filter(isOpen).length,
      closed: mine.filter((t) => !isOpen(t)).length,
      all: mine.length,
    },
    attention: sorted
      .filter(needsYou)
      .map((t) => ({ id: t.id, subject: t.subject, status: t.status })),
  };
});

mock.get('/v1/support/tickets/:id', (req) => detailOf(ticketFor(req).t));

mock.post('/v1/support/tickets', (req) => {
  const { user, mine, actor } = schoolTickets(req);
  const body = (req.body ?? {}) as Partial<NewTicketPayload>;
  const category = oneOf(body.category, TICKET_CATEGORIES, 'a category');
  const priority = oneOf(body.priority ?? 'Normal', TICKET_PRIORITIES, 'a priority');
  const subject = text(body.subject, 'a subject', 1, TICKET_LIMITS.subject);
  const description = text(
    body.description,
    'a description',
    TICKET_LIMITS.descriptionMin,
    TICKET_LIMITS.text,
  );
  const attachments = attachmentsOf(body.attachments);

  let followUpOf: string | null = null;
  if (body.followUpOf) {
    const prev = mine.find((t) => t.id === body.followUpOf);
    if (!prev) throw new MockHttpError(404, 'The ticket you’re following up doesn’t exist.');
    if (prev.status !== 'Closed')
      throw new MockHttpError(409, `${prev.id} is still active. Reply on it instead.`);
    followUpOf = prev.id;
  }

  // A double-click or a re-sent form shouldn't raise the same ticket twice.
  const now = Date.now();
  const dup = mine.find(
    (t) =>
      t.requesterId === user.id &&
      t.subject === subject &&
      t.messages[0]?.text === description &&
      now - Date.parse(t.createdAt) < 60_000,
  );
  if (dup) throw new MockHttpError(409, `You just raised this as ${dup.id}.`);

  const at = new Date(now).toISOString();
  const role = `${user.position} · School Admin`;
  const t: TicketRec = {
    id: nextTicketId(),
    schoolId: user.schoolId,
    subject,
    category,
    priority,
    status: 'Open',
    requester: actor,
    requesterId: user.id,
    assignee: null,
    createdAt: at,
    updatedAt: at,
    firstReplyAt: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    rating: null,
    reopenCount: 0,
    followUpOf,
    messages: [
      {
        id: nextMsgId(),
        author: actor,
        authorRole: role,
        kind: 'school',
        at,
        text: description,
        attachments,
      },
    ],
    events: [
      event(at, 'Ticket raised', 'info', actor),
      event(at, `Routed to ${TEAM_OF[category]}`, 'neutral'),
      ...(followUpOf ? [event(at, `Follow-up to ${followUpOf}`, 'neutral')] : []),
    ],
  };
  tickets.unshift(t);
  if (followUpOf) {
    const prev = mine.find((x) => x.id === followUpOf)!;
    prev.events.push(event(at, `Follow-up raised as ${t.id}`, 'info', actor));
  }
  return detailOf(t);
});

mock.post('/v1/support/tickets/:id/replies', (req) => {
  const { t, actor, user } = ticketFor(req);
  if (t.status === 'Closed')
    throw new MockHttpError(409, 'This ticket is closed. Open a follow-up ticket instead.');
  if (t.status === 'Resolved')
    throw new MockHttpError(
      409,
      'Support marked this resolved. Confirm the fix or reopen the ticket.',
    );
  const body = (req.body ?? {}) as { text?: unknown; attachments?: unknown };
  const msgText = text(body.text, 'a message', 1, TICKET_LIMITS.text);
  const attachments = attachmentsOf(body.attachments);
  const at = nowIso();
  t.messages.push({
    id: nextMsgId(),
    author: actor,
    authorRole: `${user.position} · School Admin`,
    kind: 'school',
    at,
    text: msgText,
    attachments,
  });
  if (t.status === 'Waiting for School') {
    t.status = 'In progress';
    t.events.push(event(at, 'You replied · back with support', 'info', actor));
  }
  t.updatedAt = at;
  return detailOf(t);
});

mock.post('/v1/support/tickets/:id/confirm', (req) => {
  const { t, actor } = ticketFor(req);
  if (t.status !== 'Resolved')
    throw new MockHttpError(409, 'Only a resolved ticket can be confirmed.');
  const body = (req.body ?? {}) as { rating?: unknown };
  let rating: number | null = null;
  if (body.rating !== undefined && body.rating !== null && body.rating !== '') {
    rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      throw new MockHttpError(422, 'Rate the support from 1 to 5.');
  }
  const at = nowIso();
  t.status = 'Closed';
  t.closedAt = at;
  t.updatedAt = at;
  t.rating = rating;
  t.events.push(
    event(at, `You confirmed the fix${rating ? ` · rated ${rating} of 5` : ''}`, 'success', actor),
  );
  return detailOf(t);
});

mock.post('/v1/support/tickets/:id/reopen', (req) => {
  const { t, actor, user } = ticketFor(req);
  if (t.status === 'Closed')
    throw new MockHttpError(409, 'Closed tickets can’t be reopened. Open a follow-up ticket.');
  if (t.status !== 'Resolved') throw new MockHttpError(409, 'This ticket is still open.');
  const reason = text(
    (req.body as { reason?: unknown })?.reason,
    'what still isn’t working',
    10,
    TICKET_LIMITS.text,
  );
  const at = nowIso();
  t.status = 'Open';
  t.reopenCount += 1;
  t.resolvedAt = null;
  t.updatedAt = at;
  t.messages.push({
    id: nextMsgId(),
    author: actor,
    authorRole: `${user.position} · School Admin`,
    kind: 'school',
    at,
    text: reason,
    attachments: [],
  });
  t.events.push(event(at, 'You reopened the ticket', 'warning', actor));
  return detailOf(t);
});

mock.post('/v1/support/tickets/:id/close', (req) => {
  const { t, actor } = ticketFor(req);
  if (!isOpen(t))
    throw new MockHttpError(
      409,
      t.status === 'Closed' ? 'This ticket is already closed.' : 'Confirm the fix instead.',
    );
  const reason = text((req.body as { reason?: unknown })?.reason, 'a reason', 3, 500);
  const at = nowIso();
  t.status = 'Closed';
  t.closedAt = at;
  t.updatedAt = at;
  t.events.push(event(at, 'You closed the ticket', 'neutral', `${actor} · ${reason}`));
  return detailOf(t);
});
