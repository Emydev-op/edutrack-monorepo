import { mock, MockHttpError } from '@edutrack/web-core/mock';

import { routesPath } from '@/router/routes-path';
import type {
  AcademicSession,
  ArmInput,
  AssessmentConfig,
  AssessmentScheme,
  AssignmentInput,
  AssignmentsView,
  AssignmentWarning,
  CalendarEvent,
  CalendarEventInput,
  CalendarView,
  Checklist,
  ClassDetail,
  ClassesView,
  CopyArea,
  CurriculumView,
  ElectiveGroup,
  LevelInput,
  NewSessionPayload,
  Offering,
  SectionInput,
  SectionsView,
  SessionsView,
  SubjectInput,
  TermEvent,
  TermInput,
  TimetableArmOption,
  TimetableView,
} from '@/types';
import { DAYS } from '@/types';

import {
  armLabel,
  armStudents,
  autoTimetable,
  curriculumFromSuggestions,
  DEFAULT_LEVELS,
  LESSON_SLOTS,
  MAX_CONSECUTIVE,
  offeredSubjects,
  PERIODS,
  PUBLIC_HOLIDAYS,
  syncStudentClasses,
  teacherBusy,
  type AcademicsData,
  type LevelRec,
  type TimetableRec,
} from '../academics-db';
import { schoolData } from '../school-db';
import { studentsData } from '../students-db';
import {
  acadFor,
  activeBranches,
  allArms,
  branchName,
  currentSession,
  currentTerm,
  findArm,
  fmtDate,
  levelsBySection,
  nextId,
  nowLabel,
  orderedLevels,
  plural,
  subjectName,
  subjectPeriods,
  teacherLoad,
  teacherName,
  termFrom,
  toArm,
  today,
} from './academics-shared';
import { requireText } from './shared';

