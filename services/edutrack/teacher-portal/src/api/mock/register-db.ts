/**
 * The daily register for each class arm, kept by its class teacher (My class → Register).
 *
 * Seeded for every school day of First Term 2026/2027 up to yesterday (today, Tue 8 Dec, isn't
 * taken yet) and for the whole of Third Term 2025/2026. About 95% present, with some late, absent
 * and excused marks. JSS 2B and SSS 1A each have two days not taken (19 Nov, locked, and 3 Dec,
 * still editable) so history shows gaps. Students are only marked on days they were in the arm:
 * the late joiner (JSS 1A, from 2 Nov) has nothing before, the transferred student (JSS 2B, left
 * 16 Nov) nothing after.
 *
 * Shapes match School Admin's register (`register-db.ts` there): marks are
 * `{ status, reason }` per student, and the attendance rate is (present + late) ÷ marked.
 *
 * Other features read attendance through `registerTakenToday`, `attendanceSummary` and
 * `attendanceOf`, never through `REGISTERS` directly.
 */
import { MockHttpError } from '@edutrack/web-core/mock';

import type { AttendanceCounts, AttendanceMark, AttendanceSummary } from '@/types';

import {
  addDays,
  closureReason,
  formatDay,
  isoToday,
  nowLocal,
  previousSchoolDays,
  schoolDaysBetween,
  weekdayOf,
} from './clock';
import { logHistory } from './notify-db';
import { ARMS, MEMBERSHIPS, TERMS, seeded, type StudentRecord } from './school-db';
import { studentsInArm, termById } from './scope';

export const ATTENDANCE_MARKS: AttendanceMark[] = ['Present', 'Absent', 'Late', 'Excused'];
/** How many school days before today a register can still be changed. */
export const EDIT_WINDOW = 5;

export interface RegisterRecord {
  armId: string;
  date: string;
  takenBy: string;
  /** Local "YYYY-MM-DDTHH:mm" of the first save. */
  takenAt: string;
  updatedAt: string;
  marks: Record<string, { status: AttendanceMark; reason: string }>;
  /** Guardians told about an absence (log only until the guardian portal exists). */
  notified: { studentId: string; at: string }[];
}

/** "armId|date" → the day's register. */
export const REGISTERS = new Map<string, RegisterRecord>();
const keyOf = (armId: string, date: string) => `${armId}|${date}`;
export const registerOf = (armId: string, date: string) =>
  REGISTERS.get(keyOf(armId, date)) ?? null;
export const historyKeyOf = (armId: string, date: string) => `register:${armId}|${date}`;

/* ---------- Who is on the roll ---------- */

/** Whether a student was in the arm on a date (joined on or before it, not yet left). */
export const onRoll = (studentId: string, armId: string, date: string) =>
  MEMBERSHIPS.some(
    (m) =>
      m.studentId === studentId &&
      m.armId === armId &&
      m.from <= date &&
      (m.to === null || m.to >= date),
  );

/** Everyone in the arm on a given day, in register order. */
export function rollFor(armId: string, termId: string, date: string): StudentRecord[] {
  return studentsInArm(armId, termId, { includeLeft: true }).filter((s) =>
    onRoll(s.id, armId, date),
  );
}

/* ---------- Dates ---------- */

/** The term a date falls in, or null. */
export const termOfDate = (date: string) =>
  TERMS.find((t) => date >= t.start && date <= t.end) ?? null;

/** The last day a term's registers count up to: yesterday-or-today for the active term. */
export const termCutoff = (termId: string) => {
  const t = termById(termId);
  const today = isoToday();
  return today < t.end ? today : t.end;
};

/** School days of a term up to today (or its end), oldest first. */
export const termSchoolDays = (termId: string) => {
  const t = termById(termId);
  return t.start > isoToday() ? [] : schoolDaysBetween(t.start, termCutoff(termId));
};

/** "Tue 8 Dec" */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayLabel = (date: string) => `${DAYS[weekdayOf(date)]} ${formatDay(date, false)}`;

/** Days the register can still be changed: today and the previous 5 school days. */
export const editableDays = () => [isoToday(), ...previousSchoolDays(EDIT_WINDOW)];

/**
 * Why a day's register can't be taken or changed, or null when it can. `code` tells the UI which
 * notice to show: no school that day, a future day, too old, or a read-only term.
 */
