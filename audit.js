// TODO (persistence): ship these to a real audit log / SIEM instead of stdout.
// This satisfies the PRD's "audit event" test case for now — every allow/deny
// decision on identity/claims/consent gets recorded.

const events = [];

function record({ actor, action, resource, result }) {
  const entry = { timestamp: new Date().toISOString(), actor, action, resource, result };
  events.push(entry);
  console.log('[audit]', JSON.stringify(entry));
  return entry;
}

module.exports = { record, events };
