// Validation for PATCH /me. Only these fields are self-editable; anything else
// (student_id, id, created_at, …) is rejected so a student can't rewrite
// their identity or another record's keys.
const EDITABLE = ['first_name', 'last_name', 'email', 'age'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateProfileUpdate(body) {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: { _: 'Body must be a JSON object' } };
  }
  const unknown = Object.keys(body).filter((k) => !EDITABLE.includes(k));
  unknown.forEach((k) => (errors[k] = 'This field cannot be changed'));

  const updates = {};
  for (const k of EDITABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === 'first_name' || k === 'last_name') {
      if (typeof v !== 'string' || !v.trim() || v.trim().length > 100) errors[k] = 'Must be 1–100 characters';
      else updates[k] = v.trim();
    } else if (k === 'email') {
      if (typeof v !== 'string' || !EMAIL.test(v.trim())) errors[k] = 'Must be a valid email address';
      else updates[k] = v.trim().toLowerCase();
    } else if (k === 'age') {
      if (v === null) updates[k] = null;
      else if (!Number.isInteger(v) || v < 1 || v > 119) errors[k] = 'Must be a whole number from 1 to 119';
      else updates[k] = v;
    }
  }
  if (!Object.keys(errors).length && !Object.keys(updates).length) errors._ = 'Nothing to update';
  return { errors, updates };
}

module.exports = { EDITABLE, validateProfileUpdate };
