drop table if exists public.students;

create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_id text unique not null,
  first_name text not null,
  last_name text not null,
  email text unique not null,
  age int check (age > 0 and age < 120),
  nationality text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.students enable row level security;

create policy "Students can view own profile"
  on public.students
  for select
  using (auth.uid() = id);

create policy "Students can update own profile"
  on public.students
  for update
  using (auth.uid() = id);