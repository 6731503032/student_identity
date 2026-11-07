const supabase = require('./db');

// Persistence for the `Role` entity. Subjects without a row default to 'student'
// when they have a student record (see GET /roles in routes/identity.js).
const ROLES = ['student', 'instructor', 'staff'];

async function list() {
  const { data, error } = await supabase.from('roles').select('*');
  if (error) throw error;
  return data;
}

async function get(subject) {
  const { data, error } = await supabase.from('roles').select('*').eq('subject', subject).maybeSingle();
  if (error) throw error;
  return data;
}

async function set(subject, role, actor) {
  const { data, error } = await supabase
    .from('roles')
    .upsert({ subject, role, updated_by: actor, updated_at: new Date().toISOString() }, { onConflict: 'subject' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = { ROLES, list, get, set };
