-- 060_elite_real.sql — TIM ELIT becomes real (audit fix #1).
--
-- pod_leads and kpi_checks have existed since the base schema but carried NO
-- RLS and no client wiring — the Elite command centre rendered seed data and
-- every captain action died in browser state. This migration opens the two
-- tables safely and adds pod_board(), the one read a captain genuinely needs
-- across other people's rows (members' activity), kept behind an explicit
-- authorisation check.
-- country columns are country_t enums — ::text on both sides (040/041 lesson).

-- ---------- pod_leads ----------
alter table pod_leads enable row level security;

-- captain of the pod, any member of the pod, the assignee, or a country admin
drop policy if exists r_pod_leads on pod_leads;
create policy r_pod_leads on pod_leads for select using (
  assigned_to = auth.uid()
  or exists (select 1 from pods p where p.id = pod_id and p.captain_id = auth.uid())
  or exists (select 1 from pod_members pm where pm.pod_id = pod_leads.pod_id and pm.agent_id = auth.uid())
  or (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
);

-- captain + admin manage everything in their pod
drop policy if exists w_pod_leads_captain on pod_leads;
create policy w_pod_leads_captain on pod_leads for all using (
  exists (select 1 from pods p where p.id = pod_id and p.captain_id = auth.uid())
  or (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
) with check (
  exists (select 1 from pods p where p.id = pod_id and p.captain_id = auth.uid())
  or (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
);

-- the assigned member updates their own lead (status, note, callback)
drop policy if exists u_pod_leads_assigned on pod_leads;
create policy u_pod_leads_assigned on pod_leads for update
  using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

-- ---------- kpi_checks: personal checklist rows ----------
alter table kpi_checks enable row level security;
drop policy if exists rw_kpi_own on kpi_checks;
create policy rw_kpi_own on kpi_checks for all
  using (agent_id = auth.uid()) with check (agent_id = auth.uid());

-- ---------- pod board: real member stats for the captain ----------
-- time_tasks / m4u_attempts / points_ledger are all locked to the owner by
-- RLS, so the captain's board needs a definer function with its own gate.
create or replace function pod_board(p_pod uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  if not (
    exists (select 1 from pods p where p.id = p_pod and p.captain_id = v_me)
    or exists (select 1 from pod_members pm where pm.pod_id = p_pod and pm.agent_id = v_me)
    or (is_admin() and exists (select 1 from pods p where p.id = p_pod
          and (p.country::text = my_country()::text or my_role() = 'master_admin')))
  ) then
    raise exception 'not your pod';
  end if;

  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', pr.id, 'name', pr.name, 'rank', pr.career_rank,
      'is_captain', (pr.id = p.captain_id),
      'segment', coalesce(pm.segment, ''),
      'planned', (select count(*) from time_tasks t where t.user_id = pr.id and t.on_date = v_today),
      'done', (select count(*) from time_tasks t where t.user_id = pr.id and t.on_date = v_today and t.status = 'done'),
      'calls_today', (select count(*) from m4u_attempts a
                       where a.agent_id = pr.id and a.called_at >= v_today::timestamptz),
      'points', (select coalesce(sum(amount), 0) from points_ledger
                  where user_id = pr.id and status = 'verified'))
      order by (pr.id = p.captain_id) desc, pr.name)
    from pod_members pm
    join pods p on p.id = pm.pod_id
    join profiles pr on pr.id = pm.agent_id
    where pm.pod_id = p_pod), '[]'::jsonb);
end $$;

revoke all on function pod_board(uuid) from public, anon;
grant execute on function pod_board(uuid) to authenticated;
