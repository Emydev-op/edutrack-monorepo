# @edutrack/student-portal

Students viewing timetables, assignments and results.

Vue 3 · Vite · Pinia · Vue Router · TanStack Query · VeeValidate + Yup · shadcn-vue (`@edutrack/ui`).

## Develop

```bash
cp services/edutrack/student-portal/.env.example services/edutrack/student-portal/.env
npm run dev -w @edutrack/student-portal
```

Runs on http://localhost:5173.

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
