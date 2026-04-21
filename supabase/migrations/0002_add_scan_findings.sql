alter table public.assets
  add column if not exists scan_findings jsonb not null default '[]'::jsonb;
