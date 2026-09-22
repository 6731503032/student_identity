// Sends the `profile.updated` event to Notification Hub and Data & Analytics
// (per PRD "Integrations"). Uses Node's built-in fetch (Node 18+).

const NOTIFICATION_HUB_URL = process.env.NOTIFICATION_HUB_URL || 'http://localhost:3000/mock/notification-hub';
const DATA_ANALYTICS_URL = process.env.DATA_ANALYTICS_URL || 'http://localhost:3000/mock/data-analytics';

// TODO: confirm this list against the platform's actual data classification —
// this is a placeholder assumption (email withheld; everything else shared).
const PRIVATE_FIELDS = ['email'];

function buildProfileUpdatedPayload(student) {
  const publicFields = {};
  Object.keys(student).forEach((key) => {
    if (!PRIVATE_FIELDS.includes(key)) publicFields[key] = student[key];
  });
  return {
    event: 'profile.updated',
    studentId: student.id,
    data: publicFields,
    emittedAt: new Date().toISOString(),
  };
}

async function sendProfileUpdated(student, audit) {
  const payload = buildProfileUpdatedPayload(student);
  const targets = [
    { name: 'notification-hub', url: NOTIFICATION_HUB_URL },
    { name: 'data-analytics', url: DATA_ANALYTICS_URL },
  ];

  const results = await Promise.all(
    targets.map(async (target) => {
      try {
        const res = await fetch(target.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        audit.record({
          actor: 'student-identity',
          action: 'webhook_send',
          resource: `${target.name} (${target.url})`,
          result: res.ok ? 'allow:delivered' : `deny:status_${res.status}`,
        });
        return { target: target.name, status: res.status, body };
      } catch (err) {
        audit.record({
          actor: 'student-identity',
          action: 'webhook_send',
          resource: `${target.name} (${target.url})`,
          result: `deny:error_${err.message}`,
        });
        return { target: target.name, status: null, error: err.message };
      }
    })
  );

  return { payload, results };
}

module.exports = { buildProfileUpdatedPayload, sendProfileUpdated };
