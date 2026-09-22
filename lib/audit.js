const supabase = require('./db');

// Real persistence for audit events (was an in-memory array before).
// Falls back to console logging if the DB write fails, so you never
// silently lose an audit trail during a demo.

async function record({ actor, action, resource, result }) {
  const entry = { actor, action, resource, result };
  const { data, error } = await supabase.from('audit_events').insert([entry]).select().single();

  if (error) {
    console.error('[audit] failed to persist, falling back to console:', error.message);
    const fallback = { ...entry, timestamp: new Date().toISOString() };
    console.log('[audit]', JSON.stringify(fallback));
    return fallback;
  }

  console.log('[audit]', JSON.stringify(data));
  return data;
}

async function list() {
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = { record, list };