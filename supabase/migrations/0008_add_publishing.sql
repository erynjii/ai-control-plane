alter table public.assets
  add column if not exists destination text,
  add column if not exists destination_status text not null default 'idle',
  add column if not exists destination_meta jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists failure_reason text;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_asset_created_idx
  on public.audit_events (asset_id, created_at);

alter table public.audit_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_select_own'
  ) then
    create policy audit_events_select_own on public.audit_events
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_insert_own'
  ) then
    create policy audit_events_insert_own on public.audit_events
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
end $$;
