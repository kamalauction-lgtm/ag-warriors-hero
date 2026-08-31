-- 042_activity_monitor.sql — per-agent activity counts for leadership.
--
-- The Activity Monitor claimed "Every agent's plan & completion today (from My
-- Day)" while rendering five invented names. The planner data is real now
-- (time_tasks, migration 038), but its RLS is deliberately personal: not even
-- an admin may read someone's task list. That stays. What leadership needs is
-- the COUNT — planned, done, not done — and that is all this function returns.
-- Task labels and reasons never leave the row.

create or replace function timebox_admin_today()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_out jsonb; v_today date;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;

  select coalesce(jsonb_agg(x order by (x->>'planned')::int desc, x->>'name'), '[]'::jsonb)
    into v_out
  from (
    select jsonb_build_object(
      'user_id', p.id,
      'name', p.name,
      'country', p.country::text,
      'planned', count(t.id),
      'done',    count(t.id) filter (where t.status = 'done'),
      'notdone', count(t.id) filter (where t.status = 'notdone'),
      'calls_today', (select count(*) from m4u_attempts a
                       where a.agent_id = p.id
                         and a.called_at >= v_today::timestamptz)
    ) as x
    from profiles p
    left join time_tasks t on t.user_id = p.id and t.on_date = v_today
    where p.status = 'active'
      and (p.country::text = my_country()::text or my_role() = 'master_admin')
    group by p.id, p.name, p.country
  ) s;

  return v_out;
end $$;

revoke all on function timebox_admin_today() from anon;
grant execute on function timebox_admin_today() to authenticated;
