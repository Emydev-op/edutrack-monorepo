import { getApiErrorMessage } from '@edutrack/web-core/http';
import { shallowRef } from 'vue';
import { toast } from 'vue-sonner';

import {
  useIssueTransitionMutation,
  useSupportSummaryQuery,
  useUpdateIssueMutation,
} from '@/api/services/support';
import { useConfirm, type ConfirmOption } from '@edutrack/app-kit/composables/useConfirm';
import {
  CLOSE_REASONS,
  ESCALATION_TARGETS,
  HOLD_REASONS,
  hoursText,
  isDone,
  PAUSED_STATUSES,
  RESOLUTION_TYPES,
  SLA_TARGETS,
  SUPPORT_AGENTS,
} from '@/config/support-desk';
import { useAuthStore } from '@/stores/auth';
import { ISSUE_PRIORITIES, type SupportIssue } from '@/types';

export interface IssueAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

const choices = (list: [string, string][]): ConfirmOption[] =>
  list.map(([value, description]) => ({ value, label: value, description }));

/**
 * The steps a support agent can take on a ticket, by status. Each one confirms first and says
 * what the school will see and what happens to the SLA clock.
 */
export function useIssueActions() {
  const confirm = useConfirm();
  const auth = useAuthStore();
  const me = () => auth.fullName;
  const { data: summary } = useSupportSummaryQuery();

  const current = shallowRef<SupportIssue>();
  const id = () => current.value?.id ?? '';
  const update = useUpdateIssueMutation(id);
  const transition = useIssueTransitionMutation(id);

  const openTickets = (team: string, n: number) =>
    `${team} · ${n} open ticket${n === 1 ? '' : 's'}`;
  const requesterOf = (i: SupportIssue) => i.requester.split(' · ')[0] ?? 'the requester';

  function assign(i: SupportIssue, reassign: boolean) {
    void confirm({
      title: `${reassign ? 'Reassign' : 'Assign'} ${i.id}`,
      description: reassign
        ? `Now with ${i.assignee} (${i.team}). The school is told who handles it next; the SLA clock keeps running.`
        : 'The owner’s team becomes the ticket’s team.',
      options: SUPPORT_AGENTS.filter((a) => a.name !== i.assignee).map((a) => ({
        value: a.name,
        label: a.name + (a.name === me() ? ' (you)' : ''),
        description: openTickets(a.team, summary.value?.agentLoad[a.name] ?? 0),
      })),
      input: reassign
        ? {
            label: 'Reason (kept in the ticket history)',
            placeholder: 'e.g. Needs a data fix · moving to Technical',
            required: true,
          }
        : undefined,
      confirmLabel: reassign ? 'Reassign' : 'Assign',
      action: async ({ option, text }) => {
        await update.mutateAsync({ assignee: option, reason: text || undefined });
        toast.success(`${reassign ? 'Reassigned' : 'Assigned'} to ${option}.`);
      },
    });
  }

  async function assignToMe() {
    await update.mutateAsync({ assignee: me() });
    toast.success(`Assigned to you.`);
  }

  async function start(i: SupportIssue) {
    await transition.mutateAsync({ to: 'In Progress' });
    toast.success(i.status === 'Escalated' ? 'Escalation accepted.' : 'Work started.');
  }

  const resolve = (i: SupportIssue) =>
    void confirm({
      title: `Resolve ${i.id}?`,
      description:
        'The school is asked to confirm. If they don’t reply in 7 days it closes automatically; replying reopens it.',
      details: [
        ['Status', `${i.status} → Resolved`],
        [
          'Resolution SLA',
          i.sla.resolution.state === 'over'
            ? `Missed · ${i.sla.resolution.label.toLowerCase()}`
            : 'Met',
        ],
        ['Notifies', `${requesterOf(i)} by email and in-app`],
      ],
      options: choices(RESOLUTION_TYPES),
      input: {
        label: 'Resolution summary (sent to the school)',
        placeholder: 'e.g. Results published after correcting the assessment weights for SSS 2C.',
        required: true,
      },
      confirmLabel: 'Resolve',
      action: async ({ option, text }) => {
        await transition.mutateAsync({ to: 'Resolved', option, note: text });
        toast.success('Resolved. The school has been asked to confirm.');
      },
    });

  const escalate = (i: SupportIssue) =>
    void confirm({
      title: `Escalate ${i.id}?`,
      description: 'Hands the ticket to a specialist owner. The school sees “With a specialist”.',
      details: [['Current owner', `${i.assignee ?? 'Unassigned'} · ${i.team}`]],
      options: ESCALATION_TARGETS.map((t) => ({
        value: t.team,
        label: `${t.label} · ${t.owner}`,
        description: t.description,
      })),
      input: {
        label: 'Why it needs escalating',
        placeholder: 'e.g. Publish button disabled for one arm only; looks like a data issue',
        required: true,
      },
      confirmLabel: 'Escalate',
      tone: 'destructive',
      action: async ({ option, text }) => {
        await transition.mutateAsync({ to: 'Escalated', option, note: text });
        toast.success(`Escalated to ${ESCALATION_TARGETS.find((t) => t.team === option)?.label}.`);
      },
    });

  const askSchool = (i: SupportIssue) =>
    void confirm({
      title: `Ask ${i.schoolName} for information?`,
      description:
        'Sends your question and pauses the resolution SLA until they reply. They get a reminder after 2 working days; with no reply in 7 days the ticket closes.',
      details: [['Status', `${i.status} → Waiting for School`]],
      input: {
        label: 'Your question (sent to the school)',
        placeholder: 'e.g. Can you share a screenshot of the Publish page for SSS 2C?',
        required: true,
      },
      confirmLabel: 'Send and wait',
      action: async ({ text }) => {
        await transition.mutateAsync({ to: 'Waiting for School', note: text });
        toast.success('Question sent. SLA paused.');
      },
    });

  const hold = (i: SupportIssue) =>
    void confirm({
      title: `Put ${i.id} on hold?`,
      description:
        'For waits outside the school’s control. The SLA pauses; the school sees “On hold” with your reason.',
      options: choices(HOLD_REASONS),
      input: {
        label: 'Note for the school',
        placeholder: 'e.g. Our SMS provider is fixing delivery to MTN numbers; expected by Friday.',
        required: true,
      },
      confirmLabel: 'Put on hold',
      action: async ({ option, text }) => {
        await transition.mutateAsync({ to: 'On Hold', option, note: text });
        toast.success('On hold. SLA paused.');
      },
    });

  const resume = (i: SupportIssue) =>
    void confirm({
      title: `Resume work on ${i.id}?`,
      details: [
        ['Status', `${i.status} → In Progress`],
        ['SLA', 'Clock restarts'],
      ],
      confirmLabel: 'Resume',
      action: async () => {
        await transition.mutateAsync({ to: 'In Progress' });
        toast.success('Work resumed.');
      },
    });

  const reopen = (i: SupportIssue) =>
    void confirm({
      title: `Reopen ${i.id}?`,
      details: [
        ['Status', `${i.status} → Reopened`],
        ['Owner', i.assignee ?? 'Unassigned'],
        ['SLA', 'Resolution clock continues from before'],
      ],
      input: {
        label: 'Reason',
        placeholder: 'e.g. School says results are still locked for SSS 2C',
        required: true,
      },
      confirmLabel: 'Reopen',
      action: async ({ text }) => {
        await transition.mutateAsync({ to: 'Reopened', note: text });
        toast.success(`${i.id} reopened.`);
      },
    });

  const closeNow = (i: SupportIssue) =>
    void confirm({
      title: `Close ${i.id} now?`,
      description:
        'Skips the 7-day confirmation window. The school can’t reply on a closed ticket; they’d raise a follow-up.',
      details: [['Resolution', i.resolution ?? '—']],
      confirmLabel: 'Close ticket',
      action: async () => {
        await transition.mutateAsync({ to: 'Closed' });
        toast.success(`${i.id} closed.`);
      },
    });

  const closeUnresolved = (i: SupportIssue) =>
    void confirm({
      title: `Close ${i.id} without resolving?`,
      options: choices(CLOSE_REASONS),
      input: {
        label: 'Note to the school',
        placeholder: 'e.g. We’re tracking this in SUP-1179.',
        required: true,
      },
      confirmLabel: 'Close',
      tone: 'destructive',
      action: async ({ option, text }) => {
        await transition.mutateAsync({ to: 'Closed', option, note: text });
        toast.success(`${i.id} closed.`);
      },
    });

  const changePriority = (i: SupportIssue) =>
    void confirm({
      title: `Change priority of ${i.id}`,
      description: 'SLA targets recalculate from when the ticket was created.',
      options: [...ISSUE_PRIORITIES].reverse().map((p) => ({
        value: p,
        label: p + (p === i.priority ? ' (current)' : ''),
        description: `First reply ${hoursText(SLA_TARGETS[p][0])} · resolve ${hoursText(SLA_TARGETS[p][1])}`,
      })),
      defaultOption: i.priority,
      confirmLabel: 'Change',
      action: async ({ option }) => {
        if (option === i.priority) return;
        await update.mutateAsync({ priority: option as SupportIssue['priority'] });
        toast.success(`Priority set to ${option}.`);
      },
    });

  /** Runs `fn` with `issue` as the ticket the mutations act on. */
  const on =
    (issue: SupportIssue, fn: (i: SupportIssue) => unknown): (() => void) =>
    () => {
      current.value = issue;
      // Steps without a dialog report their own failures; dialogs show errors inline.
      Promise.resolve(fn(issue)).catch((e: unknown) =>
        toast.error(getApiErrorMessage(e, 'That didn’t work. Try again.')),
      );
    };

  function actionsFor(i: SupportIssue): IssueAction[] {
    const list: IssueAction[] = [];
    const add = (label: string, fn: (i: SupportIssue) => unknown, primary = false) =>
      list.push({ label, primary, run: on(i, fn) });
    switch (i.status) {
      case 'Open':
      case 'Reopened':
        add('Assign to me', assignToMe, true);
        add('Assign', (x) => assign(x, false));
        add('Close without resolving', closeUnresolved);
        break;
      case 'Assigned':
        add('Start work', start, true);
        add('Reassign', (x) => assign(x, true));
        add('Escalate', escalate);
        break;
      case 'In Progress':
        add('Resolve', resolve, true);
        add('Ask school', askSchool);
        add('Put on hold', hold);
        add('Escalate', escalate);
        add('Reassign', (x) => assign(x, true));
        break;
      case 'Escalated':
        add('Accept & start', start, true);
        add('Resolve', resolve);
        add('Reassign', (x) => assign(x, true));
        break;
      case 'Resolved':
        add('Close now', closeNow, true);
        add('Reopen', reopen);
        break;
      case 'Closed':
        add('Reopen', reopen);
        break;
      default:
        if (PAUSED_STATUSES.includes(i.status)) {
          add('Resume', resume, true);
          add('Resolve', resolve);
          add('Reassign', (x) => assign(x, true));
        }
    }
    if (!isDone(i.status)) add('Change priority', changePriority);
    return list;
  }

  /** Assign or reassign only, for the list's row menu. */
  const assignAction = (i: SupportIssue): IssueAction | null =>
    isDone(i.status)
      ? null
      : {
          label: i.assignee ? 'Reassign' : 'Assign',
          run: on(i, (x) => assign(x, !!x.assignee)),
        };

  return { actionsFor, assignAction };
}
