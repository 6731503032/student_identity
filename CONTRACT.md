# Student Identity — Shared Contract (Team 01)

How other Digital Campus teams authenticate users and read identity data.
Covers Platform integration flow **1** (every system verifies users and reads
profiles here) and flow **6** (Internship / Job Board read profile claims).

**Base URL:** `https://student-identity.onrender.com`
(free tier sleeps when idle — the first request after ~15 min can take ~50 s;
use a timeout of at least 20 s)

All bodies are JSON. Two ways to authenticate:

| Caller | Send | How to get it |
|---|---|---|
| A person (via your frontend) | `Authorization: Bearer <token>` | `POST /auth/login` — expires in 15 min |
| **Your backend (service)** | `X-API-Key: sik_…` | Ask Team 01 — staff issue it on the Service clients screen. Long-lived; keep it in an env var, never in frontend code |
CORS is open to browser frontends (`ALLOWED_ORIGINS`, default `*`).

---

## 1. Tokens

Tokens are HS256 JWTs, valid **15 minutes**, with these claims:

| Claim | Meaning |
|---|---|
| `sub` | Student ID (e.g. `6731503032`), staff username, or service name |
| `role` | `student` · `instructor` · `staff` · `service` |
| `scopes` | Service permissions, e.g. `["profile:read"]` (empty for people) |
| `exp` | Expiry (Unix seconds) |

Do **not** decode tokens yourself to make access decisions — call
`POST /tokens/verify`. It checks the signature and expiry for you.

### Get a token (people)

```http
POST /auth/login
{ "studentId": "6731503032", "password": "••••••••" }
```
`200 { "token": "eyJ…", "role": "staff", "expiresIn": 900 }` · `401` wrong credentials

New students use `POST /auth/signup` (`studentId`, `firstName`, `lastName`,
`email`, `password`). The role in the token comes from Identity's role table,
so staff can promote a user on the Role lookup screen; it applies at their
next sign-in.

### Verify a token (any team, server-side)

```http
POST /tokens/verify
{ "token": "eyJ…" }
```
```json
{ "valid": true, "sub": "6731503032", "role": "staff", "scopes": [], "expiresAt": "2026-11-07T15:00:00.000Z" }
```
Invalid, tampered or expired → `200 { "valid": false }`; a suspended account → `200 { "valid": false, "reason": "suspended" }`. No auth needed.

---

## 2. Roles

| Role | Typical use in your service |
|---|---|
| `student` | Read-only access to public data |
| `instructor` | Teaching actions (your PRD decides) |
| `staff` | Administrative edits — e.g. Course Catalog create/update/delete |
| `service` | Machine-to-machine calls; carries `scopes` |

---

## 3. Endpoints other teams use

| Method | Path | Caller | Returns |
|---|---|---|---|
| POST | `/auth/login` | person | token |
| POST | `/tokens/verify` | any service | `valid`, `sub`, `role`, `scopes`, `expiresAt` |
| GET | `/me` | person (token) | own profile |
| GET | `/students/{id}` | self, instructor, staff | profile; `403` otherwise |
| GET | `/students/{id}/claims` | service (API key or service token) with `profile:read` **and** student consent | claims below; `401` bad key; `403` no consent; `404` unknown student |

Claims response:
```http
GET /students/6731503029/claims
X-API-Key: sik_…
```
```json
{
  "studentId": "6731503029",
  "claims": {
    "verified": true,
    "name": { "first": "Yosnawat", "last": "Onjan" },
    "profileComplete": true,
    "missingFields": [],
    "skills": []
  },
  "issuedAt": "2026-11-07T15:00:00.000Z"
}
```

| Claim | Meaning |
|---|---|
| `verified` | The student exists in the authoritative identity record |
| `name` | First / last name (email and age are private and never shared) |
| `profileComplete` | First name, last name and email are all filled in |
| `missingFields` | Which of those are missing |
| `skills` | Approved skills — empty until Identity stores skills |

**Eligibility** is decided by your service, using these inputs:
1. Request succeeds (`200`) → the student exists **and** consented to share with you. `403` means no consent — treat as *not eligible* and ask the student to allow your service on Identity's Consent screen.
2. `claims.verified === true`.
3. Add your own rules (e.g. require `profileComplete === true`).
Students grant or revoke each service on the **Consent** screen. Every allow
and deny is written to Identity's audit log.

