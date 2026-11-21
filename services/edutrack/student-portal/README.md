# @edutrack/student-portal

Students viewing timetables, assignments and results.

Vue 3 · Vite · Pinia · Vue Router · TanStack Query · VeeValidate + Yup · shadcn-vue (`@edutrack/ui`).

## Develop

```bash
cp services/edutrack/student-portal/.env.example services/edutrack/student-portal/.env
npm run dev -w @edutrack/student-portal
```

Runs on http://greenfield.localhost:5173/student/ (built for the path `/student/`; open it on the
school's address so the API knows the school). Through the local router (`npm run infra:up`) it is
http://greenfield.localhost/student, the same shape as the deployed address
`<school>.edutrack.ng/student`; the school's entry page (`@edutrack/school-home`) links here.

Sign in with an admission number and password. The seed gives Emmanuel Adeyemi (JSS 2B,
Greenfield Academy) a login: admission number `STU-2025-0042`, the demo password. Other students
get login slips from School Admin › Students › Logins (one-time password, changed at first sign-in).

## Layout

```
src/
├── api/                   # Axios client, TanStack Query hooks per resource (/v1/student/*)
├── components/            # Layout (frame, tabs, contact + sign-out sheets) and list pieces
├── lib/                   # Dates, summaries, notifications, school branding
├── router/                # Routes, tabs and the sign-in guard
├── schema/                # Form validation (sign-in, passwords)
├── stores/                # Signed-in session, sheets
└── views/                 # Screens: Home, Timetable, Assignments, Results, More…
```
