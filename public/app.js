// Student Identity — frontend (vanilla JS, hash routing, served by Express from /public)
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => esc(JSON.stringify(v, null, 2));

// ---------- session ----------
let session = null; // { token, sub, role, scopes, exp }
try { session = JSON.parse(sessionStorage.getItem('si_session')); } catch {}
const saveSession = (s) => { session = s; try { s ? sessionStorage.setItem('si_session', JSON.stringify(s)) : sessionStorage.removeItem('si_session'); } catch {} };
const decode = (t) => JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

// ---------- API ----------
async function api(method, path, body, headers = {}) {
  const h = { ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (session?.token) h.Authorization = `Bearer ${session.token}`;
  let status = 0, data = null;
  try {
    const res = await fetch(path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    status = res.status;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  } catch (e) { data = { error: 'Network error — is the server running?' }; }
  if (status === 401 && session && path !== '/tokens/verify') { toast('Session expired — sign in again'); signOut(true); }
  if (status === 403 && data?.code === 'suspended' && session) { toast('Your account is suspended — contact staff'); signOut(true); }
  return { ok: status >= 200 && status < 300, status, data };
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3000);
}
const errMsg = (r) => r.data?.error || r.data?.message || `HTTP ${r.status}`;

// ---------- auth ----------
function startSession(token) {
  const p = decode(token);
  saveSession({ token, sub: p.sub, role: p.role, scopes: p.scopes || [], exp: p.exp });
  go('#/');
}
async function signOut(silent) {
  if (!silent && session) await api('DELETE', `/sessions/${encodeURIComponent(session.sub)}`);
  saveSession(null);
  go('#/signin');
}
// Navigate and (re)build the page even if the hash doesn't change.
function go(hash) {
  shellReady = false;
  if (location.hash === hash) boot(); else location.hash = hash;
}

// tabs
const showTab = (name) => {
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('[data-pane]').forEach((f) => (f.hidden = f.dataset.pane !== name));
  const first = $(`[data-pane="${name}"] input`);
  if (first) first.focus();
};
document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => (location.hash = `#/${b.dataset.tab}`)));

const busy = (form, on) => { const b = form.querySelector('button[type=submit]'); b.disabled = on; };

$('#signinForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, err = f.querySelector('[data-err]');
  const studentId = f.studentId.value.trim(), password = f.password.value;
  if (!studentId || !password) return (err.textContent = 'Enter your student ID and password');
  busy(f, true);
  const r = await api('POST', '/auth/login', { studentId, password });
  busy(f, false);
  if (!r.ok) { err.textContent = errMsg(r); f.password.value = ''; return f.password.focus(); }
  err.textContent = ''; f.reset();
  startSession(r.data.token);
};

$('#signupForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target, err = f.querySelector('[data-err]');
  const body = Object.fromEntries(['studentId', 'firstName', 'lastName', 'email', 'faculty', 'password'].map((k) => [k, f[k].value.trim()]));
  body.password = f.password.value;
  // client-side checks mirror the server; the server is still the authority
  const fields = {};
  if (!/^\d{10}$/.test(body.studentId)) fields.studentId = 'Student ID must be 10 digits';
  if (!body.firstName) fields.firstName = 'Required';
  if (!body.lastName) fields.lastName = 'Required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) fields.email = 'Enter a valid email address';
  if (body.password.length < 8) fields.password = 'At least 8 characters';
  if (f.confirm.value !== body.password) fields.confirm = 'Passwords do not match';
  showFieldErrors(f, fields);
  if (Object.keys(fields).length) return (err.textContent = '');
  busy(f, true);
  const r = await api('POST', '/auth/signup', body);
  busy(f, false);
  if (!r.ok) { showFieldErrors(f, r.data?.fields || {}); return (err.textContent = errMsg(r)); }
  err.textContent = ''; f.reset();
  toast('Account created — welcome!');
  startSession(r.data.token);
};

