create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

alter table public.conversations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_select_own'
  ) then
    create policy conversations_select_own on public.conversations
      for select to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_insert_own'
  ) then
    create policy conversations_insert_own on public.conversations
      for insert to authenticated with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_update_own'
  ) then
    create policy conversations_update_own on public.conversations
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'conversations' and policyname = 'conversations_delete_own'
  ) then
    create policy conversations_delete_own on public.conversations
      for delete to authenticated using (auth.uid() = user_id);
  end if;
end $$;
