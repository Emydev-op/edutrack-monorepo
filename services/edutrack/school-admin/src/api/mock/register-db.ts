/*
 * What class teachers record in the Teacher Workspace, as School Admin sees it: the daily register
 * for each arm, and each student's report-card remark and conduct ratings. School Admin only reads
 * these. Greenfield is seeded for First Term 2026/2027 up to today (the real date); Crestview has
 * none.
 */
import type { AttendanceCounts, AttendanceMark, ConductTrait, Term } from '@/types';
import { CONDUCT_TRAITS } from '@/types';

import {
  academicsData,
  armLabel,
  armStudents,
  PUBLIC_HOLIDAYS,
  seeded,
  type AcademicsData,
  type ArmRec,
  type LevelRec,
} from './academics-db';
import { addDays, isoToday } from './finance-ledger';

export interface RegisterRec {
  armId: string;
  date: string;
  takenBy: string;
  /** "07:52". */
  takenAt: string;
  /** studentId → mark, for students with a record. */
  marks: Record<string, { status: AttendanceMark; reason: string }>;
  /** Students counted in the arm without a record: how many got each mark. */
  headcount: AttendanceCounts;
}

export interface RemarkRec {
  remark: string;
  ratings: Partial<Record<ConductTrait, number>>;
  by: string;
}

export interface RegisterData {
  /** "armId|date" → the day's register. */
  registers: Record<string, RegisterRec>;
  /** "termId|studentId" → the class teacher's report-card entry. */
  remarks: Record<string, RemarkRec>;
}

/* ---------------- School days ---------------- */

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
export const isWeekend = (iso: string) => weekday(iso) === 0 || weekday(iso) === 6;

/** Weekdays in a term with no classes, and why: public holidays, breaks and no-class events. */
export function closures(acad: AcademicsData, term: Pick<Term, 'start' | 'end' | 'events'>) {
  const out = new Map<string, string>();
  const mark = (start: string, end: string, name: string) => {
    for (let d = start; d <= end; d = addDays(d, 1))
      if (d >= term.start && d <= term.end && !isWeekend(d) && !out.has(d)) out.set(d, name);
  };
  for (const [d, name] of PUBLIC_HOLIDAYS) mark(d, d, name);
  for (const e of term.events) if (e.type === 'midterm') mark(e.start, e.end, e.name);
  for (const e of acad.events)
    if (e.type === 'Holiday' || e.type === 'Break' || /no classes/i.test(e.notes))
      mark(e.start, e.end, e.title);
  return out;
}

/** School days in a term up to a date (inclusive): weekdays that aren't closures. */
export function schoolDays(
  acad: AcademicsData,
  term: Pick<Term, 'start' | 'end' | 'events'>,
  upTo = isoToday(),
) {
  const closed = closures(acad, term);
  const last = upTo < term.end ? upTo : term.end;
  const out: string[] = [];
  for (let d = term.start; d <= last; d = addDays(d, 1))
    if (!isWeekend(d) && !closed.has(d)) out.push(d);
  return out;
}

/** Present or late ÷ everything marked, to one decimal place; null when nothing is marked. */
export function attendanceRate(c: AttendanceCounts) {
  const marked = c.present + c.late + c.absent + c.excused;
  return marked ? Math.round(((c.present + c.late) / marked) * 1000) / 10 : null;
}

export const emptyCounts = (): AttendanceCounts => ({ present: 0, late: 0, absent: 0, excused: 0 });

const KEY: Record<AttendanceMark, keyof AttendanceCounts> = {
  Present: 'present',
  Late: 'late',
  Absent: 'absent',
  Excused: 'excused',
};
export const countKey = (m: AttendanceMark) => KEY[m];

/* ---------------- Greenfield seed ---------------- */

const EXCUSED = [
  'Hospital appointment',
  'Family wedding',
  'Inter-school quiz competition',
  'Religious observance',
  'Bereavement in the family',
];
const ABSENT = ['', '', 'Sick · parent called', 'No reason given', 'Unwell'];

/** Students who miss more days than most, so the per-student view has something to show. */
const RATE: Record<string, number> = { daniel: 0.84, blessing: 0.88, seun: 0.9 };

function markFor(key: string, rate: number): { status: AttendanceMark; reason: string } {
  const r = seeded(key);
  if (r < rate) return { status: 'Present', reason: '' };
  const rest = (r - rate) / (1 - rate);
  if (rest < 0.35) return { status: 'Late', reason: '' };
  if (rest < 0.75)
    return { status: 'Absent', reason: ABSENT[Math.floor(seeded(`${key}a`) * ABSENT.length)]! };
  return { status: 'Excused', reason: EXCUSED[Math.floor(seeded(`${key}e`) * EXCUSED.length)]! };
}

