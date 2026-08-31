-- 037_m4u_admin_write.sql — let admins actually manage quotes and BOP sessions.
--
-- 020 enabled RLS on `quotes` and `bop_sessions` but only ever created SELECT
-- policies. The console already shipped an "active / off" toggle on both, so
-- every click was silently rejected: PostgREST returns success for an UPDATE
-- that matches zero rows, the toast said "Retired", and nothing changed. That is
-- worse than a missing feature, because it looks like it worked.
--
-- Country scoping follows the same rule as the rest of the M4U tables: a country
-- admin manages their own country, a master admin manages both.

-- ---------- quotes ----------
drop policy if exists w_quotes on quotes;
create policy w_quotes on quotes for all
  using (is_admin() and (country = my_country() or my_role() = 'master_admin'))
  with check (is_admin() and (country = my_country() or my_role() = 'master_admin'));

-- ---------- BOP sessions ----------
drop policy if exists w_bop_sessions on bop_sessions;
create policy w_bop_sessions on bop_sessions for all
  using (is_admin() and (country = my_country() or my_role() = 'master_admin'))
  with check (is_admin() and (country = my_country() or my_role() = 'master_admin'));

-- ---------- appointments, as a first-class number ----------
-- The old console had a "Janji Temu Diatur" column. Nothing was lost in the
-- migration: an appointment IS a winning disposition (Booked for property,
-- Attend Online/Physical BOP for recruitment). It simply was never surfaced.
-- Reading it from m4u_dispositions.is_win rather than a hardcoded list means new
-- win outcomes are counted automatically.
create or replace function m4u_appointments(p_days int default 30)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb;
begin
  if not is_admin() then raise exception 'not authorised'; end if;

  select coalesce(jsonb_agg(x order by (x->>'appointments')::int desc), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'agent_id', a.agent_id,
      'agent', coalesce(p.name, 'Unknown'),
      'country', l.country,
      'appointments', count(*) filter (where d.is_win),
      'booked',       count(*) filter (where a.disposition = 'Booked'),
      'bop_online',   count(*) filter (where a.disposition = 'Attend Online BOP'),
      'bop_physical', count(*) filter (where a.disposition = 'Attend Physical BOP'),
      'calls', count(*)
    ) as x
    from m4u_attempts a
    join m4u_leads l on l.id = a.lead_id
    left join profiles p on p.id = a.agent_id
    left join m4u_dispositions d
           on d.key = a.disposition and d.country = l.country and d.active
    where a.called_at > now() - make_interval(days => greatest(p_days, 1))
      and (l.country = my_country() or my_role() = 'master_admin')
    group by a.agent_id, p.name, l.country
  ) s;

  return v_out;
end $$;

revoke all on function m4u_appointments(int) from anon;
grant execute on function m4u_appointments(int) to authenticated;
