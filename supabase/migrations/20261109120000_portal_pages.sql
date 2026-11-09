-- Portal pages: profile photo/faculty, settings, suspension, announcements,
-- in-app notifications. Safe to run more than once.

alter table public.students add column if not exists faculty text;
alter table public.students add column if not exists photo text;            -- small JPEG data URL (≤ ~150 KB)
alter table public.students add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.accounts add column if not exists suspended_at timestamptz;
alter table public.accounts add column if not exists suspended_by text;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  subject text not null,          -- student ID / username the alert is for
  kind text not null,             -- e.g. role_changed, suspended, password_reset, consent
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_subject_idx on public.notifications (subject, created_at desc);
