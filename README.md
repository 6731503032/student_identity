# Student Identity — Team 01

The authoritative student profile and role-aware access claims for every
Digital Campus service (Pod 1: Identity & Academic Core).

- **Live:** https://student-identity.onrender.com
- **Contract for other teams:** [CONTRACT.md](CONTRACT.md)
- **Stack:** Node 18+ · Express · Supabase (Postgres) · JWT · vanilla JS frontend in `public/`

---

## What it does

| PRD requirement | Where |
|---|---|
| Student profile + role-based access other teams reuse | `students`, `roles` tables · `POST /tokens/verify` · [`examples/course-catalog-auth.js`](examples/course-catalog-auth.js) |
| 3 core screens | **Sign in / profile**, **Consent & sharing**, **Role lookup** |
| ≥ 6 REST operations + shared contract | 7 PRD endpoints below · [CONTRACT.md](CONTRACT.md) |
| Inter-team webhook | `profile.updated` → Notification Hub, Data & Analytics (email removed) |
| AI-assisted flow + deterministic fallback | `GET /me/profile-completeness` |
| ≥ 7 automated tests | `npm test` — 7 PRD tests + 1 for API keys |

### Screens

| Who | Screens |
|---|---|
| Public | **Sign in / Create account** (opens at `/`) · **Forgot password** (staff reset — no email yet) · **Verify** (`#/v/<code>`, opened from the QR; shows only Valid / Currently enrolled) |
| Student | **Dashboard** (verification, QR, today's classes, announcements, alerts) · **Courses** ★ (search, filter, detail, Register) · **Timetable** ★ · **Grades** ★ (GPA, CSV transcript, print) · **Consent** |
| Anyone with a student record | User menu: **My profile** (photo, faculty, edit, completeness) · **Settings** (password, privacy, alert preferences) · Sign out |
| Staff | **Dashboard** (counts, connected services, announcements) · **Users** (search, suspend/reactivate, reset password) · Students · Roles · **Courses** ★ (read-only synced view) · Service clients · **Audit log** (filter who did what) |
| Instructor | Students (read-only) · Roles (read-only) |
| Service | Claims lookup |

Layout: a header (student ID, name, photo, user menu) and a **side menu** grouped into
Student Menu / Staff Menu / Service Menu (My profile and Settings are in the user menu); groups collapse, and on phones the
menu slides in from the hamburger button.

★ = data owned by another team, fetched through our backend adapters (`lib/external.js`) — see
[Pages that use other teams' data](#pages-that-use-other-teams-data).
Every page has loading, empty and error states, plus 404 (unknown page) and 403 (wrong role).
**Demo the AI fallback** (no UI button — dev routes only):
```bash
curl -X POST https://student-identity.onrender.com/dev/break-ai   # completeness card shows "Fallback"
curl -X POST https://student-identity.onrender.com/dev/fix-ai     # back to "AI"
```

> **Scope note.** The PRD asks for 3 screens. The portal pages above were added on the
> team's request (2026-11-09). Courses / Timetable / Grades / Synced courses depend on
> other teams' APIs and show "not connected yet" until their URLs are set.

---

## Run locally

```bash
npm install
cp .env.example .env   # or create .env by hand — see below
npm run dev            # http://localhost:3000, restarts on save
npm test               # no Supabase or internet needed
```

### Environment variables

| Name | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_KEY` | yes | Supabase key (a **secret** key is recommended so RLS can be enabled) |
| `JWT_SECRET` | yes in prod | Signs tokens. Long random string. Changing it signs everyone out |
| `API_KEY_SECRET` | no | Encrypts stored service API keys so staff can copy them again (falls back to `JWT_SECRET`). **Don't change it** once keys exist |
| `NOTIFICATION_HUB_URL` | yes | Notification Hub webhook URL |
| `DATA_ANALYTICS_URL` | yes | Data & Analytics webhook URL |
| `ALLOWED_ORIGINS` | no | CORS origins, comma-separated. Default `*` |
| `COURSE_CATALOG_URL` | no | Course Catalog base URL (courses, course detail, sections) |
| `ENROLLMENT_URL` | no | Enrollment base URL (register, "currently enrolled" on the verify page) |
| `TIMETABLE_URL` | no | Timetable & Room base URL |
| `GRADES_URL` | no | Grades service base URL |
| `COURSE_CATALOG_TOKEN`, `ENROLLMENT_TOKEN`, `TIMETABLE_TOKEN`, `GRADES_TOKEN` | no | Service token issued **by that team**, if their API uses its own JWTs. Sent instead of the user's Identity token (server-side only) |
| `PUBLIC_URL` | no | Base URL put in verify QR codes. Default: the request's host |
| `PORT` | no | Default `3000` (Render sets it) |
| `NODE_ENV` | no | `production` **disables** dev routes (`/dev/*`, including `/dev/issue-token` and break/fix AI) |

Never commit `.env` — it is in `.gitignore`.

### Database setup (Supabase SQL editor, run once, in order)

```
supabase/migrations/20260922111533_create_initial_schema.sql
supabase/migrations/20260922130000_create_integration_tables.sql
supabase/migrations/20261107120000_create_roles.sql
supabase/migrations/20261107140000_create_accounts.sql
supabase/migrations/20261107150000_service_client_api_keys.sql
supabase/migrations/20261107160000_service_client_key_enc.sql
supabase/migrations/20261109120000_portal_pages.sql
```

Tables: `students`, `roles`, `accounts`, `consents`, `service_clients`, `audit_events`,
`announcements`, `notifications`.

---

## API

All JSON. Full request/response examples and error codes are in [CONTRACT.md](CONTRACT.md).

**Auth:** people send `Authorization: Bearer <token>` (from `/auth/login`, 15 min).
Other teams' backends send `X-API-Key: sik_…` (issued on the Service clients screen).

### PRD endpoints

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/me` | signed in | Own profile |
| PATCH | `/me` | signed in | Only `first_name`, `last_name`, `email`, `age`; others → `400`. Sends `profile.updated` |
| GET | `/students/{id}` | self, instructor, staff | |
| GET | `/students/{id}/claims` | service with `profile:read` + student consent | `verified`, `name`, `profileComplete`, `missingFields`, `skills` |
| POST | `/tokens/verify` | anyone | `{ valid, sub, role, scopes, expiresAt }` |
| POST | `/service-clients` | staff | `Idempotency-Key` header supported; returns an API key |
| DELETE | `/sessions/{id}` | signed in | Records sign-out in the audit log (tokens are stateless and expire on their own) |

### Added to support the screens and integrations

| Method | Path | Who |
|---|---|---|
| POST | `/auth/signup`, `/auth/login` | public |
| POST | `/auth/refresh` | signed in (accounts only) — new 15-min token with the current role; the page calls it while the user is active, so idle sessions end after ~15 min |
| POST | `/auth/change-password` | signed in — `{ currentPassword, newPassword }`; `204`, or `400` if the current password is wrong |
| GET | `/me/profile-completeness` | signed in |
| GET · PUT · DELETE | `/me/consents`, `/me/consents/{serviceName}` | student |
| GET · PUT | `/roles`, `/roles/{subject}` | staff (instructor: GET only) |
| GET · POST · DELETE | `/students`, `/students/{id}` | staff (instructor: GET) |
| GET | `/service-clients/{id}/key` | staff — copy the key again |
| POST | `/service-clients/{id}/keys` | staff — issue a new key (old one stops working) |
| DELETE | `/service-clients/{id}` | staff — remove a client; its key stops working (students' consents to that name are kept) |
| GET | `/health` | public — for the uptime monitor |
| GET | `/me/verify-qr` · `/verify/{code}` | signed in · **public** (returns only `valid`, `enrolled`, `checkedAt`) |
| GET · PUT | `/me/settings` | signed in — alert preferences |
| GET · POST | `/me/notifications`, `/me/notifications/read` | signed in |
| GET · POST · DELETE | `/announcements`, `/announcements/{id}` | read: signed in · write: staff |
| GET | `/catalog/courses`, `/catalog/courses/{code}` | signed in ★ |
| POST | `/catalog/courses/{code}/register` | student ★ — `409` if Enrollment rejects |
| GET | `/me/timetable`, `/me/grades` | signed in ★ |
| GET | `/admin/stats`, `/admin/users`, `/admin/audit`, `/admin/courses` ★ | staff |
| POST | `/admin/users/{subject}/suspend` · `/reactivate` · `/reset-password` | staff |
| GET | `/integrations` | signed in — which external services are connected |

★ calls another team's API. Failures come back as `503 { code: "service_not_configured" | "service_unavailable", service }`.

### Dev-only (off when `NODE_ENV=production`)

`POST /dev/issue-token` · `GET /dev/service-clients` · `POST /dev/break-ai` ·
`POST /dev/fix-ai` · `POST /mock/notification-hub` · `POST /mock/data-analytics`

---

## Pages that use other teams' data

`lib/external.js` is the only place that talks to other teams. It:

- reads the base URLs above (unset = "not connected yet");
- forwards the signed-in user's Identity token as `Authorization: Bearer`, so
  their service can check it with `POST /tokens/verify`;
  — or, when `<TEAM>_TOKEN` is set, sends that team-issued service token instead;
- for Course Catalog, resolves a course code to the team's internal id (`crs_…`)
  when their detail endpoint is id-based, requests `limit=100`, and hides
  non-`published` courses from students (staff see all with a status badge);
- accepts the common response shapes (`[...]`, `{ courses: [...] }`,
  `courseCode`/`code`, `name`/`title`, `seatsLeft` or `capacity - enrolled`, …) and
  normalises them;
- times out after 20 s and turns errors into `503`, which the UI shows as
  "… unavailable — try again".

**Team 02 (Course Catalog) setup:** `COURSE_CATALOG_URL=https://course-catalog.taskflow-123.workers.dev/v1`
and `COURSE_CATALOG_TOKEN=<service token from Team 02>` (their API only accepts its own
HS256 JWTs with `iss=https://auth.course-catalog.dev`). Team 02 mints it **with their
production secret**:
`JWT_SECRET=<prod secret> npm run token:dev -- --role service --sub svc_student_identity --expires 15552000`
(180 days; re-issue before it expires).

| Page | Calls (default paths, override with env) |
|---|---|
| Courses, Synced courses | `GET {COURSE_CATALOG_URL}/courses`, `/courses/{code}`, `/courses/{code}/sections` |
| Register button | `POST {ENROLLMENT_URL}/enrollments` `{ studentId, courseCode, section }` → `{ status }` |
| Verify page "enrolled" | `GET {ENROLLMENT_URL}/students/{studentId}/enrollments` → `{ enrolled }` or a list |
| Timetable, Today's classes | `GET {TIMETABLE_URL}/timetable/{studentId}` → `[{ courseCode, day, start, end, room }]` |
| Grades | `GET {GRADES_URL}/grades/{studentId}` → `[{ term, courseCode, credits, grade }]` (GPA computed here, S/U not counted) |

Path overrides: `COURSE_CATALOG_COURSES_PATH`, `COURSE_CATALOG_COURSE_PATH`,
`COURSE_CATALOG_SECTIONS_PATH`, `ENROLLMENT_REGISTER_PATH`, `ENROLLMENT_STATUS_PATH`,
`TIMETABLE_PATH`, `GRADES_PATH` (`{code}` and `{studentId}` are filled in).

---

## How it works

- **Sign-up / sign-in** — passwords are salted **scrypt** hashes (`lib/accounts.js`).
  The token's role comes from the `roles` table (default `student`), so a role
  assigned on the Roles screen applies at the next sign-in. Signing up with the
  same email as a staff-created record claims that record.
- **Roles** — `middleware/auth.js`: `authenticate`, `requireRole(...)`, `requireScope(...)`.
- **Consent** — students allow or stop sharing per service. `GET /students/{id}/claims`
  returns `403` without it, and consent for one service never covers another.
- **Service API keys** — 47 characters (`sik_` + 43). Stored as a SHA-256 hash (to
  authenticate) and AES-256-GCM ciphertext (so staff can press **Copy**). The key
  acts as a `service` caller named after the client, scope `profile:read`.
- **Webhook** — `lib/webhooks.js` posts `profile.updated` to both targets in
  parallel after every `PATCH /me`, with `email` removed.
- **AI + fallback** — `lib/completeness.js`. The AI message is currently
  **simulated**; when it is unavailable (or broken with `POST /dev/break-ai`) the response comes
  from a deterministic checklist of `first_name`, `last_name`, `email`.
- **Audit** — every allow and deny (sign-in, role, consent, claims, key copy,
  webhook delivery) is written to `audit_events` with actor, resource and result.

---

## Tests

```bash
npm test
```

Node's built-in test runner. `test/helpers.js` swaps Supabase for an in-memory
fake and boots the real Express app, so requests go through the real routes,
middleware and validation.

| # | PRD test | What it proves |
|---|---|---|
| 1 | sign-in | Sign-up returns a working token; password is hashed; wrong password → 401; change password works and the old one stops; duplicate → 409 |
| 2 | role check | Student can't create students (403), staff can (201); instructor can't delete; assigned role appears in the next token |
| 3 | consent grant/revoke | Claims 403 → grant → 200 → revoke → 403; unknown scope → 400 |
| 4 | token expiry | Expired, tampered and missing tokens → 401; `/tokens/verify` → `valid: false` |
| 5 | profile validation | `PATCH /me` rejects `student_id`, bad email, age 500, blank name, empty body |
| 6 | service scope | No `profile:read` → 403 even with consent; consent is per service |
| 7 | audit event | Denied and allowed claims, consent grant and failed sign-in are all audited |
| 8 | service API key | Key works only with consent; staff can copy it again; bad or rotated key → 401 |

`test/portal.test.js` (13 more) covers the portal pages against a mock of the other
teams' APIs: suspension blocks sign-in, tokens and `/tokens/verify`; staff reset;
verify codes can't be forged and leak nothing; not-connected and down → 503;
course normalisation; registration forwards the token and creates alerts; timetable
days; GPA; admin APIs are staff-only; announcements; photo never reaches the
webhook; alert preferences filter alerts.

---

## Deploy (Render)

1. Web Service from this repo — Build `npm install`, Start `npm start`.
2. Set the environment variables above (not `NODE_ENV=production` while you still need `/dev/break-ai` or `/dev/issue-token` for demos).
3. Run any new migration in Supabase **before** deploying code that uses it.
4. Push, then **Manual Deploy → Deploy latest commit** (auto-deploy is off).
5. Free tier sleeps after ~15 min idle: an UptimeRobot HTTP(s) monitor on
   `https://student-identity.onrender.com/health` every 5 minutes keeps it awake
   (uses ~730 of the 750 free hours a month — keep only one always-on free service).

---

## Known limitations

- The AI completeness message is simulated, not a real model call.
- `skills` in claims is always empty — Identity doesn't store skills yet.
- RLS is off on the Supabase tables. Use a secret `SUPABASE_KEY` on Render and enable RLS before real use.
- Staff and instructor accounts have no self sign-up; a student signs up, then staff promote the account on the Roles screen. For a first staff account, mint a token with `POST /dev/issue-token` (dev only).
- Forgot password and email verification need an email service (e.g. Resend); for now staff reset passwords on the Users screen.
- No team in Pod 1 owns grades yet, so Grades stays "not connected" until a `GRADES_URL` exists.
- Profile photos are stored as small JPEG data URLs in `students.photo` (resized in the browser, max ~150 KB), not in object storage.
- Dev routes are on in the deployed demo, so anyone with the URL can mint a staff token. Set `NODE_ENV=production` after grading.