const fail = (msg: string, status = 422): never => {
  throw new MockHttpError(status, msg);
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const r = routesPath.academics;

/* ======================= Sections ======================= */

function sectionsView(schoolId: string, acad: AcademicsData): SectionsView {
  const branches = activeBranches(schoolId);
  return {
    confirmed: acad.confirmed.sections,
    sections: acad.sections.map((s) => ({
      ...s,
      levels: acad.levels.filter((l) => l.section === s.name).length,
      branches: branches.filter((b) => b.sections.includes(s.name)).map((b) => b.name),
    })),
  };
}

mock.get('/v1/academics/sections', (req) => {
  const { acad, schoolId } = acadFor(req);
  return sectionsView(schoolId, acad);
});

mock.put('/v1/academics/sections', (req) => {
  const { acad, schoolId, data, log } = acadFor(req);
  const input = (req.body as { sections: SectionInput[] }).sections ?? [];
  if (!input.length) fail('Add at least one section.');
  const names = new Set<string>();
  const codes = new Set<string>();
  for (const s of input) {
    const name = requireText(s.name, 'Name every section.');
    if (names.has(name.toLowerCase())) fail(`Two sections are called “${name}”.`);
    names.add(name.toLowerCase());
    if (!/^[A-Z]{2,5}$/.test(s.code ?? ''))
      fail(`${name}: use a 2–5 letter code in capitals, e.g. JSS.`);
    if (codes.has(s.code)) fail(`Two sections use the code ${s.code}.`);
    codes.add(s.code);
  }
  const removed = acad.sections.filter((s) => !input.some((i) => i.id === s.id));
  const blocked = removed.filter((s) => acad.levels.some((l) => l.section === s.name));
  if (blocked.length)
    fail(
      `${blocked.map((s) => s.name).join(', ')} still ${blocked.length > 1 ? 'have' : 'has'} classes. Remove its class levels in Classes & Arms first.`,
    );
  // Renames carry classes, curriculum, groups, grading and branches with them.
  const renames: [string, string][] = [];
  for (const s of input) {
    const old = acad.sections.find((x) => x.id === s.id);
    if (old && old.name !== s.name.trim()) renames.push([old.name, s.name.trim()]);
  }
  for (const [from, to] of renames) {
    acad.levels.forEach((l) => l.section === from && (l.section = to));
    if (acad.curriculum[from]) {
      acad.curriculum[to] = acad.curriculum[from]!;
      delete acad.curriculum[from];
    }
    acad.groups.forEach((g) => g.section === from && (g.section = to));
    if (from in acad.assessment.schemes) {
      acad.assessment.schemes[to] = acad.assessment.schemes[from] ?? null;
      delete acad.assessment.schemes[from];
    }
    data.branches.forEach((b) => (b.sections = b.sections.map((x) => (x === from ? to : x))));
  }
  const removedNames = removed.map((s) => s.name);
  data.branches.forEach((b) => (b.sections = b.sections.filter((x) => !removedNames.includes(x))));
  acad.sections = input.map((s, i) => ({
    id: s.id ?? `sec-${Date.now()}-${i}`,
    name: s.name.trim(),
    code: s.code,
    description: (s.description ?? '').trim(),
  }));
  data.profile.sections = acad.sections.map((s) => s.name);
  if (!acad.assessment.same)
    for (const s of acad.sections)
      if (!(s.name in acad.assessment.schemes)) acad.assessment.schemes[s.name] = null;
  log('Academics', 'Academic sections saved', acad.sections.map((s) => s.code).join(' · '));
  return sectionsView(schoolId, acad);
});

/* ======================= Sessions & terms ======================= */

/** Enrolled students in the active session; the plan's count for schools seeded with figures. */
function sessionStudents(schoolId: string, s: AcademicSession) {
  if (s.status !== 'Active') return s.students;
  const sd = studentsData[schoolId]!;
  const live =
    sd.students.filter((x) => ['Active', 'Incomplete profile'].includes(x.status)).length +
    Object.values(sd.armBaseline).reduce((n, v) => n + v, 0);
  return Math.max(live, schoolData[schoolId]!.profile.plan.students);
}

function copyAreas(acad: AcademicsData) {
  const arms = acad.levels.reduce((n, l) => n + l.arms.length, 0);
  const schemes = Object.values(acad.assessment.schemes).filter(Boolean).length;
  const rows: [CopyArea, string, string][] = [
    ['sections', 'Academic sections', plural(acad.sections.length, 'section')],
    ['classes', 'Class levels', plural(acad.levels.length, 'level')],
    ['arms', 'Class arms', plural(arms, 'arm')],
    [
      'subjects',
      'Subjects',
      plural(acad.subjects.filter((s) => s.status === 'Active').length, 'active subject'),
    ],
    [
      'curriculum',
      'Curriculum',
      `${plural(
        levelsBySection(acad).reduce((n, x) => n + x.levels.length, 0),
        'curriculum',
        'curricula',
      )} · elective groups`,
    ],
    ['grading', 'Grading scales', plural(schemes, 'scale')],
    ['assessment', 'Assessment scheme', 'CA and exam weights'],
    ['assignments', 'Teacher assignments', plural(acad.assignments.length, 'assignment')],
    ['timetable', 'Timetables', 'Copied as drafts'],
    ['calendar', 'Calendar pattern', 'Term breaks and events, shifted to the new dates'],
  ];
  return rows.map(([id, label, detail]) => ({ id, label, detail }));
}

function termChecklist(acad: AcademicsData): (Checklist & { termId: string }) | null {
  const session = currentSession(acad);
  const term = session?.terms.find((t) => t.status === 'Active');
  if (!session || !term) return null;
  const sheets = acad.sheets.filter((s) => s.termId === term.id);
  const notIn = sheets.filter((s) => ['Not started', 'Draft'].includes(s.status)).length;
  const waiting = sheets.filter((s) =>
    ['Submitted', 'Under review', 'Returned'].includes(s.status),
  ).length;
  const armIds = [...new Set(sheets.map((s) => s.armId))];
  const pub = armIds.filter((id) => acad.published.includes(`${term.id}|${id}`)).length;
  const absent = sheets.reduce(
    (n, s) => n + Object.values(s.scores).filter((v) => v.includes('ABS')).length,
    0,
  );
  const items: Checklist['items'] = [
    {
      label: 'Result entry',
      detail: sheets.length
        ? `${sheets.length - notIn} of ${sheets.length} sheets entered${notIn ? ` · ${plural(notIn, 'draft')} or not started` : ''}`
        : 'No result sheets this term',
      status: notIn ? 'Blocking' : 'Complete',
      to: { name: r.results.name },
    },
    {
      label: 'Results approved',
      detail: waiting
        ? `${plural(waiting, 'sheet')} awaiting approval`
        : 'All submitted sheets approved',
      status: waiting || notIn ? 'Blocking' : 'Complete',
      to: { name: r.results.name },
    },
    {
      label: 'Results published',
      detail: armIds.length
        ? `${pub} of ${plural(armIds.length, 'class', 'classes')} published`
        : 'Nothing to publish yet',
      status: armIds.length && pub === armIds.length ? 'Complete' : pub ? 'In progress' : 'Pending',
      to: { name: r.results.name },
    },
    {
      label: 'Unresolved student decisions',
      detail: absent
        ? `${plural(absent, 'absent exam')} need a make-up date or a decision`
        : 'None',
      status: absent ? 'Review needed' : 'Complete',
      to: { name: r.results.name },
    },
    {
      label: 'Fee review',
      detail: 'Outstanding balances stay attached to this term and do not block closing.',
      status: 'Optional',
      to: null,
    },
  ];
  const blocking = items.filter((i) => ['Blocking', 'Pending', 'In progress'].includes(i.status));
  const early = today() < term.end;
  return {
    termId: term.id,
    title: `${term.name} closing checklist`,
    items,
    canClose: !blocking.length && !early,
    reason: early
      ? `Available after ${fmtDate(term.end, false)} once blocking items are resolved.`
      : blocking.length
        ? `Blocked by ${plural(blocking.length, 'item')} above.`
        : '',
  };
}

function sessionsView(schoolId: string, acad: AcademicsData): SessionsView {
  const cur = currentSession(acad);
  return {
    sessions: [...acad.sessions]
      .sort((a, b) => b.start.localeCompare(a.start))
      .map((s) => ({ ...s, students: sessionStudents(schoolId, s) })),
    currentId: cur?.id ?? null,
    termChecklist: termChecklist(acad),
    copyAreas: copyAreas(acad),
    confirmed: { session: acad.confirmed.session, terms: acad.confirmed.terms },
  };
}

mock.get('/v1/academics/sessions', (req) => {
  const { acad, schoolId } = acadFor(req);
  return sessionsView(schoolId, acad);
});

/** Spreads terms evenly across the session with a two-week break between them. */
export function evenTerms(start: string, end: string, names: string[]) {
  const total = days(start, end);
  const gap = names.length > 1 ? 14 : 0;
  const len = Math.floor((total - gap * (names.length - 1)) / names.length);
  return names.map((name, i) => {
    const s = addDays(start, i * (len + gap));
    return { name, start: s, end: i === names.length - 1 ? end : addDays(s, len) };
  });
}

mock.post('/v1/academics/sessions', (req) => {
  const { acad, log } = acadFor(req);
  const p = req.body as NewSessionPayload;
  const name = requireText(p.name, 'Name the session, e.g. 2027/2028.');
  if (acad.sessions.some((s) => s.name === name)) fail(`${name} already exists.`);
  if (!ISO.test(p.start ?? '') || !ISO.test(p.end ?? '')) fail('Choose the start and end dates.');
  if (p.end <= p.start) fail('The session must end after it starts.');
  const months = days(p.start, p.end) / 30.44;
  if (months < 5 || months > 15) fail('A session runs between 5 and 15 months.');
  const overlap = acad.sessions.find((s) => p.start <= s.end && p.end >= s.start);
  if (overlap)
    fail(
      `These dates overlap ${overlap.name} (${fmtDate(overlap.start)} – ${fmtDate(overlap.end)}).`,
    );
  const names = (p.termNames ?? []).map((n) => n.trim());
  if (names.length < 1 || names.length > 4) fail('Use between 1 and 4 terms.');
  if (names.some((n) => !n)) fail('Name every term.');
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
    fail('Term names must be different.');
  const first = !acad.sessions.some((s) => ['Active', 'Upcoming'].includes(s.status));
  const from = currentSession(acad);
  const session: AcademicSession = {
    id: nextId(acad, 's-'),
    name,
    start: p.start,
    end: p.end,
    status: first ? 'Active' : 'Upcoming',
    structure: p.structure,
    students: 0,
    note:
      from && p.copy?.length
        ? `Configuration copied from ${from.name}`
        : first
          ? 'First session on Edutrack'
          : 'Started blank',
    closedOn: null,
    terms: evenTerms(p.start, p.end, names).map((t, i) => ({
      id: nextId(acad, 't-'),
      ...t,
      status: first && i === 0 ? 'Active' : 'Upcoming',
      events: [],
    })),
  };
  // Copy the calendar pattern (term events) shifted by the difference in start dates.
  if (from && p.copy?.includes('calendar'))
    session.terms.forEach((t, i) => {
      const src = from.terms[i];
      if (!src) return;
      const shift = days(src.start, t.start);
      t.events = src.events
        .map((e) => ({
          ...e,
          id: nextId(acad, 'e'),
          start: addDays(e.start, shift),
          end: addDays(e.end, shift),
        }))
        .filter((e) => e.start >= t.start && e.end <= t.end);
    });
  acad.sessions.push(session);
  acad.confirmed.session = true;
  log(
    'Academics',
    `Session ${name} created`,
    `${session.status} · ${plural(names.length, 'term')}`,
  );
  return session;
});

function validateTerms(session: AcademicSession, terms: TermInput[]) {
  if (!terms.length || terms.length > 4) fail('Use between 1 and 4 terms.');
  const names = new Set<string>();
  const sorted = [...terms].sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  for (const t of terms) {
    const name = requireText(t.name, 'Name every term.');
    if (names.has(name.toLowerCase())) fail('Term names must be different.');
    names.add(name.toLowerCase());
    if (!ISO.test(t.start ?? '') || !ISO.test(t.end ?? ''))
      fail(`${name}: choose its start and end dates.`);
    if (t.end <= t.start) fail(`${name} must end after it starts.`);
    if (t.start < session.start || t.end > session.end)
      fail(
        `${name} must fall within the session (${fmtDate(session.start)} – ${fmtDate(session.end)}).`,
      );
    if (days(t.start, t.end) < 28) fail(`${name} is shorter than 4 weeks.`);
    for (const e of t.events ?? []) {
      const en = requireText(e.name, `${name}: name every event.`);
      if (!ISO.test(e.start ?? '') || !ISO.test(e.end ?? ''))
        fail(`${name} · ${en}: choose its dates.`);
      if (e.end < e.start) fail(`${name} · ${en} ends before it starts.`);
      if (e.start < t.start || e.end > t.end) fail(`${name} · ${en} must fall within the term.`);
    }
  }
  sorted.forEach((t, i) => {
    const next = sorted[i + 1];
    if (next && next.start <= t.end) fail(`${t.name} and ${next.name} overlap.`);
  });
}

mock.put('/v1/academics/sessions/:id/terms', (req) => {
  const { acad, log } = acadFor(req);
  const session =
    acad.sessions.find((s) => s.id === req.params.id) ?? fail('Session not found', 404);
  if (['Closed', 'Archived'].includes(session.status))
    fail(`${session.name} is closed and read-only.`, 409);
  const terms = (req.body as { terms: TermInput[] }).terms ?? [];
  validateTerms(session, terms);
  const kept = session.terms.filter((t) => terms.some((x) => x.id === t.id));
  const removedWithData = session.terms
    .filter((t) => !kept.includes(t))
    .filter(
      (t) =>
        acad.sheets.some((s) => s.termId === t.id) ||
        acad.timetables.some((x) => x.termId === t.id),
    );
  if (removedWithData.length)
    fail(
      `${removedWithData.map((t) => t.name).join(', ')} already has results or timetables and can't be removed.`,
      409,
    );
  session.terms = [...terms]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((t) => {
      const old = session.terms.find((x) => x.id === t.id);
      return {
        id: old?.id ?? nextId(acad, 't-'),
        name: t.name.trim(),
        start: t.start,
        end: t.end,
        status: old?.status ?? 'Upcoming',
        events: (t.events ?? []).map((e: TermEvent) => ({
          ...e,
          id: e.id || nextId(acad, 'e'),
          name: e.name.trim(),
        })),
      };
    });
  if (
    session.status === 'Active' &&
    !session.terms.some((t) => ['Active', 'Ended', 'Closed'].includes(t.status))
  )
    session.terms[0]!.status = 'Active';
  acad.confirmed.terms = true;
  log('Academics', `Terms saved for ${session.name}`, plural(session.terms.length, 'term'));
  return session;
});

mock.post('/v1/academics/sessions/:id/start', (req) => {
  const { acad, log } = acadFor(req);
  const session =
    acad.sessions.find((s) => s.id === req.params.id) ?? fail('Session not found', 404);
  if (session.status !== 'Upcoming') fail('Only an upcoming session can be started.', 409);
  const active = acad.sessions.find((s) => s.status === 'Active');
  if (active && active.terms.some((t) => t.status !== 'Closed'))
    fail(`Close every term of ${active.name} first. ${active.name} then moves to Closing.`, 409);
  if (active) active.status = 'Closing';
  session.status = 'Active';
  session.terms[0]!.status = 'Active';
  log(
    'Academics',
    `Session ${session.name} started`,
    active ? `${active.name} moved to Closing` : '',
  );
  return session;
});

function sessionChecklist(
  schoolId: string,
  acad: AcademicsData,
  session: AcademicSession,
): Checklist {
  const promo = acad.promotion?.fromSessionId === session.id ? acad.promotion : null;
  const pending = promo?.classes.flatMap((c) => c.students.filter((s) => !s.decision)) ?? [];
  const promoDone = !promo || promo.classes.every((c) => c.status !== 'Pending');
  const openTerms = session.terms.filter((t) => t.status !== 'Closed');
  const items: Checklist['items'] = [
    {
      label: 'Terms closed',
      detail: openTerms.length
        ? `${openTerms.map((t) => t.name).join(', ')} still open`
        : `All ${plural(session.terms.length, 'term')} closed`,
      status: openTerms.length ? 'Blocking' : 'Complete',
      to: { name: r.sessions.name },
    },
    {
      label: 'Results complete and approved',
      detail: 'All result sheets approved',
      status: 'Complete',
      to: null,
    },
    {
      label: 'Results published',
      detail: `${session.terms[session.terms.length - 1]?.name ?? 'Final term'} published`,
      status: 'Complete',
      to: null,
    },
    {
      label: 'Student decisions',
      detail: pending.length
        ? `${plural(pending.length, 'student')} in ${[...new Set(promo!.classes.filter((c) => c.status === 'Pending').map((c) => c.name))].join(', ')} have no decision`
        : `All ${session.students.toLocaleString('en-NG')} students have a decision`,
      status: pending.length ? 'Blocking' : 'Complete',
      to: { name: r.promotion.name },
    },
    {
      label: 'Transfers and withdrawals processed',
      detail: '6 transfers · 3 withdrawals',
      status: 'Complete',
      to: null,
    },
    {
      label: 'Promotion complete',
      detail: promoDone
        ? 'Next-session enrollments created for promoted and repeating students'
        : 'Apply the pending decisions',
      status: promoDone ? 'Complete' : 'Blocking',
      to: { name: r.promotion.name },
    },
    {
      label: 'Financial review',
      detail: `Outstanding balances stay attached to ${session.name} invoices and remain collectable`,
      status: 'Review needed',
      to: null,
    },
  ];
  void schoolId;
  const blocking = items.filter((i) => i.status === 'Blocking').length;
  return {
    title: 'Closing checklist',
    items,
    canClose: session.status === 'Closing' && !blocking,
    reason:
      session.status === 'Closed' || session.status === 'Archived'
        ? `${session.name} is closed.`
        : session.status !== 'Closing'
          ? `${session.name} is ${session.status.toLowerCase()}. A session closes after the next one starts.`
          : blocking
            ? `Blocked by ${plural(blocking, 'item')} above.`
            : '',
  };
}

mock.get('/v1/academics/sessions/:id/close', (req) => {
  const { acad, schoolId } = acadFor(req);
  const session =
    acad.sessions.find((s) => s.id === req.params.id) ?? fail('Session not found', 404);
  return { session, checklist: sessionChecklist(schoolId, acad, session) };
});

mock.post('/v1/academics/sessions/:id/close', (req) => {
  const { acad, schoolId, log, actor } = acadFor(req);
  const session =
    acad.sessions.find((s) => s.id === req.params.id) ?? fail('Session not found', 404);
  const c = sessionChecklist(schoolId, acad, session);
  if (!c.canClose) fail(c.reason || 'Resolve the blocking items first.', 409);
  session.status = 'Closed';
  session.closedOn = `${fmtDate(today())} by ${actor}`;
  log('Academics', `Session ${session.name} closed`, 'Now read-only');
  return { session, checklist: sessionChecklist(schoolId, acad, session) };
});

mock.post('/v1/academics/terms/:id/close', (req) => {
  const { acad, log } = acadFor(req);
  const c = termChecklist(acad);
  if (!c || c.termId !== req.params.id) fail('Only the active term can be closed.', 409);
  if (!c!.canClose) fail(c!.reason, 409);
  const session = currentSession(acad)!;
  const i = session.terms.findIndex((t) => t.id === req.params.id);
  session.terms[i]!.status = 'Closed';
  if (session.terms[i + 1]) session.terms[i + 1]!.status = 'Active';
  log('Academics', `${session.terms[i]!.name} closed`, session.name);
  return { ok: true };
});

/* ======================= Calendar ======================= */

const EVENT_TYPE: Record<TermEvent['type'], CalendarEvent['type']> = {
  resumption: 'Term',
  midterm: 'Break',
  ca: 'Exam',
  exams: 'Exam',
  pta: 'Meeting',
  results: 'Event',
  custom: 'Event',
};

function calendarView(acad: AcademicsData): CalendarView {
  const s = currentSession(acad);
  if (!s) return { session: '', events: [], holidays: [], start: today(), end: today() };
  const events: CalendarEvent[] = s.terms.flatMap((t) => [
    ...(t.start
      ? [
          {
            id: `${t.id}-end`,
            title: `${t.name} ends`,
            type: 'Term' as const,
            start: t.end,
            end: t.end,
            audience: 'Everyone',
            source: 'term' as const,
            notes: '',
          },
        ]
      : []),
    ...t.events.map((e) => ({
      id: `${t.id}-${e.id}`,
      title: e.type === 'resumption' ? `${t.name} resumes` : e.name,
      type: EVENT_TYPE[e.type],
      start: e.start,
      end: e.end,
      audience: 'Everyone',
      source: 'term' as const,
      notes: t.name,
    })),
  ]);
  const holidays = PUBLIC_HOLIDAYS.filter(([d]) => d >= s.start && d <= s.end).map(
    ([date, name]) => ({ date, name }),
  );
  return {
    session: s.name,
    start: s.start,
    end: s.end,
    holidays,
    events: [
      ...events,
      ...holidays.map((h) => ({
        id: `hol-${h.date}`,
        title: h.name,
        type: 'Holiday' as const,
        start: h.date,
        end: h.date,
        audience: 'Everyone',
        source: 'holiday' as const,
        notes: 'Public holiday',
      })),
      ...acad.events.filter((e) => e.end >= s.start && e.start <= s.end),
    ].sort((a, b) => a.start.localeCompare(b.start)),
  };
}

mock.get('/v1/academics/calendar', (req) => calendarView(acadFor(req).acad));

function validEvent(acad: AcademicsData, p: CalendarEventInput) {
  const s = currentSession(acad) ?? fail('Create a session first.', 409);
  requireText(p.title, 'Give the event a title.');
  if (!ISO.test(p.start ?? '') || !ISO.test(p.end ?? '')) fail('Choose the dates.');
  if (p.end < p.start) fail('The event ends before it starts.');
  if (p.start < s.start || p.end > s.end)
    fail(`Events must fall within ${s.name} (${fmtDate(s.start)} – ${fmtDate(s.end)}).`);
}

mock.post('/v1/academics/calendar/events', (req) => {
  const { acad, log } = acadFor(req);
  const p = req.body as CalendarEventInput;
  validEvent(acad, p);
  const ev: CalendarEvent = {
    ...p,
    id: nextId(acad, 'ev'),
    title: p.title.trim(),
    source: 'custom',
  };
  acad.events.push(ev);
  log('Academics', `Calendar event added: ${ev.title}`, fmtDate(ev.start));
  return ev;
});

mock.put('/v1/academics/calendar/events/:id', (req) => {
  const { acad, log } = acadFor(req);
  const ev =
    acad.events.find((e) => e.id === req.params.id) ??
    fail('Only school events can be edited here. Term events are edited in Sessions & Terms.', 404);
  const p = req.body as CalendarEventInput;
  validEvent(acad, p);
  Object.assign(ev, p, { title: p.title.trim() });
  log('Academics', `Calendar event updated: ${ev.title}`);
  return ev;
});

mock.delete('/v1/academics/calendar/events/:id', (req) => {
  const { acad, log } = acadFor(req);
  const i = acad.events.findIndex((e) => e.id === req.params.id);
  if (i < 0) fail('Event not found', 404);
  const [ev] = acad.events.splice(i, 1);
  log('Academics', `Calendar event removed: ${ev!.title}`);
  return { ok: true };
});

/* ======================= Classes & arms ======================= */

/** Levels at a branch in promotion order (sections first, then as entered). */
function branchLevels(acad: AcademicsData, branchId: string) {
  return orderedLevels(acad).filter((l) => l.branchId === branchId);
}

function classesView(schoolId: string, acad: AcademicsData): ClassesView {
  const branches = activeBranches(schoolId);
  return {
    branches: branches.map((b) => ({ id: b.id, name: b.name, sections: b.sections })),
    sections: acad.sections.map((s) => ({
      ...s,
      levels: acad.levels.filter((l) => l.section === s.name).length,
      branches: branches.filter((b) => b.sections.includes(s.name)).map((b) => b.name),
    })),
    levels: branches.flatMap((b) => {
      const list = branchLevels(acad, b.id);
      return list.map((l, i) => ({
        id: l.id,
        branchId: l.branchId,
        section: l.section,
        name: l.name,
        next: list[i + 1]?.name ?? null,
        arms: l.arms.map((a) => toArm(schoolId, acad, l, a)),
      }));
    }),
    confirmed: acad.confirmed.classes,
    defaults: DEFAULT_LEVELS,
  };
}

mock.get('/v1/academics/classes', (req) => {
  const { acad, schoolId } = acadFor(req);
  return classesView(schoolId, acad);
});

const levelId = (branchId: string, name: string) =>
  `lv-${branchId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${Date.now().toString(36)}`;
const armId = (branchId: string, label: string) =>
  `arm-${branchId}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${Math.random().toString(36).slice(2, 6)}`;

mock.post('/v1/academics/classes/defaults', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  if (!acad.confirmed.sections) fail('Finish Academic Sections first.', 409);
  let added = 0;
  for (const b of activeBranches(schoolId))
    for (const sec of b.sections) {
      const code = acad.sections.find((s) => s.name === sec)?.code ?? '';
      for (const name of DEFAULT_LEVELS[code] ?? []) {
        if (acad.levels.some((l) => l.branchId === b.id && l.name === name)) continue;
        acad.levels.push({
          id: levelId(b.id, name),
          branchId: b.id,
          section: sec,
          name,
          arms: [
            {
              id: armId(b.id, armLabel(name, 'A')),
              arm: 'A',
              capacity: code === 'NUR' ? 25 : 35,
              classTeacherId: null,
              room: '',
              baseline: 0,
            },
          ],
        });
        added++;
      }
    }
  if (!added)
    fail(
      'Your sections have no standard levels to add, or they are already there. Add levels one by one.',
    );
  syncStudentClasses(schoolId);
  log('Academics', 'Nigerian default class levels added', plural(added, 'level'));
  return classesView(schoolId, acad);
});

