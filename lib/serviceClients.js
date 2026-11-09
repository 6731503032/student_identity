const crypto = require('crypto');
const supabase = require('./db');

// Persistence for `ServiceClient`. Idempotency is enforced by the unique
// constraint on idempotency_key. Each client holds one API key, stored twice:
//   api_key_hash — SHA-256, used to authenticate requests
//   api_key_enc  — AES-256-GCM, so staff can copy the key again later.
// The encryption key lives only on the server (API_KEY_SECRET, else JWT_SECRET),
// so reading the database alone never reveals a usable API key.

const KEY_PREFIX = 'sik_';
const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');
const newKey = () => KEY_PREFIX + crypto.randomBytes(32).toString('base64url');

const ENC_KEY = crypto.createHash('sha256')
  .update(process.env.API_KEY_SECRET || process.env.JWT_SECRET || 'dev-only-secret-change-me')
  .digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function decrypt(blob) {
  const [iv, tag, data] = String(blob).split('.').map((p) => Buffer.from(p, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const keyColumns = (apiKey) => ({ api_key_hash: hashKey(apiKey), api_key_enc: encrypt(apiKey), key_prefix: apiKey.slice(0, 10) });

// Never return the hash or ciphertext to callers.
const publicRecord = ({ api_key_hash, api_key_enc, ...rest }) => ({ ...rest, hasApiKey: !!api_key_hash, canCopy: !!api_key_enc });

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
      ...keyColumns(apiKey),
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
    .update(keyColumns(apiKey))
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

// Return the stored key for staff to copy. null if the client has no key, or
// the key was created before encryption was added (rotate once to fix).
async function revealKey(id) {
  const { data, error } = await supabase.from('service_clients').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  if (!data.api_key_enc) return null;
  try { return decrypt(data.api_key_enc); } catch (e) { return null; } // secret changed
}

async function list() {
  const { data, error } = await supabase.from('service_clients').select('*');
  if (error) throw error;
  return data.map(publicRecord);
}

// Remove a client; its API key stops working immediately. Consents students
// gave to that service name are kept (another client may share the name).
async function remove(id) {
  const { data, error } = await supabase.from('service_clients').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { error: delErr } = await supabase.from('service_clients').delete().eq('id', id);
  if (delErr) throw delErr;
  return publicRecord(data);
}

module.exports = { KEY_PREFIX, create, rotateKey, revealKey, findByApiKey, list, remove };
