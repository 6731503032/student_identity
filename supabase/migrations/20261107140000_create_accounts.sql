-- Sign-in credentials for students (one row per student_id).
-- Passwords are stored as salted scrypt hashes, never in plain text.
create table if not exists public.accounts (
  subject text primary key,
  password_hash text not null,
  created_at timestamptz not null default now()
);
