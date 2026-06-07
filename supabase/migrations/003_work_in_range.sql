-- Add work_in_end to people: late = check-in after this time
alter table public.people
  add column work_in_end time not null default '09:30:00';
