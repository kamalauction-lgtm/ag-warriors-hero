-- ============================================================
-- 022_m4u_pipeline_rls.sql — pipeline mapping access. ADDITIVE.
--
-- m4u_pipeline_map was the one caller table left with RLS on and no policy,
-- so the admin Pipelines tab showed "no pipelines mapped" while 16 existed.
-- Mapping a GHL pipeline to a project is what stops leads landing in triage,
-- so admins need both read and write here.
-- ============================================================

alter table m4u_pipeline_map enable row level security;

drop policy if exists r_m4u_pipes on m4u_pipeline_map;
create policy r_m4u_pipes on m4u_pipeline_map for select using (
  auth.uid() is not null
  and (country = my_country() or my_role() = 'master_admin' or is_admin() = false)
);

-- only admins may (re)map a pipeline to a project, and only within their country
drop policy if exists w_m4u_pipes on m4u_pipeline_map;
create policy w_m4u_pipes on m4u_pipeline_map for update
  using (is_admin() and (country = my_country() or my_role() = 'master_admin'))
  with check (is_admin() and (country = my_country() or my_role() = 'master_admin'));

drop policy if exists i_m4u_pipes on m4u_pipeline_map;
create policy i_m4u_pipes on m4u_pipeline_map for insert
  with check (is_admin() and (country = my_country() or my_role() = 'master_admin'));
