// In-memory "table" for registered service clients (PRD entity: ServiceClient)
// TODO (persistence): replace with a real DB table + unique constraint on idempotency_key

const clients = [];
const idempotencyIndex = new Map(); // idempotencyKey -> record

function create({ name, idempotencyKey }) {
  if (idempotencyKey && idempotencyIndex.has(idempotencyKey)) {
    // Same key seen before — return the original record, do NOT create a new row.
    return { record: idempotencyIndex.get(idempotencyKey), replayed: true };
  }

  const record = {
    id: `client-${clients.length + 1}`,
    name: name || 'unnamed-service',
    createdAt: new Date().toISOString(),
  };
  clients.push(record);
  if (idempotencyKey) idempotencyIndex.set(idempotencyKey, record);
  return { record, replayed: false };
}

function list() {
  return clients;
}

module.exports = { create, list };
