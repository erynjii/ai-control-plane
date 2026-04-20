create extension if not exists pgcrypto;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  output text not null,
  model text not null,
  status text not null default 'draft',
  risk_level text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'assets'
      and policyname = 'assets_select_own'
  ) then
    create policy assets_select_own
      on public.assets
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'assets'
      and policyname = 'assets_insert_own'
  ) then
    create policy assets_insert_own
      on public.assets
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;
