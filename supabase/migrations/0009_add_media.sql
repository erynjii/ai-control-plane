alter table public.assets
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_prompt text;

-- Storage bucket setup for generated images and uploaded media.
-- Bucket creation via SQL requires the executing role to have storage admin privileges
-- (Supabase migrations typically run as supabase_admin which does). If this migration
-- cannot create the bucket in your environment, create it manually in the Supabase
-- dashboard with the name "media" and make it public.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_public_read'
  ) then
    create policy media_public_read on storage.objects
      for select
      using (bucket_id = 'media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_authenticated_insert'
  ) then
    create policy media_authenticated_insert on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_authenticated_update'
  ) then
    create policy media_authenticated_update on storage.objects
      for update
      to authenticated
      using (bucket_id = 'media')
      with check (bucket_id = 'media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'media_authenticated_delete'
  ) then
    create policy media_authenticated_delete on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'media');
  end if;
end $$;
