// Portal pages. Loaded before app.js; uses its helpers ($, esc, api, toast,
// errMsg, session, showFieldErrors, busy) at call time.

// ---------- shared UI helpers ----------
const ICONS = {
  check: '<path d="M4 10.5 8 14.5 16 6"/>',
  x: '<path d="M5 5l10 10M15 5 5 15"/>',
  q: '<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 1 1 2.5 1.9c-.4.2-.5.5-.5.9V11M10 14h.01"/>',
  plug: '<path d="M7 3v4M13 3v4M5 7h10v3a5 5 0 0 1-10 0V7ZM10 15v2"/>',
  cloudOff: '<path d="M3 3l14 14M7 7a4 4 0 0 0-1 7.9h8M12 6.2A4 4 0 0 1 16.5 11a3 3 0 0 1 .4 3.6"/>',
  empty: '<rect x="3" y="5" width="14" height="11" rx="2"/><path d="M3 9h14"/>',
  lock: '<rect x="4" y="9" width="12" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>',
  compass: '<circle cx="10" cy="10" r="7"/><path d="m12.5 7.5-1.5 3.5-3.5 1.5 1.5-3.5z"/>',
  bell: '<path d="M6 8a4 4 0 1 1 8 0c0 4 1.5 5 1.5 5h-11S6 12 6 8ZM8.5 16a1.6 1.6 0 0 0 3 0"/>',
  gauge: '<path d="M3.5 14a6.5 6.5 0 1 1 13 0"/><path d="m10 14 3-4"/><circle cx="10" cy="14" r="1"/>',
  cap: '<path d="M2 7.5 10 4l8 3.5-8 3.5z"/><path d="M5.5 9v3.5c1.2 1.2 2.8 1.8 4.5 1.8s3.3-.6 4.5-1.8V9M18 7.5V12"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5zM4 16.5A1.5 1.5 0 0 0 5.5 18H16v-3"/>',
  calendar: '<rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8h14M7 3v3M13 3v3"/>',
  award: '<circle cx="10" cy="8" r="4.5"/><path d="m7.5 11.8-1 5.2 3.5-2 3.5 2-1-5.2"/>',
  user: '<circle cx="10" cy="7" r="3.2"/><path d="M3.5 17c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5"/>',
  gear: '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  shield: '<path d="M10 2.5 4 5v4.5c0 3.8 2.6 6.7 6 8 3.4-1.3 6-4.2 6-8V5z"/><path d="m7.5 10 2 2 3-3.5"/>',
  users: '<circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16.5c.6-2.8 2.5-4.3 5-4.3s4.4 1.5 5 4.3M13 4.5a2.6 2.6 0 0 1 0 5M14.5 12.4c1.6.5 2.6 1.9 3 4.1"/>',
  idcard: '<rect x="2.5" y="4.5" width="15" height="11" rx="1.5"/><circle cx="7" cy="9.5" r="1.8"/><path d="M4.5 13.5c.5-1.3 1.4-2 2.5-2s2 .7 2.5 2M11.5 8.5h4M11.5 11.5h3"/>',
  key: '<circle cx="7" cy="12.5" r="3.5"/><path d="m9.5 10 6.5-6.5M13.5 6l2 2"/>',
  list: '<path d="M7 5.5h10M7 10h10M7 14.5h10"/><circle cx="3.7" cy="5.5" r=".8"/><circle cx="3.7" cy="10" r=".8"/><circle cx="3.7" cy="14.5" r=".8"/>',
  scroll: '<path d="M5 3.5h9.5v11a2 2 0 0 1-2 2H5.5"/><path d="M5 3.5a1.5 1.5 0 0 0-1.5 1.5v1.5H5M5.5 16.5a2 2 0 0 1-2-2v-1h9"/><path d="M8 7h4M8 10h4"/>',
  wrench: '<path d="M12.5 3a4 4 0 0 0-3.7 5.4L3.5 13.7a1.4 1.4 0 0 0 2 2l5.3-5.3A4 4 0 0 0 16.6 6l-2.4 2.4-2-2L14.6 4a4 4 0 0 0-2.1-1z"/>',
  file: '<path d="M5 2.5h6.5L15 6v11.5H5z"/><path d="M11.5 2.5V6H15M7.5 10h5M7.5 13h5"/>',
  admin: '<path d="M10 2.5 4 5v4.5c0 3.8 2.6 6.7 6 8 3.4-1.3 6-4.2 6-8V5z"/><circle cx="10" cy="8.5" r="2"/><path d="M6.8 13.5c.6-1.4 1.8-2.2 3.2-2.2s2.6.8 3.2 2.2"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 20 20" aria-hidden="true">${ICONS[name] || ''}</svg>`;

function skeleton(rows = 3) {
  return `<div class="skel" aria-busy="true" aria-label="Loading">${'<div class="skel-row"></div>'.repeat(rows)}</div>`;
}

function emptyState(title, text = '', action = '', ic = 'empty') {
  return `<div class="state">${icon(ic, 'state-ic')}<b>${esc(title)}</b>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

// Response from an external adapter that failed → friendly state + retry.
function unavailable(r, what = 'Course service') {
  const name = r.data?.service || what;
  if (r.data?.code === 'service_not_configured') {
    return emptyState(`${what} not connected yet`,
      `This page shows data from <b>${esc(name)}</b>. It will appear here as soon as that service is connected.`, '', 'plug');
  }
  if (r.data?.code === 'service_auth_failed') {
    return emptyState(`${what} access not set up`,
      `<b>${esc(name)}</b> didn't accept our credentials. Staff need to add the service token that team issued (e.g. <code>COURSE_CATALOG_TOKEN</code>) on the server.`, '', 'lock');
  }
  if (r.status === 503) {
    return emptyState(`${what} unavailable`,
      `We couldn't reach <b>${esc(name)}</b>. It may be waking up — try again in a moment.`,
      '<button class="btn sm" data-retry>Try again</button>', 'cloudOff');
  }
  return emptyState('Something went wrong', esc(errMsg(r)), '<button class="btn sm" data-retry>Try again</button>', 'x');
}
function onRetry(el, fn) { el.querySelectorAll('[data-retry]').forEach((b) => (b.onclick = fn)); }