function seedRegisters(schoolId: string, acad: AcademicsData, out: RegisterData) {
  const term = acad.sessions.flatMap((s) => s.terms).find((t) => t.status === 'Active');
  if (!term) return;
  const today = isoToday();
  const days = schoolDays(acad, term, today);
  const recent = days.slice(-6, -1);
  for (const level of acad.levels)
    for (const arm of level.arms) {
      // Nobody takes the register for an arm without a class teacher (SSS 1C).
      if (!arm.classTeacherId) continue;
      const teacher = acad.teachers.find((t) => t.id === arm.classTeacherId)?.name ?? '';
      const { records, count } = armStudents(schoolId, level, arm);
      // An empty arm has no register to take.
      if (!count) continue;
      const others = count - records.length;
      // A few arms missed one or two recent days; some haven't taken today's yet.
      const missed = seeded(`${arm.id}missed`) < 0.2 ? recent.filter((_, i) => i % 2 === 1) : [];
      const lateToday = seeded(`${arm.id}today`) < 0.2;
      for (const date of days) {
        if (missed.includes(date) || (date === today && lateToday)) continue;
        const marks: RegisterRec['marks'] = {};
        for (const s of records) marks[s.id] = markFor(`${s.id}${date}`, RATE[s.id] ?? 0.915);
        const headcount = emptyCounts();
        for (let i = 0; i < others; i++)
          headcount[KEY[markFor(`${arm.id}${i}${date}`, 0.915).status]]++;
        out.registers[`${arm.id}|${date}`] = {
          armId: arm.id,
          date,
          takenBy: teacher,
          takenAt: `07:${String(40 + Math.floor(seeded(`${arm.id}${date}t`) * 20)).padStart(2, '0')}`,
          marks,
          headcount,
        };
      }
    }
}

/** Report-card remarks by how the student is doing; {name} is the first name. */
const REMARKS = [
  '{name} is a hardworking and well-behaved student who gives every subject full attention. Keep it up.',
  '{name} has made steady progress this term and participates well in class. More effort in weaker subjects will help.',
  '{name} is capable of much more. Better time management and regular revision at home are needed next term.',
  '{name} is polite and helpful to classmates. Paying closer attention in class will improve results.',
  '{name} shows good leadership and is a positive example to others. An excellent term overall.',
];

/** JSS 2B: Mrs. Okafor hasn't written these three yet. */
const NOT_YET = new Set(['aisha', 'samuel', 'yusuf']);

function seedRemarks(schoolId: string, acad: AcademicsData, out: RegisterData) {
  const term = acad.sessions.flatMap((s) => s.terms).find((t) => t.status === 'Active');
  if (!term) return;
  for (const level of acad.levels)
    for (const arm of level.arms) {
      if (!arm.classTeacherId) continue;
      const by = acad.teachers.find((t) => t.id === arm.classTeacherId)?.name ?? '';
      for (const s of armStudents(schoolId, level, arm).records) {
        if (NOT_YET.has(s.id)) continue;
        // One standing per student, so the ratings and the remark agree.
        const base = 2.6 + seeded(`${s.id}remark`) * 2.2;
        const ratings: RemarkRec['ratings'] = {};
        CONDUCT_TRAITS.forEach((t, i) => {
          const noise = (seeded(`${s.id}trait${i}`) - 0.5) * 1.8;
          ratings[t] = Math.max(1, Math.min(5, Math.round(base + noise)));
        });
        const pick = base >= 4.4 ? 4 : base >= 3.9 ? 0 : base >= 3.4 ? 3 : base >= 3 ? 1 : 2;
        out.remarks[`${term.id}|${s.id}`] = {
          remark: REMARKS[pick]!.replace('{name}', s.firstName),
          ratings,
          by,
        };
      }
    }
}

export const registerData: Record<string, RegisterData> = Object.fromEntries(
  Object.keys(academicsData).map((id) => {
    const data: RegisterData = { registers: {}, remarks: {} };
    if (id === 'greenfield') {
      seedRegisters(id, academicsData[id]!, data);
      seedRemarks(id, academicsData[id]!, data);
    }
    return [id, data];
  }),
);

export const registersFor = (schoolId: string) =>
  (registerData[schoolId] ??= { registers: {}, remarks: {} });

/** An arm's registers and students over a set of school days. */
export function armAttendance(
  schoolId: string,
  level: LevelRec,
  arm: ArmRec,
  days: string[],
): {
  name: string;
  counts: AttendanceCounts;
  taken: string[];
  byStudent: Map<string, AttendanceCounts>;
} {
  const regs = registersFor(schoolId).registers;
  const counts = emptyCounts();
  const taken: string[] = [];
  const byStudent = new Map<string, AttendanceCounts>();
  for (const d of days) {
    const reg = regs[`${arm.id}|${d}`];
    if (!reg) continue;
    taken.push(d);
    for (const [id, m] of Object.entries(reg.marks)) {
      counts[KEY[m.status]]++;
      const c = byStudent.get(id) ?? emptyCounts();
      c[KEY[m.status]]++;
      byStudent.set(id, c);
    }
    for (const k of Object.keys(counts) as (keyof AttendanceCounts)[])
      counts[k] += reg.headcount[k];
  }
  return { name: armLabel(level.name, arm.arm), counts, taken, byStudent };
}