function checkArms(arms: string[]) {
  if (!arms.length) fail('Add at least one arm, e.g. A.');
  if (arms.length > 12) fail('Use 12 arms or fewer.');
  if (arms.some((a) => !/^[A-Za-z0-9][A-Za-z0-9 ]{0,11}$/.test(a)))
    fail('Arm names are short, e.g. A, B or Gold.');
  if (new Set(arms.map((a) => a.toLowerCase())).size !== arms.length)
    fail('Arm names must be different.');
}

mock.post('/v1/academics/classes/levels', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const p = req.body as LevelInput;
  const branch =
    activeBranches(schoolId).find((b) => b.id === p.branchId) ?? fail('Choose an active branch.');
  if (!branch.sections.includes(p.section))
    fail(`${branch.name} doesn’t run ${p.section}. Add the section to the branch first.`);
  const name = requireText(p.name, 'Name the class level, e.g. JSS 1.');
  if (
    acad.levels.some((l) => l.branchId === branch.id && l.name.toLowerCase() === name.toLowerCase())
  )
    fail(`${branch.name} already has ${name}.`);
  const arms = (p.arms ?? []).map((a) => a.trim()).filter(Boolean);
  checkArms(arms);
  const cap = Number(p.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100)
    fail('Places per arm must be between 1 and 100.');
  const level: LevelRec = {
    id: levelId(branch.id, name),
    branchId: branch.id,
    section: p.section,
    name,
    arms: arms.map((a) => ({
      id: armId(branch.id, armLabel(name, a)),
      arm: a,
      capacity: cap,
      classTeacherId: null,
      room: '',
      baseline: 0,
    })),
  };
  // Insert after the chosen level so promotion order follows the list.
  const after = p.after ? acad.levels.findIndex((l) => l.id === p.after) : -1;
  if (after >= 0) acad.levels.splice(after + 1, 0, level);
  else {
    const firstOfSection = acad.levels.findIndex(
      (l) => l.branchId === branch.id && l.section === p.section,
    );
    if (p.after === null && firstOfSection >= 0) acad.levels.splice(firstOfSection, 0, level);
    else acad.levels.push(level);
  }
  // A level with the same name elsewhere shares its curriculum; a new name starts empty.
  syncStudentClasses(schoolId);
  log('Academics', `Class level ${name} added`, `${branch.name} · ${plural(arms.length, 'arm')}`);
  return classesView(schoolId, acad);
});

