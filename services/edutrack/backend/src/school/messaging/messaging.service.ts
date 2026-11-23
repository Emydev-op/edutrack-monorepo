import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthUserContext } from '../../auth/auth-context.js';
import { PortalAccessService } from '../../auth/portal-access.service.js';
import { PortalLinksService } from '../../auth/portal-links.service.js';
import { Clock } from '../../common/clock/clock.js';
import { RequestContext } from '../../common/context/request-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ChatSender, ConversationKind } from '../../generated/prisma/enums.js';
import { Portal } from '../../generated/prisma/enums.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { TenantPrismaService } from '../../tenancy/tenant-prisma.service.js';
import { armLabel, staffName } from '../academics/academic-format.js';
import { MemberPermissions } from '../students/member-permissions.js';

export const MAX_SUBJECT = 120;
export const MAX_BODY = 2000;

/** Who is reading or writing: a parent, a teacher, or the school office. */
export type Viewer =
  | { side: 'parent'; userId: string; guardianId: string; name: string }
  | { side: 'teacher'; userId: string; staffId: string; name: string }
  | { side: 'school'; userId: string; name: string };

const SENDER: Record<Viewer['side'], ChatSender> = {
  parent: 'PARENT',
  teacher: 'TEACHER',
  school: 'SCHOOL',
};
const SENDER_LABEL: Record<ChatSender, 'Parent' | 'Teacher' | 'School'> = {
  PARENT: 'Parent',
  TEACHER: 'Teacher',
  SCHOOL: 'School',
};

const guardianName = (g: { title: string | null; fullName: string }) =>
  [g.title, g.fullName].filter(Boolean).join(' ');
const studentName = (s: { firstName: string; surname: string }) => `${s.firstName} ${s.surname}`;
const preview = (body: string, n = 140) =>
  body.length > n ? `${body.slice(0, n - 1).trimEnd()}…` : body;

const invalid = (fields: Record<string, string>) =>
  AppException.validation(fields, Object.values(fields)[0]);
const notFound = () =>
  AppException.notFound('That conversation doesn’t exist.', 'CONVERSATION_NOT_FOUND');

const CONVERSATION_INCLUDE = {
  guardian: { select: { id: true, title: true, fullName: true, email: true } },
  staff: {
    select: {
      id: true,
      title: true,
      firstName: true,
      lastName: true,
      email: true,
      status: true,
      membership: { select: { user: { select: { email: true } } } },
    },
  },
  student: { select: { id: true, firstName: true, surname: true } },
} as const;

