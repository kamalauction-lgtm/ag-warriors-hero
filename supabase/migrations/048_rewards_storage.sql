-- 048_rewards_storage.sql — who may put poster files in the `rewards` bucket.
--
-- The bucket itself is created via the Storage API (public read, 5 MB cap,
-- images only). Storage enforces writes through policies on storage.objects:
-- without these, every upload from the admin console is refused. Read needs no
-- policy — the bucket is public, which is the point of a campaign poster.

drop policy if exists rewards_poster_insert on storage.objects;
create policy rewards_poster_insert on storage.objects for insert
  with check (bucket_id = 'rewards' and is_admin());

drop policy if exists rewards_poster_update on storage.objects;
create policy rewards_poster_update on storage.objects for update
  using (bucket_id = 'rewards' and is_admin());

drop policy if exists rewards_poster_delete on storage.objects;
create policy rewards_poster_delete on storage.objects for delete
  using (bucket_id = 'rewards' and is_admin());