export function registerLock(
  termId: string,
  date: string,
): {
  code: 'NO_SCHOOL' | 'FUTURE' | 'OUT_OF_TERM' | 'TERM_LOCKED' | 'TOO_OLD';
  reason: string;
} | null {
  const t = termById(termId);
  if (date < t.start || date > t.end)
    return {
      code: 'OUT_OF_TERM',
      reason: `${formatDay(date)} isn’t in ${t.name} (${formatDay(t.start, false)} – ${formatDay(t.end, false)}).`,
    };
  const closed = closureReason(date);
  if (closed)
    return { code: 'NO_SCHOOL', reason: `There’s no register on ${dayLabel(date)}: ${closed}.` };
  if (date > isoToday())
    return {
      code: 'FUTURE',
      reason: `${dayLabel(date)} hasn’t happened yet. You can take a register on the day.`,
    };
  if (t.status !== 'Active')
    return {
      code: 'TERM_LOCKED',
      reason: `${t.sessionName} ${t.name} is closed. Its registers are read-only.`,
    };
  if (!editableDays().includes(date))
    return {
      code: 'TOO_OLD',
      reason: `Registers can be changed for ${EDIT_WINDOW} school days. ${dayLabel(date)} is older, so it’s read-only. Ask the academic office to correct it.`,
    };
  return null;
}

/* ---------- Counting ---------- */

export const emptyCounts = (): AttendanceCounts => ({ present: 0, absent: 0, late: 0, excused: 0 });
const KEY: Record<AttendanceMark, keyof AttendanceCounts> = {
  Present: 'present',
  Absent: 'absent',
  Late: 'late',
  Excused: 'excused',
};

/** Present or late ÷ marked, to one decimal place; null when nothing was marked. */
export function attendancePercent(c: AttendanceCounts) {
  const marked = c.present + c.absent + c.late + c.excused;
  return marked ? Math.round(((c.present + c.late) / marked) * 1000) / 10 : null;
}

export function countMarks(marks: { status: AttendanceMark }[]) {
  const c = emptyCounts();
  for (const m of marks) c[KEY[m.status]]++;
  return c;
}

/** A student's marks in an arm for a term (days taken while they were on the roll). */
export function attendanceOf(studentId: string, armId: string, termId: string) {
  const days = termSchoolDays(termId).filter((d) => onRoll(studentId, armId, d));
  const counts = emptyCounts();
  const marks: Record<string, { status: AttendanceMark; reason: string }> = {};
  for (const d of days) {
    const mark = registerOf(armId, d)?.marks[studentId];
    if (!mark) continue;
    marks[d] = mark;
    counts[KEY[mark.status]]++;
  }
  return { days, counts, marks };
}

/* ---------- Exports for the dashboard and the student page ---------- */

/** Whether today's register for an arm has been taken. */
export const registerTakenToday = (armId: string) => REGISTERS.has(keyOf(armId, isoToday()));

/**
 * A student's attendance in a term, in the arm(s) they were in: present, absent, late and
 * excused marks, the school days they were on the roll so far, and (present + late) ÷ marked.
 */
export function attendanceSummary(studentId: string, termId: string): AttendanceSummary {
  const sessionId = termById(termId).sessionId;
  const arms = ARMS.filter(
    (a) =>
      a.sessionId === sessionId &&
      MEMBERSHIPS.some((m) => m.studentId === studentId && m.armId === a.id),
  );
  const counts = emptyCounts();
  let schoolDays = 0;
  for (const a of arms) {
    const { days, counts: c } = attendanceOf(studentId, a.id, termId);
    schoolDays += days.length;
    for (const k of Object.keys(counts) as (keyof AttendanceCounts)[]) counts[k] += c[k];
  }
  return { ...counts, schoolDays, percent: attendancePercent(counts) };
}

/* ---------- Saving ---------- */

export interface MarkInput {
  studentId?: unknown;
  status?: unknown;
  reason?: unknown;
}

/**
 * Saves a day's register. Every student on the roll needs a mark; Excused needs a reason, Absent
 * takes an optional note. Guardians of students newly marked Absent are notified (logged on the
 * day's history). Returns the record and who was notified.
 */
