const express = require('express');
const router = express.Router();
const accounts = require('../lib/accounts');
const roles = require('../lib/roles');
const studentsDb = require('../lib/students');
const audit = require('../lib/audit');
const { issueToken, TOKEN_TTL_SECONDS } = require('../lib/tokens');
const { authenticate } = require('../middleware/auth');

/**
 * Sign-up / sign-in for students. The PRD lists a sign-in screen but no
 * sign-in endpoint, so these two routes are additions (see README).
 * The token's role comes from the `roles` table (default 'student'), so a
 * role assigned on the Role lookup screen takes effect at the next sign-in.
 */

const STUDENT_ID = /^\d{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

async function tokenFor(subject) {
  const row = await roles.get(subject);
  const role = row ? row.role : 'student';
  return { token: issueToken({ sub: subject, role, scopes: [] }), role, expiresIn: TOKEN_TTL_SECONDS };
}

// POST /auth/signup — create a student record + credentials, return a token
router.post('/auth/signup', async (req, res) => {
  const body = req.body || {};
  const studentId = String(body.studentId || '').trim();
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const faculty = String(body.faculty || '').trim();

  const errors = {};
  if (!STUDENT_ID.test(studentId)) errors.studentId = 'Student ID must be 10 digits';
  if (!firstName || firstName.length > 100) errors.firstName = 'First name is required';
  if (!lastName || lastName.length > 100) errors.lastName = 'Last name is required';
  if (!EMAIL.test(email)) errors.email = 'Enter a valid email address';
  if (password.length < MIN_PASSWORD) errors.password = `Password must be at least ${MIN_PASSWORD} characters`;
  if (faculty.length > 120) errors.faculty = 'Faculty must be at most 120 characters';
  if (Object.keys(errors).length) {
    audit.record({ actor: studentId || 'unknown', action: 'signup', resource: '/auth/signup', result: 'deny:validation' });
    return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errors });
  }

  try {
    if (await accounts.get(studentId)) {
      audit.record({ actor: studentId, action: 'signup', resource: '/auth/signup', result: 'deny:account_exists' });
      return res.status(409).json({ error: 'An account already exists for this student ID. Sign in instead.' });
    }

    // A staff member may have created the student record already; let the
    // student claim it only if the email matches.
    let existing = null;
    try { existing = await studentsDb.getStudent(studentId); } catch (e) { /* not found */ }
    if (existing && String(existing.email || '').toLowerCase() !== email) {
      audit.record({ actor: studentId, action: 'signup', resource: '/auth/signup', result: 'deny:email_mismatch' });
      return res.status(409).json({ error: 'This student ID is registered with a different email.' });
    }
    if (!existing) {
      try {
        await studentsDb.createStudent({ studentId, firstName, lastName, email });
        if (faculty) await studentsDb.updateStudent(studentId, { faculty });
      } catch (e) {
        audit.record({ actor: studentId, action: 'signup', resource: '/auth/signup', result: 'deny:email_taken' });
        return res.status(409).json({ error: 'This email is already used by another student.' });
      }
    }

    await accounts.create(studentId, password);
    audit.record({ actor: studentId, action: 'signup', resource: '/auth/signup', result: existing ? 'allow:claimed' : 'allow:created' });
    res.status(201).json(await tokenFor(studentId));
  } catch (err) {
    res.status(500).json({ error: 'Sign-up failed. Try again.' });
  }
});

// POST /auth/login — check credentials, return a token with the stored role
router.post('/auth/login', async (req, res) => {
  const studentId = String((req.body && req.body.studentId) || '').trim();
  const password = String((req.body && req.body.password) || '');
  try {
    const account = studentId && password ? await accounts.get(studentId) : null;
    if (!account || !accounts.verifyPassword(password, account.password_hash)) {
      audit.record({ actor: studentId || 'unknown', action: 'login', resource: '/auth/login', result: 'deny:bad_credentials' });
      return res.status(401).json({ error: 'Wrong student ID or password' });
    }
    if (account.suspended_at) {
      audit.record({ actor: studentId, action: 'login', resource: '/auth/login', result: 'deny:suspended' });
      return res.status(403).json({ error: 'This account is suspended. Contact staff.', code: 'suspended' });
    }
    const out = await tokenFor(studentId);
    audit.record({ actor: studentId, action: 'login', resource: '/auth/login', result: `allow:${out.role}` });
    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: 'Sign-in failed. Try again.' });
  }
});

// POST /auth/change-password — signed-in user changes their own password
router.post('/auth/change-password', authenticate, async (req, res) => {
  const subject = req.user.sub;
  const currentPassword = String((req.body && req.body.currentPassword) || '');
  const newPassword = String((req.body && req.body.newPassword) || '');
  if (newPassword.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD} characters`, fields: { newPassword: `At least ${MIN_PASSWORD} characters` } });
  }
  try {
    const account = await accounts.get(subject);
    if (!account) return res.status(404).json({ error: 'This account has no password (it signs in another way)' });
    if (!accounts.verifyPassword(currentPassword, account.password_hash)) {
      audit.record({ actor: subject, action: 'change_password', resource: '/auth/change-password', result: 'deny:wrong_current' });
      return res.status(400).json({ error: 'Current password is incorrect', fields: { currentPassword: 'Incorrect password' } });
    }
    await accounts.setPassword(subject, newPassword);
    audit.record({ actor: subject, action: 'change_password', resource: '/auth/change-password', result: 'allow' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Could not change password. Try again.' });
  }
});

module.exports = router;
