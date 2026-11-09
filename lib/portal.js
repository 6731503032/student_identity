const crypto = require('crypto');
const supabase = require('./db');

// Data helpers for the portal pages: announcements, notifications,
// account suspension and signed public-verify codes.

// ---------- announcements ----------
async function listAnnouncements(limit = 20) {
  const { data, error } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data.slice(0, limit);
}
async function createAnnouncement({ title, body, createdBy }) {
  const { data, error } = await supabase
    .from('announcements').insert([{ title, body: body || '', created_by: createdBy }]).select().single();
  if (error) throw error;
  return data;
}
async function deleteAnnouncement(id) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}

// ---------- notifications (in-app alerts) ----------
async function notify(subject, kind, message) {
  try {
    await supabase.from('notifications').insert([{ subject, kind, message }]);
  } catch (e) { /* alerts are best-effort */ }
}
async function listNotifications(subject, limit = 30) {
  const { data, error } = await supabase
    .from('notifications').select('*').eq('subject', subject).order('created_at', { ascending: false });
  if (error) throw error;
  return data.slice(0, limit);
}
async function markAllRead(subject) {
  const { error } = await supabase
    .from('notifications').update({ read_at: new Date().toISOString() }).eq('subject', subject);
  if (error) throw error;
}

// ---------- suspension ----------
async function isSuspended(subject) {
  if (!subject) return false;
  const { data, error } = await supabase.from('accounts').select('*').eq('subject', subject).maybeSingle();
  if (error) throw error;
  return !!(data && data.suspended_at);
}
async function setSuspended(subject, suspended, actor) {
  const { data, error } = await supabase
    .from('accounts')
    .update(suspended ? { suspended_at: new Date().toISOString(), suspended_by: actor } : { suspended_at: null, suspended_by: null })
    .eq('subject', subject)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------- public verify codes (for the QR) ----------
// code = base64url(studentId) + "." + first 16 bytes of HMAC-SHA256.
// Stable per student, can't be forged without the server secret.
const VERIFY_KEY = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';
function sign(studentId) {
  return crypto.createHmac('sha256', VERIFY_KEY()).update(`verify:${studentId}`).digest().subarray(0, 16).toString('base64url');
}
function verifyCodeFor(studentId) {
  return `${Buffer.from(studentId).toString('base64url')}.${sign(studentId)}`;
}
function studentIdFromCode(code) {
  const [idPart, sig] = String(code || '').split('.');
  if (!idPart || !sig) return null;
  let studentId;
  try { studentId = Buffer.from(idPart, 'base64url').toString('utf8'); } catch (e) { return null; }
  const expected = Buffer.from(sign(studentId));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return studentId;
}

module.exports = {
  listAnnouncements, createAnnouncement, deleteAnnouncement,
  notify, listNotifications, markAllRead,
  isSuspended, setSuspended,
  verifyCodeFor, studentIdFromCode,
};
