const { verifyToken } = require('../lib/tokens');
const audit = require('../lib/audit');

// Accepts either a user/service JWT (`Authorization: Bearer <jwt>`) or a
// service API key (`X-API-Key: sik_…`, or `Authorization: Bearer sik_…`).
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  const apiKey = req.headers['x-api-key'] || (scheme === 'Bearer' && token && token.startsWith('sik_') ? token : null);
  if (apiKey) {
    let client = null;
    try { client = await require('../lib/serviceClients').findByApiKey(apiKey); } catch (e) { /* treat as invalid */ }
    if (!client) {
      audit.record({ actor: 'unknown', action: 'authenticate', resource: req.originalUrl, result: 'deny:invalid_api_key' });
      return res.status(401).json({ error: 'Invalid API key' });
    }
    req.user = { sub: client.name, role: 'service', scopes: client.scopes || [], via: 'api_key' };
    return next();
  }
  if (scheme !== 'Bearer' || !token) {
    audit.record({ actor: 'unknown', action: 'authenticate', resource: req.originalUrl, result: 'deny:missing_token' });
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    req.user = verifyToken(token); // { sub, role, scopes, iat, exp }
  } catch (err) {
    audit.record({ actor: 'unknown', action: 'authenticate', resource: req.originalUrl, result: 'deny:invalid_token' });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  // Suspended accounts lose access immediately, not only at the next sign-in.
  if (req.user.role !== 'service') {
    let suspended = false;
    try { suspended = await require('../lib/portal').isSuspended(req.user.sub); } catch (e) { /* fail open on DB hiccup */ }
    if (suspended) {
      audit.record({ actor: req.user.sub, action: 'authenticate', resource: req.originalUrl, result: 'deny:suspended' });
      return res.status(403).json({ error: 'This account is suspended. Contact staff.', code: 'suspended' });
    }
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      audit.record({ actor: req.user && req.user.sub, action: 'authorize_role', resource: req.originalUrl, result: 'deny' });
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.user || !(req.user.scopes || []).includes(scope)) {
      audit.record({ actor: req.user && req.user.sub, action: 'authorize_scope', resource: req.originalUrl, result: 'deny' });
      return res.status(403).json({ error: `Missing required scope: ${scope}` });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, requireScope };
