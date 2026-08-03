-- ============================================================
-- 021_m4u_attempt_scope.sql — scope call history by country. ADDITIVE.
--
-- 020 let ANY admin read ANY attempt (`is_admin()` with no country test), so a
-- Malaysia country_admin could see Indonesian call activity in the reports.
-- Leads are already country-scoped; attempts must match.
-- master_admin still sees everything (Commander view).
-- ============================================================

drop policy if exists r_m4u_attempts on m4u_attempts;
create policy r_m4u_attempts on m4u_attempts for select using (
  agent_id = auth.uid()                                   -- my own calls
  or exists (                                             -- calls on leads I can see
    select 1 from m4u_leads l
    where l.id = lead_id
      and (l.country = my_country() or my_role() = 'master_admin'
           or l.assigned_to = auth.uid() or l.owner_agent_id = auth.uid()
           or l.reserved_for = auth.uid())
  )
);

-- Admins need to resolve agent NAMES for their own country's reports.
-- Without this the pivot renders "—" for every agent.
drop policy if exists r_profiles_admin_country on profiles;
create policy r_profiles_admin_country on profiles for select using (
  is_admin() and (country = my_country() or my_role() = 'master_admin')
);
