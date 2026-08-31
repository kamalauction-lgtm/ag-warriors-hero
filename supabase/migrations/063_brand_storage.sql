-- 063_brand_storage.sql — Brand Studio becomes real (audit fix #5a).
--
-- Brand uploads lived in the admin's own localStorage as data-URLs — no other
-- device ever saw them. Real home: public 'brand' storage bucket (logos and
-- mascots are public assets — the login page needs them before auth) with the
-- existing brand_assets table as the version registry (v1, v2, … kept, active
-- flag picks the live one, so admins can roll back any time).

insert into storage.buckets (id, name, public)
values ('brand', 'brand', true)
on conflict (id) do update set public = true;

drop policy if exists brand_public_read on storage.objects;
create policy brand_public_read on storage.objects for select
  using (bucket_id = 'brand');

drop policy if exists brand_admin_write on storage.objects;
create policy brand_admin_write on storage.objects for insert
  with check (bucket_id = 'brand' and is_admin());

drop policy if exists brand_admin_update on storage.objects;
create policy brand_admin_update on storage.objects for update
  using (bucket_id = 'brand' and is_admin());

drop policy if exists brand_admin_delete on storage.objects;
create policy brand_admin_delete on storage.objects for delete
  using (bucket_id = 'brand' and is_admin());
