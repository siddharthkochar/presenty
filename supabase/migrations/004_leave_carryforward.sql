-- Per-person per-month manual leave carry-forward
create table public.leave_carryforward (
  id uuid primary key default uuid_generate_v4(),
  person_id uuid not null references public.people(id) on delete cascade,
  year_month text not null,       -- 'YYYY-MM' of the month receiving carry-in
  carried_days int not null default 0,
  created_at timestamptz not null default now(),
  unique(person_id, year_month)
);

alter table public.leave_carryforward enable row level security;

create policy "anon_all_leave_carryforward" on public.leave_carryforward
  for all to anon using (true) with check (true);
