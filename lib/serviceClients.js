const supabase = require('./db');

// Real persistence for `ServiceClient` (was an in-memory array + Map before).
// Idempotency is now enforced by the unique constraint on idempotency_key.

async function create({ name, idempotencyKey }) {
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('service_clients')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) return { record: existing, replayed: true };
  }

  const { data, error } = await supabase
    .from('service_clients')
    .insert([{ name: name || 'unnamed-service', idempotency_key: idempotencyKey || null }])
    .select()
    .single();
  if (error) throw error;
  return { record: data, replayed: false };
}

async function list() {
  const { data, error } = await supabase.from('service_clients').select('*');
  if (error) throw error;
  return data;
}

module.exports = { create, list };