function showFieldErrors(form, fields) {
  form.querySelectorAll('[data-f]').forEach((el) => {
    const msg = fields[el.dataset.f];
    if (el.classList.contains('hintline')) { el.dataset.def ??= el.textContent; el.textContent = msg || el.dataset.def; el.classList.toggle('bad', !!msg); }
    else el.textContent = msg || '';
    el.closest('label').querySelector('input').toggleAttribute('aria-invalid', !!msg);
  });
}

$('#logout').onclick = () => { closeMenu(); signOut(); };

// user menu (top-right)
const userBtn = $('#userBtn'), userMenu = $('#userMenu');
function closeMenu() { userMenu.hidden = true; userBtn.setAttribute('aria-expanded', 'false'); }
userBtn.onclick = (e) => {
  e.stopPropagation();
  const open = userMenu.hidden;
  userMenu.hidden = !open; userBtn.setAttribute('aria-expanded', String(open));
  if (open) userMenu.querySelector('a:not([hidden]), button').focus();
};
userMenu.onclick = (e) => { if (e.target.closest('a')) closeMenu(); };
document.addEventListener('click', (e) => { if (!e.target.closest('.usermenu')) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !userMenu.hidden) { closeMenu(); userBtn.focus(); } });

// ---------- routes ----------
// Side menu: items without a group sit at the top; the rest are grouped.
// inMenu pages (profile, settings) are only in the top-right user menu.
const GROUPS = {
  student: { label: 'Student Menu', icon: 'cap' },
  admin:   { label: 'Staff Menu', icon: 'admin' },
  service: { label: 'Service Menu', icon: 'plug' },
};
const ROUTES = {
  dashboard: { label: 'Dashboard',       icon: 'gauge',    roles: ['student'],                        render: viewDashboard },
  admin:     { label: 'Dashboard',       icon: 'gauge',    roles: ['staff'],                          render: viewAdmin },
  courses:   { label: 'Courses',         icon: 'book',     roles: ['student'], group: 'student',      render: viewCourses },
  timetable: { label: 'Timetable',       icon: 'calendar', roles: ['student'], group: 'student',      render: viewTimetable },
  grades:    { label: 'Grades',          icon: 'award',    roles: ['student'], group: 'student',      render: viewGrades },
  profile:   { label: 'My profile',      icon: 'user',     roles: ['student'], ifRecord: true, inMenu: true, render: viewProfile },
  consent:   { label: 'Consent & sharing', icon: 'shield', roles: ['student'], group: 'student',      render: viewConsent },
  settings:  { label: 'Settings',        icon: 'gear',     roles: ['student'], ifRecord: true, inMenu: true, render: viewSettings },
  users:     { label: 'Users',           icon: 'users',    roles: ['staff'], group: 'admin',          render: viewUsers },
  students:  { label: 'Students',        icon: 'idcard',   roles: ['staff', 'instructor'], group: 'admin', render: viewStudents },
  roles:     { label: 'Roles',           icon: 'key',      roles: ['staff', 'instructor'], group: 'admin', render: viewRoles },
  synced:    { label: 'Course list',     icon: 'list',     roles: ['staff'], group: 'admin',          render: viewSynced },
  clients:   { label: 'Service clients', icon: 'plug',     roles: ['staff'], group: 'admin',          render: viewClients },
  audit:     { label: 'Audit log',       icon: 'scroll',   roles: ['staff'], group: 'admin',          render: viewAudit },
  claims:    { label: 'Claims',          icon: 'file',     roles: ['service'], group: 'service',      render: viewClaims },
};
const ALIASES = { password: 'settings' };
const PUBLIC_KEYS = ['', 'signin', 'signup', 'forgot'];

