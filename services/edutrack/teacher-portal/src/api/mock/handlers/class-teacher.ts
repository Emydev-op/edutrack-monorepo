/**
 * My class (class teachers only): the daily register, class progress across subjects, and
 * report-card remarks and conduct ratings.
 *
 * GET  /v1/class-teacher/register?term=&date=          one day's register (default: today)
 * PUT  /v1/class-teacher/register/:date?term=          save it { marks: [{ studentId, status, reason? }] }
 * GET  /v1/class-teacher/register/history?term=        per day and per student for the term
 * GET  /v1/class-teacher/progress?term=                every subject's sheet for my arm
 * POST /v1/class-teacher/progress/:sheetId/remind      in-app reminder to the subject teacher (once a day)
 * GET  /v1/class-teacher/report-cards?term=            remarks progress, totals so far, attendance
 * GET  /v1/class-teacher/report-cards/:studentId?term= one student's remark and ratings
 * PUT  /v1/class-teacher/report-cards/:studentId?term= save { remark, ratings }
 */
import { MockHttpError, mock } from '@edutrack/web-core/mock';

import { routesPath as r } from '@/router/routes-path';
import type {
  ClassArmRef,
  ClassProgress,
  ConductTrait,
  RegisterDay,
  RegisterHistory,
  ReportCardEntry,
  ReportCardsList,
  SaveRegisterResult,
  SheetStatus,
} from '@/types';
import { CONDUCT_TRAITS } from '@/types';

import { formatDay, isoToday, nowLocal } from '../clock';
import { logHistory, notify, timelineOf } from '../notify-db';
import {
  attendanceOf,
  attendancePercent,
  attendanceSummary,
  countMarks,
  editableDays,
  emptyCounts,
  historyKeyOf,
  registerLock,
  registerOf,
  registerTakenToday,
  rollFor,
  saveRegister,
  termSchoolDays,
} from '../register-db';
import {
  isDone,
  remarkOf,
  remarksProgress,
  reportCardHistoryKey,
  reportCardLock,
  reportCardStudents,
  saveRemark,
} from '../report-cards-db';
import {
  SHEET_STATUSES,
  historyKey as sheetHistoryKey,
  sheetsForArm,
  studentTermResults,
} from '../results-db';
import { type ArmRecord, type TermRecord } from '../school-db';
import {
  activeTerm,
  branchOf,
  classArmOf,
  currentTeacher,
  forbidden,
  requireClassArm,
  requireEditableTerm,
  staffById,
  studentById,
  studentsInArm,
  termFor,
} from '../scope';
import { registerNavCount } from './shell';

const armRef = (arm: ArmRecord, term: TermRecord): ClassArmRef => ({
  armId: arm.id,
  arm: arm.name,
  branchName: branchOf(arm.branchId).name,
  termId: term.id,
});

/* ---------- Register ---------- */

/** The day a register opens on when none is asked for: today, or a past term's last school day. */
function defaultDay(term: TermRecord) {
  const today = isoToday();
  if (today >= term.start && today <= term.end) return today;
  const days = termSchoolDays(term.id);
  return days[days.length - 1] ?? term.start;
}

function registerDay(arm: ArmRecord, term: TermRecord, date: string): RegisterDay {
  const lock = registerLock(term.id, date);
  const record = registerOf(arm.id, date);
  const roll =
    lock?.code === 'NO_SCHOOL' || lock?.code === 'OUT_OF_TERM' || lock?.code === 'FUTURE'
      ? []
      : rollFor(arm.id, term.id, date);
  const rows = roll.map((s) => {
    const mark = record?.marks[s.id];
    return {
      studentId: s.id,
      name: s.name,
      admissionNo: s.admissionNo,
      status: mark?.status ?? null,
      reason: mark?.reason ?? '',
      guardianNotified: Boolean(record?.notified.some((n) => n.studentId === s.id)),
    };
  });
  const counts = countMarks(rows.filter((x) => x.status).map((x) => ({ status: x.status! })));
  return {
    ...armRef(arm, term),
    date,
    today: isoToday(),
    taken: Boolean(record),
    takenBy: record ? staffById(record.takenBy).name : null,
    takenAt: record?.takenAt ?? null,
    updatedAt: record && record.updatedAt !== record.takenAt ? record.updatedAt : null,
    lock,
    rows,
    counts: { ...counts, unmarked: rows.filter((x) => !x.status).length },
    editableDays: term.status === 'Active' ? editableDays() : [],
    termStart: term.start,
    termEnd: term.end,
    history: timelineOf(historyKeyOf(arm.id, date)),
  };
}

const dateParam = (value: string | undefined) => {
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new MockHttpError(422, 'Choose a valid date.', 'VALIDATION');
  return value;
};

mock.get('/v1/class-teacher/register', (req): RegisterDay => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  return registerDay(arm, term, dateParam(req.query.date) ?? defaultDay(term));
});

