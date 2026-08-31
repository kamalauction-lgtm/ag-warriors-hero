-- 051_m4u_props_country_scope.sql — projects are visible per admin-set country,
-- enforced in the database, not just filtered in the UI.
--
-- Before this, r_m4u_props let any signed-in user read every country's project
-- list, and i_m4u_grants let an agent self-request a project from the other
-- country by calling the API directly. The caller UI already filtered by
-- country; RLS now guarantees it.
-- country columns are country_t enums — compare ::text on both sides (the
-- 040/041/045 lesson).

-- agents see their own country's projects; country admins likewise; master sees all
drop policy if exists r_m4u_props on m4u_properties;
create policy r_m4u_props on m4u_properties for select
  using (auth.uid() is not null
         and (country::text = my_country()::text
              or (is_admin() and my_role() = 'master_admin')));

-- self-request only, and only for a project in the agent's own country
drop policy if exists i_m4u_grants on m4u_grants;
create policy i_m4u_grants on m4u_grants for insert
  with check (agent_id = auth.uid() and approved = false
              and exists (select 1 from m4u_properties p
                           where p.id = property_id
                             and p.country::text = my_country()::text));
