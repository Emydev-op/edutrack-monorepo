# @edutrack/school-home

The school's entry page: what people see at the root of a school's address
(`greenfield.edutrack.ng`). It shows the school's logo (or initials badge), name and motto in the
school's brand colour, with one link each to the **Teacher**, **Parent** and **Student** portals
(`/teacher/`, `/parent/`, `/student/` on the same address).

Vue 3 · Vite · Tailwind via `@edutrack/ui` · brand theming from `@edutrack/app-kit`. No router.

## Develop

```bash
npm run dev:school-home                 # from the root; http://localhost:5175
npm run infra:up                        # the local router, then open http://greenfield.localhost
```

The school comes from the page's address (the `Host`), so open it through the local router:
http://greenfield.localhost (or http://greenfield.localhost:8080 with `GATEWAY_PORT=8080`). On plain
`localhost:5175` the API finds no school and the page shows **School not found**. The dev server
forwards `/api` to `API_PROXY_TARGET` (default `http://localhost:8000`), keeping the Host.

## What it shows

It reads `GET /api/v1/public/school` (`PublicSchool` from `@edutrack/shared`).

| Answer                              | Page                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| loading                             | The page's outline (skeleton) in the remembered colour                     |
| 200, `available: true`              | Logo or initials, name, motto, and the three portal links                  |
| 200, `available: false` (suspended) | The school's name and colour, "Sign-in is unavailable", contact the school |
| 404 `SCHOOL_NOT_FOUND`              | "School not found" with the API's message, in Edutrack's own colours       |
| network or server error             | "We couldn't load this page" with **Try again**                            |

The tab title is the school's name. The brand colour is applied with `applyBrandTheme` and
remembered per address in `localStorage` (`@edutrack/app-kit/lib/brand-memory`), so the next visit
paints in the school's colour before the API answers. The portals on the same address read the same
memory.

## Layout

```
src/
├── App.vue                    # Picks the state: landing (incl. loading), not found, error
├── components/
│   ├── SchoolLanding.vue      # Brand panel + portal links / unavailable notice / skeleton
│   ├── SchoolBadge.vue        # Logo, or initials when there is none (or it fails to load)
│   ├── StatusPage.vue         # Centred page for "not found" and errors
│   └── PoweredBy.vue
└── lib/
    ├── school.ts              # GET /v1/public/school → found / not-found / SchoolLookupError
    ├── useSchool.ts           # Page state, title, brand colour
    └── portals.ts             # The three entry points
```

## Deploy

`Dockerfile` builds the page on its own (nginx, `spa.conf`). In production it ships inside the
single web image (`infrastructure/docker/web.Dockerfile`) that serves `/` of every school address.
See [DEPLOYMENT.md](../../../DEPLOYMENT.md).
