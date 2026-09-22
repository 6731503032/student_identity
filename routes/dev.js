const express = require('express');
const router = express.Router();
const { issueToken } = require('../lib/tokens');
const serviceClients = require('../lib/serviceClients');
const aiState = require('../lib/aiState');
const audit = require('../lib/audit');

/**
 * DEV-ONLY HELPER — not part of the PRD's REST list.
 * The PRD assumes tokens exist (OAuth/JWT-style scoped tokens) but doesn't
 * define a sign-in/issue endpoint. This lets you mint a token locally so you
 * can test the protected routes before real sign-in is wired up.
 *
 * TODO: delete this file, or gate it behind NODE_ENV !== 'production'
 * (already done in server.js), before any shared/staging deploy.
 */
router.post('/dev/issue-token', (req, res) => {
  const { sub, role, scopes } = req.body || {};
  if (!sub || !role) {
    return res.status(400).json({ error: 'sub and role are required' });
  }
  const token = issueToken({ sub, role, scopes: scopes || [] });
  res.status(200).json({ token });
});

// DEV-ONLY — stands in for "query the DB" when gathering Idempotency Proof
// evidence, since there's no real database wired up yet.
router.get('/dev/service-clients', (req, res) => {
  const records = serviceClients.list();
  res.status(200).json({ count: records.length, records });
});

// DEV-ONLY — simulate the AI suggestion dependency going down / recovering,
// so Degradation Proof evidence can be captured with exact timestamps
// instead of waiting for a real outage.
router.post('/dev/break-ai', (req, res) => {
  aiState.markBroken();
  const timestamp = new Date().toISOString();
  audit.record({ actor: 'system', action: 'ai_dependency_break', resource: 'ai-suggestion-service', result: 'manual_trigger' });
  res.status(200).json({ broken: true, timestamp });
});

router.post('/dev/fix-ai', (req, res) => {
  aiState.markFixed();
  const timestamp = new Date().toISOString();
  audit.record({ actor: 'system', action: 'ai_dependency_recover', resource: 'ai-suggestion-service', result: 'manual_trigger' });
  res.status(200).json({ broken: false, timestamp });
});

module.exports = router;