mock.put('/v1/class-teacher/register/:date', (req): SaveRegisterResult => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  const date = dateParam(req.params.date)!;
  const { notified } = saveRegister(arm.id, term.id, date, t.id, t.name, req.body);
  return { register: registerDay(arm, term, date), notified: notified.map((s) => s.name) };
});

mock.get('/v1/class-teacher/register/history', (req): RegisterHistory => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  const days = termSchoolDays(term.id);
  const dayRows = days
    .map((date) => {
      const record = registerOf(arm.id, date);
      const roll = rollFor(arm.id, term.id, date);
      const counts = record ? countMarks(Object.values(record.marks)) : emptyCounts();
      return {
        date,
        taken: Boolean(record),
        takenBy: record ? staffById(record.takenBy).name : null,
        takenAt: record?.takenAt ?? null,
        ...counts,
        percent: record ? attendancePercent(counts) : null,
        students: roll.length,
      };
    })
    .reverse();
  // Everyone who was in the arm during the term (the transferred student too).
  const students = studentsInArm(arm.id, term.id, { includeLeft: true }).map((s) => {
    const { days: onRoll, counts } = attendanceOf(s.id, arm.id, term.id);
    const marked = counts.present + counts.absent + counts.late + counts.excused;
    const membershipNote =
      s.leftOn && s.leftOn <= term.end
        ? `Left ${formatDay(s.leftOn, false)} (transferred)`
        : s.joinedOn > term.start
          ? `Joined ${formatDay(s.joinedOn, false)}`
          : '';
    return {
      studentId: s.id,
      name: s.name,
      admissionNo: s.admissionNo,
      ...counts,
      schoolDays: onRoll.length,
      marked,
      percent: attendancePercent(counts),
      note: membershipNote,
    };
  });
  const taken = dayRows.filter((d) => d.taken);
  const total = taken.reduce(
    (c, d) => ({
      present: c.present + d.present,
      absent: c.absent + d.absent,
      late: c.late + d.late,
      excused: c.excused + d.excused,
    }),
    emptyCounts(),
  );
  return {
    ...armRef(arm, term),
    term: `${term.sessionName} · ${term.name}`,
    today: isoToday(),
    schoolDays: days.length,
    daysTaken: taken.length,
    notTaken: days.length - taken.length,
    percent: attendancePercent(total),
    days: dayRows,
    students,
  };
});

/** Sidebar: 1 while today is a school day and today's register isn't taken. */
registerNavCount(r.classTeacher.register.name, (teacherId, termId) => {
  if (termId !== activeTerm().id) return 0;
  const arm = classArmOf(teacherId, termId);
  if (!arm || registerLock(termId, isoToday())) return 0;
  return registerTakenToday(arm.id) ? 0 : 1;
});

/* ---------- Class progress ---------- */

/** "sheetId|date" → when the reminder went out. */
const REMINDERS = new Map<string, string>();
const reminderKey = (sheetId: string) => `${sheetId}|${isoToday()}`;
const REMINDABLE: SheetStatus[] = ['Not started', 'Draft', 'Returned'];

mock.get('/v1/class-teacher/progress', (req): ClassProgress => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  const editable = term.status === 'Active';
  const sheets = sheetsForArm(arm.id, term.id).sort((a, b) =>
    a.subjectName.localeCompare(b.subjectName),
  );
  const summary = Object.fromEntries(SHEET_STATUSES.map((s) => [s, 0])) as Record<
    SheetStatus,
    number
  >;
  for (const s of sheets) summary[s.status]++;
  return {
    ...armRef(arm, term),
    students: reportCardStudents(arm.id, term.id).length,
    deadline: term.resultEntryCloses,
    editable,
    summary,
    subjects: sheets.map((s) => {
      const isMine = s.teacherId === t.id;
      const remindedAt = REMINDERS.get(reminderKey(s.sheetId)) ?? null;
      return {
        ...s,
        isMine,
        canRemind: editable && !isMine && REMINDABLE.includes(s.status) && !remindedAt,
        remindedAt,
      };
    }),
  };
});

