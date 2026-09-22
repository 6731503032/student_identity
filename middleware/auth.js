const { verifyToken } = require('../lib/tokens');
const audit = require('../lib/audit');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    audit.record({ actor: 'unknown', action: 'authenticate', resource: req.originalUrl, result: 'deny:missing_token' });
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    req.user = verifyToken(token); // { sub, role, scopes, iat, exp }
    next();
  } catch (err) {
    audit.record({ actor: 'unknown', action: 'authenticate', resource: req.originalUrl, result: 'deny:invalid_token' });
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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
