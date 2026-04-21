alter table public.assets
  add column if not exists promoted boolean not null default false;

create index if not exists assets_promoted_status_idx
  on public.assets (promoted, status);
