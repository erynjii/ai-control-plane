-- pipeline_runs: one row per agent-pipeline execution, keyed 1:1 to the asset
-- the pipeline produced. Created as part of PR 1 of the agent pipeline rollout.
--
-- Storage split:
--   - assets row stays exactly the same shape as v1 (byte-identical when
--     PIPELINE_V2_WORKSPACES is not set), so downstream UI doesn't need to
--     branch on pipeline version.
--   - pipeline_runs.context holds the full PipelineContext (brief, variants,
--     imageUrl, flags, stepLog). Joined on asset_id when PR 2/3 renders
--     agent output in the approval card and timeline.
--
-- RLS note (intentionally matches existing tables, not "ideal"):
--   Ownership is on user_id to stay consistent with assets, audit_events,
--   and conversations. workspace_id is denormalized as data for filtering
--   and analysis.
--
--   TODO(multi-manager workspaces): the moment the product supports more
--   than one manager in a workspace seeing each other's content, the entire
--   RLS model needs to migrate from user-owned to workspace-membership-based
--   across every table. That's a cross-cutting refactor, not a PR 1 fix.
--   Flag it as its own piece of work before the feedback-loop PR ships.

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id text not null,
  connected_account_id text,
  total_cost_usd numeric(10, 4) not null default 0,
  duration_ms integer not null default 0,
  model_versions jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  -- Pre-aggregated max flag severity so the approval queue can sort/filter
  -- without parsing context->flags on every list view. Nullable when no
  -- flags were emitted.
  max_flag_severity text,
  created_at timestamptz not null default now()
);

create index if not exists pipeline_runs_asset_id_idx
  on public.pipeline_runs (asset_id);

create index if not exists pipeline_runs_workspace_created_idx
  on public.pipeline_runs (workspace_id, created_at desc);

-- Enforce that max_flag_severity stays in the expected enum.
alter table public.pipeline_runs
  drop constraint if exists pipeline_runs_max_flag_severity_check;
alter table public.pipeline_runs
  add constraint pipeline_runs_max_flag_severity_check
  check (max_flag_severity is null
         or max_flag_severity in ('blocker', 'warning', 'note'));

alter table public.pipeline_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pipeline_runs'
      and policyname = 'pipeline_runs_select_own'
  ) then
    create policy pipeline_runs_select_own
      on public.pipeline_runs
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'pipeline_runs'
      and policyname = 'pipeline_runs_insert_own'
  ) then
    create policy pipeline_runs_insert_own
      on public.pipeline_runs
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;
