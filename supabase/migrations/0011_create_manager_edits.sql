-- manager_edits: captures each time a manager edits a field on an asset
-- before approval. Used by PR 3's "edited" badge on approved cards and
-- by PR 4's diff viewer + feedback loop.
--
-- Shape per brief: { id, postId, field, before, after, editorId, editedAt }.
-- Mapped to this codebase as { id, asset_id, field, before, after, user_id,
-- edited_at } — asset_id replaces postId (we have an assets table, not
-- posts), user_id replaces editorId (matches the existing tables' column
-- name).
--
-- RLS note (matches existing tables, intentionally):
--   Ownership is on user_id (the editor). When the product adds
--   multi-manager workspace membership, every table — including this one —
--   will need to migrate to workspace-membership-based policies. See the
--   TODO in migration 0010_create_pipeline_runs.sql.

create table if not exists public.manager_edits (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  before text not null,
  after text not null,
  edited_at timestamptz not null default now()
);

create index if not exists manager_edits_asset_edited_idx
  on public.manager_edits (asset_id, edited_at desc);

alter table public.manager_edits enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'manager_edits'
      and policyname = 'manager_edits_select_own'
  ) then
    create policy manager_edits_select_own
      on public.manager_edits
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'manager_edits'
      and policyname = 'manager_edits_insert_own'
  ) then
    create policy manager_edits_insert_own
      on public.manager_edits
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;
