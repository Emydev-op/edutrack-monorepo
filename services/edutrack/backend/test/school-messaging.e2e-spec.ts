import {
  authed,
  createTestApp,
  login,
  PASSWORD,
  signIn,
  type TestApp,
} from './support/test-app.js';

type Api = ReturnType<typeof authed>;
const HOST = 'greenfield.localhost';
const P = '/api/v1/parent/messages';
const T = '/api/v1/messages';
const O = '/api/v1/comms/messages';

interface Thread {
  id: string;
  kind: string;
  with: string;
  about: string | null;
  canReply: boolean;
  messages: { body: string; mine: boolean; sender: string; from: string }[];
}
interface List {
  conversations: { id: string; unread: number; subject: string; with: string }[];
  unread: number;
}
interface ParentContacts {
  school: string;
  children: {
    studentId: string;
    name: string;
    onRoll: boolean;
    teachers: { staffId: string; name: string; roles: string[] }[];
  }[];
}

/**
 * Parent messaging: a parent writes to one of their child's teachers or to the school office; a
 * teacher writes to parents of students they teach; the office answers as the school. Each side
 * sees only its own conversations, unread counts follow read markers, and the other side gets an
 * email (never an SMS).
 */
describe('Parent messaging (e2e)', () => {
  let t: TestApp;
  let parent: Api;
  let office: Api;
  let teacher: Api;
  let contacts: ParentContacts;
  let teacherId: string;
  let teacherEmail: string;
  let teacherThread: string;
  let schoolThread: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.reseed();
    const res = await login(t, 'funke.adeyemi@gmail.com', PASSWORD, {
      portal: 'parent',
      host: HOST,
    });
    parent = authed(t, res.body.data.accessToken as string, { host: HOST });
    office = authed(t, (await signIn(t, 'adaeze.okonkwo@greenfield.edu.ng')).token);
    contacts = (await parent.get(`${P}/contacts`)).body.data as ParentContacts;
    // A teacher of one of Funke's children who has signed in to the Teacher Workspace.
    const ids = contacts.children.flatMap((c) => c.teachers.map((x) => x.staffId));
    const staff = await t.prisma.staff.findFirstOrThrow({
      where: { id: { in: ids }, membership: { status: 'ACTIVE', user: { status: 'ACTIVE' } } },
      include: { membership: { include: { user: true } } },
    });
    teacherId = staff.id;
    teacherEmail = staff.membership!.user.email!;
    teacher = authed(t, (await signIn(t, teacherEmail, { host: HOST })).token, { host: HOST });
  });

  afterAll(async () => {
    await t.prisma.chatMessage.deleteMany({});
    await t.prisma.conversation.deleteMany({});
    await t.reseed();
    await t.close();
  });

  it('lists each child’s teachers and the school', async () => {
    expect(contacts.school).toBe('Greenfield Academy');
    expect(contacts.children.length).toBeGreaterThan(0);
    const withTeachers = contacts.children.find((c) => c.teachers.length)!;
    expect(withTeachers.teachers.some((x) => x.roles.length > 0)).toBe(true);
  });

  it('lets a parent write to their child’s teacher, and the teacher reply', async () => {
    t.notifications.clear();
    const res = await parent.post(P).send({
      to: 'teacher',
      staffId: teacherId,
      subject: 'Homework this week',
      body: 'Good morning. Could you tell me what Emmanuel should revise this week?',
    });
    expect(res.status).toBe(201);
    const thread = res.body.data as Thread;
    teacherThread = thread.id;
    expect(thread).toMatchObject({ kind: 'Teacher', canReply: true });
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({ mine: true, sender: 'Parent' });
    // The teacher is emailed, with a link to the conversation in the Teacher Workspace.
    const mail = t.notifications.find(teacherEmail, 'chat-message');
    expect(mail).toBeTruthy();
    expect((mail!.data as { link: string }).link).toContain(`/messages/${thread.id}`);
    expect(
      t.notifications.sent.some((m) => m.channel === 'sms' && m.template === 'chat-message'),
    ).toBe(false);

    const inbox = (await teacher.get(T)).body.data as List;
    expect(inbox.conversations.find((c) => c.id === teacherThread)).toMatchObject({ unread: 1 });
    const opened = (await teacher.get(`${T}/${teacherThread}`)).body.data as Thread;
    expect(opened.messages[0]).toMatchObject({ mine: false, sender: 'Parent' });
    expect(((await teacher.get(T)).body.data as List).unread).toBe(0);

    const reply = await teacher
      .post(`${T}/${teacherThread}`)
      .send({ body: 'Fractions and decimals, pages 40 to 52.' });
    expect(reply.status).toBe(201);
    const parentInbox = (await parent.get(P)).body.data as List;
    expect(parentInbox.conversations.find((c) => c.id === teacherThread)!.unread).toBe(1);
    expect(t.notifications.find('funke.adeyemi@gmail.com', 'chat-message')).toBeTruthy();
  });

  it('refuses a teacher who doesn’t teach the parent’s children', async () => {
    const mine = new Set(contacts.children.flatMap((c) => c.teachers.map((x) => x.staffId)));
    const other = await t.prisma.staff.findFirstOrThrow({
      where: {
        school: { slug: 'greenfield' },
        kind: 'TEACHING',
        status: 'ACTIVE',
        id: { notIn: [...mine] },
      },
    });
    const res = await parent
      .post(P)
      .send({ to: 'teacher', staffId: other.id, subject: 'Hello', body: 'Hello' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.staffId).toBeTruthy();
    const empty = await parent.post(P).send({ to: 'school', subject: '', body: '' });
    expect(Object.keys(empty.body.error.fields).sort()).toEqual(['body', 'subject']);
  });

  it('sends a parent’s message to the school office, answered as the school', async () => {
    const res = await parent.post(P).send({
      to: 'school',
      subject: 'Change of address',
      body: 'We have moved to 12 Admiralty Way, Lekki.',
    });
    expect(res.status).toBe(201);
    schoolThread = res.body.data.id;

    const inbox = (await office.get(O)).body.data as List;
    expect(inbox.conversations.map((c) => c.id)).toContain(schoolThread);
    // The office never sees conversations with teachers, and teachers never see the office's.
    expect(inbox.conversations.map((c) => c.id)).not.toContain(teacherThread);
    expect((await office.get(`${O}/${teacherThread}`)).status).toBe(404);
    expect((await teacher.get(`${T}/${schoolThread}`)).status).toBe(404);

    await office.post(`${O}/${schoolThread}`).send({ body: 'Thank you, we’ve updated it.' });
    const seen = (await parent.get(`${P}/${schoolThread}`)).body.data as Thread;
    expect(seen.messages.at(-1)).toMatchObject({ sender: 'School', from: 'Greenfield Academy' });
    const officeView = (await office.get(`${O}/${schoolThread}`)).body.data as Thread;
    expect(officeView.messages.at(-1)!.from).toContain('· Greenfield Academy');
  });

  it('lets a teacher write to a parent of a student they teach, and no one else', async () => {
    const { students } = (await teacher.get(`${T}/contacts`)).body.data as {
      students: { studentId: string; parents: { guardianId: string }[] }[];
    };
    const s = students.find((x) => x.parents.length)!;
    const res = await teacher.post(T).send({
      guardianId: s.parents[0]!.guardianId,
      studentId: s.studentId,
      subject: 'Great progress',
      body: 'Just to say your child has done very well this week.',
    });
    expect(res.status).toBe(201);

    const taught = new Set(students.flatMap((x) => x.parents.map((p) => p.guardianId)));
    const stranger = await t.prisma.guardian.findFirst({
      where: { school: { slug: 'greenfield' }, id: { notIn: [...taught] }, deletedAt: null },
    });
    if (stranger) {
      const no = await teacher.post(T).send({ guardianId: stranger.id, subject: 'Hi', body: 'Hi' });
      expect(no.status).toBe(422);
      expect(no.body.error.fields.guardianId).toBeTruthy();
    }
  });
});
