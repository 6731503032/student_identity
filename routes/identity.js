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
  let student;
  try {
    student = await studentsDb.updateStudent(req.user.sub, req.body);
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

// GET /students/:id/claims — service clients only, gated by consent
// This is the endpoint Provider Proof evidence (Flow 1 + Flow 6) is captured against.
router.get('/students/:id/claims', authenticate, requireScope('profile:read'), (req, res) => {
  const granted = consent.hasConsent(req.params.id, req.user.sub, 'profile:read');
  if (!granted) {
    audit.record({
      actor: req.user.sub,
      action: 'read_claims',
      resource: `/students/${req.params.id}/claims`,
      result: 'deny:no_consent',
    });
    return res.status(403).json({ error: 'No consent granted for this scope' });
  }
  audit.record({
    actor: req.user.sub,
    action: 'read_claims',
    resource: `/students/${req.params.id}/claims`,
    result: 'allow',
  });
  res.status(200).json({
    studentId: req.params.id,
    claims: { verified: true, skills: [], profileComplete: false },
    issuedAt: new Date().toISOString(),
  });
});

// POST /tokens/verify — any service can check a token it was handed
router.post('/tokens/verify', (req, res) => {
  const { token } = req.body || {};
  try {
    const decoded = verifyToken(token);
    res.status(200).json({ valid: true, sub: decoded.sub, role: decoded.role, scopes: decoded.scopes || [] });
  } catch (err) {
    res.status(200).json({ valid: false });
  }
});

// POST /service-clients — staff only, idempotent via the Idempotency-Key header
router.post('/service-clients', authenticate, requireRole('staff'), (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'];
  const { record, replayed } = serviceClients.create({
    name: req.body && req.body.name,
    idempotencyKey,
  });
  audit.record({
    actor: req.user.sub,
    action: 'create_service_client',
    resource: '/service-clients',
    result: replayed ? 'allow:idempotent_replay' : 'allow:created',
  });
  res.status(201).json(record);
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

module.exports = router;