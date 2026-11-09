const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();

const { authenticate, requireRole } = require('../middleware/auth');
const audit = require('../lib/audit');
const studentsDb = require('../lib/students');
const accounts = require('../lib/accounts');
const portal = require('../lib/portal');
const ext = require('../lib/external');
const { deterministicChecklist } = require('../lib/completeness');
const supabase = require('../lib/db');

/**
 * Portal pages (dashboard, courses, timetable, grades, settings, admin,
 * public verify). Course/timetable/grade data is owned by other teams and
 * fetched through lib/external.js; nothing here stores it.
 */

const SETTING_KEYS = { notifyEnrollment: true, notifyAnnouncements: true, notifyAccount: true };

const bearer = (req) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && token && !token.startsWith('sik_') ? token : null;
};

// Turn an adapter error into a response the UI understands.
function sendExternal(res, err, fallbackMsg) {
  if (err instanceof ext.ExternalError) return res.status(err.status).json(err.toJSON());
  console.error(err);
  return res.status(500).json({ error: fallbackMsg });
}

async function getStudentOrNull(id) {
  try { return await studentsDb.getStudent(id); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Which external services are connected (UI shows labels / empty states)
// ---------------------------------------------------------------------------
router.get('/integrations', authenticate, (req, res) => res.json(ext.status()));

// ---------------------------------------------------------------------------
// Courses (Course Catalog, Team 02) and registration (Enrollment, Team 03)
// ---------------------------------------------------------------------------
router.get('/catalog/courses', authenticate, async (req, res) => {
  try {
    const courses = await ext.listCourses({ q: req.query.q, token: bearer(req) });
    res.json({ source: ext.status().catalog.name, fetchedAt: new Date().toISOString(), courses });
  } catch (err) { sendExternal(res, err, 'Failed to load courses'); }
});

router.get('/catalog/courses/:code', authenticate, async (req, res) => {
  try {
    const course = await ext.getCourse(req.params.code, { token: bearer(req) });
    res.json({ source: ext.status().catalog.name, course });
  } catch (err) { sendExternal(res, err, 'Failed to load course'); }
});

router.post('/catalog/courses/:code/register', authenticate, requireRole('student'), async (req, res) => {
  const courseCode = req.params.code;
  const section = req.body && req.body.section ? String(req.body.section) : undefined;
  try {
    const out = await ext.register({ studentId: req.user.sub, courseCode, section, token: bearer(req) });
    const rejected = /reject|denied|fail/.test(out.status);
    audit.record({ actor: req.user.sub, action: 'register_course', resource: `/catalog/courses/${courseCode}`, result: `${rejected ? 'deny' : 'allow'}:${out.status}` });
    await portal.notify(req.user.sub, rejected ? 'enrollment_rejected' : 'enrollment_update',
      `Registration for ${courseCode}: ${out.status}${out.message ? ` — ${out.message}` : ''}`);
    res.status(rejected ? 409 : 200).json({ courseCode, status: out.status, message: out.message });
  } catch (err) {
    if (err instanceof ext.ExternalError && err.code === 'upstream_rejected') {
      audit.record({ actor: req.user.sub, action: 'register_course', resource: `/catalog/courses/${courseCode}`, result: 'deny:rejected' });
      await portal.notify(req.user.sub, 'enrollment_rejected', `Registration for ${courseCode} was rejected — ${err.message}`);
    }
    sendExternal(res, err, 'Registration failed');
  }
});

// Staff: read-only "synced courses" view
router.get('/admin/courses', authenticate, requireRole('staff'), async (req, res) => {
  try {
    const courses = await ext.listCourses({ token: bearer(req) });
    res.json({ source: ext.status().catalog.name, fetchedAt: new Date().toISOString(), courses });
  } catch (err) { sendExternal(res, err, 'Failed to load courses'); }
});

// ---------------------------------------------------------------------------
// Timetable (Team 04) and grades
// ---------------------------------------------------------------------------
router.get('/me/timetable', authenticate, async (req, res) => {
  try {
    const classes = await ext.timetable(req.user.sub, { token: bearer(req) });
    res.json({ source: ext.status().timetable.name, classes });
  } catch (err) { sendExternal(res, err, 'Failed to load timetable'); }
});

router.get('/me/grades', authenticate, async (req, res) => {
  try {
    const g = await ext.grades(req.user.sub, { token: bearer(req) });
    res.json({ source: ext.status().grades.name, ...g });
  } catch (err) { sendExternal(res, err, 'Failed to load grades'); }
});

// ---------------------------------------------------------------------------
// Public verify (QR)
// ---------------------------------------------------------------------------
router.get('/me/verify-qr', authenticate, async (req, res) => {
  const student = await getStudentOrNull(req.user.sub);
  if (!student) return res.status(404).json({ error: 'No student record for this account' });
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const url = `${base.replace(/\/$/, '')}/#/v/${portal.verifyCodeFor(student.student_id)}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  res.json({ url, svg });
});

// Public — shows only valid yes/no and enrolled yes/no/unknown. No name, no ID.
router.get('/verify/:code', async (req, res) => {
  const studentId = portal.studentIdFromCode(req.params.code);
  const checkedAt = new Date().toISOString();
  if (!studentId) {
    audit.record({ actor: 'public', action: 'public_verify', resource: '/verify', result: 'deny:bad_code' });
    return res.status(404).json({ valid: false, enrolled: null, checkedAt });
  }
  const student = await getStudentOrNull(studentId);
  let suspended = false;
  try { suspended = await portal.isSuspended(studentId); } catch (e) { /* treat as not suspended */ }
  const valid = !!student && !suspended;
  let enrolled = null;
  if (valid && ext.configured('enrollment')) {
    try { enrolled = await ext.enrollmentStatus(studentId); } catch (e) { enrolled = null; }
  }
  audit.record({ actor: 'public', action: 'public_verify', resource: `/verify/${studentId}`, result: valid ? 'allow:valid' : 'allow:invalid' });
  res.json({ valid, enrolled, checkedAt });
});

// ---------------------------------------------------------------------------
// Announcements & notifications
// ---------------------------------------------------------------------------
router.get('/announcements', authenticate, async (req, res) => {
  try { res.json(await portal.listAnnouncements()); } catch (err) { res.status(500).json({ error: 'Failed to load announcements' }); }
});

router.post('/announcements', authenticate, requireRole('staff'), async (req, res) => {
  const title = String((req.body && req.body.title) || '').trim();
  const body = String((req.body && req.body.body) || '').trim();
  if (!title || title.length > 140 || body.length > 2000) {
    return res.status(400).json({ error: 'Title is required (max 140 characters); body max 2000', fields: { title: 'Required, max 140 characters' } });
  }
  try {
    const a = await portal.createAnnouncement({ title, body, createdBy: req.user.sub });
    audit.record({ actor: req.user.sub, action: 'create_announcement', resource: '/announcements', result: 'allow' });
    res.status(201).json(a);
  } catch (err) { res.status(500).json({ error: 'Failed to post announcement' }); }
});

router.delete('/announcements/:id', authenticate, requireRole('staff'), async (req, res) => {
  try {
    await portal.deleteAnnouncement(req.params.id);
    audit.record({ actor: req.user.sub, action: 'delete_announcement', resource: `/announcements/${req.params.id}`, result: 'allow' });
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: 'Failed to delete announcement' }); }
});

// Which setting controls which alert kind.
const KIND_SETTING = (kind) => (/^enrollment/.test(kind) ? 'notifyEnrollment' : 'notifyAccount');

router.get('/me/notifications', authenticate, async (req, res) => {
  try {
    const student = await getStudentOrNull(req.user.sub);
    const prefs = { ...SETTING_KEYS, ...((student && student.settings) || {}) };
    const list = (await portal.listNotifications(req.user.sub)).filter((n) => prefs[KIND_SETTING(n.kind)] !== false);
    res.json({ unread: list.filter((n) => !n.read_at).length, notifications: list });
  } catch (err) { res.status(500).json({ error: 'Failed to load notifications' }); }
});

router.post('/me/notifications/read', authenticate, async (req, res) => {
  try { await portal.markAllRead(req.user.sub); res.status(204).send(); } catch (err) { res.status(500).json({ error: 'Failed to update' }); }
});

// ---------------------------------------------------------------------------
// Settings (notification preferences)
// ---------------------------------------------------------------------------

router.get('/me/settings', authenticate, async (req, res) => {
  const student = await getStudentOrNull(req.user.sub);
  if (!student) return res.status(404).json({ error: 'No student record for this account' });
  res.json({ ...SETTING_KEYS, ...(student.settings || {}) });
});

router.put('/me/settings', authenticate, async (req, res) => {
  const body = req.body || {};
  const bad = Object.keys(body).filter((k) => !(k in SETTING_KEYS) || typeof body[k] !== 'boolean');
  if (bad.length) return res.status(400).json({ error: `Unknown or non-boolean settings: ${bad.join(', ')}` });
  const student = await getStudentOrNull(req.user.sub);
  if (!student) return res.status(404).json({ error: 'No student record for this account' });
  try {
    const settings = { ...SETTING_KEYS, ...(student.settings || {}), ...body };
    await studentsDb.updateStudent(req.user.sub, { settings });
    audit.record({ actor: req.user.sub, action: 'update_settings', resource: '/me/settings', result: 'allow' });
    res.json(settings);
  } catch (err) { res.status(500).json({ error: 'Failed to save settings' }); }
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
async function all(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data || [];
}

router.get('/admin/stats', authenticate, requireRole('staff'), async (req, res) => {
  try {
    const [students, accts, roleRows, consents, clients, events] = await Promise.all(
      ['students', 'accounts', 'roles', 'consents', 'service_clients', 'audit_events'].map(all));
    const dayAgo = Date.now() - 864e5;
    const recent = events.filter((e) => new Date(e.timestamp || e.created_at || 0).getTime() > dayAgo);
    res.json({
      students: students.length,
      completeProfiles: students.filter((s) => deterministicChecklist(s).isComplete).length,
      accounts: accts.length,
      suspended: accts.filter((a) => a.suspended_at).length,
      staff: roleRows.filter((r) => r.role === 'staff').length,
      instructors: roleRows.filter((r) => r.role === 'instructor').length,
      consentsGranted: consents.filter((c) => (c.scopes || []).length).length,
      serviceClients: clients.length,
      auditLast24h: recent.length,
      deniedLast24h: recent.filter((e) => String(e.result).startsWith('deny')).length,
      integrations: ext.status(),
    });
  } catch (err) { res.status(500).json({ error: 'Failed to load stats' }); }
});

router.get('/admin/users', authenticate, requireRole('staff'), async (req, res) => {
  try {
    const [accts, students, roleRows] = await Promise.all(['accounts', 'students', 'roles'].map(all));
    const q = String(req.query.q || '').trim().toLowerCase();
    const users = accts.map((a) => {
      const s = students.find((x) => x.student_id === a.subject) || {};
      const r = roleRows.find((x) => x.subject === a.subject);
      return {
        subject: a.subject,
        name: [s.first_name, s.last_name].filter(Boolean).join(' ') || null,
        email: s.email || null,
        role: r ? r.role : 'student',
        suspended: !!a.suspended_at,
        suspendedAt: a.suspended_at || null,
        suspendedBy: a.suspended_by || null,
        createdAt: a.created_at || null,
      };
    }).filter((u) => !q || `${u.subject} ${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q));
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Failed to list users' }); }
});

async function setSuspension(req, res, suspended) {
  const { subject } = req.params;
  if (subject === req.user.sub) return res.status(400).json({ error: "You can't suspend your own account" });
  try {
    const row = await portal.setSuspended(subject, suspended, req.user.sub);
    if (!row) return res.status(404).json({ error: 'No sign-in account for this subject' });
    audit.record({ actor: req.user.sub, action: suspended ? 'suspend_user' : 'reactivate_user', resource: `/admin/users/${subject}`, result: 'allow' });
    await portal.notify(subject, suspended ? 'suspended' : 'reactivated',
      suspended ? `Your account was suspended by ${req.user.sub}.` : `Your account was reactivated by ${req.user.sub}.`);
    res.json({ subject, suspended });
  } catch (err) { res.status(500).json({ error: 'Failed to update account' }); }
}
router.post('/admin/users/:subject/suspend', authenticate, requireRole('staff'), (req, res) => setSuspension(req, res, true));
router.post('/admin/users/:subject/reactivate', authenticate, requireRole('staff'), (req, res) => setSuspension(req, res, false));

// Forgot password without email: staff issue a one-time temporary password.
router.post('/admin/users/:subject/reset-password', authenticate, requireRole('staff'), async (req, res) => {
  const { subject } = req.params;
  try {
    if (!(await accounts.get(subject))) return res.status(404).json({ error: 'No sign-in account for this subject' });
    const temp = require('crypto').randomBytes(6).toString('base64url'); // 8 chars
    await accounts.setPassword(subject, temp);
    audit.record({ actor: req.user.sub, action: 'reset_password', resource: `/admin/users/${subject}`, result: 'allow' });
    await portal.notify(subject, 'password_reset', `Your password was reset by ${req.user.sub}. Change it in Settings.`);
    res.json({ subject, temporaryPassword: temp });
  } catch (err) { res.status(500).json({ error: 'Failed to reset password' }); }
});

router.get('/admin/audit', authenticate, requireRole('staff'), async (req, res) => {
  try {
    const { actor = '', action = '', result = '' } = req.query;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const has = (v, q) => !q || String(v || '').toLowerCase().includes(String(q).toLowerCase());
    const events = (await audit.list())
      .filter((e) => has(e.actor, actor) && has(e.action, action) && has(e.result, result))
      .slice(0, limit);
    res.json(events);
  } catch (err) { res.status(500).json({ error: 'Failed to load audit log' }); }
});

module.exports = router;
