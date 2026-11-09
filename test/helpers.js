// Test harness: swaps Supabase for an in-memory fake, boots the real Express
// app on a random port, and gives small helpers for requests and tokens.
// Load this BEFORE anything that requires ../lib/db.js.
const path = require('path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
// Point webhooks at a closed port so tests never hit the internet.
process.env.NOTIFICATION_HUB_URL = 'http://127.0.0.1:9/notification-hub';
process.env.DATA_ANALYTICS_URL = 'http://127.0.0.1:9/data-analytics';

// Keep test output readable: drop the app's [audit] / [mock:*] console lines.
const quiet = (fn) => (...a) => (typeof a[0] === 'string' && /^\[(audit|mock)/.test(a[0]) ? undefined : fn(...a));
console.log = quiet(console.log);

// ---- in-memory Supabase stand-in (only the calls this codebase uses) ----
const tables = {};
function reset() {
  for (const k of Object.keys(tables)) delete tables[k];
  Object.assign(tables, {
    students: [{ id: 'u1', student_id: '6731500001', first_name: 'Ann', last_name: 'Lee', email: 'ann@lamduan.mfu.ac.th', age: 20 }],
    consents: [],
    service_clients: [{ id: 'sc1', name: 'internship-service', idempotency_key: null }],
    audit_events: [],
    roles: [],
    accounts: [],
    announcements: [],
    notifications: [],
  });
}
reset();

function from(table) {
  let op = 'select', payload, conflict = [], mode = 'many';
  const filters = [];
  const rows = () => (tables[table] ||= []);
  const match = () => rows().filter((r) => filters.every(([k, v]) => String(r[k]) === String(v)));
  const q = {
    select() { return q; },
    eq(k, v) { filters.push([k, v]); return q; },
    order() { return q; },
    insert(p) { op = 'insert'; payload = p; return q; },
    update(p) { op = 'update'; payload = p; return q; },
    delete() { op = 'delete'; return q; },
    upsert(p, o = {}) { op = 'upsert'; payload = p; conflict = (o.onConflict || 'id').split(','); return q; },
    single() { mode = 'single'; return q; },
    maybeSingle() { mode = 'maybe'; return q; },
    then(resolve, reject) {
      let out = [], error = null;
      if (op === 'insert') {
        for (const p of payload) {
          const dupEmail = table === 'students' && rows().some((r) => r.email === p.email);
          const dupKey = table === 'accounts' && rows().some((r) => r.subject === p.subject);
          if (dupEmail || dupKey) { error = { message: 'duplicate key value', code: '23505' }; break; }
          const row = { id: `id${Math.random().toString(16).slice(2, 8)}`, created_at: new Date().toISOString(), ...p };
          rows().push(row); out.push(row);
        }
      } else if (op === 'update') {
        out = match(); out.forEach((r) => Object.assign(r, payload));
      } else if (op === 'delete') {
        const gone = new Set(match()); tables[table] = rows().filter((r) => !gone.has(r));
      } else if (op === 'upsert') {
        const ex = rows().find((r) => conflict.every((k) => String(r[k]) === String(payload[k])));
        if (ex) { Object.assign(ex, payload); out = [ex]; } else { rows().push({ ...payload }); out = [payload]; }
      } else out = match();
      let data = out;
      if (!error && mode === 'single') { data = out[0] || null; if (!data) error = { message: 'Row not found', code: 'PGRST116' }; }
      if (!error && mode === 'maybe') data = out[0] || null;
      return Promise.resolve(error ? { data: null, error } : { data, error: null }).then(resolve, reject);
    },
  };
  return q;
}
require.cache[path.join(__dirname, '..', 'lib', 'db.js')] = {
  id: 'fake-db', filename: 'fake-db', loaded: true, exports: { from },
};

// ---- boot the real app ----
const app = require('../server');
let server, base;
async function start() {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
}
async function stop() { await new Promise((r) => server.close(r)); }

async function api(method, url, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// Mint a token signed with the test secret (same as Identity would issue).
function token(sub, role, scopes = [], opts = {}) {
  return jwt.sign({ sub, role, scopes }, process.env.JWT_SECRET, { expiresIn: 900, ...opts });
}

// Audit writes are fire-and-forget in the routes; give them a tick to land.
const settle = () => new Promise((r) => setImmediate(r));

module.exports = { tables, reset, start, stop, api, token, settle };
