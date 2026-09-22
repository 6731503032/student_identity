const aiState = require('./aiState');

// Deterministic checklist — always available, no external dependency.
// This is the fallback per the PRD's "AI and quality" section.
function deterministicChecklist(student) {
  const requiredFields = ['name', 'email', 'role'];
  const missingFields = requiredFields.filter((f) => !student[f]);
  return {
    type: 'deterministic-checklist',
    isComplete: missingFields.length === 0,
    missingFields,
    checklist: requiredFields.map((f) => ({ field: f, present: !!student[f] })),
  };
}

// Simulated AI call — in a real build this would call an LLM API.
// TODO (real integration): replace this with an actual model call, keep the
// same try/catch shape in the route below so the fallback path is unchanged.
async function getAISuggestion(student) {
  if (aiState.isBroken()) {
    throw new Error('AI suggestion service unavailable (simulated outage)');
  }
  const { missingFields } = deterministicChecklist(student);
  if (missingFields.length === 0) {
    return `Your profile looks complete! Nice work, ${student.name}.`;
  }
  return `Hey ${student.name}, your profile is missing: ${missingFields.join(', ')}. Adding these helps services like Internship and Job Board find you.`;
}

module.exports = { getAISuggestion, deterministicChecklist };
