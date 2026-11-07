# Student Identity Service — Step 1 Scaffold

Stub implementation of the 7 endpoints from `PRD_Student_Identity.md`. Every
handler returns a canned `200` / `201` / `204` response — no real auth,
consent, database, or webhook logic yet. That's intentional: this is only
**Step 1** of the build plan.

## Endpoints stubbed
- `GET /me`
- `PATCH /me`
- `GET /students/:id`
- `GET /students/:id/claims`
- `POST /tokens/verify`
- `POST /service-clients`
- `DELETE /sessions/:id`

## Run it
```bash
npm install
npm start
```
Server listens on `http://localhost:3000` (override with the `PORT` env var).

## Quick smoke test
```bash
curl http://localhost:3000/me
curl http://localhost:3000/students/123/claims
curl -X POST http://localhost:3000/service-clients \
  -H "Content-Type: application/json" \
  -d '{"name":"internship-service"}'
```
All three should return `200`/`201` with the stub JSON shown above — that's
the "step 1 done" bar: routes exist and respond, nothing more.

## Step 2 — Auth, Role, Consent (added)

Now wired in:
- **`lib/tokens.js`** — JWT scoped tokens (HS256, dev secret, 15 min TTL)
- **`middleware/auth.js`** — `authenticate`, `requireRole(...)`, `requireScope(...)`
- **`lib/consent.js`** — in-memory `Consent` store, seeded so student `123` has
  granted `profile:read` to a service called `internship-service`
