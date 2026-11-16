# @edutrack/school-admin

School administrators managing their school.

Vue 3 · Vite · Pinia · Vue Router · TanStack Query · VeeValidate + Yup · shadcn-vue (`@edutrack/ui`).

## Develop

```bash
cp services/edutrack/school-admin/.env.example services/edutrack/school-admin/.env
npm run dev -w @edutrack/school-admin
```

Runs on http://localhost:5171, or http://admin.localhost through the local router (`npm run infra:up`).
Deployed at `admin.edutrack.ng`, shared by every school (the school is chosen at sign-in).

## Layout

```
src/
├── assets/main.css        # Tailwind + @edutrack/ui theme
├── composables/           # TanStack Query hooks, one per API resource
├── lib/http.ts            # Axios instance (auth + tenant headers)
├── router/                # Routes and auth guard
├── stores/                # Pinia stores
└── views/                 # Route components
```