mock.post('/v1/class-teacher/progress/:sheetId/remind', (req) => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  const sheet = sheetsForArm(arm.id, term.id).find((s) => s.sheetId === req.params.sheetId);
  if (!sheet)
    forbidden(
      `You can only send reminders about ${arm.name}’s subjects. That sheet isn’t one of them.`,
    );
  const s = sheet!;
  requireEditableTerm(term.id);
  if (s.teacherId === t.id)
    throw new MockHttpError(
      409,
      'This is your own sheet. Open it from Results to finish it.',
      'OWN_SHEET',
    );
  if (!REMINDABLE.includes(s.status))
    throw new MockHttpError(
      409,
      `${s.teacherName} has already submitted ${s.subjectName}. There’s nothing to remind them about.`,
      'NOT_REMINDABLE',
    );
  const key = reminderKey(s.sheetId);
  if (REMINDERS.has(key))
    throw new MockHttpError(
      409,
      `You already reminded ${s.teacherName} about ${s.subjectName} today. You can remind them again tomorrow.`,
      'ALREADY_REMINDED',
    );
  const at = nowLocal();
  REMINDERS.set(key, at);
  const missing = s.completion.missing;
  notify(s.teacherId, {
    title: `${t.name} reminded you about ${arm.name} · ${s.subjectName}`,
    body: `Class teacher of ${arm.name}: ${
      s.status === 'Returned'
        ? 'your returned sheet is waiting to be fixed and resubmitted'
        : missing
          ? `${missing} student${missing === 1 ? ' is' : 's are'} missing scores`
          : 'the sheet is ready to submit'
    }. Result entry closes ${term.resultEntryCloses ? formatDay(term.resultEntryCloses.slice(0, 10), false) : 'soon'}.`,
    category: 'results',
    to: { name: r.results.sheet.name, params: { sheetId: s.sheetId } },
    emailEvent: 'class-reminder',
  });
  logHistory(
    sheetHistoryKey(s.sheetId),
    `Reminder from class teacher ${t.name}`,
    `Sent to ${s.teacherName}`,
    'info',
  );
  return { remindedAt: at, teacherName: s.teacherName };
});

/* ---------- Report cards ---------- */

function requireStudentInArm(arm: ArmRecord, termId: string, studentId: string) {
  const s = studentById(studentId);
  const list = reportCardStudents(arm.id, termId);
  const i = list.findIndex((x) => x.id === studentId);
  if (i < 0)
    forbidden(
      `You don’t have access to ${s.name}’s report card. You’re the class teacher of ${arm.name}.`,
    );
  return { student: s, list, index: i };
}

mock.get('/v1/class-teacher/report-cards', (req): ReportCardsList => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  const lock = reportCardLock(arm.id, term.id);
  const subjects = sheetsForArm(arm.id, term.id)
    .map((s) => ({ code: s.subject, name: s.subjectName }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...armRef(arm, term),
    term: `${term.sessionName} · ${term.name}`,
    editable: !lock,
    lockReason: lock?.reason ?? null,
    progress: remarksProgress(arm.id, term.id),
    subjects,
    students: reportCardStudents(arm.id, term.id).map((s) => {
      const entry = remarkOf(term.id, s.id);
      return {
        studentId: s.id,
        name: s.name,
        admissionNo: s.admissionNo,
        done: isDone(entry),
        remark: entry?.remark ?? null,
        results: studentTermResults(s.id, term.id),
        attendance: attendanceSummary(s.id, term.id),
      };
    }),
  };
});

function reportCardEntry(arm: ArmRecord, term: TermRecord, studentId: string): ReportCardEntry {
  const { student, list, index } = requireStudentInArm(arm, term.id, studentId);
  const entry = remarkOf(term.id, student.id);
  const lock = reportCardLock(arm.id, term.id);
  return {
    ...armRef(arm, term),
    student: {
      id: student.id,
      name: student.name,
      admissionNo: student.admissionNo,
      gender: student.gender,
    },
    term: `${term.sessionName} · ${term.name}`,
    remark: entry?.remark ?? '',
    ratings: Object.fromEntries(
      CONDUCT_TRAITS.map((tr) => [tr, entry?.ratings[tr] ?? null]),
    ) as Record<ConductTrait, number | null>,
    done: isDone(entry),
    updatedAt: entry?.updatedAt ?? null,
    updatedBy: entry ? staffById(entry.by).name : null,
    results: studentTermResults(student.id, term.id),
    attendance: attendanceSummary(student.id, term.id),
    editable: !lock,
    lockReason: lock?.reason ?? null,
    index: index + 1,
    total: list.length,
    prevId: list[index - 1]?.id ?? null,
    nextId: list[index + 1]?.id ?? null,
    history: timelineOf(reportCardHistoryKey(term.id, student.id)),
  };
}

mock.get('/v1/class-teacher/report-cards/:studentId', (req): ReportCardEntry => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  return reportCardEntry(arm, term, req.params.studentId!);
});

mock.put('/v1/class-teacher/report-cards/:studentId', (req): ReportCardEntry => {
  const t = currentTeacher(req);
  const term = termFor(req);
  const arm = requireClassArm(t.id, term.id);
  const { student } = requireStudentInArm(arm, term.id, req.params.studentId!);
  saveRemark(arm.id, term.id, student.id, t.id, t.name, req.body);
  return reportCardEntry(arm, term, student.id);
});

/** Sidebar: students still missing a remark or a rating. */
registerNavCount(r.classTeacher.reportCards.name, (teacherId, termId) => {
  const arm = classArmOf(teacherId, termId);
  if (!arm || reportCardLock(arm.id, termId)) return 0;
  const { done, total } = remarksProgress(arm.id, termId);
  return total - done;
});
