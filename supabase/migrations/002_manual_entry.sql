-- Add manual_entry mode toggle to settings
alter table public.settings
  add column if not exists manual_entry boolean not null default false;
