# Teacher Workspace — product spec

Status: agreed 9 Nov 2026. Source design: Claude Design project `b382eda8…`, file `Teacher Workspace.dc.html` with `teacher-routes.js` and `teacher-routes-2.js`. This spec is the source of truth where it differs from the design; each difference is listed in [Changes from the design](#changes-from-the-design).

App: `services/edutrack/teacher-portal` (Vue 3 + TanStack Query + Pinia + shadcn-vue, same building blocks as School Admin through `@edutrack/app-kit`). It runs on its own in-browser mock API (`@edutrack/web-core/mock`) until the backend exists; it does not share live data with School Admin.

## 1. Who uses it

Every staff account with the **Teacher** role signs in here. Extra responsibilities come from the teacher's assignments and roles, not separate apps:

| Responsibility  | Comes from                                              | Unlocks                                                                                     |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Subject teacher | A teacher assignment (subject × class arm) for the term | Classes, subjects, students, assignments, materials, assessments, score entry, lesson notes |
| Class teacher   | Being the class teacher of an arm                       | My class: daily register, all-subject progress, report-card remarks and conduct ratings     |
| HOD             | The **HOD** role for a department                       | Reviews: result sheets and lesson notes from that department                                |
| Academic Head   | The **Academic Head** role                              | Reviews lesson notes for departments with no HOD                                            |

A teacher only ever sees classes, students and work inside their own assignments for the selected term. Fees, guardians' contacts and documents are never shown.

### Demo accounts (mock only, password `Edutrack2026!`)

| Account                             | Who                              | Shows                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `s.ade@greenfield.edu.ng`           | Mr. Samuel Ade · Mathematics     | Subject teacher on two campuses (Maths: JSS 1A, JSS 2B, SSS 1A at Main; Further Maths: SSS 1A at Lekki). Department Sciences, HOD Mr. Bello                                                      |
| `g.okafor@greenfield.edu.ng`        | Mrs. Grace Okafor · English      | Class teacher of JSS 2B (register, remarks) and English teacher. Department Languages has **no HOD**, so her sheets go straight to the academic office and her lesson notes to the Academic Head |
| `i.bello@greenfield.edu.ng`         | Mr. Ibrahim Bello · HOD Sciences | Reviews Sciences sheets and lesson notes; also teaches Physics                                                                                                                                   |
| `c.eze@greenfield.edu.ng`           | Mrs. Chioma Eze · VP Academics   | Academic Head: reviews Languages lesson notes; her own English notes are filed without review                                                                                                    |
| `t.salami@greenfield.edu.ng`        | Mr. Babatunde Salami             | New teacher with no assignments yet and no phone number (empty state, "complete your profile")                                                                                                   |
| `invite` link from the sign-in page | Pending invitation               | Activation flow                                                                                                                                                                                  |
| `y.oladipo@greenfield.edu.ng`       | Suspended account                | Sign-in refused with the reason                                                                                                                                                                  |

## 2. Time and the school calendar

The mock runs on a fixed demo clock: **Tuesday 8 December 2026, 08:15** (one setting, `MOCK_NOW` in the mock). The real API uses the real date. The calendar matches School Admin's:

- Session 2026/2027. **First Term** 14 Sep – 18 Dec 2026 (Active). Second Term starts 12 Jan 2027 (Upcoming).
- Mid-term break 29 Oct – 2 Nov. Examinations 24 Nov – 5 Dec. **Result entry closes Fri 11 Dec, 23:59**. Results publication Mon 14 Dec.
- Public holidays: 1 Oct, 25–26 Dec, 1 Jan. Staff development day 20 Nov (no classes).
- Past term for history: Third Term 2025/2026 (Closed, read-only).

The context bar shows session and term. Choosing a past term makes everything read-only. "Today" in the dashboard, register and timetable is the demo clock's date.

## 3. Navigation

```
Dashboard
Teaching      My classes · My subjects · Timetable · Students
My class      Register · Class progress · Report cards        (class teachers only)
Work          Assignments · Assessments · Results · Materials · Lesson notes
Reviews       Result sheets · Lesson notes                     (HOD / Academic Head only)
              Announcements · Notifications · Profile
```

Counts in the sidebar: Results (sheets returned, or still open with missing scores), Assignments (submissions waiting to be graded), Lesson notes (returned + overdue), Register (today not taken), Report cards (students still missing a remark or rating), Reviews (items waiting on me). Each count is the same set the page it opens (and the dashboard to-do) shows.

## 4. Rules the whole app follows

1. **Scope**: every list and record is filtered to the signed-in teacher's assignments for the selected term. Opening anything outside that scope by URL shows "You don't have access to …" with what they _are_ assigned to, never someone else's data.
2. **Term lock**: only the Active term is editable. Past and upcoming terms are read-only, with a reason.
3. **Missing is never zero**: a blank score is _missing_. ABS = absent (counts as 0 only if the school says so; here it is excluded from the average and flagged), EXM = exempt (excluded from the total, the component weights re-spread). A sheet can't be submitted with any missing score.
4. **Deadlines are real**: after result entry closes, drafts become read-only and the teacher must ask the academic office to reopen (shown as a notice, not a silent failure).
5. **Unsaved changes**: every form and the score sheet guard navigation; the score sheet also autosaves a draft every few seconds and on blur.
6. **Everything that changes state confirms** with what will happen and who is notified, and leaves a history entry.
7. **Phone width**: every screen works at 375px; the score sheet and the register switch to one-student-at-a-time cards.

## 5. Screens and flows

### 5.1 Sign-in and activation

Portal Auth design, teacher variant. Sign in (wrong password, locked after 5 attempts for 15 min, suspended, deactivated, password expired → set a new one), forgot / reset password, accept invitation (validate link → confirm details → set password → signed in). Expired or used invitation links explain what to do.

### 5.2 Dashboard

- Greeting with the API's date, the selected term and the campuses taught.
- Metrics: classes today (with the lesson on now or next), submissions to grade, result sheets (submitted of total, deadline countdown), register (class teachers: taken today or not), reviews waiting (HODs and the Academic Head).
- Today's lessons from the published timetable (Done / Now / Next / Later from the clock), each opening the lesson.
- To-do list built from real state, each item linking to the record: returned sheets (with the reviewer's comment), sheets with missing scores and the deadline (opening the sheet on the first blank cell), complete drafts not yet submitted ("ready to submit", opening the Review tab), submissions to grade (the two busiest assignments, then one line summing the rest), register not taken today, lesson notes returned / overdue / due this week (several due the same Friday are one item), report-card remarks still to write, reviews waiting. Items disappear as soon as the underlying state changes; the sidebar counts are the same sets ("ready to submit" is a nudge and isn't counted on the Results badge).
- Latest announcements for teachers.
- States: no assignments (explains the academic office assigns classes), past or upcoming term selected (its figures, read-only notice, no to-dos), first sign-in (complete your profile: phone number). Each block (metrics, lessons, to-do, announcements) loads and fails on its own, so one failure never blanks the page.

### 5.3 My classes and My subjects

- Cards per teaching assignment (class arm × subject × campus) with students, periods a week and the result sheet status. Same arm on two subjects = two cards.
- **Class page** `/classes/:armId/:subject` tabs: Overview (average, highest, needs support = the lowest two totals below the pass mark, absent from exam), Students, Assignments, Assessments (each scheme component with its date and scored count, or Schedule), Results (the sheet: status incl. with HOD, completion, average, deadline, Open sheet), Materials.
- **Subject page** groups the classes for one subject.

### 5.4 Students

- Everyone the teacher teaches this term, filterable by class and subject; a student taught in two subjects shows once with both.
- **Student page**: overview, assignments, scores per component (ABS / EXM / missing shown as words, with a link to the sheet focused on that student), results (this term's total only once the sheet is Approved or Published, else "Pending · Draft / Submitted · with HOD …"; past published terms read-only), attendance summary (present / absent / late / excused this term). Scores and results cover **only the signed-in teacher's subjects**, never other teachers', even for the class teacher. No fees, guardians or documents.

### 5.5 Timetable

- My week (Mon–Fri × periods) from the school's published timetable, campus shown on each lesson. Today's lessons list. Not published yet → explains and notifies when it is.
- **Lesson page**: class, subject, room, students, open assignment (next published one not yet due, with handed-in count), latest material, next lesson; shortcuts to the class, upload material.

### 5.6 Assignments

- List across classes with due date, submitted / class size, to grade, status: **Draft · Published · Closed**.
- **Create / edit**: class and subject (only my assignments), title, instructions, due date and time (must be in the active term, not in the past), max score (1–100), allow late submissions (yes/no), attachments (PDF, Word, PowerPoint, images; 25 MB each, 5 max). Save as draft or publish. Publishing notifies students and guardians. Editing a published assignment notifies them of the change; reducing the max score below a given score is refused.
- Close submissions early (confirm); reopen while the term is active. Reopening an assignment whose due date has passed turns on "allow late submissions", so new work is marked Late (said in the confirmation and the history).
- **Submissions**: tabs All / Submitted / Late / Not submitted / Graded / Returned, metrics, bulk return.
- **One submission**: files, student note, score and feedback; Save grade (private) or Return (visible to student and guardian). Score 0–max. Returned work can be regraded until the result sheet is submitted. Not submitted → can't grade; can mark "Excused".
- Submission statuses everywhere: **Not submitted · Submitted · Late · Graded · Returned · Excused**.
- Student work is seeded until the Student Portal exists.

### 5.7 Assessments

- The **scheme** (components, max, weights) comes from the school and is read-only here.
- The teacher **schedules** a component for a class: date (inside the term, and not before today for new ones), topics, instructions. Students see it in their portal. A component can be scheduled once per class per term; rescheduling notifies students.
- Assessment page: scored count, absent / exempt, link to the score sheet for that component.

### 5.8 Results (score sheets)

- List of my sheets for the term: class · subject, campus, students, completion, status, deadline.
- Status lifecycle (same words as School Admin): **Not started → Draft → Submitted (with HOD) → Under review (with academic office) → Approved → Published**, plus **Returned** (to the teacher, with the reviewer's comment). Departments with no HOD go Draft → Under review directly.
- **Sheet page** `/results/:sheetId` — one page with two tabs:
  - _Scores_: grid of students × components, keyboard navigation (Enter/arrows), ABS/EXM, per-cell validation (number 0–max, ABS, EXM), the teacher's own remark per student (optional, up to 300 characters, e.g. "Make-up exam booked"; separate from the grade band's remark), live total and grade, autosave, on phones one student at a time. A link can open the sheet on one cell: `/results/:sheetId?focus=CA2&student=<id>`.
  - _Review_: calculated totals, grade distribution, counts (complete / missing / absent / exempt), blockers listed by student. **Submit** confirms with the counts and the reviewer's name.
- Locked when Submitted / Under review / Approved / Published, when the deadline has passed, or for past terms — the reason is always shown.
- Returned: the comment is shown at the top; editing reopens; resubmitting goes back to the same reviewer.
- **Correction request** (Published sheets only): student, component, current and proposed score, reason, optional evidence file. Goes to School Admin's Corrections queue (status Under review / Applied / Rejected) and shows on the sheet's history. Only numeric scores can be corrected here: a request on an ABS or EXM score is refused with "Ask the academic office about absent or exempt scores", since those change the student's standing, not just a number. One open request per student and component.

### 5.9 Materials

Upload (file up to 25 MB or a video link), choose class and subject, title, description; progress, failure keeps the form; publish; archive / restore; views per material.

### 5.10 Lesson notes (new)

- Each week of the term, a teacher submits a lesson note per subject and class level: week, topic, objectives, content summary, attachment (optional), linked scheme-of-work topic.
- Statuses: **Draft · Submitted · Approved · Returned**. Due on the Friday before the week it covers (school default). Overdue notes show on the dashboard.
- Reviewer: the department's HOD, or the Academic Head when the department has no HOD (and for an HOD's own notes). Returned notes carry a comment; resubmitting goes back to the same reviewer.
- The Academic Head's own notes have no one above them: they are **filed as Approved on submit**, with the history entry "Filed by the Academic Head — no review needed". They never wait in a queue and notify no one; the form says so before submitting ("File note").

### 5.11 My class (class teachers, new)

- **Register**: take today's attendance for the arm — Present / Absent / Late / Excused (with a reason for Excused), "mark all present" then exceptions. Can't take it for weekends, holidays, the mid-term break or future days. The edit window is today plus the previous 5 school days (weekends, holidays and closures don't count); older days are read-only and corrections go to the academic office. Absences notify guardians (In-app/Email/SMS per school settings). History by day and by student; this-term percentage.
- **Class progress**: every subject for the arm with its teacher and sheet status, so the class teacher sees who hasn't submitted. "Remind teacher" sends an in-app notification, at most once per sheet per day (the button then shows "Reminded today 08:15" until the next day).
- **Report cards**: per student, class teacher's remark (required, 20–400 chars) and conduct ratings (Punctuality, Neatness, Attentiveness, Relationship with others, Leadership — rated 1–5) plus attendance pulled from the register. Can be edited until the class's results are published. Progress shows how many students are done.

### 5.12 Reviews (HOD / Academic Head, new)

- **Result sheets** waiting on me (from my department): open the sheet read-only, see totals and flags, then **Forward to academic office** or **Return to teacher** (comment required, 10+ chars). Both notify. An HOD can only open sheets that were routed to them (submitted to them, or decided by them); other sheets of the department, including drafts, answer "This sheet hasn't been submitted to you for review".
- **Lesson notes** waiting on me: Approve or Return with a comment.
- A reviewer can't review their own sheet or note — it skips them and goes to the next step (their own sheets go straight to the academic office; their own notes go to the Academic Head).

### 5.13 Announcements and Notifications

- Announcements for teachers / whole school, read-only. Messaging parents is not part of this release.
- Notifications inbox: unread / all, mark one or all read, each opens its record. **Notification settings**: which events notify by email (in-app is always on).

### 5.14 Profile

View; edit phone (Nigerian mobile format), address and emergency contact; change password (same rules as School Admin; other devices signed out); signed-in devices; sign out (warns about unsaved score entries).

## 6. Changes to School Admin

1. **HOD step**: sheets show "Submitted · with HOD" until the HOD forwards them; the academic office acts on _Under review_ sheets (and on _Submitted_ sheets only from departments with no HOD). The history shows the HOD's decision.
2. **Attendance**: a read-only Attendance view per class (daily register, % per student, days not taken) and attendance on the report card. The Modules tab marks Attendance as on.
3. **Report card**: class teacher's remark and conduct ratings appear; report cards can't be published for a class with remarks missing (warning in the publish check).
4. **Corrections**: requests arriving from teachers show the teacher's reason and evidence (already supported).

Because each portal has its own mock data, these show on School Admin's seeded data; the two portals line up once the API exists.

## Changes from the design

| Design                                        | Now                                                                 | Why                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| No attendance                                 | Daily register for class teachers                                   | The class teacher's main daily job in Nigerian schools         |
| Class teacher only shown as a label           | My class: register, class progress, report-card remarks and ratings | Report cards need these; class teachers chase missing subjects |
| Entry page and review page for the same sheet | One sheet page with Scores and Review tabs                          | Fewer places to look; one status                               |
| "Create assessment" invents components        | Schedule a component from the school scheme                         | Weights belong to the school                                   |
| HOD named but no HOD workspace                | Reviews section for HODs and Academic Heads                         | Matches the review chain                                       |
| Correction links into the admin portal        | Teacher's own correction request form                               | Teachers can't open School Admin                               |
| Hardcoded deadline text                       | Deadlines from the term calendar; lock after close                  | Real enforcement                                               |
| Single subject assumed ("Mathematics")        | Every list carries class and subject                                | Teachers teach several subjects and campuses                   |
| Graded / Reviewed / Returned used loosely     | Not submitted · Submitted · Late · Graded · Returned · Excused      | One meaning per word                                           |
| No lesson notes                               | Weekly lesson notes with approval                                   | Required in most schools                                       |
| No notification settings                      | Email preferences per event                                         | Teachers asked to control email                                |
| Wide score grid only                          | One-student-at-a-time cards on phones                               | Many teachers enter scores on a phone                          |