mock.put('/v1/academics/classes/levels/:id', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const level =
    acad.levels.find((l) => l.id === req.params.id) ?? fail('Class level not found', 404);
  const name = requireText((req.body as { name: string }).name, 'Name the class level.');
  if (
    acad.levels.some(
      (l) =>
        l.id !== level.id &&
        l.branchId === level.branchId &&
        l.name.toLowerCase() === name.toLowerCase(),
    )
  )
    fail(`${branchName(schoolId, level.branchId)} already has ${name}.`);
  const old = level.name;
  if (old === name) return classesView(schoolId, acad);
  level.name = name;
  // Carry the curriculum and students with the rename.
  const cur = acad.curriculum[level.section];
  if (cur?.[old] && !acad.levels.some((l) => l.name === old)) {
    cur[name] ??= cur[old]!;
    delete cur[old];
  } else if (cur?.[old] && !cur[name]) cur[name] = { ...cur[old]! };
  const bname = branchName(schoolId, level.branchId);
  studentsData[schoolId]!.students.forEach(
    (s) => s.level === old && s.branch === bname && (s.level = name),
  );
  syncStudentClasses(schoolId);
  log('Academics', `Class level renamed: ${old} → ${name}`, bname);
  return classesView(schoolId, acad);
});

mock.post('/v1/academics/classes/levels/:id/move', (req) => {
  const { acad, schoolId } = acadFor(req);
  const level =
    acad.levels.find((l) => l.id === req.params.id) ?? fail('Class level not found', 404);
  const dir = (req.body as { direction: 'up' | 'down' }).direction;
  const siblings = acad.levels.filter(
    (l) => l.branchId === level.branchId && l.section === level.section,
  );
  const i = siblings.indexOf(level);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= siblings.length) fail('It can’t move further.');
  const a = acad.levels.indexOf(level);
  const b = acad.levels.indexOf(siblings[j]!);
  [acad.levels[a], acad.levels[b]] = [acad.levels[b]!, acad.levels[a]!];
  return classesView(schoolId, acad);
});

function dropArmData(acad: AcademicsData, ids: string[]) {
  acad.assignments = acad.assignments.filter((a) => !ids.includes(a.armId));
  acad.timetables = acad.timetables.filter((t) => !ids.includes(t.armId));
  acad.sheets = acad.sheets.filter((s) => !ids.includes(s.armId));
}

mock.delete('/v1/academics/classes/levels/:id', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const level =
    acad.levels.find((l) => l.id === req.params.id) ?? fail('Class level not found', 404);
  const used = level.arms.filter((a) => armStudents(schoolId, level, a).count);
  if (used.length)
    fail(
      `${used.map((a) => armLabel(level.name, a.arm)).join(', ')} ${used.length > 1 ? 'have' : 'has'} students. Move them to another class first.`,
      409,
    );
  dropArmData(
    acad,
    level.arms.map((a) => a.id),
  );
  acad.levels.splice(acad.levels.indexOf(level), 1);
  syncStudentClasses(schoolId);
  log('Academics', `Class level ${level.name} removed`, branchName(schoolId, level.branchId));
  return classesView(schoolId, acad);
});

function checkClassTeacher(
  schoolId: string,
  acad: AcademicsData,
  level: LevelRec,
  id: string | null,
) {
  if (!id) return;
  const t = acad.teachers.find((x) => x.id === id) ?? fail('Choose a teacher on your staff list.');
  if (!t.branches.includes(level.branchId))
    fail(`${t.name} doesn’t work at ${branchName(schoolId, level.branchId)}.`);
}