// Staff/instructors who also have a student record (e.g. a student promoted on
// the Roles screen) still get their own profile and settings.
let hasRecord = false, booting = false, shellReady = false, me = null;
const allowed = () => Object.entries(ROUTES).filter(([, r]) => r.roles.includes(session.role) || (r.ifRecord && hasRecord));
const parseHash = () => { const [key = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/'); return { key, param: rest.join('/') }; };

function showPublic(which, param) {
  shellReady = false;
  $('#app').hidden = true;
  $('#public').hidden = false;
  $('#auth').hidden = which === 'verify';
  $('#verifyView').hidden = which !== 'verify';
  if (which === 'verify') renderVerify($('#verifyView'), param);
  else showTab(which);
  window.scrollTo(0, 0);
}

// Header: photo (or initials), student ID, name, role.
function paintWho() {
  const name = me ? [me.first_name, me.last_name].filter(Boolean).join(' ') : '';
  $('#whoText').innerHTML = `<span class="who-id">${esc(session.sub)}</span>${name ? `<span class="who-name">${esc(name)}</span>` : ''}<span class="badge accent">${esc(session.role)}</span>`;
  const initials = name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('') : session.sub.slice(0, 2);
  $('#whoAvatar').innerHTML = me && me.photo ? `<img src="${esc(me.photo)}" alt="">` : esc(initials.toUpperCase());
}

async function boot() {
  const authed = session && session.exp * 1000 > Date.now();
  if (!authed && session) saveSession(null);
  const { key, param } = parseHash();
  if (key === 'v') return showPublic('verify', param); // public QR page, signed in or not
  if (!authed) return showPublic(['signin', 'signup', 'forgot'].includes(key) ? key : 'signin');
  $('#public').hidden = true;
  $('#app').hidden = false;
  me = null; hasRecord = false;
  paintWho();
  if (session.role !== 'service') {
    booting = true; // don't render a page until we know which menu items exist
    $('#view').innerHTML = skeleton(4);
    try { const r = await api('GET', '/me'); if (r.ok) { me = r.data; hasRecord = true; } } finally { booting = false; }
    if (!session) return; // signed out while loading (e.g. suspended)
    paintWho();
  }
  const own = session.role === 'student' || hasRecord;
  userMenu.querySelectorAll('[data-needs="record"]').forEach((a) => (a.hidden = !own));
  shellReady = true;
  route();
}

function homeKey(list) {
  const has = (k) => list.some(([x]) => x === k);
  return has('dashboard') ? 'dashboard' : has('admin') ? 'admin' : (list.find(([, r]) => !r.inMenu) || list[0])[0];
}

// collapsed side-menu groups survive reloads (per browser)
let collapsed = {};
try { collapsed = JSON.parse(localStorage.getItem('si_nav_collapsed')) || {}; } catch {}
const saveCollapsed = () => { try { localStorage.setItem('si_nav_collapsed', JSON.stringify(collapsed)); } catch {} };

function renderNav(all, key) {
  const list = all.filter(([, r]) => !r.inMenu);
  const item = ([k, r]) => `<a class="nav-item ${k === key ? 'active' : ''}" href="#/${k}" ${k === key ? 'aria-current="page"' : ''}>
    <span class="nav-ic">${icon(r.icon)}</span>${esc(r.label)}</a>`;
  const top = list.filter(([, r]) => !r.group).map(item).join('');
  const groups = [...new Set(list.filter(([, r]) => r.group).map(([, r]) => r.group))].map((g) => {
    const items = list.filter(([, r]) => r.group === g);
    const open = !collapsed[g] || items.some(([k]) => k === key);
    return `<div class="nav-group"><button type="button" class="nav-head" data-g="${g}" aria-expanded="${open}">
      <span class="nav-ic">${icon(GROUPS[g].icon)}</span>${esc(GROUPS[g].label)}
      <svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
      <div class="nav-items" ${open ? '' : 'hidden'}>${items.map(item).join('')}</div></div>`;
  }).join('');
  $('#nav').innerHTML = top + groups;
}
$('#nav').onclick = (e) => {
  const head = e.target.closest('.nav-head');
  if (head) {
    const open = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(open));
    head.nextElementSibling.hidden = !open;
    collapsed[head.dataset.g] = !open; saveCollapsed();
  } else if (e.target.closest('a')) closeSide();
};

// mobile: side menu slides in
function closeSide() { $('#side').classList.remove('open'); $('#scrim').hidden = true; $('#navToggle').setAttribute('aria-expanded', 'false'); }
$('#navToggle').onclick = () => {
  const open = !$('#side').classList.contains('open');
  $('#side').classList.toggle('open', open); $('#scrim').hidden = !open; $('#navToggle').setAttribute('aria-expanded', String(open));
};
$('#scrim').onclick = closeSide;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSide(); });

