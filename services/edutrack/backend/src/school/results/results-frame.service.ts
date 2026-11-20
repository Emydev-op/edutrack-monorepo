import { Injectable } from '@nestjs/common';
import { fmtDate, plural } from '../academics/academic-format.js';
import { TeacherScopeService, type TermRow } from '../teacher/teacher-scope.service.js';
import { ClassResultsService } from './class-results.service.js';
import { ResultsCoreService, type SheetCtx } from './results-core.service.js';
import { TeacherResultsService } from './teacher-results.service.js';

type Staff = Awaited<ReturnType<TeacherScopeService['staff']>>;

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Fri 11 Dec, 23:59" from a local "YYYY-MM-DDTHH:mm". */
const deadlineLabel = (local: string) =>
  `${DAYS[new Date(`${local.slice(0, 10)}T00:00:00Z`).getUTCDay()]} ${fmtDate(local.slice(0, 10), false)}, ${local.slice(11, 16)}`;

/**
 * The results parts of the Teacher Workspace's frame: sidebar counts (my sheets that need me,
 * sheets waiting on me as HOD, report-card remarks still to write), the dashboard's sheet and
 * review metrics, and the results to-dos.
 */
@Injectable()
export class ResultsFrameService {
  constructor(
    private readonly core: ResultsCoreService,
    private readonly sheets: TeacherResultsService,
    private readonly classResults: ClassResultsService,
    private readonly scope: TeacherScopeService,
  ) {}

  private static isHod(s: Staff) {
    return s.hodOf.length > 0 || s.roleKeys.includes('hod');
  }

  /** "3 days left" / "14 hours left" to a local deadline. */
  private timeLeft(deadline: string) {
    const now = TeacherScopeService.local(this.core.now());
    const minutes = (local: string) =>
      Date.UTC(+local.slice(0, 4), +local.slice(5, 7) - 1, +local.slice(8, 10)) / 60_000 +
      +local.slice(11, 13) * 60 +
      +local.slice(14, 16);
    const left = minutes(deadline) - minutes(now);
    const days = Math.floor(left / 1440);
    if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
    const hours = Math.max(1, Math.floor(left / 60));
    return `${hours} hour${hours === 1 ? '' : 's'} left`;
  }

  private static firstMissing(ctx: SheetCtx) {
    for (const row of ctx.rows) {
      const i = row.scores.findIndex((v) => v === null);
      if (i >= 0) return { focus: ctx.scheme.components[i]!.key, student: row.studentId };
    }
    return null;
  }

  private static link(ctx: SheetCtx, query?: Record<string, string> | null) {
    return {
      name: 'result-sheet',
      params: { sheetId: ctx.sheet.id },
      ...(query ? { query } : {}),
    };
  }

