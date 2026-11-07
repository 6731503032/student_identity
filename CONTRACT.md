# Student Identity — Shared Contract (Team 01)

How other Digital Campus teams authenticate users and read identity data.
Covers Platform integration flow **1** (every system verifies users and reads
profiles here) and flow **6** (Internship / Job Board read profile claims).

**Base URL:** `https://student-identity.onrender.com`
(free tier sleeps when idle — the first request after ~15 min can take ~50 s;
use a timeout of at least 20 s)

All bodies are JSON. Protected routes need `Authorization: Bearer <token>`.
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
Invalid, tampered or expired → `200 { "valid": false }`. No auth needed.

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
| GET | `/students/{id}/claims` | service with `profile:read` **and** student consent | claims below; `403` if no scope or no consent |

Claims response:
```json
{ "studentId": "6731503032", "claims": { "verified": true, "skills": [], "profileComplete": false }, "issuedAt": "2026-11-07T14:00:00.000Z" }
```
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
