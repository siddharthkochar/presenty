-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- People table
create table public.people (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  photo_url text,
  face_descriptor float8[],  -- 128-d face embedding stored as float8 array
  work_in_time time not null default '09:00:00',
  salary_per_month numeric(12, 2) not null default 0,
  monthly_leave_balance int not null default 2,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Attendance table
create table public.attendance (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references public.people(id) on delete cascade,
  attend_date date not null,
  check_in_at timestamptz not null default now(),
  is_late boolean not null default false,
  created_at timestamptz not null default now(),
  unique(person_id, attend_date)  -- one record per person per day
);

-- Settings table (single row)
create table public.settings (
  id int primary key default 1,
  capture_start time not null default '08:00:00',
  capture_end time not null default '11:00:00',
  capture_interval_sec int not null default 60,
  match_threshold float8 not null default 0.5,
  constraint settings_single_row check (id = 1)
);

-- Insert default settings
insert into public.settings (id) values (1) on conflict do nothing;

-- Enable RLS
alter table public.people enable row level security;
alter table public.attendance enable row level security;
alter table public.settings enable row level security;

-- RLS policies: allow anon access (private URL, no login v1)
create policy "anon_all_people" on public.people for all to anon using (true) with check (true);
create policy "anon_all_attendance" on public.attendance for all to anon using (true) with check (true);
create policy "anon_all_settings" on public.settings for all to anon using (true) with check (true);

-- Read-only role for analytics server
-- Run this manually in Supabase SQL editor after setup:
-- create role analytics_readonly;
-- grant connect on database postgres to analytics_readonly;
-- grant usage on schema public to analytics_readonly;
-- grant select on public.people, public.attendance, public.settings to analytics_readonly;
-- Note: Supabase Service Key is used instead (SELECT-only enforced in app code)

-- STORAGE: Create a bucket named 'faces' in Supabase Dashboard > Storage
-- Set bucket to private (not public)
-- Add a storage policy: allow anon INSERT and SELECT on faces bucket
