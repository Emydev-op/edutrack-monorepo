# @edutrack/parent-portal

Parents following their children's progress.

Vue 3 · Vite · Pinia · Vue Router · TanStack Query · VeeValidate + Yup · shadcn-vue (`@edutrack/ui`).

## Develop

```bash
cp services/edutrack/parent-portal/.env.example services/edutrack/parent-portal/.env
npm run dev -w @edutrack/parent-portal
```

Runs on http://localhost:5174/parent/ (built for the path `/parent/`). Through the local router
(`npm run infra:up`) it is http://greenfield.localhost/parent, the same shape as the deployed
address `<school>.edutrack.ng/parent`; the school's entry page (`@edutrack/school-home`) links here.

## Sign in locally

Run the backend and open http://greenfield.localhost:5174/parent (the school comes from the
address). The seed has one parent: `funke.adeyemi@gmail.com`, password `Edutrack2026!`, mother of
Emmanuel Adeyemi (JSS 2B) and Michael Adeyemi (Primary 5B). Everything runs on the real API
(`/v1/parent/*`); there is no mock.

## Layout

```
src/
├── api/                   # Axios client (portal header, refresh, envelope), query keys, services
├── components/layout/     # Sign-in layout, portal frame (header, child switcher, tabs), sheets
├── components/common/     # List sections and rows, alerts, chips, stats
├── lib/                   # School branding, dates, money, pay steps, summaries
├── router/                # Routes, names (routes-path.ts) and the sign-in guard
├── stores/                # Session (auth), selected child, sheets
└── views/                 # Screens: auth, Home, fees, results, assignments, school, account
```
