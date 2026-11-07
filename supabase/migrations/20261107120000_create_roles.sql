-- Role entity (PRD: Student, Role, Consent, ServiceClient).
-- One row per subject (student ID or staff/instructor username).
-- Students with no row here are treated as role 'student' by default.
create table if not exists public.roles (
  subject text primary key,
  role text not null check (role in ('student', 'instructor', 'staff')),
  updated_by text,
  updated_at timestamptz not null default now()
);