export function saveRegister(
  armId: string,
  termId: string,
  date: string,
  teacherId: string,
  teacherName: string,
  input: unknown,
) {
  const lock = registerLock(termId, date);
  if (lock)
    throw new MockHttpError(
      409,
      lock.reason,
      lock.code === 'TERM_LOCKED' ? 'TERM_LOCKED' : `REGISTER_${lock.code}`,
    );
  const roll = rollFor(armId, termId, date);
  const list = (input as { marks?: unknown } | undefined)?.marks;
  if (!Array.isArray(list))
    throw new MockHttpError(422, 'Mark every student before saving.', 'VALIDATION');
  const byId = new Map<string, MarkInput>();
  for (const m of list as MarkInput[])
    if (typeof m?.studentId === 'string') byId.set(m.studentId, m);
  const fields: Record<string, string> = {};
  const marks: RegisterRecord['marks'] = {};
  for (const s of roll) {
    const m = byId.get(s.id);
    const status = m?.status;
    if (typeof status !== 'string' || !ATTENDANCE_MARKS.includes(status as AttendanceMark)) {
      fields[s.id] = 'Choose Present, Absent, Late or Excused.';
      continue;
    }
    const reason = typeof m?.reason === 'string' ? m.reason.trim() : '';
    if (status === 'Excused' && reason.length < 3) {
      fields[s.id] = 'Give a reason for Excused (e.g. Hospital appointment).';
      continue;
    }
    if (reason.length > 200) {
      fields[s.id] = 'Keep the reason or note under 200 characters.';
      continue;
    }
    marks[s.id] = {
      status: status as AttendanceMark,
      reason: status === 'Excused' || status === 'Absent' ? reason : '',
    };
  }
  const extra = [...byId.keys()].filter((id) => !roll.some((s) => s.id === id));
  if (extra.length)
    throw new MockHttpError(
      422,
      'Some students in this register weren’t in the class on that day. Refresh and try again.',
      'VALIDATION',
    );
  const missing = Object.keys(fields).length;
  if (missing)
    throw new MockHttpError(
      422,
      `${missing} student${missing === 1 ? ' needs' : 's need'} a mark or a reason before you can save.`,
      'VALIDATION',
      fields,
    );

  const existing = registerOf(armId, date);
  const before = existing?.marks ?? {};
  const now = nowLocal();
  const record: RegisterRecord = existing ?? {
    armId,
    date,
    takenBy: teacherId,
    takenAt: now,
    updatedAt: now,
    marks: {},
    notified: [],
  };
  record.marks = marks;
  record.updatedAt = now;
  REGISTERS.set(keyOf(armId, date), record);

  const counts = countMarks(Object.values(marks));
  const newlyAbsent = roll.filter(
    (s) => marks[s.id]!.status === 'Absent' && before[s.id]?.status !== 'Absent',
  );
  for (const s of newlyAbsent) record.notified.push({ studentId: s.id, at: now });
  const h = historyKeyOf(armId, date);
  logHistory(
    h,
    existing ? `Register updated by ${teacherName}` : `Register taken by ${teacherName}`,
    countsLabel(counts),
    existing ? 'info' : 'success',
  );
  if (newlyAbsent.length)
    logHistory(
      h,
      `Guardians of ${newlyAbsent.length} student${newlyAbsent.length === 1 ? '' : 's'} notified`,
      `${newlyAbsent.map((s) => s.name).join(', ')} · marked absent (in-app, email and SMS per school settings)`,
      'warning',
    );
  return { record, notified: newlyAbsent };
}

export const countsLabel = (c: AttendanceCounts) =>
  [
    `${c.present} present`,
    c.late && `${c.late} late`,
    c.absent && `${c.absent} absent`,
    c.excused && `${c.excused} excused`,
  ]
    .filter(Boolean)
    .join(' · ');

/* ---------- Seed ---------- */

const EXCUSES = [
  'Hospital appointment',
  'Family bereavement',
  'Representing the school at the inter-house sports',
  'Medical: malaria, note from the clinic',
  'Travelled for a family wedding (approved by the principal)',
];
const ABSENT_NOTES = ['', '', '', 'No word from home', 'Guardian called: unwell'];

/** Days not taken, so history shows gaps (one locked, one still editable). */
const GAPS: Record<string, string[]> = {
  'mc-jss2b': ['2026-11-19', '2026-12-03'],
  'mc-sss1a': ['2026-11-19', '2026-12-03'],
};

function seedRegisters() {
  const today = isoToday();
  for (const term of TERMS) {
    if (term.start > today) continue;
    const last = term.status === 'Closed' ? term.end : addDays(today, -1);
    const days = schoolDaysBetween(term.start, last < term.end ? last : term.end);
    for (const arm of ARMS.filter((a) => a.sessionId === term.sessionId && a.classTeacherId)) {
      const rng = seeded(
        [...arm.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) ^
          +term.start.slice(0, 4),
      );
      const students = studentsInArm(arm.id, term.id, { includeLeft: true });
      for (const date of days) {
        if (GAPS[arm.id]?.includes(date) && term.status === 'Active') continue;
        if (!GAPS[arm.id] && rng.chance(0.02)) continue;
        const marks: RegisterRecord['marks'] = {};
        for (const s of students) {
          if (!onRoll(s.id, arm.id, date)) continue;
          const roll = rng.next();
          if (roll < 0.95) marks[s.id] = { status: 'Present', reason: '' };
          else if (roll < 0.97) marks[s.id] = { status: 'Late', reason: '' };
          else if (roll < 0.99) marks[s.id] = { status: 'Absent', reason: rng.pick(ABSENT_NOTES) };
          else marks[s.id] = { status: 'Excused', reason: rng.pick(EXCUSES) };
        }
        const at = `${date}T07:${String(rng.int(41, 58)).padStart(2, '0')}`;
        const absent = Object.keys(marks).filter((id) => marks[id]!.status === 'Absent');
        REGISTERS.set(keyOf(arm.id, date), {
          armId: arm.id,
          date,
          takenBy: arm.classTeacherId!,
          takenAt: at,
          updatedAt: at,
          marks,
          notified: absent.map((studentId) => ({ studentId, at })),
        });
      }
    }
  }
}

seedRegisters();
