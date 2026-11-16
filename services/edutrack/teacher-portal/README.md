# @edutrack/teacher-portal

Teachers managing classes, attendance and grades.

Vue 3 · Vite · Pinia · Vue Router · TanStack Query · VeeValidate + Yup · shadcn-vue (`@edutrack/ui`).

## Develop

```bash
cp services/edutrack/teacher-portal/.env.example services/edutrack/teacher-portal/.env
npm run dev -w @edutrack/teacher-portal
```

Runs on http://localhost:5172/teacher/ (built for the path `/teacher/`). Through the local router
(`npm run infra:up`) it is http://greenfield.localhost/teacher, the same shape as the deployed
address `<school>.edutrack.ng/teacher`; the school's entry page (`@edutrack/school-home`) links here.

## School branding

Against the real API (`VITE_USE_MOCKS=false`) the sign-in pages show the school at the address
(`GET /api/v1/public/school`: name, logo) and the portal takes its brand colour, remembered per
address so the next visit doesn't flash Edutrack's default. With mocks on, `VITE_SCHOOL_NAME` is
shown instead. See `src/lib/school-brand.ts`.

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
