create table if not exists public.consents (
  student_id text not null,
  grantee_id text not null,
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, grantee_id)
);

create table if not exists public.service_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  resource text not null,
  result text not null,
  timestamp timestamptz not null default now()
);

create index if not exists consents_grantee_idx
  on public.consents (grantee_id);

create index if not exists audit_events_timestamp_idx
  on public.audit_events (timestamp desc);