- **`lib/audit.js`** — every allow/deny is printed as `[audit] {...}` (satisfies
  the PRD's "audit event" test case)

There is still no login/sign-in endpoint in the PRD's REST list, so a
**dev-only** helper (`POST /dev/issue-token`, mounted only outside
`NODE_ENV=production`) lets you mint tokens locally for testing.

### Test it (PowerShell)

**1. Issue a student token and call `/me`:**
```powershell
$resp = curl -UseBasicParsing -Method POST http://localhost:3000/dev/issue-token `
  -ContentType "application/json" -Body '{"sub":"123","role":"student","scopes":[]}'
$token = ($resp.Content | ConvertFrom-Json).token

curl -UseBasicParsing http://localhost:3000/me -Headers @{ Authorization = "Bearer $token" }
```

**2. Issue a service-client token and call the consent-gated claims endpoint:**
```powershell
$resp = curl -UseBasicParsing -Method POST http://localhost:3000/dev/issue-token `
  -ContentType "application/json" -Body '{"sub":"internship-service","role":"service","scopes":["profile:read"]}'
$svcToken = ($resp.Content | ConvertFrom-Json).token

curl -UseBasicParsing http://localhost:3000/students/123/claims -Headers @{ Authorization = "Bearer $svcToken" }
```
This should return `200` — student `123` has consented. Change `sub` to
anything else (e.g. `"other-service"`) and re-run: it should come back `403`
with `"No consent granted for this scope"`. Watch the server's terminal —
you'll see an `[audit]` line for both the allow and the deny.

**3. Try `/service-clients` without the `staff` role (should 403):**
```powershell
curl -UseBasicParsing -Method POST http://localhost:3000/service-clients `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body '{"name":"x"}'
```
`$token` above has `role: student`, so this should fail with `403 Insufficient role`.
Mint a token with `"role":"staff"` and it should succeed with `201`.

## Step 4 — Webhook Sender (added)

`PATCH /me` now fires a `profile.updated` event to **Notification Hub** and
**Data & Analytics** after every successful update, per the PRD's
"Integrations" section.

- **`lib/webhooks.js`** — builds the payload (private fields stripped — currently
  just `email`, see the `PRIVATE_FIELDS` TODO) and POSTs it to both targets in
  parallel, logging an `[audit]` line for each delivery (allow/deny).
- **`routes/mock-receivers.js`** — dev-only stand-ins for Notification Hub and
  Data & Analytics (`POST /mock/notification-hub`, `POST /mock/data-analytics`).
  They just log what they received and ack `200`. **Swap these for the real
  endpoints** by setting `NOTIFICATION_HUB_URL` and `DATA_ANALYTICS_URL` env
  vars once those teams have something live.
- Requires **Node 18+** (uses the built-in `fetch`).

### Test it (PowerShell)
Reuse the student token (`$token`) from Step 2, or mint a fresh one:
```powershell
curl -UseBasicParsing -Method PATCH http://localhost:3000/me `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" -Body '{"name":"Updated Name"}'
```
Watch the **server terminal** — you should see:
```
[mock:notification-hub] received {"event":"profile.updated","studentId":"123","data":{...},"emittedAt":"..."}
[mock:data-analytics] received {"event":"profile.updated","studentId":"123","data":{...},"emittedAt":"..."}
[audit] {...,"action":"webhook_send","resource":"notification-hub (...)","result":"allow:delivered"}
[audit] {...,"action":"webhook_send","resource":"data-analytics (...)","result":"allow:delivered"}
```
The PATCH response itself also includes a `_webhookDebug` field (non-production
only) showing the exact payload sent and each target's response — useful for
pasting straight into §4 of the evidence file.

## Step 5 — Idempotency Proof (added)

`POST /service-clients` (staff only) now accepts an `Idempotency-Key` header.
Send the same key twice and you get back the **same record** both times — no
second row created.

- **`lib/serviceClients.js`** — in-memory store keyed by `idempotencyKey`.
  A repeat key returns the original record and logs
  `result: "allow:idempotent_replay"` in the audit log instead of
  `"allow:created"`.
- **`GET /dev/service-clients`** (dev-only) — stands in for "query the DB"
  since there's no real database yet; lists every record currently stored,
  so you can prove only one row exists after two identical requests.

### Test it (PowerShell)
First, mint a **staff** token (student/service roles will get `403`):
```powershell
$resp = curl -UseBasicParsing -Method POST http://localhost:3000/dev/issue-token `
  -ContentType "application/json" -Body '{"sub":"staff-1","role":"staff","scopes":[]}'
$staffToken = ($resp.Content | ConvertFrom-Json).token
```

Send the **same** `Idempotency-Key` twice:
```powershell
curl -UseBasicParsing -Method POST http://localhost:3000/service-clients `
  -Headers @{ Authorization = "Bearer $staffToken"; "Idempotency-Key" = "req-abc-001" } `
  -ContentType "application/json" -Body '{"name":"internship-service"}'

curl -UseBasicParsing -Method POST http://localhost:3000/service-clients `
  -Headers @{ Authorization = "Bearer $staffToken"; "Idempotency-Key" = "req-abc-001" } `
  -ContentType "application/json" -Body '{"name":"internship-service"}'
```
Both responses should return the **same `id`**. Then confirm only one row
exists:
```powershell
curl -UseBasicParsing http://localhost:3000/dev/service-clients
```
`count` should be `1`. Check the server terminal — the second `POST` logs
`"result":"allow:idempotent_replay"` instead of `"allow:created"`.

## Step 6 — Degradation Proof (added)

New endpoint: **`GET /me/profile-completeness`**. It tries an AI-generated
suggestion first and falls back to a deterministic checklist if that call
fails — matching the PRD's "AI and quality" section exactly. This route
isn't in the PRD's REST list verbatim (the PRD only names the entity/feature,
not a path), so it's a reasonable addition under the existing `/me` prefix.

- **`lib/completeness.js`** — `getAISuggestion()` (simulated; swap for a real
  model call later) and `deterministicChecklist()` (always available, no
  external dependency).
- **`lib/aiState.js`** + **`POST /dev/break-ai`** / **`POST /dev/fix-ai`**
  (dev-only) — toggle a simulated outage on demand, so you can capture an
  exact breakage timestamp and a recovery log instead of waiting for a real
  failure.

### Test it (PowerShell)
Reuse `$token` from earlier steps (or mint a fresh one — see Step 2).

**1. Normal (AI) path:**
```powershell
curl -UseBasicParsing http://localhost:3000/me/profile-completeness -Headers @{ Authorization = "Bearer $token" }
```
Response `source` should be `"ai"`.

**2. Break it, then hit the endpoint again:**
```powershell
curl -UseBasicParsing -Method POST http://localhost:3000/dev/break-ai
curl -UseBasicParsing http://localhost:3000/me/profile-completeness -Headers @{ Authorization = "Bearer $token" }
```
Response `source` should now be `"deterministic-fallback"`, with a
`missingFields` / `checklist` breakdown instead of an AI message. Check the
server terminal for `[audit] ...ai_dependency_break...` and
`[audit] ...profile_completeness...allow:fallback...`.

**3. Fix it, then confirm AI resumes automatically (no restart needed):**
```powershell
curl -UseBasicParsing -Method POST http://localhost:3000/dev/fix-ai
curl -UseBasicParsing http://localhost:3000/me/profile-completeness -Headers @{ Authorization = "Bearer $token" }
```
Response `source` should be back to `"ai"` — same server process, no restart.
The `[audit] ...ai_dependency_recover...` line plus this successful call together
are your "automatic recovery" evidence for §6.

## All 6 steps done
Every `TODO` left in the code is a **real** follow-up for before a shared or
production deploy — grep for `TODO` across the project to see the full list
(dev secrets, real persistence, real cross-team calls, replacing the mock
webhook receivers, replacing the simulated AI call). Nothing left is blocking
evidence collection for the A5 submission itself.

## Consent & Role lookup screens (added)

Completes the PRD's 3 screens: sign-in/profile, **consent and sharing
preferences**, **staff role lookup**.

**One-time setup:** run `supabase/migrations/20261107120000_create_roles.sql`
in the Supabase SQL editor (creates the `roles` table for the Role entity).

Endpoints added (not in the PRD's REST list verbatim; they back the two screens):

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/me/consents` | student | Known services + scopes granted to each |
| PUT | `/me/consents/:granteeId` | student | Set scopes `{ "scopes": ["profile:read"] }`; `[]` revokes. Unknown scope → 400 |
| DELETE | `/me/consents/:granteeId` | student | Revoke all scopes for one service |
| GET | `/roles` | staff, instructor | Every subject with effective role (students default to `student`) |
| GET | `/roles/:subject` | staff, instructor | Effective role for one subject, 404 if unknown |
| PUT | `/roles/:subject` | staff | Assign `{ "role": "student" \| "instructor" \| "staff" }`. Invalid → 400 |

Every grant, revoke, lookup and assignment writes an audit event. Granting
consent here is what makes `GET /students/:id/claims` return 200 for that service.

## Sign-up & sign-in (added)

**One-time setup:** run `supabase/migrations/20261107140000_create_accounts.sql`
in the Supabase SQL editor (creates the `accounts` table).

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/auth/signup` | `studentId` (10 digits), `firstName`, `lastName`, `email`, `password` (≥ 8) | `201 { token, role, expiresIn }`; `400` with per-field `fields` errors; `409` if the account exists, the email is taken, or a staff-created record has a different email |
| POST | `/auth/login` | `studentId`, `password` | `200 { token, role, expiresIn }`; `401` on wrong credentials |

- Passwords are stored as salted scrypt hashes (`lib/accounts.js`), never plain text.
- The token's role comes from the `roles` table (default `student`), so a role
  assigned on the Role lookup screen applies at the next sign-in.
- If staff already created the student record, signing up with the **same email**
  claims it instead of creating a duplicate.
- Every sign-up and sign-in attempt (allowed or denied) writes an audit event.

## Integrating with other teams (added)

See **[CONTRACT.md](CONTRACT.md)** — tokens, roles, endpoints, errors and the
`profile.updated` webhook, plus a Course Catalog section.
`examples/course-catalog-auth.js` is copy-paste Express middleware other teams
use to require a role (e.g. staff-only course edits). CORS is enabled
(`ALLOWED_ORIGINS`, default `*`).

## Automated tests (added)

```bash
npm test
```
Runs `test/identity.test.js` with Node's built-in test runner — no extra
packages, no Supabase or internet needed (`test/helpers.js` swaps the database
for an in-memory fake and boots the real Express app on a random port).

| # | PRD test | What it proves |
|---|---|---|
| 1 | sign-in | Sign-up returns a working token; password is hashed; wrong password → 401; duplicate sign-up → 409 |
| 2 | role check | Student can't create students (403), staff can (201); instructor reads but can't delete; a role assigned by staff appears in the next sign-in token |
| 3 | consent grant/revoke | Claims 403 → grant → 200 → revoke → 403; unknown scope → 400 |
| 4 | token expiry | Expired, tampered and missing tokens → 401; `/tokens/verify` → `valid: false` |
| 5 | profile validation | `PATCH /me` rejects `student_id`, bad email, age 500, blank name, empty body (400); valid edit → 200 |
| 6 | service scope | Service without `profile:read` → 403 even with consent; consent for one service doesn't cover another |
| 7 | audit event | Denied and allowed claims, consent grant and failed login all write audit events with actor/resource/result |

`PATCH /me` now only accepts `first_name`, `last_name`, `email`, `age`
(`lib/profileValidation.js`).

## Service API keys & real claims (added)

**One-time setup:** run `supabase/migrations/20261107150000_service_client_api_keys.sql`
in the Supabase SQL editor.

- Staff register a team's service on **Service clients**; an API key (`sik_…`) is
  shown **once**. Only its SHA-256 hash is stored. "New key" rotates it
  (`POST /service-clients/:id/keys`); the old key stops working.
- The other team's backend sends `X-API-Key: sik_…` (or `Authorization: Bearer sik_…`).
  The key acts as a `service` caller named after the client with scope `profile:read`.
- `GET /students/:id/claims` now returns real data: `verified`, `name`,
  `profileComplete`, `missingFields`, `skills`; `404` for unknown students.
- Keys are also stored **encrypted** (AES-256-GCM, `api_key_enc`) so staff can
  press **Copy** on Service clients any time. The encryption key is
  `API_KEY_SECRET` (falls back to `JWT_SECRET`) — set it on Render and don't
  change it, or existing keys can't be copied (they still work). Run
  `supabase/migrations/20261107160000_service_client_key_enc.sql` once.
