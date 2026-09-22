// In-memory consent store: studentId -> Map(granteeId -> Set(scopes))
// TODO (persistence): replace with the real `Consent` entity/table from the PRD

const store = new Map();

function grant(studentId, granteeId, scopes) {
  if (!store.has(studentId)) store.set(studentId, new Map());
  const grants = store.get(studentId);
  const existing = grants.get(granteeId) || new Set();
  scopes.forEach((s) => existing.add(s));
  grants.set(granteeId, existing);
}

function revoke(studentId, granteeId) {
  const grants = store.get(studentId);
  if (grants) grants.delete(granteeId);
}

function hasConsent(studentId, granteeId, scope) {
  const grants = store.get(studentId);
  if (!grants) return false;
  const scopes = grants.get(granteeId);
  return !!scopes && scopes.has(scope);
}

// Seed data for local testing — student "123" has granted "internship-service"
// permission to read their profile claims. Try any other sub and expect a 403.
grant('123', 'internship-service', ['profile:read']);

module.exports = { grant, revoke, hasConsent };
