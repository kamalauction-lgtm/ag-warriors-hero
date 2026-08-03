-- ============================================================
-- 020_m4u_rls.sql — read access for the caller UI. ADDITIVE.
-- m4u_leads already has the right policy (assignee | owner | reserved-for | admin).
-- Writes stay server-side: every mutation goes through the SECURITY DEFINER
-- engine functions from 014/019, so no client write policies are granted.
-- ============================================================

alter table m4u_properties   enable row level security;
alter table m4u_grants       enable row level security;
alter table m4u_lead_props   enable row level security;
alter table m4u_attempts     enable row level security;
alter table m4u_field_settings enable row level security;
alter table m4u_notes        enable row level security;
alter table quotes           enable row level security;
alter table bop_sessions     enable row level security;
alter table bop_roster       enable row level security;

-- projects: every signed-in agent needs names/types to make sense of a lead
drop policy if exists r_m4u_props on m4u_properties;
create policy r_m4u_props on m4u_properties for select
  using (auth.uid() is not null);

-- my grants (the Projects tab) + admins see all
drop policy if exists r_m4u_grants on m4u_grants;
create policy r_m4u_grants on m4u_grants for select
  using (agent_id = auth.uid() or is_admin());
-- an agent may toggle their own `active` flag; `approved` stays admin-only
drop policy if exists u_m4u_grants on m4u_grants;
create policy u_m4u_grants on m4u_grants for update
  using (agent_id = auth.uid()) with check (agent_id = auth.uid());
drop policy if exists i_m4u_grants on m4u_grants;
create policy i_m4u_grants on m4u_grants for insert
  with check (agent_id = auth.uid() and approved = false);   -- self-request only

-- multi-interest chips: visible when the parent lead is visible
drop policy if exists r_m4u_lead_props on m4u_lead_props;
create policy r_m4u_lead_props on m4u_lead_props for select
  using (exists (select 1 from m4u_leads l where l.id = lead_id));

-- call history: my own attempts, attempts on leads I can see, or admin
drop policy if exists r_m4u_attempts on m4u_attempts;
create policy r_m4u_attempts on m4u_attempts for select
  using (agent_id = auth.uid() or is_admin()
         or exists (select 1 from m4u_leads l where l.id = lead_id));

drop policy if exists r_m4u_fields on m4u_field_settings;
create policy r_m4u_fields on m4u_field_settings for select using (auth.uid() is not null);

drop policy if exists r_quotes on quotes;
create policy r_quotes on quotes for select using (auth.uid() is not null);

drop policy if exists r_bop_sessions on bop_sessions;
create policy r_bop_sessions on bop_sessions for select using (auth.uid() is not null);

drop policy if exists r_bop_roster on bop_roster;
create policy r_bop_roster on bop_roster for select
  using (caller_id = auth.uid() or is_admin());

-- admin↔agent threads: mine, or addressed to me, or admin
drop policy if exists r_m4u_notes on m4u_notes;
create policy r_m4u_notes on m4u_notes for select
  using (author_id = auth.uid() or target_agent_id = auth.uid() or is_admin());
