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
