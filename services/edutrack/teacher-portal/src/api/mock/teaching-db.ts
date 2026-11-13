/**
 * Teaching helpers over the seed school: a teacher's published week, today's lessons with
 * Done / Now / Next / Later from the demo clock, and when a lesson next happens. Pure functions
 * of `school-db` + the clock, so other areas (e.g. the dashboard's "Today's lessons") can reuse
 * them instead of re-deriving the timetable.
 */
import type { LessonOccurrence, LessonStatus, TimetableLesson, TodayLesson } from '@/types';

import {
  WEEKDAYS,
  addDays,
  closureReason,
  formatDay,
  isSchoolDay,
  isoToday,
  nowLocal,
  weekdayName,
} from './clock';
import { LESSONS, PERIODS, TIMETABLES, type LessonRecord } from './school-db';
import { armById, branchOf, subjectByCode, termById } from './scope';

const periodOf = (id: string) => PERIODS.find((p) => p.id === id)!;
const periodIndex = (id: string) => PERIODS.findIndex((p) => p.id === id);
const dayIndex = (d: string) => WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number]);

/** "HH:mm" of the demo moment. */
const nowTime = () => nowLocal().slice(11, 16);

export const isPublished = (termId: string) => TIMETABLES[termId]?.published ?? false;

/** A teacher's lessons in a term's published timetable (none when it isn't published), Mon P1 first. */
export function lessonsOf(teacherId: string, termId: string): LessonRecord[] {
  if (!isPublished(termId)) return [];
  return LESSONS.filter((l) => l.teacherId === teacherId && l.termId === termId).sort(
    (a, b) =>
      dayIndex(a.day) - dayIndex(b.day) || periodIndex(a.periodId) - periodIndex(b.periodId),
  );
}

/** Lessons of one teaching assignment. */
export const lessonsOfAssignment = (assignmentId: string) =>
  LESSONS.filter((l) => l.assignmentId === assignmentId && isPublished(l.termId));

export function lessonShape(l: LessonRecord): TimetableLesson {
  const p = periodOf(l.periodId);
  const a = armById(l.armId);
  const b = branchOf(l.branchId);
  return {
    id: l.id,
    day: l.day,
    periodId: l.periodId,
    periodLabel: `Period ${p.label}`,
    start: p.start,
    end: p.end,
    armId: a.id,
    armName: a.name,
    subject: l.subject,
    subjectName: subjectByCode(l.subject).name,
    room: l.room,
    branchId: b.id,
    branchName: b.name,
    branchShort: b.short,
  };
}

/**
 * Why a term has no "today" (past or upcoming term, weekend, holiday…), or null when today is a
 * school day of that term.
 */
export function todayNoteFor(termId: string): string | null {
  const term = termById(termId);
  const today = isoToday();
  if (term.status === 'Closed') return `${term.sessionName} ${term.name} has ended.`;
  if (today < term.start) return `${term.name} starts on ${formatDay(term.start)}.`;
  if (today > term.end) return `${term.name} has ended.`;
  return closureReason(today);
}

/** Today's lessons for a teacher with their status at the demo clock. Empty when there is no school today. */
export function todaysLessons(teacherId: string, termId: string): TodayLesson[] {
  if (todayNoteFor(termId)) return [];
  const day = weekdayName(isoToday());
  const time = nowTime();
  let nextGiven = false;
  return lessonsOf(teacherId, termId)
    .filter((l) => l.day === day)
    .map((l) => {
      const shape = lessonShape(l);
      let status: LessonStatus;
      if (shape.end <= time) status = 'Done';
      else if (shape.start <= time) status = 'Now';
      else if (!nextGiven) {
        status = 'Next';
        nextGiven = true;
      } else status = 'Later';
      return { ...shape, status };
    });
}

/**
 * The next time any of `lessons` happens from the demo clock (a lesson in progress counts),
 * within its term. Null for closed terms or when nothing is left.
 */
export function nextOccurrence(lessons: LessonRecord[], termId: string): LessonOccurrence | null {
  const term = termById(termId);
  if (term.status === 'Closed' || !lessons.length || !isPublished(termId)) return null;
  const today = isoToday();
  const time = nowTime();
  const from = today > term.start ? today : term.start;
  for (let d = from; d <= term.end; d = addDays(d, 1)) {
    if (!isSchoolDay(d)) continue;
    const day = weekdayName(d);
    const options = lessons
      .filter((l) => l.day === day)
      .map((l) => ({ l, p: periodOf(l.periodId) }))
      .filter(({ p }) => d !== today || p.end > time)
      .sort((x, y) => x.p.start.localeCompare(y.p.start));
    const first = options[0];
    if (first)
      return {
        lessonId: first.l.id,
        date: d,
        day: first.l.day,
        periodId: first.p.id,
        periodLabel: `Period ${first.p.label}`,
        start: first.p.start,
        end: first.p.end,
        room: first.l.room,
        inProgress: d === today && first.p.start <= time,
      };
  }
  return null;
}