mock.post('/v1/academics/classes/levels/:id/arms', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const level =
    acad.levels.find((l) => l.id === req.params.id) ?? fail('Class level not found', 404);
  const p = req.body as ArmInput;
  const letter =
    (p.arm ?? '').trim() ||
    'ABCDEFGHIJKL'.split('').find((c) => !level.arms.some((a) => a.arm === c)) ||
    '';
  checkArms([...level.arms.map((a) => a.arm), letter]);
  const cap = Number(p.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 100)
    fail('Places per arm must be between 1 and 100.');
  checkClassTeacher(schoolId, acad, level, p.classTeacherId);
  level.arms.push({
    id: armId(level.branchId, armLabel(level.name, letter)),
    arm: letter,
    capacity: cap,
    classTeacherId: p.classTeacherId ?? null,
    room: (p.room ?? '').trim(),
    baseline: 0,
  });
  syncStudentClasses(schoolId);
  log(
    'Academics',
    `Arm ${armLabel(level.name, letter)} added`,
    branchName(schoolId, level.branchId),
  );
  return classesView(schoolId, acad);
});

mock.put('/v1/academics/classes/arms/:id', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const { level, arm } = findArm(acad, req.params.id!);
  const p = req.body as Partial<ArmInput>;
  const label = armLabel(level.name, arm.arm);
  if (p.arm !== undefined && p.arm.trim() !== arm.arm) {
    const next = p.arm.trim();
    checkArms([...level.arms.filter((a) => a !== arm).map((a) => a.arm), next]);
    const bname = branchName(schoolId, level.branchId);
    studentsData[schoolId]!.students.forEach(
      (s) => s.level === level.name && s.arm === arm.arm && s.branch === bname && (s.arm = next),
    );
    arm.arm = next;
  }
  if (p.capacity !== undefined) {
    const cap = Number(p.capacity);
    const used = armStudents(schoolId, level, arm).count;
    if (!Number.isInteger(cap) || cap < 1 || cap > 100)
      fail('Places per arm must be between 1 and 100.');
    if (cap < used) fail(`${label} already has ${used} students. Capacity can’t go below that.`);
    arm.capacity = cap;
  }
  if (p.classTeacherId !== undefined) {
    checkClassTeacher(schoolId, acad, level, p.classTeacherId);
    arm.classTeacherId = p.classTeacherId;
  }
  if (p.room !== undefined) arm.room = p.room.trim();
  syncStudentClasses(schoolId);
  log(
    'Academics',
    `${armLabel(level.name, arm.arm)} updated`,
    p.classTeacherId !== undefined
      ? `Class teacher: ${teacherName(acad, arm.classTeacherId) ?? 'none'}`
      : '',
  );
  return toArm(schoolId, acad, level, arm);
});

mock.delete('/v1/academics/classes/arms/:id', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const { level, arm } = findArm(acad, req.params.id!);
  const label = armLabel(level.name, arm.arm);
  const n = armStudents(schoolId, level, arm).count;
  if (n) fail(`${label} has ${plural(n, 'student')}. Move them to another arm first.`, 409);
  if (level.arms.length === 1)
    fail(`${label} is the only arm of ${level.name}. Remove the class level instead.`, 409);
  dropArmData(acad, [arm.id]);
  level.arms.splice(level.arms.indexOf(arm), 1);
  syncStudentClasses(schoolId);
  log('Academics', `Arm ${label} removed`, branchName(schoolId, level.branchId));
  return classesView(schoolId, acad);
});

mock.get('/v1/academics/classes/:id', (req): ClassDetail => {
  const { acad, schoolId } = acadFor(req);
  const { level, arm } = findArm(acad, req.params.id!);
  const sd = studentsData[schoolId]!;
  const { records } = armStudents(schoolId, level, arm);
  const term = currentTerm(acad);
  const tt = term ? acad.timetables.find((t) => t.armId === arm.id && t.termId === term.id) : null;
  return {
    arm: toArm(schoolId, acad, level, arm),
    students: records.map((s) => {
      const g = sd.guardians.find((x) => x.children[s.id]);
      return {
        id: s.id,
        name: `${s.firstName} ${s.surname}`.trim(),
        admissionNo: s.admissionNo,
        gender: s.gender,
        guardian: g?.name ?? '',
        balance: s.balance,
      };
    }),
    subjects: offeredSubjects(acad, level).map(([code, o]) => {
      const a = acad.assignments.find((x) => x.armId === arm.id && x.subject === code);
      return {
        code,
        name: subjectName(acad, code),
        type: o === 'C' ? 'Compulsory' : 'Elective',
        teacherId: a?.teacherId ?? null,
        teacher: teacherName(acad, a?.teacherId ?? null),
        periods: subjectPeriods(acad, code),
      };
    }),
    timetable: tt && term ? timetableView(schoolId, acad, arm.id, term.id) : null,
    results: offeredSubjects(acad, level).map(([code]) => {
      const sheet = term
        ? acad.sheets.find((s) => s.armId === arm.id && s.subject === code && s.termId === term.id)
        : null;
      const totals = sheet
        ? Object.values(sheet.scores)
            .map((v) => weighted(acad, level.section, v))
            .filter((x): x is number => x !== null)
        : [];
      const published = term && acad.published.includes(`${term.id}|${arm.id}`);
      return {
        code,
        subject: subjectName(acad, code),
        teacher: teacherName(
          acad,
          acad.assignments.find((x) => x.armId === arm.id && x.subject === code)?.teacherId ?? null,
        ),
        average: totals.length
          ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10
          : null,
        status: published ? 'Published' : (sheet?.status ?? 'Not started'),
      };
    }),
  };
});

/** Weighted total for one student's raw scores, or null when incomplete. */
export function weighted(acad: AcademicsData, section: string, values: (number | string | null)[]) {
  const scheme = acad.assessment.same
    ? acad.assessment.schemes['*']
    : acad.assessment.schemes[section];
  if (!scheme || scheme.mode !== 'scores') return null;
  let total = 0;
  let counted = 0;
  for (const [i, c] of scheme.components.entries()) {
    const v = values[i];
    if (v === 'EXM') continue;
    if (v === null || v === undefined || v === 'ABS') return null;
    total += (Number(v) / c.max) * c.weight;
    counted += c.weight;
  }
  if (!counted) return null;
  return Math.round((total / counted) * 100 * 10) / 10;
}

/* ======================= Subjects & curriculum ======================= */

function curriculumView(acad: AcademicsData): CurriculumView {
  const term = currentTerm(acad);
  return {
    subjects: acad.subjects.map((s) => {
      const levels = levelsBySection(acad).flatMap(({ section, levels }) =>
        levels.filter((lv) => acad.curriculum[section]?.[lv]?.[s.code]),
      );
      const teachers = [
        ...new Set(
          acad.assignments
            .filter((a) => a.subject === s.code)
            .map((a) => teacherName(acad, a.teacherId)!),
        ),
      ];
      return {
        ...s,
        levels,
        teachers,
        hasScores: acad.sheets.some(
          (x) =>
            x.subject === s.code &&
            x.termId === term?.id &&
            !['Not started', 'Draft'].includes(x.status),
        ),
      };
    }),
    curriculum: acad.curriculum,
    groups: acad.groups,
    levels: levelsBySection(acad).filter((x) => x.levels.length),
    confirmed: acad.confirmed.subjects,
  };
}

mock.get('/v1/academics/curriculum', (req) => curriculumView(acadFor(req).acad));

mock.post('/v1/academics/subjects/defaults', (req) => {
  const { acad, log } = acadFor(req);
  if (acad.subjects.length) fail('You already have subjects. Add more one by one.', 409);
  if (!acad.levels.length) fail('Add class levels in Classes & Arms first.', 409);
  const by: Record<string, string[]> = Object.fromEntries(
    levelsBySection(acad).map((x) => [x.section, x.levels]),
  );
  Object.assign(acad, curriculumFromSuggestions(acad, by));
  log('Academics', 'Suggested subjects added', plural(acad.subjects.length, 'subject'));
  return curriculumView(acad);
});

function checkSubject(acad: AcademicsData, p: SubjectInput, existing?: string) {
  const name = requireText(p.name, 'Name the subject.');
  if (!existing && !/^[A-Z]{2,4}\d?$/.test(p.code ?? ''))
    fail('Use 2–4 capitals for the code, e.g. MTH.');
  if (!existing && acad.subjects.some((s) => s.code === p.code))
    fail(`The code ${p.code} is already used by ${subjectName(acad, p.code)}.`);
  if (acad.subjects.some((s) => s.code !== existing && s.name.toLowerCase() === name.toLowerCase()))
    fail(`${name} already exists.`);
  const periods = Number(p.periods);
  if (!Number.isInteger(periods) || periods < 1 || periods > 10)
    fail('Lessons per week must be between 1 and 10.');
  return { name, periods };
}

mock.post('/v1/academics/subjects', (req) => {
  const { acad, log } = acadFor(req);
  const p = req.body as SubjectInput;
  const { name, periods } = checkSubject(acad, p);
  acad.subjects.push({
    code: p.code,
    name,
    category: p.category,
    status: p.status ?? 'Active',
    periods,
  });
  log('Academics', `Subject added: ${name}`, p.code);
  return curriculumView(acad);
});

