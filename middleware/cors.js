// CORS so other teams' web frontends can call this API from the browser.
// ALLOWED_ORIGINS: comma-separated list (e.g. "https://course-catalog.onrender.com,http://localhost:5173")
// or "*" (default) — safe here because auth uses Bearer tokens, not cookies.
const ALLOWED = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);

function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.includes('*') || ALLOWED.includes(origin))) {
    res.set('Access-Control-Allow-Origin', ALLOWED.includes('*') ? '*' : origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.set('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

module.exports = cors;
