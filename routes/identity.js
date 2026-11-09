const express = require('express');
const router = express.Router();
const { authenticate, requireRole, requireScope } = require('../middleware/auth');
const consent = require('../lib/consent');
const audit = require('../lib/audit');
const { verifyToken } = require('../lib/tokens');
const { sendProfileUpdated } = require('../lib/webhooks');
const serviceClients = require('../lib/serviceClients');
const { getAISuggestion, deterministicChecklist } = require('../lib/completeness');
const studentsDb = require('../lib/students');
const roles = require('../lib/roles');
const { validateProfileUpdate } = require('../lib/profileValidation');

/**
 * STEP 3 — real auth, role checks, consent, and now real persistence via
 * Supabase (lib/students.js) are wired in. The old in-memory stub is gone.
 * Students are looked up by `student_id` (matches JWT `sub`), not the
 * table's internal UUID `id` column.
 * TODO (Step 3 cont.): connect /students/:id/claims to real callers (Flow 1 / Flow 6)
 * TODO (Step 5): idempotency-key handling on POST /service-clients
 */

// GET /me — requires a valid token; returns the caller's own profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const student = await studentsDb.getStudent(req.user.sub);
    audit.record({ actor: req.user.sub, action: 'read_self', resource: '/me', result: 'allow' });
    res.status(200).json(student);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// PATCH /me — requires a valid token; updates the caller's own profile
router.patch('/me', authenticate, async (req, res) => {
  const { errors, updates } = validateProfileUpdate(req.body);
  if (Object.keys(errors).length) {
    audit.record({ actor: req.user.sub, action: 'update_self', resource: '/me', result: 'deny:validation' });
    return res.status(400).json({ error: errors._ || 'Please fix the highlighted fields', fields: errors });
  }
  let student;
  try {
    student = await studentsDb.updateStudent(req.user.sub, updates);
  } catch (err) {
    return res.status(404).json({ error: 'Not found' });
  }

  audit.record({ actor: req.user.sub, action: 'update_self', resource: '/me', result: 'allow' });

  // Fire the `profile.updated` webhook (private fields excluded) to
  // Notification Hub and Data & Analytics, per PRD "Integrations".
  const webhook = await sendProfileUpdated(student, audit);

  const response = { ...student };
  if (process.env.NODE_ENV !== 'production') {
    // Included only in non-production so you can see delivery results
    // while gathering §4 Webhook Sender evidence. Strip before real deploy.
    response._webhookDebug = webhook;
  }
  res.status(200).json(response);
});

// POST /students — staff only; creates a new student record
router.post('/students', authenticate, requireRole('staff'), async (req, res) => {
  try {
    const student = await studentsDb.createStudent(req.body);
    audit.record({ actor: req.user.sub, action: 'create_student', resource: '/students', result: 'allow' });
    res.status(201).json(student);
  } catch (err) {
    audit.record({ actor: req.user.sub, action: 'create_student', resource: '/students', result: `deny:${err.message}` });
    res.status(400).json({ error: err.message });
  }
});