mock.put('/v1/academics/subjects/:code', (req) => {
  const { acad, log } = acadFor(req);
  const s = acad.subjects.find((x) => x.code === req.params.code) ?? fail('Subject not found', 404);
  const p = req.body as SubjectInput;
  const { name, periods } = checkSubject(acad, p, s.code);
  if (
    p.status === 'Inactive' &&
    s.status === 'Active' &&
    acad.assignments.some((a) => a.subject === s.code)
  )
    fail(`${s.name} is still assigned to teachers. Remove those assignments first.`, 409);
  Object.assign(s, { name, periods, category: p.category, status: p.status });
  log('Academics', `Subject updated: ${name}`, s.code);
  return curriculumView(acad);
});

mock.delete('/v1/academics/subjects/:code', (req) => {
  const { acad, log } = acadFor(req);
  const code = req.params.code!;
  const s = acad.subjects.find((x) => x.code === code) ?? fail('Subject not found', 404);
  if (acad.sheets.some((x) => x.subject === code && !['Not started'].includes(x.status)))
    fail(`${s.name} has results this session. Make it inactive instead.`, 409);
  if (acad.assignments.some((a) => a.subject === code))
    fail(`${s.name} is assigned to teachers. Remove those assignments first.`, 409);
  acad.subjects.splice(acad.subjects.indexOf(s), 1);
  for (const sec of Object.values(acad.curriculum))
    for (const lv of Object.values(sec)) delete lv[code];
  acad.groups.forEach((g) => (g.subjects = g.subjects.filter((c) => c !== code)));
  log('Academics', `Subject removed: ${s.name}`, code);
  return curriculumView(acad);
});

mock.put('/v1/academics/curriculum', (req) => {
  const { acad, log } = acadFor(req);
  const p = req.body as { curriculum: CurriculumView['curriculum']; groups: ElectiveGroup[] };
  const term = currentTerm(acad);
  for (const [i, g] of (p.groups ?? []).entries()) {
    const name = requireText(g.name, `Name elective group ${i + 1}.`);
    if (!acad.sections.some((s) => s.name === g.section)) fail(`${name}: choose a section.`);
    if ((g.subjects ?? []).length < 2) fail(`${name}: pick at least 2 subjects.`);
    if (!Number.isInteger(g.min) || g.min < 0) fail(`${name}: the minimum is a whole number.`);
    if (!Number.isInteger(g.max) || g.max < 1 || g.max < g.min)
      fail(`${name}: the maximum must be at least 1 and not below the minimum.`);
    if (g.max > g.subjects.length)
      fail(`${name}: students can’t choose ${g.max} of ${g.subjects.length} subjects.`);
  }
  // Subjects already scored this term can't be taken out of a class.
  const dropped: [string, string, string][] = [];
  for (const [sec, lvs] of Object.entries(acad.curriculum))
    for (const [lv, subs] of Object.entries(lvs))
      for (const code of Object.keys(subs))
        if (!p.curriculum?.[sec]?.[lv]?.[code]) dropped.push([sec, lv, code]);
  const scored = dropped.filter(([, lv, code]) =>
    acad.sheets.some(
      (s) =>
        s.termId === term?.id &&
        s.subject === code &&
        !['Not started', 'Draft'].includes(s.status) &&
        findArm(acad, s.armId).level.name === lv,
    ),
  );
  if (scored.length)
    fail(
      `These already have scores this term and can’t be removed until the session closes: ${scored.map(([, lv, c]) => `${subjectName(acad, c)} in ${lv}`).join(', ')}.`,
      409,
    );
  let cleared = 0;
  for (const [, lv, code] of dropped) {
    const before = acad.assignments.length;
    acad.assignments = acad.assignments.filter(
      (a) => !(a.subject === code && findArm(acad, a.armId).level.name === lv),
    );
    cleared += before - acad.assignments.length;
  }
  acad.curriculum = Object.fromEntries(
    Object.entries(p.curriculum ?? {}).map(([sec, lvs]) => [
      sec,
      Object.fromEntries(
        Object.entries(lvs).map(([lv, m]) => [
          lv,
          Object.fromEntries(Object.entries(m).filter(([, v]) => v === 'C' || v === 'E')) as Record<
            string,
            Offering
          >,
        ]),
      ),
    ]),
  );
  acad.groups = (p.groups ?? []).map((g, i) => ({
    ...g,
    id: g.id || `g${Date.now()}${i}`,
    name: g.name.trim(),
    note: (g.note ?? '').trim(),
  }));
  log(
    'Academics',
    'Curriculum saved',
    `${plural(acad.groups.length, 'elective group')}${cleared ? ` · ${plural(cleared, 'assignment')} cleared` : ''}`,
  );
  return { ...curriculumView(acad), cleared };
});

/* ======================= Teachers & assignments ======================= */

function teachersOf(acad: AcademicsData) {
  return acad.teachers.map((t) => ({
    id: t.id,
    name: t.name,
    branches: t.branches,
    qualified: t.qualified,
    employment: t.employment,
    maxPeriods: t.maxPeriods,
    periods: teacherLoad(acad, t.id),
    classTeacherOf: allArms(acad)
      .filter(({ arm }) => arm.classTeacherId === t.id)
      .map(({ level, arm }) => armLabel(level.name, arm.arm)),
  }));
}

function assignmentsView(schoolId: string, acad: AcademicsData, branch?: string): AssignmentsView {
  const term = currentTerm(acad);
  const branchId = activeBranches(schoolId).find((b) => b.name === branch)?.id;
  const arms = allArms(acad).filter(({ level }) => !branchId || level.branchId === branchId);
  const gaps = new Map<string, { id: string; name: string }[]>();
  for (const { level, arm } of arms)
    for (const [code] of offeredSubjects(acad, level))
      if (!acad.assignments.some((a) => a.armId === arm.id && a.subject === code))
        gaps.set(code, [
          ...(gaps.get(code) ?? []),
          { id: arm.id, name: armLabel(level.name, arm.arm) },
        ]);
  const ids = new Set(arms.map(({ arm }) => arm.id));
  return {
    term: term?.name ?? '',
    assignments: acad.assignments
      .filter((a) => ids.has(a.armId))
      .map((a) => {
        const { level, arm } = findArm(acad, a.armId);
        return {
          ...a,
          teacher: teacherName(acad, a.teacherId) ?? 'Removed staff',
          subjectName: subjectName(acad, a.subject),
          arm: armLabel(level.name, arm.arm),
          branch: branchName(schoolId, level.branchId),
          periods: subjectPeriods(acad, a.subject),
        };
      }),
    teachers: teachersOf(acad),
    gaps: [...gaps.entries()].map(([subject, list]) => ({
      subject,
      subjectName: subjectName(acad, subject),
      arms: list,
    })),
    armsWithoutClassTeacher: arms
      .filter(({ arm }) => !arm.classTeacherId)
      .map(({ level, arm }) => ({ id: arm.id, name: armLabel(level.name, arm.arm) })),
    arms: arms.map(({ level, arm }) => ({
      id: arm.id,
      name: armLabel(level.name, arm.arm),
      branch: branchName(schoolId, level.branchId),
      branchId: level.branchId,
      subjects: offeredSubjects(acad, level).map(([c]) => c),
    })),
    subjects: acad.subjects
      .filter((s) => s.status === 'Active')
      .map((s) => ({ code: s.code, name: s.name })),
    confirmed: acad.confirmed.assignments,
    canCopyPrevious: acad.previousAssignments.length > 0,
  };
}

mock.get('/v1/academics/assignments', (req) => {
  const { acad, schoolId } = acadFor(req);
  return assignmentsView(schoolId, acad, req.query.branch);
});

