alter table public.assets
  add column if not exists system_prompt text;
