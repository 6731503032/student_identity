/**
 * Drop-in Express middleware for Course Catalog (Team 02) — or any team —
 * to check users against Student Identity (Team 01).
 *
 *   const { verifyIdentity, requireRole } = require('./identity-auth');
 *   app.get('/courses', listCourses);                                   // public
 *   app.post('/courses', verifyIdentity, requireRole('staff'), create); // staff only
 *   app.patch('/courses/:code', verifyIdentity, requireRole('staff'), update);
 *   app.delete('/courses/:code', verifyIdentity, requireRole('staff'), remove);
 *
 * Env: IDENTITY_URL (default https://student-identity.onrender.com)
 * Needs Node 18+ (built-in fetch). No other dependencies.
 */
const IDENTITY_URL = (process.env.IDENTITY_URL || 'https://student-identity.onrender.com').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.IDENTITY_TIMEOUT_MS || 20000); // Render free tier can take ~50s to wake

async function verifyIdentity(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Sign in with Student Identity first (missing Bearer token)' });
  }
  let result;
  try {
    const r = await fetch(`${IDENTITY_URL}/tokens/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    result = await r.json();
  } catch (err) {
    // Fail closed: never allow an edit when identity can't be confirmed.
    return res.status(503).json({ error: 'Student Identity is unavailable; try again shortly' });
  }
  if (!result || !result.valid) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = { sub: result.sub, role: result.role, scopes: result.scopes || [] };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

module.exports = { verifyIdentity, requireRole };
