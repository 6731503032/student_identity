const jwt = require('jsonwebtoken');

// Dev-only secret and symmetric signing (HS256).
// TODO (before shared/staging deploy): move secret to env var / secret manager,
// and consider RS256 (asymmetric keys) if other teams verify tokens themselves
// instead of always calling POST /tokens/verify.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

function issueToken({ sub, role, scopes = [] }) {
  return jwt.sign({ sub, role, scopes }, JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET); // throws if invalid, expired, or tampered
}

module.exports = { issueToken, verifyToken, TOKEN_TTL_SECONDS };
