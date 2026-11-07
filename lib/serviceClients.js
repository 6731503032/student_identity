const crypto = require('crypto');
const supabase = require('./db');

// Persistence for `ServiceClient`. Idempotency is enforced by the unique
// constraint on idempotency_key. Each client can hold one API key; only its
// SHA-256 hash is stored (keys are 32 random bytes, so a fast hash is fine).

const KEY_PREFIX = 'sik_';
const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');
const newKey = () => KEY_PREFIX + crypto.randomBytes(32).toString('base64url');

// Never return the hash to callers.
const publicRecord = ({ api_key_hash, ...rest }) => ({ ...rest, hasApiKey: !!api_key_hash });

async function create({ name, idempotencyKey }) {
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('service_clients')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) return { record: publicRecord(existing), replayed: true };
  }

  const apiKey = newKey();
  const { data, error } = await supabase
    .from('service_clients')
    .insert([{
      name: name || 'unnamed-service',
      idempotency_key: idempotencyKey || null,
      api_key_hash: hashKey(apiKey),
      key_prefix: apiKey.slice(0, 10),
      scopes: ['profile:read'],
    }])
    .select()
    .single();
  if (error) throw error;
  return { record: publicRecord(data), apiKey, replayed: false };
}

// Issue a fresh key for an existing client (the old key stops working).
async function rotateKey(id) {
  const apiKey = newKey();
  const { data, error } = await supabase
    .from('service_clients')
    .update({ api_key_hash: hashKey(apiKey), key_prefix: apiKey.slice(0, 10) })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return { record: publicRecord(data), apiKey };
}

async function findByApiKey(apiKey) {
  if (typeof apiKey !== 'string' || !apiKey.startsWith(KEY_PREFIX)) return null;
  const { data, error } = await supabase
    .from('service_clients')
    .select('*')
    .eq('api_key_hash', hashKey(apiKey))
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function list() {
  const { data, error } = await supabase.from('service_clients').select('*');
  if (error) throw error;
  return data.map(publicRecord);
}

module.exports = { KEY_PREFIX, create, rotateKey, findByApiKey, list };