  async frame(s: Staff, termRow: TermRow) {
    const term = await this.core.term(termRow.id);
    const all = await this.sheets.mySheets(s.id, term);
    const own = all.filter((c) => c.sheet.teacherStaffId === s.id);
    const summaries = new Map(own.map((c) => [c.sheet.id, this.core.summary(c)]));
    const open = (c: SheetCtx) =>
      (c.sheet.status === 'DRAFT' || c.sheet.status === 'NOT_STARTED') &&
      this.core.lock(c) === null;
    const isHod = ResultsFrameService.isHod(s);
    const waiting = isHod ? await this.sheets.waitingOn(s.id, term.id) : 0;
    const arm = await this.scope.classArm(s.id, term);
    let remarksLeft = 0;
    let remarks: { done: number; total: number } | null = null;
    if (arm && !(await this.classResults.lock(term, arm.id))) {
      remarks = await this.classResults.remarksProgress(term, arm.id);
      remarksLeft = remarks.total - remarks.done;
    }
    const deadline = term.resultEntryClosesAt
      ? TeacherScopeService.local(term.resultEntryClosesAt)
      : null;

    const todo: unknown[] = [];
    if (term.status === 'ACTIVE') {
      for (const c of own.filter((x) => x.sheet.status === 'RETURNED')) {
        const missing = summaries.get(c.sheet.id)!.completion.missing;
        const by =
          c.sheet.returnedBy === 'HOD' && c.sheet.reviewer
            ? ResultsCoreService.hodLabel(c, c.sheet.reviewer)
            : 'The academic office';
        todo.push({
          id: `sheet-returned:${c.sheet.id}`,
          kind: 'sheet-returned',
          badge: { label: 'Returned', tone: 'error' },
          title: `${c.arm.label} · ${c.sheet.subject.name} result sheet was returned`,
          detail: `${by}: “${c.sheet.returnNote ?? ''}”${missing ? ` · ${plural(missing, 'student')} with missing scores` : ''}`,
          action: 'Open sheet',
          to: ResultsFrameService.link(c, missing ? ResultsFrameService.firstMissing(c) : null),
        });
      }
      for (const c of own.filter(open)) {
        const summary = summaries.get(c.sheet.id)!;
        const due = summary.deadline;
        if (!summary.completion.missing) {
          if (c.sheet.status === 'DRAFT' && summary.completion.total > 0)
            todo.push({
              id: `sheet-ready:${c.sheet.id}`,
              kind: 'sheet-ready',
              badge: { label: 'Ready to submit', tone: 'success' },
              title: `${c.arm.label} · ${c.sheet.subject.name} is complete: submit it for review`,
              detail: due
                ? `Result entry closes ${deadlineLabel(due)} · ${this.timeLeft(due)}`
                : 'Check the totals on the Review tab, then submit.',
              action: 'Review and submit',
              to: ResultsFrameService.link(c, { tab: 'review' }),
            });
          continue;
        }
        todo.push({
          id: `sheet-missing:${c.sheet.id}`,
          kind: 'sheet-missing',
          badge: { label: 'Missing scores', tone: 'warning' },
          title: `${c.arm.label} · ${c.sheet.subject.name}: ${plural(summary.completion.missing, 'student')} with missing scores`,
          detail: due
            ? `Result entry closes ${deadlineLabel(due)} · ${this.timeLeft(due)}`
            : 'Enter every score, then submit the sheet for review.',
          action: c.sheet.status === 'NOT_STARTED' ? 'Start sheet' : 'Enter scores',
          to: ResultsFrameService.link(c, ResultsFrameService.firstMissing(c)),
        });
      }
      if (arm && remarks && remarksLeft > 0)
        todo.push({
          id: `remarks:${arm.id}`,
          kind: 'remarks',
          badge: { label: 'Report cards', tone: 'warning' },
          title: `Report-card remarks: ${plural(remarksLeft, 'student')} still to do`,
          detail: `${arm.label} · ${remarks.done} of ${remarks.total} done · needed before results are published`,
          action: 'Write remarks',
          to: { name: 'report-cards' },
        });
      if (waiting)
        todo.push({
          id: 'review-sheets',
          kind: 'review-sheets',
          badge: { label: 'Review', tone: 'info' },
          title: `${plural(waiting, 'result sheet')} waiting for your review`,
          detail: 'Forward to the academic office or return to the teacher',
          action: 'Review',
          to: { name: 'review-sheets' },
        });
    }

    const needsMe = own.filter(
      (c) =>
        c.sheet.status === 'RETURNED' ||
        (open(c) && summaries.get(c.sheet.id)!.completion.missing > 0),
    ).length;
    return {
      counts: {
        results: needsMe,
        'review-sheets': waiting,
        'report-cards': remarksLeft,
      },
      sheets: {
        submitted: own.filter((c) =>
          ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED'].includes(c.sheet.status),
        ).length,
        total: own.length,
        deadline,
        entryOpen: term.status === 'ACTIVE' && !this.core.entryClosed(term),
      },
      reviewSheets: isHod ? waiting : null,
      todo,
    };
  }
}