function route() {
  if (!session || booting) return;
  const list = allowed();
  let { key, param } = parseHash();
  key = ALIASES[key] || key;
  if (PUBLIC_KEYS.includes(key)) key = homeKey(list);
  renderNav(list, key);
  closeSide();
  userMenu.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/${key}`));
  const view = $('#view');
  window.scrollTo(0, 0);
  if (!ROUTES[key]) return viewNotFound(view);
  if (!list.some(([k]) => k === key)) return viewForbidden(view);
  ROUTES[key].render(view, param);
}
window.addEventListener('hashchange', () => {
  const { key } = parseHash();
  if (key === 'v' || !session || !shellReady) boot(); else route();
});

setInterval(() => {
  if (!session) return;
  const left = Math.round(session.exp - Date.now() / 1000);
  if (left <= 0) { toast('Token expired — sign in again'); return signOut(true); }
  const el = $('#ttl');
  el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.classList.toggle('low', left < 120);
  el.title = 'Token time left';
}, 1000);

// ---------- views ----------
async function loadCompleteness() {
  const c = await api('GET', '/me/profile-completeness');
  if (!c.ok) return ($('#pc').innerHTML = `<p class="err">${esc(errMsg(c))}</p>`);
  const d = c.data;
  $('#src').innerHTML = d.source === 'ai' ? '<span class="badge ok">AI</span>' : '<span class="badge warn">Fallback</span>';
  $('#pc').innerHTML = d.source === 'ai'
    ? `<p>${esc(d.message)}</p>`
    : `<p class="sub" style="margin:0">${esc(d.note)}</p>
       <p style="margin:12px 0 0">${d.isComplete ? '<span class="badge ok">Complete</span>' : `<span class="badge bad">${d.missingFields.length} missing</span>`}</p>
       <ul class="checklist">${d.checklist.map((i) => `<li class="${i.present ? 'on' : ''}">${esc(i.field)}</li>`).join('')}</ul>`;
}

async function viewStudents(el) {
  const staff = session.role === 'staff';
  el.innerHTML = `<h2>Students</h2><p class="sub">${staff ? 'Create, view and remove student records.' : 'Read-only list of student records.'}</p>
    ${staff ? `<div class="card" style="margin-bottom:16px"><h3>Add student</h3>
      <form id="addForm"><div class="row">
        <label>Student ID<input name="studentId" required></label>
        <label>First name<input name="firstName" required></label>
        <label>Last name<input name="lastName" required></label>
        <label>Email<input name="email" type="email" required placeholder="id@lamduan.mfu.ac.th"></label>
        <button class="btn primary" type="submit">Add</button></div>
        <p class="err" id="addErr"></p></form></div>` : ''}
    <div class="card"><div class="row" style="margin-bottom:12px">
      <label>Search<input id="q" placeholder="ID, name or email"></label>
      <button class="btn" id="reload">Refresh</button></div>
      <div class="table-wrap" id="tbl">Loading…</div></div>
    <div class="card" id="detail" hidden style="margin-top:16px"></div>`;

  let rows = [];
  const load = async () => {
    const r = await api('GET', '/students');
    if (!r.ok) return ($('#tbl').innerHTML = `<p class="err">${esc(errMsg(r))}</p>`);
    rows = r.data || []; draw();
  };
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const list = rows.filter((s) => !q || [s.student_id, s.first_name, s.last_name, s.email].join(' ').toLowerCase().includes(q));
    $('#tbl').innerHTML = !list.length ? '<p class="empty">No students found.</p>' : `<table>
      <thead><tr><th>Student ID</th><th>Name</th><th>Email</th><th>Age</th><th></th></tr></thead>
      <tbody>${list.map((s) => `<tr><td class="mono">${esc(s.student_id)}</td><td>${esc([s.first_name, s.last_name].filter(Boolean).join(' '))}</td>
        <td>${esc(s.email)}</td><td>${esc(s.age ?? '—')}</td>
        <td class="actions"><button class="btn sm" data-view="${esc(s.student_id)}">View</button>
        ${staff ? `<button class="btn sm danger" data-del="${esc(s.student_id)}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
  };

  $('#q').oninput = draw;
  $('#reload').onclick = load;
  $('#tbl').onclick = async (e) => {
    const v = e.target.dataset.view, d = e.target.dataset.del;
    if (v) {
      const r = await api('GET', `/students/${encodeURIComponent(v)}`);
      const box = $('#detail'); box.hidden = false;
      box.innerHTML = r.ok ? `<h3>${esc(v)}</h3><dl class="kv">${Object.entries(r.data).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val ?? '—')}</dd>`).join('')}</dl>`
        : `<p class="err">${esc(errMsg(r))}</p>`;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (d && confirm(`Delete student ${d}? This can't be undone.`)) {
      const r = await api('DELETE', `/students/${encodeURIComponent(d)}`);
      r.ok ? (toast(`Deleted ${d}`), $('#detail').hidden = true, load()) : toast(errMsg(r));
    }
  };
  if (staff) $('#addForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    const r = await api('POST', '/students', body);
    if (!r.ok) return ($('#addErr').textContent = errMsg(r));
    $('#addErr').textContent = ''; e.target.reset(); toast(`Added ${r.data.student_id}`); load();
  };
  load();
}