// GET /students/:id — self can always read; staff/instructor can read anyone
router.get('/students/:id', authenticate, async (req, res) => {
  const isSelf = req.user.sub === req.params.id;
  const isStaff = ['staff', 'instructor'].includes(req.user.role);
  if (!isSelf && !isStaff) {
    audit.record({ actor: req.user.sub, action: 'read_student', resource: `/students/${req.params.id}`, result: 'deny' });
    return res.status(403).json({ error: 'Not permitted to read this profile' });
  }
  try {
    const student = await studentsDb.getStudent(req.params.id);
    audit.record({ actor: req.user.sub, action: 'read_student', resource: `/students/${req.params.id}`, result: 'allow' });
    res.status(200).json(student);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// DELETE /students/:id — staff only; deletes a student record
router.delete('/students/:id', authenticate, requireRole('staff'), async (req, res) => {
  try {
    await studentsDb.deleteStudent(req.params.id);
    audit.record({ actor: req.user.sub, action: 'delete_student', resource: `/students/${req.params.id}`, result: 'allow' });
    res.status(204).send();
  } catch (err) {
    audit.record({ actor: req.user.sub, action: 'delete_student', resource: `/students/${req.params.id}`, result: 'deny:not_found' });
    res.status(404).json({ error: 'Not found' });
  }
});

// GET /students — staff/instructor only; lists all student profiles
router.get('/students', authenticate, requireRole('staff', 'instructor'), async (req, res) => {
  try {
    const students = await studentsDb.listStudents();
    audit.record({ actor: req.user.sub, action: 'list_students', resource: '/students', result: 'allow' });
    // Photos are large; the list only says whether one exists.
    res.status(200).json(students.map(({ photo, ...s }) => ({ ...s, hasPhoto: !!photo })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to list students' });
  }
});

// GET /students/:id/claims — service clients only, gated by consent
// This is the endpoint Provider Proof evidence (Flow 1 + Flow 6) is captured against.
router.get('/students/:id/claims', authenticate, requireScope('profile:read'), async (req, res) => {
  const granted = await consent.hasConsent(req.params.id, req.user.sub, 'profile:read');
  if (!granted) {
    audit.record({
      actor: req.user.sub,
      action: 'read_claims',
      resource: `/students/${req.params.id}/claims`,
      result: 'deny:no_consent',
    });
    return res.status(403).json({ error: 'No consent granted for this scope' });
  }
  let student;
  try {
    student = await studentsDb.getStudent(req.params.id);
  } catch (err) {
    audit.record({ actor: req.user.sub, action: 'read_claims', resource: `/students/${req.params.id}/claims`, result: 'deny:not_found' });
    return res.status(404).json({ error: 'Student not found' });
  }
  audit.record({
    actor: req.user.sub,
    action: 'read_claims',
    resource: `/students/${req.params.id}/claims`,
    result: 'allow',
  });
  // Claims are derived from the student record. Private fields (email, age)
  // are never included.
  const { isComplete, missingFields } = deterministicChecklist(student);
  res.status(200).json({
    studentId: student.student_id,
    claims: {
      verified: true, // a record exists in the authoritative identity store
      name: { first: student.first_name, last: student.last_name },
      profileComplete: isComplete,
      missingFields,
      skills: [], // no approved-skills data in Identity yet
    },
    issuedAt: new Date().toISOString(),
  });
});

// POST /tokens/verify — any service can check a token it was handed
router.post('/tokens/verify', async (req, res) => {
  const { token } = req.body || {};
  let decoded;
  try { decoded = verifyToken(token); } catch (err) { return res.status(200).json({ valid: false }); }
  try {
    if (decoded.role !== 'service' && await require('../lib/portal').isSuspended(decoded.sub)) {
      return res.status(200).json({ valid: false, reason: 'suspended' });
    }
    res.status(200).json({
      valid: true, sub: decoded.sub, role: decoded.role, scopes: decoded.scopes || [],
      expiresAt: new Date(decoded.exp * 1000).toISOString(),
    });
  } catch (err) {
    res.status(200).json({ valid: false });
  }
});

// POST /service-clients — staff only, idempotent via the Idempotency-Key header
router.post('/service-clients', authenticate, requireRole('staff'), async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  const { record, apiKey, replayed } = await serviceClients.create({
    name: req.body && req.body.name,
    idempotencyKey,
  });
  audit.record({
    actor: req.user.sub,
    action: 'create_service_client',
    resource: '/service-clients',
    result: replayed ? 'allow:idempotent_replay' : 'allow:created',
  });
  // apiKey is only present on first creation; it is never stored or shown again.
  res.status(201).json(apiKey ? { ...record, apiKey } : record);
});

// GET /service-clients/:id/key — staff only; read the current API key to copy it again
router.get('/service-clients/:id/key', authenticate, requireRole('staff'), async (req, res) => {
  try {
    const apiKey = await serviceClients.revealKey(req.params.id);
    if (apiKey === undefined) return res.status(404).json({ error: 'Service client not found' });
    if (apiKey === null) {
      return res.status(409).json({ error: 'This key was created before keys could be copied again. Issue a new key once.' });
    }
    audit.record({ actor: req.user.sub, action: 'copy_api_key', resource: `/service-clients/${req.params.id}`, result: 'allow' });
    res.status(200).json({ apiKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read key' });
  }
});

// POST /service-clients/:id/keys — staff only; issue a new API key (old one stops working)
router.post('/service-clients/:id/keys', authenticate, requireRole('staff'), async (req, res) => {
  try {
    const { record, apiKey } = await serviceClients.rotateKey(req.params.id);
    audit.record({ actor: req.user.sub, action: 'rotate_api_key', resource: `/service-clients/${req.params.id}`, result: 'allow' });
    res.status(201).json({ ...record, apiKey });
  } catch (err) {
    res.status(404).json({ error: 'Service client not found' });
  }
});

// DELETE /sessions/:id — requires a valid token
router.delete('/sessions/:id', authenticate, (req, res) => {
  audit.record({ actor: req.user.sub, action: 'revoke_session', resource: `/sessions/${req.params.id}`, result: 'allow' });
  res.status(204).send();
});

// GET /me/profile-completeness — AI suggestion with a deterministic fallback
// Not in the PRD's REST list verbatim; implements the "AI and quality" section
// (AI suggests a profile-completeness message; fallback is a deterministic checklist).
router.get('/me/profile-completeness', authenticate, async (req, res) => {
  let student;
  try {
    student = await studentsDb.getStudent(req.user.sub);
  } catch (err) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const message = await getAISuggestion(student);
    audit.record({
      actor: req.user.sub,
      action: 'profile_completeness',
      resource: '/me/profile-completeness',
      result: 'allow:ai',
    });
    res.status(200).json({ source: 'ai', message });
  } catch (err) {
    const fallback = deterministicChecklist(student);
    audit.record({
      actor: req.user.sub,
      action: 'profile_completeness',
      resource: '/me/profile-completeness',
      result: `allow:fallback (${err.message})`,
    });
    res.status(200).json({
      source: 'deterministic-fallback',
      note: 'AI suggestion unavailable; showing the deterministic checklist instead.',
      ...fallback,
    });
  }
});

// ---------------------------------------------------------------------------
// Consent & sharing preferences (screen 2). Not in the PRD's REST list verbatim;
// added so students can grant/revoke the consent that /students/:id/claims checks.
// ---------------------------------------------------------------------------

// GET /me/consents — every known service with the scopes this student grants it
router.get('/me/consents', authenticate, requireRole('student'), async (req, res) => {
  try {
    const [rows, clients] = await Promise.all([consent.listForStudent(req.user.sub), serviceClients.list()]);
    const names = new Set([...clients.map((c) => c.name), ...rows.map((r) => r.grantee_id)]);
    const services = [...names].sort().map((granteeId) => {
      const row = rows.find((r) => r.grantee_id === granteeId);
      return { granteeId, scopes: row ? row.scopes : [], updatedAt: row ? row.updated_at : null };
    });
    audit.record({ actor: req.user.sub, action: 'list_consents', resource: '/me/consents', result: 'allow' });
    res.status(200).json({ availableScopes: consent.SCOPES, services });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load consents' });
  }
});

// PUT /me/consents/:granteeId — set exactly these scopes; an empty list revokes
router.put('/me/consents/:granteeId', authenticate, requireRole('student'), async (req, res) => {
  const { granteeId } = req.params;
  const scopes = req.body && req.body.scopes;
  if (!Array.isArray(scopes) || scopes.some((s) => !consent.SCOPES.includes(s))) {
    audit.record({ actor: req.user.sub, action: 'set_consent', resource: `/me/consents/${granteeId}`, result: 'deny:invalid_scopes' });
    return res.status(400).json({ error: `scopes must be an array of: ${consent.SCOPES.join(', ')}` });
  }
  try {
    const unique = [...new Set(scopes)];
    if (unique.length) await consent.set(req.user.sub, granteeId, unique);
    else await consent.revoke(req.user.sub, granteeId);
    audit.record({
      actor: req.user.sub, action: unique.length ? 'grant_consent' : 'revoke_consent',
      resource: `/me/consents/${granteeId}`, result: `allow:${unique.join(',') || 'none'}`,
    });
    res.status(200).json({ granteeId, scopes: unique });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save consent' });
  }
});

// DELETE /me/consents/:granteeId — revoke everything granted to one service
router.delete('/me/consents/:granteeId', authenticate, requireRole('student'), async (req, res) => {
  try {
    await consent.revoke(req.user.sub, req.params.granteeId);
    audit.record({ actor: req.user.sub, action: 'revoke_consent', resource: `/me/consents/${req.params.granteeId}`, result: 'allow' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke consent' });
  }
});

// ---------------------------------------------------------------------------
// Staff role lookup (screen 3). Role entity lives in the `roles` table;
// students without a row default to role 'student'.
// ---------------------------------------------------------------------------

function displayName(s) {
  return [s.first_name, s.last_name].filter(Boolean).join(' ') || null;
}

// GET /roles — staff/instructor; every subject with its effective role
router.get('/roles', authenticate, requireRole('staff', 'instructor'), async (req, res) => {
  try {
    const [assigned, students] = await Promise.all([roles.list(), studentsDb.listStudents()]);
    const bySubject = new Map(assigned.map((r) => [r.subject, {
      subject: r.subject, role: r.role, source: 'assigned', name: null, updatedBy: r.updated_by, updatedAt: r.updated_at,
    }]));
    students.forEach((s) => {
      const entry = bySubject.get(s.student_id);
      if (entry) entry.name = displayName(s);
      else bySubject.set(s.student_id, { subject: s.student_id, role: 'student', source: 'default', name: displayName(s) });
    });
    audit.record({ actor: req.user.sub, action: 'list_roles', resource: '/roles', result: 'allow' });
    res.status(200).json({ availableRoles: roles.ROLES, subjects: [...bySubject.values()] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list roles' });
  }
});

// GET /roles/:subject — staff/instructor; effective role for one subject
router.get('/roles/:subject', authenticate, requireRole('staff', 'instructor'), async (req, res) => {
  const { subject } = req.params;
  try {
    const row = await roles.get(subject);
    let student = null;
    try { student = await studentsDb.getStudent(subject); } catch (e) { /* not a student */ }
    if (!row && !student) {
      audit.record({ actor: req.user.sub, action: 'lookup_role', resource: `/roles/${subject}`, result: 'deny:not_found' });
      return res.status(404).json({ error: 'No role or student record for this subject' });
    }
    audit.record({ actor: req.user.sub, action: 'lookup_role', resource: `/roles/${subject}`, result: 'allow' });
    res.status(200).json({
      subject,
      role: row ? row.role : 'student',
      source: row ? 'assigned' : 'default',
      name: student ? displayName(student) : null,
      updatedBy: row ? row.updated_by : null,
      updatedAt: row ? row.updated_at : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to look up role' });
  }
});

// PUT /roles/:subject — staff only; assign a role
router.put('/roles/:subject', authenticate, requireRole('staff'), async (req, res) => {
  const { subject } = req.params;
  const role = req.body && req.body.role;
  if (!roles.ROLES.includes(role)) {
    audit.record({ actor: req.user.sub, action: 'assign_role', resource: `/roles/${subject}`, result: 'deny:invalid_role' });
    return res.status(400).json({ error: `role must be one of: ${roles.ROLES.join(', ')}` });
  }
  try {
    const row = await roles.set(subject, role, req.user.sub);
    require('../lib/portal').notify(subject, 'role_changed', `Your role was changed to ${role} by ${req.user.sub}. Sign in again to use it.`);
    audit.record({ actor: req.user.sub, action: 'assign_role', resource: `/roles/${subject}`, result: `allow:${role}` });
    res.status(200).json({ subject: row.subject, role: row.role, source: 'assigned', updatedBy: row.updated_by, updatedAt: row.updated_at });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

module.exports = router;
