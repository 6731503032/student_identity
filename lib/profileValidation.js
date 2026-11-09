// Validation for PATCH /me. Only these fields are self-editable; anything else
// (student_id, id, created_at, …) is rejected so a student can't rewrite
// their identity or another record's keys.
const EDITABLE = ['first_name', 'last_name', 'email', 'age', 'faculty', 'photo'];
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTO_CHARS = 200000; // ~150 KB image
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
    } else if (k === 'faculty') {
      if (v === null || v === '') updates[k] = null;
      else if (typeof v !== 'string' || v.trim().length > 120) errors[k] = 'Must be at most 120 characters';
      else updates[k] = v.trim();
    } else if (k === 'photo') {
      if (v === null || v === '') updates[k] = null;
      else if (typeof v !== 'string' || !PHOTO.test(v)) errors[k] = 'Must be a JPEG, PNG or WebP image';
      else if (v.length > MAX_PHOTO_CHARS) errors[k] = 'Image is too large (max ~150 KB)';
      else updates[k] = v;
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
