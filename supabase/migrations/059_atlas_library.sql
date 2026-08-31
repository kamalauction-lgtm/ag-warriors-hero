-- 059_atlas_library.sql — GROW → ATLAS Library (old M3).
-- The resource shelf: guides, forms, links, tools and videos agents reach for
-- mid-deal. Same proven patterns: trilingual jsonb, country scope (locked
-- rule), soft archive, private bucket with signed URLs, admin CRUD audited.
-- No seed content — real documents only, uploaded by admin. No fake shelf.

create table if not exists atlas_items (
  id bigint generated always as identity primary key,
  category text not null check (category in ('guide','form','link','tool','video')),
  title jsonb not null,                        -- {"en","ms","id"}
  description jsonb,
  media jsonb,          -- {files:[{path,name}], url, youtube}
  country_scope text not null default 'ALL' check (country_scope in ('MY','ID','ALL')),
  sort int not null default 100,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table atlas_items enable row level security;

drop policy if exists r_atlas on atlas_items;
create policy r_atlas on atlas_items for select
  using (is_admin() or (status = 'published'
         and country_scope in ('ALL', (select country::text from profiles where id = auth.uid()))));
drop policy if exists w_atlas on atlas_items;
create policy w_atlas on atlas_items for all
  using (is_admin()) with check (is_admin());

-- audit (title/status shape matches the shared onb_audit trigger)
drop trigger if exists atlas_items_audit on atlas_items;
create trigger atlas_items_audit after insert or update on atlas_items
  for each row execute function onb_audit();

-- private bucket 'atlas' (created via Storage API): signed URLs only
drop policy if exists atlas_assets_read on storage.objects;
create policy atlas_assets_read on storage.objects for select
  using (bucket_id = 'atlas' and auth.uid() is not null);
drop policy if exists atlas_assets_admin_write on storage.objects;
create policy atlas_assets_admin_write on storage.objects for insert
  with check (bucket_id = 'atlas' and is_admin());
drop policy if exists atlas_assets_admin_del on storage.objects;
create policy atlas_assets_admin_del on storage.objects for delete
  using (bucket_id = 'atlas' and is_admin());
