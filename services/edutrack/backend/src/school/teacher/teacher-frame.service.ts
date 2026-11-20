import { Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { Clock } from '../../common/clock/clock.js';
import { AppException } from '../../common/errors/app.exception.js';
import { formatAgo } from '../../platform/shared/format.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normalizePhone } from '../../auth/identifiers.js';
import { isoDate } from '../academics/academic-format.js';
import { ResultsFrameService } from '../results/results-frame.service.js';
import { RegisterService } from './register.service.js';
import { TeacherScopeService } from './teacher-scope.service.js';
import { TeachingService } from './teaching.service.js';

/** The emails a teacher can switch on or off (in-app notifications always arrive). */
export const TEACHER_EMAIL_EVENTS = [
  {
    key: 'sheet-returned',
    label: 'A result sheet is returned to me',
    description: 'With the reviewer’s comment, so you can correct and resubmit.',
    default: true,
  },
  {
    key: 'sheet-approved',
    label: 'A result sheet is approved or published',
    description: 'When the academic office approves or publishes one of your sheets.',
    default: false,
  },
  {
    key: 'deadline-reminder',
    label: 'Deadline reminders',
    description: 'Result entry and lesson note deadlines, two days before.',
    default: true,
  },
  {
    key: 'submission-received',
    label: 'Students submit work',
    description: 'A daily summary of new submissions waiting to be graded.',
    default: false,
  },
  {
    key: 'lesson-note-reviewed',
    label: 'A lesson note is approved or returned',
    description: 'The reviewer’s decision on your weekly lesson notes.',
    default: true,
  },
  {
    key: 'review-waiting',
    label: 'Something is waiting for my review',
    description: 'HODs and the Academic Head: sheets and notes sent to you.',
    default: true,
  },
  {
    key: 'class-reminder',
    label: 'A class teacher reminds me about a sheet',
    description: 'When a class teacher asks you to submit a missing subject.',
    default: false,
  },
  {
    key: 'announcement',
    label: 'New announcements for teachers',
    description: 'School announcements addressed to teachers or the whole school.',
    default: false,
  },
] as const;

const CATEGORIES = new Set([
  'results',
  'reviews',
  'assignments',
  'assessments',
  'lesson-notes',
  'register',
  'materials',
  'timetable',
  'announcements',
  'account',
]);

const LOCAL = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const localStamp = (d: Date) => LOCAL.format(d).replace(', ', 'T');
/** A Nigerian mobile number in any common format (0803…, +234 803…). */
const isNigerianMobile = (value: string) => {
  const e164 = normalizePhone(value);
  return !!e164 && /^\+234[789]\d{9}$/.test(e164);
};
const invalid = (message: string, field = 'phone') =>
  AppException.validation({ [field]: message }, message);

/**
 * The Teacher Workspace's frame on the API: the dashboard, sidebar counts, notifications and
 * email preferences, and the teacher's own profile. Results (sheets, HOD reviews and report-card
 * remarks) come from the results module; lesson notes and assignments arrive with their phases.
 */
@Injectable()
export class TeacherFrameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TeacherScopeService,
    private readonly teaching: TeachingService,
    private readonly register: RegisterService,
    private readonly results: ResultsFrameService,
    private readonly clock: Clock,
  ) {}

  /* ---------------- Notifications ---------------- */

  private mine(auth: AuthUserContext) {
    return { userId: auth.userId, schoolId: auth.schoolId! };
  }

  private item(n: {
    id: string;
    title: string;
    body: string;
    category: string;
    link: string | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      category: CATEGORIES.has(n.category) ? n.category : 'account',
      to: n.link ?? '/',
      createdAt: localStamp(n.createdAt),
      when: formatAgo(n.createdAt, this.clock.now()),
      read: !!n.readAt,
    };
  }

  async notifications(
    auth: AuthUserContext,
    q: { filter?: string; page?: number; pageSize?: number },
  ) {
    const base = this.mine(auth);
    const where = { ...base, ...(q.filter === 'unread' && { readAt: null }) };
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 20, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const [rows, matching, unread, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...base, readAt: null } }),
      this.prisma.notification.count({ where: base }),
    ]);
    return {
      rows: rows.map((n) => this.item(n)),
      meta: {
        page,
        pageSize,
        total: matching,
        totalPages: Math.max(1, Math.ceil(matching / pageSize)),
      },
      unread,
      total,
    };
  }

  async read(auth: AuthUserContext, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { ...this.mine(auth), id } });
    if (!n) throw AppException.notFound('Notification not found.', 'NOT_FOUND');
    const updated = n.readAt
      ? n
      : await this.prisma.notification.update({
          where: { id },
          data: { readAt: this.clock.now() },
        });
    return this.item(updated);
  }

  async readAll(auth: AuthUserContext) {
    const { count } = await this.prisma.notification.updateMany({
      where: { ...this.mine(auth), readAt: null },
      data: { readAt: this.clock.now() },
    });
    return { marked: count };
  }

  async preferences(auth: AuthUserContext) {
    const saved = await this.prisma.notificationPreference.findMany({
      where: this.mine(auth),
      select: { event: true, email: true },
    });
    const on = new Map(saved.map((p) => [p.event, p.email]));
    return TEACHER_EMAIL_EVENTS.map((e) => ({
      key: e.key,
      label: e.label,
      description: e.description,
      enabled: on.get(e.key) ?? e.default,
    }));
  }

  async savePreferences(auth: AuthUserContext, next: Record<string, unknown>) {
    const known = new Set<string>(TEACHER_EMAIL_EVENTS.map((e) => e.key));
    const changes = Object.entries(next ?? {}).filter(
      (e): e is [string, boolean] => known.has(e[0]) && typeof e[1] === 'boolean',
    );
    const { userId, schoolId } = this.mine(auth);
    for (const [event, email] of changes) {
      const existing = await this.prisma.notificationPreference.findFirst({
        where: { userId, schoolId, event },
      });
      if (existing)
        await this.prisma.notificationPreference.update({
          where: { id: existing.id },
          data: { email },
        });
      else
        await this.prisma.notificationPreference.create({
          data: { userId, schoolId, event, email, inApp: true, sms: false },
        });
    }
    return this.preferences(auth);
  }

  /* ---------------- Today's register ---------------- */

  /** A class teacher's register for today: taken or not, or why it can't be taken. */
  private async registerToday(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    const arm = await this.scope.classArm(s.id, term);
    if (!arm) return null;
    const today = TeacherScopeService.local(this.clock.now()).slice(0, 10);
    const day = await this.register.get(auth, term.id, today);
    return {
      armName: arm.label,
      taken: !!day.taken,
      closedReason:
        term.status !== 'ACTIVE'
          ? (TeacherScopeService.lockReason(term) ?? 'This term is read-only.')
          : day.lock && day.lock.code !== 'TOO_OLD'
            ? day.lock.reason
            : null,
    };
  }

  /* ---------------- Sidebar counts ---------------- */

  /** The results parts of the frame (counts, metrics, to-dos), or null when they can't load. */
  private async resultsFrame(auth: AuthUserContext, termId?: string) {
    const s = await this.scope.staff(auth);
    const term = await this.scope.term(termId);
    return this.results.frame(s, term);
  }

  async navCounts(auth: AuthUserContext, termId?: string) {
    // Lesson notes and assignments add their counts with their phases.
    const [reg, results] = await Promise.all([
      this.registerToday(auth, termId).catch(() => null),
      this.resultsFrame(auth, termId).catch(() => null),
    ]);
    const counts: Record<string, number> = {};
    if (reg && !reg.taken && !reg.closedReason) counts.register = 1;
    for (const [key, n] of Object.entries(results?.counts ?? {})) if (n) counts[key] = n;
    return counts;
  }

  /* ---------------- Dashboard ---------------- */

  async dashboard(auth: AuthUserContext, termId?: string) {
    const [me, ctx] = await Promise.all([this.teaching.me(auth), this.teaching.context()]);
    const term = await this.scope.term(termId);
    const now = TeacherScopeService.local(this.clock.now());
    const block = async <T>(fn: () => Promise<T>) => {
      try {
        return { ok: true as const, data: await fn() };
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof AppException ? error.message : 'This part didn’t load.',
        };
      }
    };
    const timetable = () => this.teaching.timetable(auth, term.id);
    const lessons = await block(async () => {
      const tt = await timetable();
      return {
        lessons: tt.todayLessons,
        note: tt.todayNote,
        multiCampus: tt.multiCampus,
        published: tt.published,
      };
    });
    const register = await this.registerToday(auth, term.id).catch(() => null);
    const results = await this.resultsFrame(auth, term.id).catch(() => null);
    const metrics = await block(async () => {
      const tt = await timetable();
      const time = now.slice(11);
      const current = tt.todayLessons.find((l) => l.start <= time && time < l.end);
      const next = current ?? tt.todayLessons.find((l) => l.start > time);
      return {
        classesToday: tt.todayLessons.length,
        nextLesson: next
          ? {
              armName: next.armName,
              subjectName: next.subjectName,
              start: next.start,
              end: next.end,
              now: next === current,
            }
          : null,
        noLessonsReason:
          tt.todayNote ?? (tt.lessons.length ? null : 'No lessons on your timetable yet.'),
        toGrade: 0,
        toGradeAssignments: 0,
        sheets: results?.sheets ?? {
          submitted: 0,
          total: 0,
          deadline: null,
          entryOpen: term.status === 'ACTIVE',
        },
        register,
        // Lesson-note reviews come with their phase.
        reviews:
          results && results.reviewSheets !== null
            ? { sheets: results.reviewSheets, notes: null }
            : null,
      };
    });
    const todo = await block(async () => {
      const items: unknown[] = [];
      // Returned sheets first, then sheets still open for entry, as the mock orders them.
      const sheetItems = (results?.todo ?? []) as { kind: string }[];
      items.push(...sheetItems.filter((x) => x.kind.startsWith('sheet-')));
      if (register && !register.taken && !register.closedReason && term.status === 'ACTIVE')
        items.push({
          id: `register:${now.slice(0, 10)}`,
          kind: 'register' as const,
          badge: { label: 'Today', tone: 'warning' as const },
          title: `Take today’s register for ${register.armName}`,
          detail: 'Mark every student present, late, absent or excused.',
          action: 'Take register',
          to: { name: 'register' },
        });
      items.push(...sheetItems.filter((x) => !x.kind.startsWith('sheet-')));
      return items;
    });
    const active = ctx.terms.find((x: { id: string }) => x.id === term.id) as
      { label?: string; name?: string; status?: string } | undefined;
    return {
      termId: term.id,
      termLabel: active?.label ?? `${term.session.name} · ${term.name}`,
      termStatus: (active?.status ?? 'Active') as string,
      lockReason: TeacherScopeService.lockReason(term),
      today: now.slice(0, 10),
      now,
      campuses: me.branches.map((b: { name: string }) => b.name),
      hasAssignments: me.hasAssignments,
      profileComplete: me.profileComplete,
      metrics,
      lessons,
      todo,
    };
  }

  /* ---------------- Profile ---------------- */

  private async staffRow(auth: AuthUserContext) {
    const s = await this.scope.staff(auth);
    return this.prisma.staff.findFirstOrThrow({
      where: { id: s.id, schoolId: auth.schoolId! },
      include: { department: { select: { name: true } } },
    });
  }

  async profile(auth: AuthUserContext) {
    const [row, me] = await Promise.all([this.staffRow(auth), this.teaching.me(auth)]);
    const term = await this.scope.term();
    const [assignments, arm] = await Promise.all([
      this.scope.assignments(row.id, term.id),
      this.scope.classArm(row.id, term),
    ]);
    return {
      id: row.id,
      title: row.title ?? '',
      firstName: row.firstName,
      lastName: row.lastName,
      name: me.teacher.name,
      email: row.email ?? me.teacher.email ?? '',
      staffNo: row.staffNumber,
      gender: row.gender === 'FEMALE' ? ('Female' as const) : ('Male' as const),
      phone: row.phone ?? '',
      address: row.address ?? '',
      emergencyContact: row.emergencyContactName
        ? {
            name: row.emergencyContactName,
            phone: row.emergencyContactPhone ?? '',
            relationship: row.emergencyContactRelationship ?? '',
          }
        : null,
      position: row.positionTitle ?? 'Teacher',
      department: row.department?.name ?? null,
      roles: me.roles,
      branches: me.branches.map((b: { name: string }) => b.name),
      employment: row.employment === 'PART_TIME' ? ('Part-time' as const) : ('Full-time' as const),
      joinedOn: row.startedOn ? isoDate(row.startedOn) : '',
      classTeacherOf: arm ? `${arm.label} · ${arm.branch}` : null,
      teaching: assignments.map(
        (a: { arm: { label: string }; subject: { name: string } }) =>
          `${a.arm.label} · ${a.subject.name}`,
      ),
    };
  }

  /** Phone, address and emergency contact; the office keeps name, email, staff number and roles. */
  async saveProfile(
    auth: AuthUserContext,
    body: {
      phone?: string;
      address?: string;
      emergencyContact?: { name?: string; phone?: string; relationship?: string } | null;
    },
  ) {
    const row = await this.staffRow(auth);
    const phone = String(body.phone ?? '').trim();
    if (!phone || !isNigerianMobile(phone))
      throw invalid('Enter your Nigerian mobile number, like 0803 412 7781.');
    const address = String(body.address ?? '').trim();
    if (address.length > 200) throw invalid('Keep the address under 200 characters.', 'address');
    const ec = body.emergencyContact;
    let contact: { name: string; phone: string; relationship: string } | null = null;
    if (ec && (ec.name?.trim() || ec.phone?.trim() || ec.relationship?.trim())) {
      if (!ec.name?.trim())
        throw invalid('Enter the emergency contact’s name.', 'emergencyContact.name');
      if (!ec.phone?.trim() || !isNigerianMobile(ec.phone))
        throw invalid(
          'Enter the emergency contact’s Nigerian mobile number, like 0803 412 7781.',
          'emergencyContact.phone',
        );
      contact = {
        name: ec.name.trim(),
        phone: normalizePhone(ec.phone) ?? ec.phone.trim(),
        relationship: (ec.relationship ?? '').trim(),
      };
    }
    await this.prisma.staff.update({
      where: { id: row.id },
      data: {
        phone: normalizePhone(phone) ?? phone,
        address: address || null,
        emergencyContactName: contact?.name ?? null,
        emergencyContactPhone: contact?.phone ?? null,
        emergencyContactRelationship: contact?.relationship ?? null,
      },
    });
    return this.profile(auth);
  }
}
