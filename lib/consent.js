const supabase = require('./db');

// Real persistence for the `Consent` entity (was an in-memory Map before).
// Seed data moved to seed.sql — run that once after creating your tables.

async function grant(studentId, granteeId, scopes) {
  const { data: existing } = await supabase
    .from('consents')
    .select('*')
    .eq('student_id', studentId)
    .eq('grantee_id', granteeId)
    .maybeSingle();

  const mergedScopes = existing
    ? Array.from(new Set([...existing.scopes, ...scopes]))
    : scopes;

  const { data, error } = await supabase
    .from('consents')
    .upsert(
      { student_id: studentId, grantee_id: granteeId, scopes: mergedScopes },
      { onConflict: 'student_id,grantee_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function revoke(studentId, granteeId) {
  const { error } = await supabase
    .from('consents')
    .delete()
    .eq('student_id', studentId)
    .eq('grantee_id', granteeId);
  if (error) throw error;
  return true;
}

async function hasConsent(studentId, granteeId, scope) {
  const { data, error } = await supabase
    .from('consents')
    .select('scopes')
    .eq('student_id', studentId)
    .eq('grantee_id', granteeId)
    .maybeSingle();
  if (error) throw error;
  return !!data && data.scopes.includes(scope);
}

// Scopes a student can grant. Extend this list as more claim types are enforced.
const SCOPES = ['profile:read'];

// Replace (not merge) the scopes a student grants to one service.
async function set(studentId, granteeId, scopes) {
  const { data, error } = await supabase
    .from('consents')
    .upsert(
      { student_id: studentId, grantee_id: granteeId, scopes, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,grantee_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listForStudent(studentId) {
  const { data, error } = await supabase.from('consents').select('*').eq('student_id', studentId);
  if (error) throw error;
  return data;
}

module.exports = { SCOPES, grant, revoke, set, listForStudent, hasConsent };