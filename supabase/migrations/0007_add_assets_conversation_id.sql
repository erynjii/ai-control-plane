alter table public.assets
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade;

create index if not exists assets_conversation_id_idx
  on public.assets (conversation_id, created_at);