### Errors (all routes)

| Status | Meaning |
|---|---|
| `400` | Validation failed (body has `error`, sometimes `fields`) |
| `401` | Missing, invalid or expired token — sign in again |
| `403` | Valid token, wrong role / missing scope / no consent |
| `404` | Not found |

---

## 4. Webhook we publish — `profile.updated`

Sent on every `PATCH /me` to Notification Hub and Data & Analytics
(`NOTIFICATION_HUB_URL`, `DATA_ANALYTICS_URL`). Private fields (`email`) are
removed.

```json
{
  "event": "profile.updated",
  "studentId": "6731503032",
  "data": { "student_id": "6731503032", "first_name": "…", "last_name": "…", "age": 20 },
  "emittedAt": "2026-11-07T14:00:00.000Z"
}
```
Reply `2xx` to acknowledge.

---

## 5. Course Catalog (Team 02) integration

Course Catalog PRD: *"Consume Identity staff roles"*, test *"unauthorised edit"*.

**Flow**
1. User signs in on Identity (`POST /auth/login`) and the Catalog frontend keeps the token.
2. Catalog frontend sends `Authorization: Bearer <token>` on every write.
3. Catalog backend calls `POST /tokens/verify`; allows the write only if `valid` and `role === "staff"`.
4. Reads (`GET /courses…`) stay public — no Identity call needed.

| Catalog route | Required |
|---|---|
| `GET /courses`, `GET /courses/{code}`, `GET /courses/{code}/sections` | none |
| `POST /courses`, `PATCH /courses/{code}`, `DELETE /courses/{code}`, `POST /courses/{code}/prerequisites` | `role: staff` |

**Copy-paste middleware:** [`examples/course-catalog-auth.js`](examples/course-catalog-auth.js)

```js
const { verifyIdentity, requireRole } = require('./identity-auth');
app.post('/courses', verifyIdentity, requireRole('staff'), createCourse);
```

Expected results (use these for the Catalog "unauthorised edit" test):

| Request | Result |
|---|---|
| no `Authorization` header | `401` |
| expired or forged token | `401` |
| valid `student` / `instructor` token | `403` |
| valid `staff` token | allowed |
| Identity unreachable | `503` — fail closed, never allow the write |

For testing without passwords, Identity's dev-only `POST /dev/issue-token`
(`{ "sub": "staff-1", "role": "staff" }`) mints a token. It is disabled when
Identity runs with `NODE_ENV=production`.

---

## 6. Data Identity reads from Pod 1 teams

Identity's student portal (Courses, Timetable, Grades, Register button, the
"currently enrolled" line on the verify page) shows **your** data. Identity
calls your API from its backend and sends the signed-in student's token as
`Authorization: Bearer <token>` — check it with `POST /tokens/verify` as usual.
Nothing is copied into Identity's database.

Send us your base URL and we set it on Render. Default paths (tell us if yours differ):

| Team | Request from Identity | We understand |
|---|---|---|
| Course Catalog (02) | `GET /courses?q=…` · `GET /courses/{code}` · `GET /courses/{code}/sections` | a list or `{ courses: [...] }`; per course `code`/`courseCode`, `title`/`name`, `credits`, `description`, `instructor`, `prerequisites` (codes or `{ code }`), `seatsLeft` or `capacity` + `enrolled`, optional `sections` |
| Enrollment (03) | `POST /enrollments` `{ studentId, courseCode, section? }` | `2xx { status: "approved" \| "pending" \| "rejected", message? }`; a `4xx` with `{ error }` is shown to the student as a rejection |
| Enrollment (03) | `GET /students/{studentId}/enrollments` | `{ enrolled: true/false }` or a list of enrollments |
| Timetable & Room (04) | `GET /timetable/{studentId}` | a list of `{ courseCode, title?, day, start, end, room }` — `day` as `Mon`/`Monday`/`0–6`/a date |

If your service is down or slow (> 20 s), students see "service unavailable —
try again"; nothing breaks on our side.
