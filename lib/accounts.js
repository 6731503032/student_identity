const crypto = require('crypto');
const supabase = require('./db');

// Sign-in credentials. Passwords are hashed with scrypt + a random salt
// (Node's built-in crypto, no extra dependency) and stored as "scrypt$salt$hash".

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

async function get(subject) {
  const { data, error } = await supabase.from('accounts').select('*').eq('subject', subject).maybeSingle();
  if (error) throw error;
  return data;
}

async function create(subject, password) {
  const { data, error } = await supabase
    .from('accounts')
    .insert([{ subject, password_hash: hashPassword(password) }])
    .select('subject, created_at')
    .single();
  if (error) throw error;
  return data;
}

module.exports = { hashPassword, verifyPassword, get, create };