function assignmentWarnings(
  schoolId: string,
  acad: AcademicsData,
  p: AssignmentInput,
): AssignmentWarning[] {
  const out: AssignmentWarning[] = [];
  const t = acad.teachers.find((x) => x.id === p.teacherId);
  if (!t || !p.armId || !p.subject) return out;
  const { level, arm } = findArm(acad, p.armId);
  const label = armLabel(level.name, arm.arm);
  if (!t.branches.includes(level.branchId))
    out.push({
      tone: 'error',
      kind: 'branch',
      text: `${t.name} doesn’t work at ${branchName(schoolId, level.branchId)}.`,
    });
  if (!offeredSubjects(acad, level).some(([c]) => c === p.subject))
    out.push({
      tone: 'error',
      kind: 'duplicate',
      text: `${level.name} doesn’t offer ${subjectName(acad, p.subject)}. Add it to the curriculum first.`,
    });
  const existing = acad.assignments.find((a) => a.armId === p.armId && a.subject === p.subject);
  if (existing && existing.teacherId !== p.teacherId)
    out.push({
      tone: 'warning',
      kind: 'duplicate',
      text: `Replaces ${teacherName(acad, existing.teacherId)} for ${label} ${subjectName(acad, p.subject)}.`,
    });
  if (existing?.teacherId === p.teacherId)
    out.push({
      tone: 'warning',
      kind: 'duplicate',
      text: `${t.name} already teaches ${label} ${subjectName(acad, p.subject)}.`,
    });
  const add = existing?.teacherId === p.teacherId ? 0 : subjectPeriods(acad, p.subject);
  const load = teacherLoad(acad, t.id);
  if (load + add > t.maxPeriods)
    out.push({
      tone: 'error',
      kind: 'workload',
      text: `Workload: ${load} + ${add} = ${load + add} of ${t.maxPeriods} periods. This exceeds the maximum set for ${t.employment.toLowerCase()} teachers.`,
    });
  else if (load + add >= t.maxPeriods - 2)
    out.push({
      tone: 'warning',
      kind: 'workload',
      text: `Workload: ${load} + ${add} = ${load + add} of ${t.maxPeriods} periods. Allowed, but close to the limit.`,
    });
  if (!t.qualified.includes(p.subject))
    out.push({
      tone: 'warning',
      kind: 'qualification',
      text: `${t.name} is not qualified for ${subjectName(acad, p.subject)} on their staff record (${t.qualified.map((c) => subjectName(acad, c)).join(', ') || 'none listed'}). Confirm this is a temporary cover.`,
    });
  const term = currentTerm(acad);
  const tt = term && acad.timetables.find((x) => x.armId === p.armId && x.termId === term.id);
  if (tt) {
    const busy = teacherBusy(acad, term.id, p.armId)[t.id] ?? {};
    const clash = Object.entries(tt.grid).find(([slot, c]) => c === p.subject && busy[slot]);
    if (clash)
      out.push({
        tone: 'error',
        kind: 'conflict',
        text: `Timetable conflict: ${label} ${subjectName(acad, p.subject)} is on ${clash[0].replace('-', ' ')}. ${t.name} teaches ${busy[clash[0]]} then. Resolve it in the timetable before publishing.`,
      });
  }
  return out;
}

mock.post('/v1/academics/assignments/check', (req) => {
  const { acad, schoolId } = acadFor(req);
  return assignmentWarnings(schoolId, acad, req.body as AssignmentInput);
});

mock.post('/v1/academics/assignments', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const p = req.body as AssignmentInput;
  const t = acad.teachers.find((x) => x.id === p.teacherId) ?? fail('Choose a teacher.');
  if (!p.subject) fail('Choose a subject.');
  if (!p.armId) fail('Choose a class.');
  const blocking = assignmentWarnings(schoolId, acad, p).filter(
    (w) => w.tone === 'error' && w.kind !== 'conflict',
  );
  if (blocking.length) fail(blocking[0]!.text);
  acad.assignments = acad.assignments.filter(
    (a) => !(a.armId === p.armId && a.subject === p.subject),
  );
  const rec = {
    id: nextId(acad, 'as'),
    teacherId: t.id,
    subject: p.subject,
    armId: p.armId,
    type: p.type ?? 'Subject teacher',
  };
  acad.assignments.push(rec);
  const { level, arm } = findArm(acad, p.armId);
  log(
    'Academics',
    `${t.name} assigned`,
    `${subjectName(acad, p.subject)} · ${armLabel(level.name, arm.arm)} · ${rec.type}`,
  );
  return assignmentsView(schoolId, acad);
});

mock.delete('/v1/academics/assignments/:id', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  const a =
    acad.assignments.find((x) => x.id === req.params.id) ?? fail('Assignment not found', 404);
  acad.assignments.splice(acad.assignments.indexOf(a), 1);
  log(
    'Academics',
    `Assignment removed: ${teacherName(acad, a.teacherId)}`,
    subjectName(acad, a.subject),
  );
  return assignmentsView(schoolId, acad);
});

mock.post('/v1/academics/assignments/copy-previous', (req) => {
  const { acad, schoolId, log } = acadFor(req);
  let copied = 0;
  for (const a of acad.previousAssignments) {
    if (acad.assignments.some((x) => x.armId === a.armId && x.subject === a.subject)) continue;
    if (!acad.teachers.some((t) => t.id === a.teacherId)) continue;
    try {
      const { level } = findArm(acad, a.armId);
      if (!offeredSubjects(acad, level).some(([c]) => c === a.subject)) continue;
    } catch {
      continue;
    }
    acad.assignments.push({ ...a, id: nextId(acad, 'as') });
    copied++;
  }
  log('Academics', 'Assignments copied from the previous term', plural(copied, 'assignment'));
  return { ...assignmentsView(schoolId, acad), copied };
});

/* ======================= Timetable ======================= */

function timetableRec(acad: AcademicsData, armId: string, termId: string): TimetableRec {
  return (
    acad.timetables.find((t) => t.armId === armId && t.termId === termId) ?? {
      armId,
      termId,
      status: 'Draft',
      version: 1,
      publishedVersion: null,
      grid: {},
      history: [],
    }
  );
}

export function timetableView(
  schoolId: string,
  acad: AcademicsData,
  armId: string,
  termId: string,
): TimetableView {
  const { level, arm } = findArm(acad, armId);
  const session = currentSession(acad);
  const term = session?.terms.find((t) => t.id === termId) ?? fail('Term not found', 404);
  const tt = timetableRec(acad, armId, termId);
  void schoolId;
  return {
    armId,
    arm: armLabel(level.name, arm.arm),
    term: term.name,
    termId,
    status: tt.status,
    version: tt.version,
    publishedVersion: tt.publishedVersion,
    periods: PERIODS,
    grid: tt.grid,
    palette: offeredSubjects(acad, level).map(([code]) => {
      const t =
        acad.assignments.find((a) => a.armId === armId && a.subject === code)?.teacherId ?? null;
      return {
        code,
        name: subjectName(acad, code),
        teacherId: t,
        teacher: teacherName(acad, t),
        need: subjectPeriods(acad, code),
      };
    }),
    busy: teacherBusy(acad, termId, armId),
    maxConsecutive: MAX_CONSECUTIVE,
    history: tt.history,
  };
}

mock.get('/v1/academics/timetable/arms', (req) => {
  const { acad, schoolId } = acadFor(req);
  const term = termFrom(acad, req.query.term);
  const branchId = activeBranches(schoolId).find((b) => b.name === req.query.branch)?.id;
  return allArms(acad)
    .filter(({ level }) => !branchId || level.branchId === branchId)
    .map(({ level, arm }): TimetableArmOption => {
      const tt = acad.timetables.find((t) => t.armId === arm.id && t.termId === term?.id);
      return {
        id: arm.id,
        name: armLabel(level.name, arm.arm),
        branch: branchName(schoolId, level.branchId),
        status: tt?.status ?? 'Not started',
      };
    });
});

mock.get('/v1/academics/timetable', (req) => {
  const { acad, schoolId } = acadFor(req);
  const term = termFrom(acad, req.query.term) ?? fail('Create a session and its terms first.', 409);
  return timetableView(schoolId, acad, req.query.arm!, term.id);
});

function validateGrid(
  acad: AcademicsData,
  armId: string,
  termId: string,
  grid: Record<string, string>,
) {
  const { level } = findArm(acad, armId);
  const offered = offeredSubjects(acad, level).map(([c]) => c);
  const counts: Record<string, number> = {};
  const busy = teacherBusy(acad, termId, armId);
  for (const [slot, code] of Object.entries(grid)) {
    if (!LESSON_SLOTS.includes(slot)) fail(`${slot} is not a lesson period.`);
    if (!offered.includes(code)) fail(`${level.name} doesn’t offer ${subjectName(acad, code)}.`);
    counts[code] = (counts[code] ?? 0) + 1;
    const t = acad.assignments.find((a) => a.armId === armId && a.subject === code)?.teacherId;
    if (t && busy[t]?.[slot])
      fail(
        `${teacherName(acad, t)} is already teaching ${busy[t]![slot]} on ${slot.replace('-', ' ')}.`,
        409,
      );
  }
  for (const [code, n] of Object.entries(counts))
    if (n > subjectPeriods(acad, code))
      fail(`${subjectName(acad, code)} has ${n} lessons; it needs ${subjectPeriods(acad, code)}.`);
  const lessons = PERIODS.filter((p) => !p.isBreak).map((p) => p.id);
  for (const d of DAYS) {
    let run = 1;
    lessons.forEach((p, i) => {
      const c = grid[`${d}-${p}`];
      const prev = i ? grid[`${d}-${lessons[i - 1]}`] : undefined;
      run = c && c === prev ? run + 1 : 1;
      if (run > MAX_CONSECUTIVE)
        fail(`More than ${MAX_CONSECUTIVE} consecutive ${subjectName(acad, c!)} lessons on ${d}.`);
    });
  }
}