/**
 * Messaging between a parent and their children's teachers, and between a parent and the school
 * office. A parent may write to the class teacher and subject teachers of their children this
 * term, or to the school; a teacher may write to the parents of students they teach; the office
 * (anyone with school-wide messaging) may write to any parent. Each side keeps a read marker, and
 * a new message emails the other side (no SMS). Conversations with a teacher are private to the
 * parent and that teacher; the office sees only conversations with the school.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly access: PortalAccessService,
    private readonly permissions: MemberPermissions,
    private readonly links: PortalLinksService,
    private readonly notifications: NotificationsService,
    private readonly clock: Clock,
  ) {}

  private get db() {
    return this.tenant.db;
  }

  /* ---------------- Who is asking ---------------- */

  async parent(auth: AuthUserContext): Promise<Viewer & { side: 'parent' }> {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'GUARDIAN', status: 'ACTIVE' },
      include: { guardian: true },
    });
    if (!m?.guardian || m.guardian.deletedAt || m.guardian.mergedIntoId)
      throw AppException.forbidden(
        'This account doesn’t have access to the Parent Portal at this school.',
        'NO_ACCESS',
      );
    return {
      side: 'parent',
      userId: auth.userId,
      guardianId: m.guardian.id,
      name: guardianName(m.guardian),
    };
  }

  async teacher(auth: AuthUserContext): Promise<Viewer & { side: 'teacher' }> {
    const m = await this.db.schoolMembership.findFirst({
      where: { id: auth.membershipId, userId: auth.userId, kind: 'STAFF', status: 'ACTIVE' },
      include: { staff: true },
    });
    if (!m?.staff || m.staff.status !== 'ACTIVE')
      throw AppException.forbidden(
        'This account doesn’t have access to the Teacher Workspace at this school.',
        'NO_ACCESS',
      );
    return { side: 'teacher', userId: auth.userId, staffId: m.staff.id, name: staffName(m.staff) };
  }

  async office(auth: AuthUserContext): Promise<Viewer & { side: 'school' }> {
    await this.permissions.require(
      'comms.school',
      'Only staff with school-wide messaging can read the school’s messages.',
    );
    const user = await this.db.user.findUnique({
      where: { id: auth.userId },
      select: { firstName: true, lastName: true },
    });
    return {
      side: 'school',
      userId: auth.userId,
      name: user ? `${user.firstName} ${user.lastName}`.trim() : 'School office',
    };
  }

  /* ---------------- Who can reach whom ---------------- */

  /** The active term, else the latest that has started. */
  private async term() {
    return (
      (await this.db.term.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true, sessionId: true, startsOn: true, endsOn: true },
      })) ??
      (await this.db.term.findFirst({
        where: { startsOn: { lte: this.clock.now() } },
        orderBy: { startsOn: 'desc' },
        select: { id: true, sessionId: true, startsOn: true, endsOn: true },
      }))
    );
  }

  /**
   * Each student's class this session and their teachers this term: the class teacher and the
   * teachers of the subjects they take (an elective only for those who chose it).
   */
  private async teachersOf(studentIds: string[]) {
    const out = new Map<
      string,
      {
        className: string | null;
        teachers: Map<string, { name: string; roles: string[] }>;
      }
    >();
    for (const id of studentIds) out.set(id, { className: null, teachers: new Map() });
    const term = await this.term();
    if (!term || !studentIds.length) return out;
    const enrolments = await this.db.enrollment.findMany({
      where: {
        sessionId: term.sessionId,
        status: 'ACTIVE',
        studentId: { in: studentIds },
        armId: { not: null },
      },
      select: {
        studentId: true,
        armId: true,
        level: { select: { name: true } },
        arm: { select: { name: true } },
      },
    });
    const armIds = [...new Set(enrolments.map((e) => e.armId!))];
    const [assignments, classTeachers, choices] = await Promise.all([
      this.db.teachingAssignment.findMany({
        where: { termId: term.id, armId: { in: armIds }, staff: { status: 'ACTIVE' } },
        select: {
          armId: true,
          subjectId: true,
          subject: { select: { name: true } },
          curriculumEntry: { select: { offering: true } },
          staff: { select: { id: true, title: true, firstName: true, lastName: true } },
        },
      }),
      this.db.classTeacherAssignment.findMany({
        where: {
          sessionId: term.sessionId,
          armId: { in: armIds },
          startsOn: { lte: term.endsOn },
          OR: [{ endsOn: null }, { endsOn: { gte: this.clock.now() } }],
          staff: { status: 'ACTIVE' },
        },
        orderBy: { startsOn: 'desc' },
        select: {
          armId: true,
          staff: { select: { id: true, title: true, firstName: true, lastName: true } },
        },
      }),
      this.db.studentSubject.findMany({
        where: { sessionId: term.sessionId, studentId: { in: studentIds } },
        select: { studentId: true, subjectId: true },
      }),
    ]);
    for (const e of enrolments) {
      const row = out.get(e.studentId)!;
      row.className = e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name;
      const add = (
        s: { id: string; title: string | null; firstName: string; lastName: string },
        role: string,
      ) => {
        const t = row.teachers.get(s.id) ?? { name: staffName(s), roles: [] };
        if (!t.roles.includes(role)) t.roles.push(role);
        row.teachers.set(s.id, t);
      };
      const ct = classTeachers.find((c) => c.armId === e.armId);
      if (ct) add(ct.staff, 'Class teacher');
      const mine = choices.filter((c) => c.studentId === e.studentId).map((c) => c.subjectId);
      for (const a of assignments.filter((x) => x.armId === e.armId)) {
        if (
          a.curriculumEntry.offering !== 'COMPULSORY' &&
          mine.length &&
          !mine.includes(a.subjectId)
        )
          continue;
        add(a.staff, a.subject.name);
      }
    }
    return out;
  }

  /** The parent's children (still at the school) with their teachers this term. */
  private async parentChildren(v: Viewer & { side: 'parent' }) {
    const links = await this.access.parentChildren(this.schoolId(), v.guardianId);
    const students = await this.db.student.findMany({
      where: { id: { in: links.map((l) => l.studentId) } },
      select: { id: true, firstName: true, surname: true },
    });
    const full = links.filter((l) => l.access === 'full').map((l) => l.studentId);
    const teachers = await this.teachersOf(full);
    return students.map((s) => ({
      studentId: s.id,
      name: studentName(s),
      onRoll: full.includes(s.id),
      className: teachers.get(s.id)?.className ?? null,
      teachers: [...(teachers.get(s.id)?.teachers.entries() ?? [])]
        .map(([staffId, t]) => ({ staffId, name: t.name, roles: t.roles }))
        .sort(
          (a, b) =>
            Number(b.roles.includes('Class teacher')) - Number(a.roles.includes('Class teacher')) ||
            a.name.localeCompare(b.name),
        ),
    }));
  }

  private schoolId() {
    return RequestContext.schoolId()!;
  }

  /** The students a teacher teaches this term (any subject) or is class teacher of. */
  private async taughtBy(staffId: string) {
    const term = await this.term();
    if (!term) return [];
    const [assignments, classArms] = await Promise.all([
      this.db.teachingAssignment.findMany({
        where: { termId: term.id, staffId },
        select: { armId: true },
      }),
      this.db.classTeacherAssignment.findMany({
        where: {
          staffId,
          sessionId: term.sessionId,
          startsOn: { lte: term.endsOn },
          OR: [{ endsOn: null }, { endsOn: { gte: this.clock.now() } }],
        },
        select: { armId: true },
      }),
    ]);
    const armIds = [...new Set([...assignments, ...classArms].map((x) => x.armId))];
    if (!armIds.length) return [];
    const enrolments = await this.db.enrollment.findMany({
      where: {
        sessionId: term.sessionId,
        status: 'ACTIVE',
        armId: { in: armIds },
        student: { status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] }, deletedAt: null },
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            surname: true,
            guardians: {
              where: { guardian: { deletedAt: null, mergedIntoId: null } },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              select: {
                relationship: true,
                guardian: { select: { id: true, title: true, fullName: true } },
              },
            },
          },
        },
        level: { select: { name: true } },
        arm: { select: { name: true } },
      },
      orderBy: [{ student: { surname: 'asc' } }, { student: { firstName: 'asc' } }],
    });
    // A teacher of electives still reaches only students in classes they teach.
    return enrolments.map((e) => ({
      studentId: e.student.id,
      name: studentName(e.student),
      className: e.arm ? armLabel(e.level.name, e.arm.name) : e.level.name,
      parents: e.student.guardians.map((g) => ({
        guardianId: g.guardian.id,
        name: guardianName(g.guardian),
        relationship: g.relationship,
      })),
    }));
  }

  /* ---------------- Contacts ---------------- */

  /** Parent: who they can write to (each child's teachers, and the school). */
  async parentContacts(auth: AuthUserContext) {
    const v = await this.parent(auth);
    const [children, school] = await Promise.all([
      this.parentChildren(v),
      this.db.school.findUniqueOrThrow({ where: { id: this.schoolId() }, select: { name: true } }),
    ]);
    return { school: school.name, children };
  }

  /** Teacher: the students they teach and their parents. */
  async teacherContacts(auth: AuthUserContext) {
    const v = await this.teacher(auth);
    return { students: await this.taughtBy(v.staffId) };
  }

  /** Office: parents matching a name, email or phone, or their child's name (up to 20). */
  async officeContacts(auth: AuthUserContext, q: string) {
    await this.office(auth);
    const text = q.trim();
    if (text.length < 2) return { parents: [] };
    const like = { contains: text, mode: 'insensitive' as const };
    const guardians = await this.db.guardian.findMany({
      where: {
        deletedAt: null,
        mergedIntoId: null,
        OR: [
          { fullName: like },
          { email: like },
          { phone: like },
          {
            students: {
              some: {
                student: { OR: [{ firstName: like }, { surname: like }, { admissionNo: like }] },
              },
            },
          },
        ],
      },
      orderBy: { fullName: 'asc' },
      take: 20,
      select: {
        id: true,
        title: true,
        fullName: true,
        students: {
          where: { student: { deletedAt: null, status: { in: ['ACTIVE', 'INCOMPLETE_PROFILE'] } } },
          select: { student: { select: { id: true, firstName: true, surname: true } } },
        },
      },
    });
    return {
      parents: guardians.map((g) => ({
        guardianId: g.id,
        name: guardianName(g),
        children: g.students.map((s) => ({
          studentId: s.student.id,
          name: studentName(s.student),
        })),
      })),
    };
  }

  /* ---------------- Conversations ---------------- */

  private whereFor(v: Viewer) {
    return v.side === 'parent'
      ? { guardianId: v.guardianId }
      : v.side === 'teacher'
        ? { kind: 'TEACHER' as ConversationKind, staffId: v.staffId }
        : { kind: 'SCHOOL' as ConversationKind };
  }

  private readAt(v: Viewer, c: { parentReadAt: Date | null; staffReadAt: Date | null }) {
    return v.side === 'parent' ? c.parentReadAt : c.staffReadAt;
  }

  /** Messages from the other side the viewer hasn't read. */
  private unreadWhere(v: Viewer) {
    return v.side === 'parent'
      ? { sender: { not: 'PARENT' as ChatSender } }
      : { sender: 'PARENT' as ChatSender };
  }

  private async schoolName() {
    return (
      await this.db.school.findUniqueOrThrow({
        where: { id: this.schoolId() },
        select: { name: true },
      })
    ).name;
  }

  /** Who the conversation is with, as the viewer sees it. */
  private other(
    v: Viewer,
    c: {
      kind: ConversationKind;
      guardian: { title: string | null; fullName: string };
      staff: { title: string | null; firstName: string; lastName: string } | null;
    },
    school: string,
  ) {
    if (v.side !== 'parent') return guardianName(c.guardian);
    return c.kind === 'SCHOOL' ? school : c.staff ? staffName(c.staff) : 'Teacher';
  }

  async list(v: Viewer) {
    const [rows, school] = await Promise.all([
      this.db.conversation.findMany({
        where: this.whereFor(v),
        orderBy: { lastMessageAt: 'desc' },
        take: 200,
        include: {
          ...CONVERSATION_INCLUDE,
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.schoolName(),
    ]);
    const unread = await Promise.all(
      rows.map((c) => {
        const since = this.readAt(v, c);
        return this.db.chatMessage.count({
          where: {
            conversationId: c.id,
            ...this.unreadWhere(v),
            ...(since && { createdAt: { gt: since } }),
          },
        });
      }),
    );
    const conversations = rows.map((c, i) => {
      const last = c.messages[0];
      return {
        id: c.id,
        kind: c.kind === 'SCHOOL' ? ('School' as const) : ('Teacher' as const),
        subject: c.subject,
        with: this.other(v, c, school),
        about: c.student ? studentName(c.student) : null,
        lastMessage: last
          ? {
              body: preview(last.body),
              at: last.createdAt.toISOString(),
              fromMe: last.sender === SENDER[v.side],
            }
          : null,
        unread: unread[i]!,
      };
    });
    return { conversations, unread: unread.reduce((a, n) => a + n, 0) };
  }

  /** How many messages wait for the viewer (for the portal's badge). */
  async unreadCount(v: Viewer) {
    return { unread: (await this.list(v)).unread };
  }

  private async find(v: Viewer, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    const c = await this.db.conversation.findFirst({
      where: { id, ...this.whereFor(v) },
      include: CONVERSATION_INCLUDE,
    });
    if (!c) throw notFound();
    return c;
  }

  /** One conversation with its messages; opening it marks it read. */
  async thread(v: Viewer, id: string) {
    const c = await this.find(v, id);
    const [messages, school] = await Promise.all([
      this.db.chatMessage.findMany({
        where: { conversationId: c.id },
        orderBy: { createdAt: 'asc' },
      }),
      this.schoolName(),
    ]);
    // Read up to the newest message (never behind it, even when the clock hasn't moved on).
    const now = new Date(Math.max(this.clock.now().getTime(), c.lastMessageAt.getTime()));
    await this.db.conversation.update({
      where: { id: c.id },
      data: v.side === 'parent' ? { parentReadAt: now } : { staffReadAt: now },
    });
    return {
      id: c.id,
      kind: c.kind === 'SCHOOL' ? ('School' as const) : ('Teacher' as const),
      subject: c.subject,
      with: this.other(v, c, school),
      about: c.student ? studentName(c.student) : null,
      canReply: c.kind === 'SCHOOL' || c.staff?.status === 'ACTIVE',
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        at: m.createdAt.toISOString(),
        sender: SENDER_LABEL[m.sender],
        mine: m.sender === SENDER[v.side],
        // The parent sees the office as the school; the office sees which colleague wrote.
        from:
          m.sender === 'SCHOOL' && v.side === 'parent'
            ? school
            : m.sender === 'SCHOOL'
              ? `${m.senderName} · ${school}`
              : m.senderName,
      })),
    };
  }

  private checkText(subject: string | null, body: string) {
    const fields: Record<string, string> = {};
    if (subject !== null) {
      if (!subject.trim()) fields.subject = 'Add a subject.';
      else if (subject.trim().length > MAX_SUBJECT)
        fields.subject = `Keep the subject to ${MAX_SUBJECT} characters.`;
    }
    if (!body.trim()) fields.body = 'Write a message.';
    else if (body.trim().length > MAX_BODY)
      fields.body = `Keep the message to ${MAX_BODY.toLocaleString('en-NG')} characters.`;
    if (Object.keys(fields).length) throw invalid(fields);
  }

  /**
   * Starts a conversation. A parent writes to the school, or to a teacher of one of their
   * children; a teacher to a parent of a student they teach; the office to any parent.
   */
  async start(
    v: Viewer,
    dto: {
      to?: 'school' | 'teacher';
      staffId?: string | null;
      guardianId?: string | null;
      studentId?: string | null;
      subject: string;
      body: string;
    },
  ) {
    this.checkText(dto.subject ?? '', dto.body ?? '');
    let kind: ConversationKind;
    let guardianId: string;
    let staffId: string | null = null;
    let studentId: string | null = dto.studentId || null;
    if (v.side === 'parent') {
      guardianId = v.guardianId;
      const children = await this.parentChildren(v);
      if (studentId && !children.some((c) => c.studentId === studentId))
        throw invalid({ studentId: 'Choose one of your children.' });
      if (dto.to === 'school') kind = 'SCHOOL';
      else if (dto.to === 'teacher') {
        kind = 'TEACHER';
        const pool = children.filter((c) => !studentId || c.studentId === studentId);
        const ok = pool.some((c) => c.teachers.some((t) => t.staffId === dto.staffId));
        if (!dto.staffId || !ok)
          throw invalid({ staffId: 'Choose one of your child’s teachers this term.' });
        staffId = dto.staffId;
        // Which child it's about, when the teacher teaches only one of them.
        if (!studentId) {
          const taught = children.filter((c) => c.teachers.some((t) => t.staffId === staffId));
          if (taught.length === 1) studentId = taught[0]!.studentId;
        }
      } else throw invalid({ to: 'Choose who to write to.' });
    } else if (v.side === 'teacher') {
      kind = 'TEACHER';
      staffId = v.staffId;
      const students = await this.taughtBy(v.staffId);
      const s = students.find(
        (x) =>
          (!studentId || x.studentId === studentId) &&
          x.parents.some((p) => p.guardianId === dto.guardianId),
      );
      if (!dto.guardianId || !s)
        throw invalid({ guardianId: 'Choose a parent of a student you teach this term.' });
      guardianId = dto.guardianId;
      studentId = s.studentId;
    } else {
      kind = 'SCHOOL';
      const g = dto.guardianId
        ? await this.db.guardian.findFirst({
            where: { id: dto.guardianId, deletedAt: null, mergedIntoId: null },
            select: { id: true },
          })
        : null;
      if (!g) throw invalid({ guardianId: 'Choose a parent.' });
      guardianId = g.id;
      if (studentId) {
        const linked = await this.db.studentGuardian.count({
          where: { guardianId, studentId },
        });
        if (!linked) studentId = null;
      }
    }
    const now = this.clock.now();
    const c = await this.db.conversation.create({
      data: {
        schoolId: this.schoolId(),
        kind,
        guardianId,
        staffId,
        studentId,
        subject: dto.subject.trim(),
        lastMessageAt: now,
        ...(v.side === 'parent' ? { parentReadAt: now } : { staffReadAt: now }),
        createdAt: now,
        updatedAt: now,
      },
    });
    await this.write(v, c.id, dto.body, now);
    return this.thread(v, c.id);
  }

  /** Adds a message to a conversation the viewer is part of. */
  async reply(v: Viewer, id: string, body: string) {
    const c = await this.find(v, id);
    this.checkText(null, body ?? '');
    if (c.kind === 'TEACHER' && c.staff?.status !== 'ACTIVE')
      throw new AppException(
        HttpStatus.CONFLICT,
        'This teacher has left the school, so the conversation is closed. Write to the school instead.',
        'CONVERSATION_CLOSED',
      );
    await this.write(v, c.id, body, this.after(c.lastMessageAt));
    return this.thread(v, c.id);
  }

  /**
   * When a new message is stamped: now, but always after the conversation's last message, so
   * messages keep their order and read markers (a message is unread when it's after the marker)
   * stay right even when two land in the same millisecond.
   */
  private after(last: Date) {
    return new Date(Math.max(this.clock.now().getTime(), last.getTime() + 1));
  }

  private async write(v: Viewer, conversationId: string, body: string, at: Date) {
    const schoolId = this.schoolId();
    await this.db.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: {
          schoolId,
          conversationId,
          sender: SENDER[v.side],
          senderUserId: v.userId,
          senderName: v.name,
          body: body.trim(),
          createdAt: at,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: at,
          ...(v.side === 'parent' ? { parentReadAt: at } : { staffReadAt: at }),
        },
      });
    });
    await this.alert(v, conversationId, body.trim());
  }

  /** Emails the other side about a new message (never SMS). */
  private async alert(v: Viewer, conversationId: string, body: string) {
    const c = await this.db.conversation.findFirstOrThrow({
      where: { id: conversationId },
      include: CONVERSATION_INCLUDE,
    });
    const school = await this.db.school.findUniqueOrThrow({
      where: { id: this.schoolId() },
      select: { name: true, slug: true, email: true },
    });
    const send = async (
      to: string | null | undefined,
      recipientName: string,
      from: string,
      link: string,
    ) => {
      if (!to) return;
      await this.notifications.email(to, 'chat-message', {
        recipientName,
        from,
        subject: c.subject,
        preview: preview(body, 300),
        link,
        schoolName: school.name,
      });
    };
    if (v.side !== 'parent')
      return send(
        c.guardian.email,
        guardianName(c.guardian),
        v.side === 'school' ? school.name : v.name,
        `${this.links.base(Portal.PARENT, school.slug)}/messages/${c.id}`,
      );
    if (c.kind === 'TEACHER' && c.staff)
      return send(
        c.staff.email ?? c.staff.membership?.user.email,
        staffName(c.staff),
        v.name,
        `${this.links.base(Portal.TEACHER, school.slug)}/messages/${c.id}`,
      );
    return send(
      school.email,
      `${school.name} office`,
      v.name,
      `${this.links.base(Portal.SCHOOL_ADMIN)}/communication/messages/${c.id}`,
    );
  }
}