async function viewClients(el) {
  el.innerHTML = `<h2>Service clients</h2><p class="sub">Other teams' backends that read student claims. Each client has one API key — copy it any time and send it to that team privately. Re-sending the same Idempotency-Key returns the original record.</p>
    <div class="card" style="margin-bottom:16px"><h3>Register client</h3>
      <form id="scForm"><div class="row">
        <label>Name (the team's service name)<input name="name" required placeholder="internship-service"></label>
        <label>Idempotency-Key<input name="key" placeholder="optional"></label>
        <button class="btn" type="button" id="genKey">Generate</button>
        <button class="btn primary" type="submit">Register</button></div></form>
      <div id="scOut"></div></div>
    <div class="card"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">Registered <span id="cnt" class="badge"></span></h3><button class="btn sm" id="reload">Refresh</button></div>
      <div class="table-wrap" id="tbl">Loading…</div></div>`;

  const form = $('#scForm');
  const showKey = (name, apiKey) => {
    $('#scOut').innerHTML = `<div class="keybox"><p style="margin:0 0 8px"><b>API key for ${esc(name)}</b></p>
      <div class="row"><input class="mono" readonly value="${esc(apiKey)}" id="keyVal"><button class="btn" type="button" id="copyKey">Copy</button></div>
      <p class="sub" style="margin:8px 0 0">They send it as <code>X-API-Key: …</code> to <code>GET /students/{id}/claims</code>.</p></div>`;
    $('#copyKey').onclick = async () => { try { await navigator.clipboard.writeText(apiKey); toast('Copied'); } catch { $('#keyVal').select(); } };
    $('#scOut').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  $('#genKey').onclick = () => (form.key.value = `req-${crypto.randomUUID().slice(0, 8)}`);
  const load = async () => {
    const r = await api('GET', '/dev/service-clients');
    if (!r.ok) return ($('#tbl').innerHTML = `<p class="err">${esc(errMsg(r))}</p>`);
    $('#cnt').textContent = r.data.count;
    $('#tbl').innerHTML = !r.data.records.length ? '<p class="empty">No service clients yet.</p>' : `<table>
      <thead><tr><th>Name</th><th>API key</th><th>Scopes</th><th>Created</th><th></th></tr></thead>
      <tbody>${r.data.records.map((c) => `<tr><td>${esc(c.name)}</td>
        <td class="mono">${c.hasApiKey ? `${esc(c.key_prefix || 'sik_')}… ${c.canCopy ? `<button class="btn sm" data-copy="${esc(c.id)}" data-name="${esc(c.name)}">Copy</button>` : '<span class="sub" title="Created before keys could be copied again — issue a new key once">(can\'t copy)</span>'}` : '<span class="sub">none</span>'}</td>
        <td class="mono">${esc((c.scopes || []).join(', ') || '—')}</td>
        <td>${c.created_at ? esc(new Date(c.created_at).toLocaleString()) : '—'}</td>
        <td class="actions"><button class="btn sm" data-rot="${esc(c.id)}" data-name="${esc(c.name)}">${c.hasApiKey ? 'New key' : 'Create key'}</button></td></tr>`).join('')}</tbody></table>`;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const key = form.key.value.trim();
    const r = await api('POST', '/service-clients', { name: form.name.value.trim() }, key ? { 'Idempotency-Key': key } : {});
    if (!r.ok) return ($('#scOut').innerHTML = `<p class="err">${esc(errMsg(r))}</p>`);
    if (r.data.apiKey) showKey(r.data.name, r.data.apiKey);
    else $('#scOut').innerHTML = `<p class="sub" style="margin-top:12px">Same Idempotency-Key — returned the existing client <b>${esc(r.data.name)}</b> (<span class="mono">${esc(r.data.id)}</span>). No new key was issued.</p>`;
    load();
  };
  $('#tbl').onclick = async (e) => {
    if (e.target.dataset.copy) {
      const r = await api('GET', `/service-clients/${encodeURIComponent(e.target.dataset.copy)}/key`);
      if (!r.ok) return toast(errMsg(r));
      try { await navigator.clipboard.writeText(r.data.apiKey); toast(`Copied key for ${e.target.dataset.name}`); }
      catch { showKey(e.target.dataset.name, r.data.apiKey); }
      return;
    }
    const id = e.target.dataset.rot; if (!id) return;
    const name = e.target.dataset.name;
    if (e.target.textContent === 'New key' && !confirm(`Issue a new key for ${name}? Their current key stops working immediately.`)) return;
    const r = await api('POST', `/service-clients/${encodeURIComponent(id)}/keys`);
    if (!r.ok) return toast(errMsg(r));
    showKey(name, r.data.apiKey); load();
  };
  $('#reload').onclick = load;
  load();
}

function viewClaims(el) {
  const hasScope = session.scopes.includes('profile:read');
  el.innerHTML = `<h2>Student claims</h2><p class="sub">Request verified claims for a student. Requires the <code>profile:read</code> scope and the student's consent for <code>${esc(session.sub)}</code>.</p>
    <div class="card">
      <p>Scope: ${hasScope ? '<span class="badge ok">profile:read</span>' : '<span class="badge bad">profile:read missing</span>'}</p>
      <form id="clForm"><div class="row"><label>Student ID<input name="id" required placeholder="123"></label>
        <button class="btn primary" type="submit">Request claims</button></div></form>
      <div id="clOut"></div></div>`;
  $('#clForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = e.target.id.value.trim();
    const r = await api('GET', `/students/${encodeURIComponent(id)}/claims`);
    $('#clOut').innerHTML = r.ok
      ? `<p style="margin-top:16px"><span class="badge ok">Granted</span></p><dl class="kv">
          <dt>Name</dt><dd>${esc([r.data.claims.name?.first, r.data.claims.name?.last].filter(Boolean).join(' ') || '—')}</dd>
          <dt>Verified</dt><dd>${r.data.claims.verified ? 'Yes' : 'No'}</dd>
          <dt>Profile complete</dt><dd>${r.data.claims.profileComplete ? 'Yes' : `No — missing ${esc((r.data.claims.missingFields || []).join(', '))}`}</dd>
          <dt>Skills</dt><dd>${esc(r.data.claims.skills.join(', ') || '—')}</dd>
          <dt>Issued</dt><dd>${esc(new Date(r.data.issuedAt).toLocaleString())}</dd></dl>`
      : `<p style="margin-top:16px"><span class="badge bad">${r.status}</span> ${esc(errMsg(r))}</p>`;
  };
}

const SCOPE_INFO = { 'profile:read': 'Your verified status, skills and profile completeness (claims)' };

async function viewConsent(el) {
  el.innerHTML = `<h2>Consent &amp; sharing</h2><p class="sub">Choose which campus services may read your identity claims. A service without consent is denied, and every change is audited.</p>
    <div id="cs">Loading…</div>`;
  const r = await api('GET', '/me/consents');
  if (!r.ok) return ($('#cs').innerHTML = `<p class="err">${esc(errMsg(r))}</p>`);
  const { availableScopes, services } = r.data;
  if (!services.length) return ($('#cs').innerHTML = '<div class="card"><p class="empty">No services are registered yet, so there is nothing to share.</p></div>');

  $('#cs').innerHTML = `<div class="grid">${services.map((s, i) => `
    <form class="card consent" data-i="${i}">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h3 class="mono" style="margin:0">${esc(s.granteeId)}</h3><span class="state"></span></div>
      ${availableScopes.map((sc) => `<label class="check scope"><input type="checkbox" value="${esc(sc)}" ${s.scopes.includes(sc) ? 'checked' : ''}>
        <span><code>${esc(sc)}</code><small>${esc(SCOPE_INFO[sc] || '')}</small></span></label>`).join('')}
      <p class="sub upd" style="margin:0"></p>
      <div class="row"><button class="btn primary" type="submit" disabled>Save</button><button class="btn danger" type="button" data-revoke>Revoke all</button></div>
    </form>`).join('')}</div>`;

  document.querySelectorAll('form.consent').forEach((f) => {
    const s = services[f.dataset.i];
    const picked = () => [...f.querySelectorAll('input:checked')].map((c) => c.value);
    const paint = () => {
      const on = s.scopes.length > 0;
      f.querySelector('.state').innerHTML = on ? '<span class="badge ok">Sharing</span>' : '<span class="badge">Not sharing</span>';
      f.querySelector('.upd').textContent = s.updatedAt ? `Updated ${new Date(s.updatedAt).toLocaleString()}` : '';
      f.querySelector('[data-revoke]').disabled = !on;
      f.querySelector('[type=submit]').disabled = picked().sort().join() === [...s.scopes].sort().join();
    };
    const save = async (scopes) => {
      const u = await api('PUT', `/me/consents/${encodeURIComponent(s.granteeId)}`, { scopes });
      if (!u.ok) return toast(errMsg(u));
      s.scopes = u.data.scopes; s.updatedAt = new Date().toISOString();
      f.querySelectorAll('input').forEach((c) => (c.checked = s.scopes.includes(c.value)));
      toast(s.scopes.length ? `Sharing with ${s.granteeId}` : `Stopped sharing with ${s.granteeId}`);
      paint();
    };
    f.onchange = paint;
    f.onsubmit = (e) => { e.preventDefault(); save(picked()); };
    f.querySelector('[data-revoke]').onclick = () => confirm(`Stop sharing everything with ${s.granteeId}?`) && save([]);
    paint();
  });
}

const ROLE_CAN = {
  student: ['Read and update own profile (/me)', 'See profile completeness', 'Grant or revoke consent to services'],
  instructor: ['List and view all student profiles', 'Look up roles'],
  staff: ['Everything an instructor can', 'Create and delete students', 'Assign roles', 'Register service clients'],
};
const roleBadge = (r) => `<span class="badge ${r === 'staff' ? 'accent' : r === 'instructor' ? 'warn' : ''}">${esc(r)}</span>`;

async function viewRoles(el) {
  const staff = session.role === 'staff';
  el.innerHTML = `<h2>Role lookup</h2><p class="sub">Check what role a person has and what it lets them do.${staff ? ' Staff can assign roles.' : ''}</p>
    <div class="card" style="margin-bottom:16px">
      <form id="lkForm"><div class="row"><label>Student ID or username<input name="s" required></label>
        <button class="btn primary" type="submit">Look up</button></div></form>
      <div id="lkOut"></div></div>
    <div class="card"><div class="row" style="margin-bottom:12px">
      <label>Search<input id="q" placeholder="ID or name"></label>
      <label style="flex:0 0 160px">Role<select id="rf"><option value="">All roles</option><option>student</option><option>instructor</option><option>staff</option></select></label>
      <button class="btn" id="reload">Refresh</button></div>
      <div class="table-wrap" id="tbl">Loading…</div></div>`;

  let rows = [], roleList = ['student', 'instructor', 'staff'];
  const load = async () => {
    const r = await api('GET', '/roles');
    if (!r.ok) return ($('#tbl').innerHTML = `<p class="err">${esc(errMsg(r))}</p>`);
    rows = r.data.subjects; roleList = r.data.availableRoles; draw();
  };
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), rf = $('#rf').value;
    const list = rows.filter((s) => (!rf || s.role === rf) && (!q || `${s.subject} ${s.name || ''}`.toLowerCase().includes(q)));
    $('#tbl').innerHTML = !list.length ? '<p class="empty">No one matches.</p>' : `<table>
      <thead><tr><th>Subject</th><th>Name</th><th>Role</th><th>Source</th><th></th></tr></thead>
      <tbody>${list.map((s) => `<tr><td class="mono">${esc(s.subject)}</td><td>${esc(s.name || '—')}</td><td>${roleBadge(s.role)}</td>
        <td>${s.source === 'assigned' ? 'Assigned' : '<span class="sub">Default</span>'}</td>
        <td class="actions"><button class="btn sm" data-lk="${esc(s.subject)}">${staff ? 'Manage' : 'View'}</button></td></tr>`).join('')}</tbody></table>`;
  };
  const lookup = async (subject) => {
    $('#lkForm').s.value = subject;
    const r = await api('GET', `/roles/${encodeURIComponent(subject)}`);
    const out = $('#lkOut');
    if (!r.ok) {
      out.innerHTML = `<p style="margin-top:16px"><span class="badge bad">${r.status}</span> ${esc(errMsg(r))}</p>
        ${staff && r.status === 404 ? '<p class="sub" style="margin:8px 0 0">You can still assign a role to this username below.</p>' + assignForm(subject, '') : ''}`;
    } else {
      const d = r.data;
      out.innerHTML = `<div class="grid" style="margin-top:16px">
        <dl class="kv"><dt>Subject</dt><dd class="mono">${esc(d.subject)}</dd><dt>Name</dt><dd>${esc(d.name || '—')}</dd>
          <dt>Role</dt><dd>${roleBadge(d.role)} <span class="sub">${d.source === 'assigned' ? 'assigned' : 'default for students'}</span></dd>
          ${d.updatedBy ? `<dt>Set by</dt><dd>${esc(d.updatedBy)} · ${esc(new Date(d.updatedAt).toLocaleString())}</dd>` : ''}</dl>
        <div><b>Can</b><ul class="checklist">${(ROLE_CAN[d.role] || []).map((c) => `<li class="on">${esc(c)}</li>`).join('')}</ul></div></div>
        ${staff ? assignForm(d.subject, d.role) : ''}`;
    }
    const af = $('#asForm');
    if (af) af.onsubmit = async (e) => {
      e.preventDefault();
      const u = await api('PUT', `/roles/${encodeURIComponent(subject)}`, { role: af.role.value });
      if (!u.ok) return toast(errMsg(u));
      toast(`${subject} is now ${u.data.role}`); await load(); lookup(subject);
    };
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const assignForm = (subject, current) => `<form id="asForm" class="row" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--line)">
    <label>Assign role to <span class="mono">${esc(subject)}</span><select name="role">${roleList.map((r) => `<option ${r === current ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <button class="btn primary" type="submit">Save role</button></form>`;

  $('#lkForm').onsubmit = (e) => { e.preventDefault(); lookup(e.target.s.value.trim()); };
  $('#q').oninput = draw; $('#rf').onchange = draw; $('#reload').onclick = load;
  $('#tbl').onclick = (e) => e.target.dataset.lk && lookup(e.target.dataset.lk);
  load();
}

boot();
