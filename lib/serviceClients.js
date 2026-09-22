const supabase = require('./db');

async function create({ name, idempotencyKey }) {
  // 1. Check if idempotencyKey already exists in Supabase
  if (idempotencyKey) {
    const { data: existing, error: selectError } = await supabase
      .from('service_clients')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (selectError) {
      console.error('[serviceClients.create] Select error:', selectError);
      throw new Error(`Database error: ${selectError.message}`);
    }

    if (existing) {
      return { record: existing, replayed: true };
    }
  }

  // 2. Insert new record
  const { data, error } = await supabase
    .from('service_clients')
    .insert([{ name: name || 'unnamed-service', idempotency_key: idempotencyKey || null }])
    .select()
    .single();

  if (error) {
    // Handle unique constraint conflict if a concurrent request inserted the same key
    if (error.code === '23505' && idempotencyKey) {
      const { data: duplicateRecord } = await supabase
        .from('service_clients')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (duplicateRecord) {
        return { record: duplicateRecord, replayed: true };
      }
    }

    console.error('[serviceClients.create] Insert error:', error);
    throw new Error(error.message);
  }

  return { record: data, replayed: false };
}

async function list() {
  const { data, error } = await supabase.from('service_clients').select('*');
  if (error) throw new Error(error.message);
  return data;
}

module.exports = { create, list };