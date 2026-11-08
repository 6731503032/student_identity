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
| Not signed in | **Sign in** (student ID + password) · **Create account** · Dev shortcuts (staff / instructor / service, no password) |
| Student | **My profile** (registrar-style card, edit, completeness) · **Consent** (allow/stop sharing with each service) · Tools |
| Staff | Students (add / view / delete) · **Roles** (look up and assign) · Service clients (register, API keys) · Tools |
| Instructor | Students (read-only) · Roles (read-only) · Tools |
| Service | Claims lookup · Tools |

Tools: verify a token, and break/fix the AI dependency to demonstrate the fallback.

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
| `PORT` | no | Default `3000` (Render sets it) |
| `NODE_ENV` | no | `production` **disables** dev routes, including Dev shortcuts on the sign-in page |

Never commit `.env` — it is in `.gitignore`.

### Database setup (Supabase SQL editor, run once, in order)

```
supabase/migrations/20260922111533_create_initial_schema.sql
supabase/migrations/20260922130000_create_integration_tables.sql
supabase/migrations/20261107120000_create_roles.sql
supabase/migrations/20261107140000_create_accounts.sql
supabase/migrations/20261107150000_service_client_api_keys.sql
supabase/migrations/20261107160000_service_client_key_enc.sql
```

Tables: `students`, `roles`, `accounts`, `consents`, `service_clients`, `audit_events`.

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
| GET | `/me/profile-completeness` | signed in |
| GET · PUT · DELETE | `/me/consents`, `/me/consents/{serviceName}` | student |
| GET · PUT | `/roles`, `/roles/{subject}` | staff (instructor: GET only) |
| GET · POST · DELETE | `/students`, `/students/{id}` | staff (instructor: GET) |
| GET | `/service-clients/{id}/key` | staff — copy the key again |
| POST | `/service-clients/{id}/keys` | staff — issue a new key (old one stops working) |
| GET | `/health` | public — for the uptime monitor |

### Dev-only (off when `NODE_ENV=production`)

`POST /dev/issue-token` · `GET /dev/service-clients` · `POST /dev/break-ai` ·
`POST /dev/fix-ai` · `POST /mock/notification-hub` · `POST /mock/data-analytics`

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
  **simulated**; when it is unavailable (or broken via Tools) the response comes
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
| 1 | sign-in | Sign-up returns a working token; password is hashed; wrong password → 401; duplicate → 409 |
| 2 | role check | Student can't create students (403), staff can (201); instructor can't delete; assigned role appears in the next token |
| 3 | consent grant/revoke | Claims 403 → grant → 200 → revoke → 403; unknown scope → 400 |
| 4 | token expiry | Expired, tampered and missing tokens → 401; `/tokens/verify` → `valid: false` |
| 5 | profile validation | `PATCH /me` rejects `student_id`, bad email, age 500, blank name, empty body |
| 6 | service scope | No `profile:read` → 403 even with consent; consent is per service |
| 7 | audit event | Denied and allowed claims, consent grant and failed sign-in are all audited |
| 8 | service API key | Key works only with consent; staff can copy it again; bad or rotated key → 401 |

---

## Deploy (Render)

1. Web Service from this repo — Build `npm install`, Start `npm start`.
2. Set the environment variables above (not `NODE_ENV=production` if you need Dev shortcuts for demos).
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
- Staff and instructor accounts have no self sign-up; promote a student account on the Roles screen, or use Dev shortcuts.
- Dev routes are on in the deployed demo, so anyone with the URL can mint a staff token. Set `NODE_ENV=production` after grading.