function saveTimetable(acad: AcademicsData, tt: TimetableRec) {
  if (!acad.timetables.includes(tt)) acad.timetables.push(tt);
}

mock.put('/v1/academics/timetable', (req) => {
  const { acad, schoolId } = acadFor(req);
  const p = req.body as { armId: string; termId: string; grid: Record<string, string> };
  const tt = timetableRec(acad, p.armId, p.termId);
  if (tt.status === 'Published')
    fail('Published timetables are locked. Start a revision to change it.', 409);
  validateGrid(acad, p.armId, p.termId, p.grid ?? {});
  tt.grid = { ...p.grid };
  tt.status = 'Draft';
  saveTimetable(acad, tt);
  return timetableView(schoolId, acad, p.armId, p.termId);
});

mock.post('/v1/academics/timetable/suggest', (req) => {
  const { acad, schoolId } = acadFor(req);
  const p = req.body as { armId: string; termId: string; grid: Record<string, string> };
  const tt = timetableRec(acad, p.armId, p.termId);
  if (tt.status === 'Published')
    fail('Published timetables are locked. Start a revision to change it.', 409);
  tt.grid = autoTimetable(acad, p.armId, p.termId, p.grid ?? tt.grid);
  tt.status = 'Draft';
  saveTimetable(acad, tt);
  return timetableView(schoolId, acad, p.armId, p.termId);
});

mock.post('/v1/academics/timetable/copy', (req) => {
  const { acad, schoolId } = acadFor(req);
  const p = req.body as { armId: string; termId: string; fromTermId: string };
  const src =
    acad.timetables.find((t) => t.armId === p.armId && t.termId === p.fromTermId) ??
    fail('Nothing to copy from that term.', 404);
  const tt = timetableRec(acad, p.armId, p.termId);
  if (tt.status === 'Published')
    fail('Published timetables are locked. Start a revision to change it.', 409);
  tt.grid = { ...src.grid };
  tt.status = 'Draft';
  tt.history.unshift({
    id: `h${Date.now()}`,
    title: 'Draft copied from another term',
    detail: '',
    when: nowLabel(),
  });
  saveTimetable(acad, tt);
  return timetableView(schoolId, acad, p.armId, p.termId);
});

mock.post('/v1/academics/timetable/:action', (req) => {
  const { acad, schoolId, actor, log } = acadFor(req);
  const p = req.body as { armId: string; termId: string };
  const tt = timetableRec(acad, p.armId, p.termId);
  const view = timetableView(schoolId, acad, p.armId, p.termId);
  const entry = (title: string, detail = actor) =>
    tt.history.unshift({ id: `h${Date.now()}`, title, detail, when: nowLabel(), tone: 'success' });
  switch (req.params.action) {
    case 'review': {
      if (tt.status !== 'Draft') fail('Only a draft can be marked as reviewed.', 409);
      const left = view.palette.reduce(
        (n, x) =>
          n + Math.max(0, x.need - Object.values(tt.grid).filter((c) => c === x.code).length),
        0,
      );
      if (left) fail(`${plural(left, 'lesson')} still ${left === 1 ? 'needs' : 'need'} a period.`);
      const noTeacher = view.palette.filter((x) => !x.teacherId);
      if (noTeacher.length)
        fail(
          `${noTeacher.map((x) => x.name).join(', ')} ${noTeacher.length > 1 ? 'have' : 'has'} no teacher. Assign one in Teacher Assignments first.`,
        );
      tt.status = 'Reviewed';
      entry('Marked as reviewed');
      break;
    }
    case 'publish':
      if (tt.status !== 'Reviewed') fail('Review the timetable before publishing it.', 409);
      tt.status = 'Published';
      tt.publishedVersion = tt.version;
      entry(`Version ${tt.version} published`);
      log('Academics', `Timetable published: ${view.arm}`, `${view.term} · v${tt.version}`);
      break;
    case 'revise':
      if (tt.status !== 'Published') fail('Only a published timetable can be revised.', 409);
      tt.status = 'Draft';
      tt.version += 1;
      entry(
        `Revision v${tt.version} started`,
        `${actor} · v${tt.publishedVersion} stays in effect until the revision is published`,
      );
      break;
    default:
      fail('Unknown action', 404);
  }
  saveTimetable(acad, tt);
  return timetableView(schoolId, acad, p.armId, p.termId);
});

/* ======================= Assessment & grading ======================= */

function assessmentView(acad: AcademicsData) {
  const missing = acad.assessment.same
    ? acad.assessment.schemes['*']
      ? []
      : ['All sections']
    : acad.sections.filter((s) => !acad.assessment.schemes[s.name]).map((s) => s.name);
  return {
    ...structuredClone(acad.assessment),
    sections: acad.sections.map((s) => ({ name: s.name, code: s.code })),
    confirmed: acad.confirmed.assessment,
    missing,
    hasPublished: acad.published.length > 0,
  };
}

mock.get('/v1/academics/assessment', (req) => assessmentView(acadFor(req).acad));

export function schemeErrors(label: string, s: AssessmentScheme): string[] {
  const e: string[] = [];
  if (s.mode === 'scores') {
    if (!s.components.length) e.push(`${label}: add at least one component.`);
    const names = new Set<string>();
    for (const c of s.components) {
      const n = c.name.trim().toLowerCase();
      if (!n) e.push(`${label}: name every component.`);
      else if (names.has(n)) e.push(`${label}: two components are called ${c.name}.`);
      names.add(n);
      if (!(c.max >= 1))
        e.push(`${label}: ${c.name || 'a component'} needs a maximum of at least 1.`);
      if (!(c.weight > 0)) e.push(`${label}: ${c.name || 'a component'} needs a weight.`);
    }
    const total = s.components.reduce((n, c) => n + (Number(c.weight) || 0), 0);
    if (Math.abs(total - 100) > 0.01)
      e.push(`${label}: weights add up to ${total}%. They must total 100%.`);
    const grades = new Set<string>();
    for (const g of s.scale) {
      if (!g.grade.trim()) e.push(`${label}: every band needs a grade.`);
      else if (grades.has(g.grade.trim().toUpperCase()))
        e.push(`${label}: grade ${g.grade} appears twice.`);
      grades.add(g.grade.trim().toUpperCase());
      if (!(g.min >= 0 && g.max <= 100 && g.min <= g.max))
        e.push(`${label}: ${g.grade || 'a band'} has an invalid range.`);
    }
    const sorted = [...s.scale].sort((a, b) => b.max - a.max);
    if (!sorted.length) e.push(`${label}: add grades.`);
    else if (sorted[0]!.max !== 100) e.push(`${label}: the top grade must end at 100.`);
    else if (sorted[sorted.length - 1]!.min !== 0)
      e.push(`${label}: the lowest grade must start at 0.`);
    else
      sorted.forEach((g, i) => {
        const next = sorted[i + 1];
        if (next && next.max !== g.min - 1)
          e.push(
            next.max >= g.min
              ? `${label}: ${g.grade} and ${next.grade} overlap.`
              : `${label}: there is a gap between ${next.grade} and ${g.grade}.`,
          );
      });
  } else {
    const names = s.ratings.map((x) => x.name.trim()).filter(Boolean);
    if (names.length < 2) e.push(`${label}: add at least 2 ratings.`);
    if (new Set(names.map((x) => x.toLowerCase())).size !== names.length)
      e.push(`${label}: ratings must be different.`);
  }
  return e;
}

mock.put('/v1/academics/assessment', (req) => {
  const { acad, log } = acadFor(req);
  const p = req.body as AssessmentConfig;
  const keys = p.same ? ['*'] : acad.sections.map((s) => s.name);
  const errors = keys.flatMap((k) => {
    const s = p.schemes[k];
    return s ? schemeErrors(k === '*' ? 'All sections' : k, s) : [];
  });
  if (errors.length) fail(errors[0]!);
  if (!(p.passMark >= 0 && p.passMark <= 100)) fail('The pass mark is between 0 and 100.');
  acad.assessment = {
    same: p.same,
    schemes: Object.fromEntries(keys.map((k) => [k, p.schemes[k] ?? null])),
    showPosition: p.showPosition,
    rounding: p.rounding,
    passMark: p.passMark,
  };
  log(
    'Academics',
    'Assessment & grading saved',
    plural(keys.filter((k) => p.schemes[k]).length, 'scheme'),
  );
  return assessmentView(acad);
});