const sourceLabel = (name) => `<p class="source">${icon('plug')} Data provided by <b>${esc(name)}</b></p>`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const todayKey = () => DAY_NAMES[new Date().getDay()];

// ---------- 404 / 403 ----------
function viewNotFound(el) {
  el.innerHTML = `<div class="card">${emptyState('Page not found', 'That page doesn\'t exist. Check the link or go back to your home page.',
    '<a class="btn primary sm" href="#/">Go home</a>', 'compass')}</div>`;
}
function viewForbidden(el) {
  el.innerHTML = `<div class="card">${emptyState('You don\'t have access to this page',
    `Your role (<b>${esc(session.role)}</b>) can't open it. If you think this is wrong, ask staff to check your role.`,
    '<a class="btn primary sm" href="#/">Go home</a>', 'lock')}</div>`;
}

// ---------- public: verify (QR target) ----------
async function renderVerify(el, code) {
  el.innerHTML = `<div class="verify-card card">${skeleton(2)}</div>`;
  let r;
  try { const res = await fetch(`/verify/${encodeURIComponent(code)}`); r = { status: res.status, data: await res.json() }; }
  catch (e) { r = { status: 0, data: {} }; }
  const v = r.data || {};
  const ok = v.valid === true;
  const enrolled = v.enrolled === true ? '<span class="badge ok">Yes</span>' : v.enrolled === false ? '<span class="badge bad">No</span>' : '<span class="badge">Unknown</span>';
  el.innerHTML = `<div class="verify-card card">
    <div class="verify-mark ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'x')}</div>
    <h1>${r.status === 0 ? 'Couldn\'t check right now' : ok ? 'Valid student identity' : 'Not valid'}</h1>
    <dl class="kv verify-kv">
      <dt>Valid</dt><dd>${ok ? '<span class="badge ok">Yes</span>' : '<span class="badge bad">No</span>'}</dd>
      <dt>Currently enrolled</dt><dd>${ok ? enrolled : '<span class="badge">—</span>'}</dd>
      <dt>Checked</dt><dd>${esc(fmtDate(v.checkedAt || new Date()))}</dd>
    </dl>
    <p class="sub" style="margin:16px 0 0">Issued by Student Identity. This page shows only validity and enrolment — no personal details.</p>
  </div>`;
}

// ---------- student: dashboard ----------
async function viewDashboard(el) {
  el.innerHTML = `<div class="dash-head"><div><h2 id="hi">Hello</h2><p class="sub">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p></div></div>
    <div class="grid">
      <div class="card" id="dVerify"><h3>Verification</h3>${skeleton(3)}</div>
      <div class="card" id="dToday"><h3>Today's classes</h3>${skeleton(2)}</div>
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="card" id="dNews"><h3>Announcements</h3>${skeleton(2)}</div>
      <div class="card" id="dAlerts"><h3>Alerts</h3>${skeleton(2)}</div>
    </div>`;

  const [me, cons, tt, news, alerts, prefs] = await Promise.all([
    api('GET', '/me'), api('GET', '/me/consents'), api('GET', '/me/timetable'), api('GET', '/announcements'), api('GET', '/me/notifications'), api('GET', '/me/settings'),
  ]);
  if (!$('#dVerify')) return; // navigated away

  // verification
  if (me.ok) {
    const s = me.data;
    $('#hi').textContent = `Hello, ${s.first_name || s.student_id}`;
    const filled = ['first_name', 'last_name', 'email'].filter((k) => s[k]).length;
    const sharing = cons.ok ? cons.data.services.filter((x) => x.scopes.length).length : 0;
    $('#dVerify').innerHTML = `<h3>Verification</h3>
      <ul class="checklist big">
        <li class="on">Identity verified <span class="sub">· ${esc(s.student_id)}</span></li>
        <li class="${filled === 3 ? 'on' : ''}">Profile ${filled}/3 complete ${filled < 3 ? '<a href="#/profile">Finish</a>' : ''}</li>
        <li class="${sharing ? 'on' : ''}">Sharing with ${sharing} service${sharing === 1 ? '' : 's'} <a href="#/consent">Manage</a></li>
      </ul>
      <div class="row" style="margin-top:14px"><button class="btn sm" id="qrBtn">Show verification QR</button></div>
      <div id="qrBox"></div>`;
    $('#qrBtn').onclick = async () => {
      const q = await api('GET', '/me/verify-qr');
      if (!q.ok) return toast(errMsg(q));
      $('#qrBox').innerHTML = `<div class="qr">${q.data.svg}<div><p style="margin:0 0 6px"><b>Scan to verify</b></p>
        <p class="sub" style="margin:0 0 8px">Shows only "Valid" and "Currently enrolled" — no name or ID.</p>
        <a href="${esc(q.data.url)}" target="_blank" rel="noopener">Open verify page</a></div></div>`;
      $('#qrBtn').hidden = true;
    };
  } else {
    $('#dVerify').innerHTML = `<h3>Verification</h3>${emptyState('No student record', 'Ask staff to create your record.', '', 'q')}`;
  }

  // today's classes
  const t = $('#dToday');
  if (tt.ok) {
    const today = tt.data.classes.filter((c) => c.day === todayKey()).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    t.innerHTML = `<h3>Today's classes</h3>${today.length ? `<ul class="list">${today.map((c) => `<li><span class="time mono">${esc(c.start || '')}–${esc(c.end || '')}</span>
      <span class="grow"><b>${esc(c.courseCode || '')}</b> ${esc(c.title || '')}<br><span class="sub">${esc(c.room || 'Room TBA')}</span></span></li>`).join('')}</ul>`
      : emptyState('No classes today', '<a href="#/timetable">See the full week</a>')}${sourceLabel(tt.data.source)}`;
  } else {
    t.innerHTML = `<h3>Today's classes</h3>${unavailable(tt, 'Timetable')}`;
    onRetry(t, () => viewDashboard(el));
  }

  // announcements
  const showNews = !(prefs.ok && prefs.data.notifyAnnouncements === false);
  $('#dNews').innerHTML = `<h3>Announcements</h3>${!showNews ? emptyState('Announcements are hidden', 'Turn them back on in <a href="#/settings">Settings</a>.', '', 'bell')
    : news.ok && news.data.length ? `<ul class="news">${news.data.slice(0, 5).map((a) =>
    `<li><div><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}<span class="sub">${esc(fmtDate(a.created_at))}</span></div></li>`).join('')}</ul>`
    : emptyState('No announcements yet')}`;

  // alerts
  const al = $('#dAlerts');
  if (alerts.ok) {
    const list = alerts.data.notifications;
    al.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Alerts ${alerts.data.unread ? `<span class="badge accent">${alerts.data.unread} new</span>` : ''}</h3>
      ${alerts.data.unread ? '<button class="btn sm ghost" id="readAll">Mark all read</button>' : ''}</div>
      ${list.length ? `<ul class="news">${list.slice(0, 8).map((n) => `<li class="${n.read_at ? '' : 'unread'}"><span class="alert-kind ${/reject|suspend/.test(n.kind) ? 'bad' : ''}">${icon('bell')}</span>
        <div>${esc(n.message)}<br><span class="sub">${esc(fmtDate(n.created_at))}</span></div></li>`).join('')}</ul>`
        : emptyState('No alerts', 'Registration approvals, rejections and account changes show up here.', '', 'bell')}`;
    const ra = $('#readAll');
    if (ra) ra.onclick = async () => { await api('POST', '/me/notifications/read'); viewDashboard(el); };
  } else al.innerHTML = `<h3>Alerts</h3><p class="err">${esc(errMsg(alerts))}</p>`;
}

// ---------- student: profile (photo + faculty) ----------
const PROFILE_FIELDS = [['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email', 'email'], ['faculty', 'Faculty / School']];

async function viewProfile(el) {
  el.innerHTML = `<div id="pf"><div class="card">${skeleton(3)}</div></div>
    <div class="card" style="margin-top:16px"><h3>Profile completeness <span id="src"></span></h3><div id="pc">${skeleton(1)}</div></div>`;
  const r = await api('GET', '/me');
  if (!$('#pf')) return;
  if (!r.ok) {
    $('#pf').innerHTML = `<div class="card">${emptyState('No student record', `There's no student record for <code>${esc(session.sub)}</code>. Ask staff to create it.`, '', 'q')}</div>`;
    $('#pc').innerHTML = '<p class="sub">—</p>';
    return;
  }
  renderView(r.data);
  loadCompleteness();

  function avatar(s, cls = '') {
    const initials = (((s.first_name || '?')[0] || '') + ((s.last_name || '')[0] || '')).toUpperCase();
    return s.photo ? `<img class="avatar ${cls}" src="${esc(s.photo)}" alt="Profile photo">` : `<div class="avatar ${cls}" aria-hidden="true">${esc(initials)}</div>`;
  }

  function renderView(s) {
    const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
    const v = (x) => (x ? esc(x) : '<span class="sub">—</span>');
    $('#pf').innerHTML = `
      <div class="card pf-head">
        ${avatar(s)}
        <div class="pf-main">
          <h2 class="pf-title"><span class="mono">${esc(s.student_id)}</span> : <span class="pf-name">${v(name)}</span></h2>
          <div class="pf-line"><span>Faculty :</span> ${v(s.faculty)}</div>
          <div class="pf-line"><span>Email :</span> ${v(s.email)}</div>
        </div>
        <button class="btn sm" id="editBtn">Edit</button>
      </div>
      <p class="sub pf-note">If your information is incorrect, edit it here or contact staff.</p>
      <div class="card pf-section">
        <div class="pf-section-head">Personal Information</div>
        <dl class="pf-grid">
          <div><dt>Student Code</dt><dd class="mono">${esc(s.student_id)}</dd></div>
          <div><dt>Email</dt><dd>${v(s.email)}</dd></div>
          <div><dt>First Name</dt><dd>${v(s.first_name)}</dd></div>
          <div><dt>Last Name</dt><dd>${v(s.last_name)}</dd></div>
          <div><dt>Faculty / School</dt><dd>${v(s.faculty)}</dd></div>
        </dl>
      </div>`;
    $('#editBtn').onclick = () => renderForm(s);
  }

  function renderForm(s) {
    let photo = s.photo || null;
    $('#pf').innerHTML = `<div class="card"><h3>Edit profile</h3><form id="meForm">
      <div class="photo-row"><span id="ph">${avatar(s, 'sm')}</span>
        <div class="row"><label class="btn sm file-btn">Upload photo<input type="file" accept="image/*" id="photoIn"></label>
        <button class="btn sm ghost" type="button" id="photoRm" ${photo ? '' : 'hidden'}>Remove</button></div></div>
      <label>Student Code <input value="${esc(s.student_id)}" readonly></label>
      <div class="row">${PROFILE_FIELDS.slice(0, 2).map(field).join('')}</div>
      ${field(PROFILE_FIELDS[2])}${field(PROFILE_FIELDS[3])}
      <div class="row"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" id="cancelEdit">Cancel</button></div>
      <p class="err" id="meErr"></p></form>
      <p class="sub" style="margin:0">Saving sends a <code>profile.updated</code> webhook. Email and photo are never shared.</p></div>`;
    function field([k, label, type = 'text']) {
      return `<label>${label}<input name="${k}" type="${type}" value="${esc(s[k])}"></label>`;
    }
    const paintPhoto = () => { $('#ph').innerHTML = avatar({ ...s, photo }, 'sm'); $('#photoRm').hidden = !photo; };
    $('#photoIn').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { photo = await shrinkImage(file, 256); paintPhoto(); } catch (err) { toast('Could not read that image'); }
    };
    $('#photoRm').onclick = () => { photo = null; paintPhoto(); };
    $('#cancelEdit').onclick = () => renderView(s);
    $('#meForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target, body = {};
      PROFILE_FIELDS.forEach(([k]) => { const val = f[k].value.trim(); if (String(s[k] ?? '') !== val) body[k] = val; });
      if ((s.photo || null) !== photo) body.photo = photo;
      if (!Object.keys(body).length) return renderView(s);
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      const u = await api('PATCH', '/me', body);
      btn.disabled = false;
      if (!u.ok) {
        const fe = u.data?.fields || {};
        const labels = Object.fromEntries([...PROFILE_FIELDS.map(([k, l]) => [k, l]), ['photo', 'Photo']]);
        return ($('#meErr').textContent = Object.keys(fe).length ? Object.entries(fe).map(([k, m]) => `${labels[k] || k}: ${m}`).join(' · ') : errMsg(u));
      }
      const { _webhookDebug, ...student } = u.data;
      toast('Profile saved');
      renderView(student);
      loadCompleteness();
      me = student; paintWho(); // update name/photo in the header
    };
  }
}

// Resize to a square-ish JPEG data URL (keeps uploads ~20–40 KB).
function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- student: courses ----------
async function viewCourses(el, code) {
  if (code) return viewCourseDetail(el, decodeURIComponent(code));
  el.innerHTML = `<h2>Courses</h2><p class="sub">Search the catalog and register for courses.</p>
    <div class="card"><div class="row filters">
      <label>Search<input id="cq" placeholder="Code, title or instructor" autocomplete="off"></label>
      <label style="flex:0 0 140px">Credits<select id="cc"><option value="">Any</option></select></label>
      <label style="flex:0 0 200px">Faculty<select id="cf"><option value="">Any</option></select></label>
      <label class="check" style="flex:0 0 auto;align-self:center"><input type="checkbox" id="cs"> Has seats</label>
    </div><div id="clist">${skeleton(4)}</div><div id="csrc"></div></div>`;
  const load = async () => {
    $('#clist').innerHTML = skeleton(4);
    const r = await api('GET', '/catalog/courses');
    if (!$('#clist')) return;
    if (!r.ok) { $('#clist').innerHTML = unavailable(r); onRetry($('#clist'), load); return; }
    const courses = r.data.courses;
    $('#csrc').innerHTML = sourceLabel(r.data.source);
    const uniq = (xs) => [...new Set(xs.filter((x) => x !== null && x !== undefined && x !== ''))].sort();
    $('#cc').innerHTML = '<option value="">Any</option>' + uniq(courses.map((c) => c.credits)).map((c) => `<option>${esc(c)}</option>`).join('');
    $('#cf').innerHTML = '<option value="">Any</option>' + uniq(courses.map((c) => c.faculty)).map((c) => `<option>${esc(c)}</option>`).join('');
    const draw = () => {
      const q = $('#cq').value.trim().toLowerCase(), cr = $('#cc').value, fa = $('#cf').value, seats = $('#cs').checked;
      const list = courses.filter((c) => (!q || `${c.code} ${c.title} ${c.instructor || ''}`.toLowerCase().includes(q))
        && (!cr || String(c.credits) === cr) && (!fa || c.faculty === fa) && (!seats || c.seatsLeft === null || c.seatsLeft > 0));
      $('#clist').innerHTML = !courses.length ? emptyState('No courses yet', 'The catalog is empty right now. Check back later.')
        : !list.length ? emptyState('No courses match', 'Try a different search or clear the filters.')
        : `<div class="course-list">${list.map((c) => `<a class="course" href="#/courses/${encodeURIComponent(c.code)}">
            <div class="course-top"><span class="mono code">${esc(c.code)}</span>${seatBadge(c.seatsLeft)}</div>
            <b>${esc(c.title)}</b>
            <span class="sub">${[c.credits !== null ? `${c.credits} credits` : '', c.instructor].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</span>
            ${c.prerequisites.length ? `<span class="sub">Requires ${c.prerequisites.map(esc).join(', ')}</span>` : ''}</a>`).join('')}</div>`;
    };
    ['#cq', '#cc', '#cf', '#cs'].forEach((s) => ($(s).oninput = draw));
    draw();
  };
  load();
}

const seatBadge = (n) => (n === null || n === undefined ? '' : n === 0 ? '<span class="badge bad">Full</span>'
  : `<span class="badge ${n <= 5 ? 'warn' : 'ok'}">${n} seat${n === 1 ? '' : 's'} left</span>`);

async function viewCourseDetail(el, code) {
  el.innerHTML = `<p><a href="#/courses">← All courses</a></p><div class="card" id="cd">${skeleton(5)}</div>`;
  const r = await api('GET', `/catalog/courses/${encodeURIComponent(code)}`);
  if (!$('#cd')) return;
  if (r.status === 404) { $('#cd').innerHTML = emptyState('Course not found', `There's no course <b>${esc(code)}</b> in the catalog.`, '<a class="btn sm" href="#/courses">Back to courses</a>', 'compass'); return; }
  if (!r.ok) { $('#cd').innerHTML = unavailable(r); onRetry($('#cd'), () => viewCourseDetail(el, code)); return; }
  const c = r.data.course;
  const canRegister = session.role === 'student';
  const full = c.seatsLeft === 0;
  $('#cd').innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-start">
      <div><span class="mono code">${esc(c.code)}</span><h2 style="margin:4px 0 6px">${esc(c.title)}</h2>
      <p class="sub" style="margin:0">${[c.credits !== null ? `${c.credits} credits` : '', c.level, c.instructor, c.faculty].filter(Boolean).map(esc).join(' · ')}</p></div>
      ${seatBadge(c.seatsLeft)}</div>
    ${c.description ? `<p style="margin:16px 0 0;max-width:70ch">${esc(c.description)}</p>` : ''}
    <h3 style="margin-top:20px">Prerequisites</h3>
    ${c.prerequisites.length ? `<div class="chips">${c.prerequisites.map((p) => `<a class="chip mono" href="#/courses/${encodeURIComponent(p)}">${esc(p)}</a>`).join('')}</div>` : '<p class="sub">None</p>'}
    ${c.sections.length ? `<h3 style="margin-top:20px">Sections</h3><div class="table-wrap"><table><thead><tr><th>Section</th><th>Day</th><th>Time</th><th>Room</th><th>Seats</th></tr></thead>
      <tbody>${c.sections.map((s) => `<tr><td>${esc(s.id || '—')}</td><td>${esc(s.day || '—')}</td><td class="mono">${esc(s.start || '')}${s.end ? `–${esc(s.end)}` : ''}</td><td>${esc(s.room || '—')}</td><td>${s.seatsLeft ?? '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${canRegister ? `<form id="regForm" class="row reg">
      ${c.sections.length > 1 ? `<label style="flex:0 0 160px">Section<select name="section">${c.sections.map((s) => `<option value="${esc(s.id)}" ${s.seatsLeft === 0 ? 'disabled' : ''}>${esc(s.id)}${s.seatsLeft === 0 ? ' (full)' : ''}</option>`).join('')}</select></label>` : ''}
      <button class="btn primary" type="submit" ${full ? 'disabled' : ''}>${full ? 'Course full' : 'Register'}</button></form><div id="regOut"></div>` : ''}
    ${sourceLabel(r.data.source)}`;
  const f = $('#regForm');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
    const body = f.section ? { section: f.section.value } : {};
    const x = await api('POST', `/catalog/courses/${encodeURIComponent(c.code)}/register`, body);
    btn.disabled = false; btn.textContent = 'Register';
    const out = $('#regOut');
    if (x.ok) out.innerHTML = `<div class="banner ok">${icon('check')}<div><b>Registration ${esc(x.data.status)}</b>${x.data.message ? `<br>${esc(x.data.message)}` : ''}</div></div>`;
    else if (x.status === 409 || x.status === 400) out.innerHTML = `<div class="banner bad">${icon('x')}<div><b>Registration rejected</b><br>${esc(x.data?.message || errMsg(x))}</div></div>`;
    else { out.innerHTML = unavailable(x, 'Enrollment service'); onRetry(out, () => f.requestSubmit()); }
  };
}

// ---------- student: weekly timetable ----------
async function viewTimetable(el) {
  el.innerHTML = `<h2>Weekly timetable</h2><p class="sub">Your classes this week.</p><div class="card" id="tt">${skeleton(5)}</div>`;
  const r = await api('GET', '/me/timetable');
  if (!$('#tt')) return;
  if (!r.ok) { $('#tt').innerHTML = unavailable(r, 'Timetable'); onRetry($('#tt'), () => viewTimetable(el)); return; }
  const classes = r.data.classes;
  if (!classes.length) { $('#tt').innerHTML = emptyState('No classes yet', 'Register for courses and your timetable will appear here.', '<a class="btn sm" href="#/courses">Browse courses</a>') + sourceLabel(r.data.source); return; }
  const week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = week.filter((d, i) => i < 5 || classes.some((c) => c.day === d));
  const byDay = (d) => classes.filter((c) => c.day === d).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const unscheduled = classes.filter((c) => !c.day);
  $('#tt').innerHTML = `<div class="week" style="--days:${days.length}">${days.map((d) => `<div class="day ${d === todayKey() ? 'today' : ''}">
      <div class="day-h">${d}${d === todayKey() ? ' <span class="badge accent">Today</span>' : ''}</div>
      ${byDay(d).map((c) => `<div class="slot"><span class="mono time">${esc(c.start || '')}${c.end ? `–${esc(c.end)}` : ''}</span>
        <b>${esc(c.courseCode || '')}</b><span>${esc(c.title || '')}</span><span class="sub">${esc(c.room || 'Room TBA')}</span></div>`).join('') || '<div class="sub free">No classes</div>'}
    </div>`).join('')}</div>
    ${unscheduled.length ? `<p class="sub">Not yet scheduled: ${unscheduled.map((c) => esc(c.courseCode || c.title)).join(', ')}</p>` : ''}
    ${sourceLabel(r.data.source)}`;
}

// ---------- student: grades ----------
async function viewGrades(el) {
  el.innerHTML = `<h2>Grades</h2><p class="sub">Per-semester and cumulative GPA.</p><div id="gr">${skeleton(5)}</div>`;
  const r = await api('GET', '/me/grades');
  if (!$('#gr')) return;
  if (!r.ok) { $('#gr').innerHTML = `<div class="card">${unavailable(r, 'Grades')}</div>`; onRetry($('#gr'), () => viewGrades(el)); return; }
  const { terms, cumulative } = r.data;
  if (!terms.length) { $('#gr').innerHTML = `<div class="card">${emptyState('No grades yet', 'Grades appear here once they are released.')}${sourceLabel(r.data.source)}</div>`; return; }
  $('#gr').innerHTML = `<div class="card gpa-card">
      <div><span class="sub">Cumulative GPA</span><div class="gpa">${cumulative.gpa ?? '—'}</div></div>
      <div><span class="sub">Credits counted</span><div class="gpa sm">${cumulative.credits}</div></div>
      <div class="row" style="margin-left:auto"><button class="btn sm" id="csvBtn">Download transcript (CSV)</button><button class="btn sm" id="printBtn">Print</button></div>
    </div>
    ${terms.map((t) => `<div class="card" style="margin-top:16px"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">${esc(t.term)}</h3><span>GPA <b>${t.gpa ?? '—'}</b> <span class="sub">· ${t.credits} credits</span></span></div>
      <div class="table-wrap"><table><thead><tr><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th></tr></thead>
      <tbody>${t.courses.map((c) => `<tr><td class="mono">${esc(c.courseCode || '—')}</td><td>${esc(c.title || '—')}</td><td>${c.credits ?? '—'}</td><td><b>${esc(c.grade || '—')}</b></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
    ${sourceLabel(r.data.source)}`;
  $('#printBtn').onclick = () => window.print();
  $('#csvBtn').onclick = () => {
    const rows = [['Term', 'Course', 'Title', 'Credits', 'Grade']];
    terms.forEach((t) => t.courses.forEach((c) => rows.push([t.term, c.courseCode, c.title, c.credits, c.grade])));
    rows.push([], ['Cumulative GPA', cumulative.gpa, '', cumulative.credits, '']);
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `transcript-${session.sub}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

// ---------- settings: password, privacy, notifications ----------
async function viewSettings(el) {
  el.innerHTML = `<h2>Settings</h2><p class="sub">Password, privacy and notifications.</p>
    <div class="settings">
      <div class="card"><h3>Password</h3>
        <form id="pwForm" novalidate>
          <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required><small class="ferr" data-f="currentPassword"></small></label>
          <label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required><small class="ferr" data-f="newPassword"></small></label>
          <label>Confirm new password<input name="confirm" type="password" autocomplete="new-password" required><small class="ferr" data-f="confirm"></small></label>
          <div class="row"><button class="btn primary" type="submit">Change password</button></div>
          <p class="err" data-err></p>
        </form></div>
      <div class="card"><h3>Privacy</h3>
        <p style="margin-top:0">You decide which campus services can read your claims. Your email and photo are never shared.</p>
        <a class="btn sm" href="#/consent">Manage sharing</a>
        <p class="sub" style="margin:14px 0 0">Your verification QR (on the Dashboard) shows only "Valid" and "Currently enrolled".</p></div>
      <div class="card"><h3>Notifications</h3><div id="nset">${skeleton(3)}</div></div>
    </div>`;
  const f = $('#pwForm');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fields = {};
    if (!f.currentPassword.value) fields.currentPassword = 'Required';
    if (f.newPassword.value.length < 8) fields.newPassword = 'At least 8 characters';
    else if (f.newPassword.value === f.currentPassword.value) fields.newPassword = 'Must be different from the current password';
    if (f.confirm.value !== f.newPassword.value) fields.confirm = 'Passwords do not match';
    showFieldErrors(f, fields);
    if (Object.keys(fields).length) return;
    busy(f, true);
    const r = await api('POST', '/auth/change-password', { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value });
    busy(f, false);
    if (!r.ok) { showFieldErrors(f, r.data?.fields || {}); return (f.querySelector('[data-err]').textContent = r.data?.fields ? '' : errMsg(r)); }
    f.reset(); f.querySelector('[data-err]').textContent = ''; toast('Password changed');
  };

  const r = await api('GET', '/me/settings');
  if (!$('#nset')) return;
  if (!r.ok) { $('#nset').innerHTML = `<p class="sub">${esc(errMsg(r))}</p>`; return; }
  const OPTS = [['notifyEnrollment', 'Registration approved or rejected'], ['notifyAnnouncements', 'New announcements'], ['notifyAccount', 'Account changes (role, suspension, password reset)']];
  $('#nset').innerHTML = `<p class="sub" style="margin-top:0">Choose which alerts appear on your Dashboard.</p>${OPTS.map(([k, label]) =>
    `<label class="switch"><input type="checkbox" data-k="${k}" ${r.data[k] ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}`;
  $('#nset').onchange = async (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const u = await api('PUT', '/me/settings', { [k]: e.target.checked });
    if (!u.ok) { e.target.checked = !e.target.checked; return toast(errMsg(u)); }
    toast('Saved');
  };
}

// ---------- admin: dashboard ----------
async function viewAdmin(el) {
  el.innerHTML = `<h2>Admin dashboard</h2><p class="sub">Student Identity at a glance.</p>
    <div id="stats" class="tiles">${'<div class="tile">' + skeleton(2) + '</div>'.repeat(1)}</div>
    <div class="grid" style="margin-top:16px">
      <div class="card"><h3>Connected services</h3><div id="integ">${skeleton(3)}</div></div>
      <div class="card"><h3>Announcements</h3>
        <form id="annForm"><label>Title<input name="title" maxlength="140" required></label>
          <label>Message<textarea name="body" rows="3" maxlength="2000"></textarea></label>
          <div class="row"><button class="btn primary sm" type="submit">Post</button></div></form>
        <div id="annList" style="margin-top:12px">${skeleton(2)}</div></div>
    </div>`;
  const s = await api('GET', '/admin/stats');
  if (!$('#stats')) return;
  if (!s.ok) { $('#stats').innerHTML = `<div class="card">${emptyState('Couldn\'t load stats', esc(errMsg(s)), '<button class="btn sm" data-retry>Try again</button>', 'x')}</div>`; onRetry($('#stats'), () => viewAdmin(el)); }
  else {
    const d = s.data;
    const tile = (label, value, sub = '', href = '') => `<${href ? `a href="${href}"` : 'div'} class="tile"><span class="sub">${label}</span><b>${value}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</${href ? 'a' : 'div'}>`;
    $('#stats').innerHTML = [
      tile('Students', d.students, `${d.completeProfiles} with complete profile${d.completeProfiles === 1 ? '' : 's'}`, '#/students'),
      tile('Sign-in accounts', d.accounts, d.suspended ? `<span class="t-bad">${d.suspended} suspended</span>` : 'none suspended', '#/users'),
      tile('Staff · Instructors', `${d.staff} · ${d.instructors}`, '', '#/roles'),
      tile('Consents granted', d.consentsGranted, `${d.serviceClients} service client${d.serviceClients === 1 ? '' : 's'}`, '#/clients'),
      tile('Audit events (24h)', d.auditLast24h, d.deniedLast24h ? `<span class="t-bad">${d.deniedLast24h} denied</span>` : 'no denials', '#/audit'),
    ].join('');
    $('#integ').innerHTML = `<ul class="list">${Object.values(d.integrations).map((i) => `<li><span>${esc(i.name)}</span>
      ${i.configured ? '<span class="badge ok">Connected</span>' : '<span class="badge">Not connected</span>'}</li>`).join('')}</ul>
      <p class="sub" style="margin:10px 0 0">Set <code>COURSE_CATALOG_URL</code>, <code>ENROLLMENT_URL</code>, <code>TIMETABLE_URL</code>, <code>GRADES_URL</code> on Render to connect.</p>`;
  }
  const loadAnn = async () => {
    const a = await api('GET', '/announcements');
    if (!$('#annList')) return;
    $('#annList').innerHTML = !a.ok ? `<p class="err">${esc(errMsg(a))}</p>` : !a.data.length ? '<p class="sub">No announcements yet.</p>'
      : `<ul class="news">${a.data.map((x) => `<li><div style="flex:1"><b>${esc(x.title)}</b>${x.body ? `<p>${esc(x.body)}</p>` : ''}<span class="sub">${esc(fmtDate(x.created_at))} · ${esc(x.created_by || '')}</span></div>
        <button class="btn sm danger" data-del="${esc(x.id)}">Delete</button></li>`).join('')}</ul>`;
  };
  $('#annForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const r = await api('POST', '/announcements', { title: f.title.value.trim(), body: f.body.value.trim() });
    if (!r.ok) return toast(errMsg(r));
    f.reset(); toast('Posted'); loadAnn();
  };
  $('#annList').onclick = async (e) => {
    const id = e.target.dataset.del; if (!id || !confirm('Delete this announcement?')) return;
    const r = await api('DELETE', `/announcements/${encodeURIComponent(id)}`);
    r.ok ? loadAnn() : toast(errMsg(r));
  };
  loadAnn();
}

// ---------- admin: users ----------
async function viewUsers(el) {
  el.innerHTML = `<h2>Users</h2><p class="sub">Sign-in accounts. Suspend access or reset a forgotten password.</p>
    <div class="card"><div class="row" style="margin-bottom:12px"><label>Search<input id="uq" placeholder="ID, name or email" autocomplete="off"></label>
      <label style="flex:0 0 160px">Status<select id="us"><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
      <button class="btn" id="ur">Refresh</button></div>
      <div id="uOut"></div><div class="table-wrap" id="ut">${skeleton(4)}</div></div>`;
  let users = [];
  const load = async () => {
    const r = await api('GET', '/admin/users');
    if (!$('#ut')) return;
    if (!r.ok) { $('#ut').innerHTML = emptyState('Couldn\'t load users', esc(errMsg(r)), '<button class="btn sm" data-retry>Try again</button>', 'x'); onRetry($('#ut'), load); return; }
    users = r.data; draw();
  };
  const draw = () => {
    const q = $('#uq').value.trim().toLowerCase(), st = $('#us').value;
    const list = users.filter((u) => (!q || `${u.subject} ${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q))
      && (!st || (st === 'suspended') === u.suspended));
    $('#ut').innerHTML = !users.length ? emptyState('No accounts yet', 'Accounts appear when students sign up.')
      : !list.length ? emptyState('No users match', 'Try a different search or status.')
      : `<table><thead><tr><th>Subject</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${list.map((u) => `<tr>
        <td class="mono">${esc(u.subject)}</td><td>${esc(u.name || '—')}<br><span class="sub">${esc(u.email || '')}</span></td><td>${roleBadge(u.role)}</td>
        <td>${u.suspended ? `<span class="badge bad">Suspended</span><br><span class="sub">by ${esc(u.suspendedBy || '?')}</span>` : '<span class="badge ok">Active</span>'}</td>
        <td class="actions">${u.subject === session.sub ? '<span class="sub">You</span>' : `
          <button class="btn sm" data-reset="${esc(u.subject)}">Reset password</button>
          <button class="btn sm ${u.suspended ? '' : 'danger'}" data-${u.suspended ? 'react' : 'susp'}="${esc(u.subject)}">${u.suspended ? 'Reactivate' : 'Suspend'}</button>`}</td></tr>`).join('')}</tbody></table>`;
  };
  $('#uq').oninput = draw; $('#us').onchange = draw; $('#ur').onclick = load;
  $('#ut').onclick = async (e) => {
    const d = e.target.dataset;
    if (d.susp && confirm(`Suspend ${d.susp}? They'll be signed out everywhere and can't sign in.`)) {
      const r = await api('POST', `/admin/users/${encodeURIComponent(d.susp)}/suspend`); r.ok ? (toast(`Suspended ${d.susp}`), load()) : toast(errMsg(r));
    }
    if (d.react) { const r = await api('POST', `/admin/users/${encodeURIComponent(d.react)}/reactivate`); r.ok ? (toast(`Reactivated ${d.react}`), load()) : toast(errMsg(r)); }
    if (d.reset && confirm(`Reset the password for ${d.reset}? Their current password stops working.`)) {
      const r = await api('POST', `/admin/users/${encodeURIComponent(d.reset)}/reset-password`);
      if (!r.ok) return toast(errMsg(r));
      $('#uOut').innerHTML = `<div class="keybox" style="margin:0 0 16px"><p style="margin:0 0 8px"><b>Temporary password for ${esc(d.reset)}</b> — give it to them in person. They should change it in Settings.</p>
        <div class="row"><input class="mono" readonly value="${esc(r.data.temporaryPassword)}" id="tmpPw"><button class="btn" type="button" id="copyPw">Copy</button></div></div>`;
      $('#copyPw').onclick = async () => { try { await navigator.clipboard.writeText(r.data.temporaryPassword); toast('Copied'); } catch { $('#tmpPw').select(); } };
    }
  };
  load();
}

// ---------- admin: synced courses (read-only) ----------
async function viewSynced(el) {
  el.innerHTML = `<h2>Synced courses</h2><p class="sub">Read-only. Course Catalog owns this data — edit courses in their system.</p>
    <div class="card"><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px"><span class="sub" id="syncAt"></span>
      <button class="btn sm" id="sr">Sync now</button></div><div class="table-wrap" id="st">${skeleton(5)}</div><div id="ssrc"></div></div>`;
  const load = async () => {
    $('#st').innerHTML = skeleton(5);
    const r = await api('GET', '/admin/courses');
    if (!$('#st')) return;
    if (!r.ok) { $('#st').innerHTML = unavailable(r); $('#syncAt').textContent = ''; onRetry($('#st'), load); return; }
    $('#syncAt').textContent = `${r.data.courses.length} courses · last synced ${fmtDate(r.data.fetchedAt)}`;
    $('#ssrc').innerHTML = sourceLabel(r.data.source);
    $('#st').innerHTML = !r.data.courses.length ? emptyState('No courses yet', 'Course Catalog hasn\'t published any courses.') : `<table>
      <thead><tr><th>Code</th><th>Title</th><th>Status</th><th>Credits</th><th>Department</th><th>Prerequisites</th><th>Seats left</th></tr></thead>
      <tbody>${r.data.courses.map((c) => `<tr><td class="mono">${esc(c.code)}</td><td>${esc(c.title)}</td>
        <td>${c.status ? `<span class="badge ${c.status === 'published' ? 'ok' : c.status === 'draft' ? 'warn' : ''}">${esc(c.status)}</span>` : '—'}</td>
        <td>${c.credits ?? '—'}</td><td>${esc(c.faculty || '—')}</td>
        <td class="mono">${esc(c.prerequisites.join(', ') || '—')}</td><td>${c.seatsLeft ?? '—'}</td></tr>`).join('')}</tbody></table>`;
  };
  $('#sr').onclick = load;
  load();
}

// ---------- admin: audit log ----------
async function viewAudit(el) {
  el.innerHTML = `<h2>Audit log</h2><p class="sub">Who did what — every allow and deny, newest first.</p>
    <div class="card"><form id="af" class="row" style="margin-bottom:12px">
      <label>Actor<input name="actor" autocomplete="off"></label><label>Action<input name="action" autocomplete="off"></label>
      <label style="flex:0 0 160px">Result<select name="result"><option value="">All</option><option value="allow">Allowed</option><option value="deny">Denied</option></select></label>
      <button class="btn" type="submit">Filter</button></form>
      <div class="table-wrap" id="at">${skeleton(6)}</div></div>`;
  const load = async () => {
    const f = $('#af');
    const q = new URLSearchParams({ actor: f.actor.value.trim(), action: f.action.value.trim(), result: f.result.value, limit: 300 });
    const r = await api('GET', `/admin/audit?${q}`);
    if (!$('#at')) return;
    if (!r.ok) { $('#at').innerHTML = emptyState('Couldn\'t load the audit log', esc(errMsg(r)), '<button class="btn sm" data-retry>Try again</button>', 'x'); onRetry($('#at'), load); return; }
    $('#at').innerHTML = !r.data.length ? emptyState('No events match', 'Try different filters.') : `<table class="audit">
      <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Result</th></tr></thead>
      <tbody>${r.data.map((e) => `<tr><td class="sub">${esc(fmtDate(e.timestamp || e.created_at))}</td><td class="mono">${esc(e.actor || '—')}</td>
        <td>${esc(e.action)}</td><td class="mono wrap">${esc(e.resource)}</td>
        <td><span class="badge ${String(e.result).startsWith('deny') ? 'bad' : 'ok'}">${esc(e.result)}</span></td></tr>`).join('')}</tbody></table>`;
  };
  $('#af').onsubmit = (e) => { e.preventDefault(); load(); };
  load();
}
