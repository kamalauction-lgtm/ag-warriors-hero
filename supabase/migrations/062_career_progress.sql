-- 062_career_progress.sql — Career page becomes real (audit fix #3).
--
-- The Career page showed hard-coded 64%/81% progress bars. Real numbers need
-- reads RLS blocks for a normal agent (downline deals, downline ranks), so a
-- definer RPC computes them: personal sales = my closed deals this year;
-- group sales = closed deals of my whole leader_id tree (me included);
-- direct downline counted by career rank. Ladder rows themselves come from
-- career_ladder (already readable by all authenticated users).

create or replace function career_progress()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_me uuid := auth.uid();
  v_y0 timestamptz := date_trunc('year', now());
  v_personal numeric; v_group numeric; v_direct jsonb;
begin
  if v_me is null then raise exception 'not authorised'; end if;

  select coalesce(sum(price), 0) into v_personal
    from deals where agent_id = v_me and stage = 'closed' and stage_changed_at >= v_y0;

  with recursive tree as (
    select id from profiles where id = v_me
    union all
    select p.id from profiles p join tree t on p.leader_id = t.id
  )
  select coalesce(sum(d.price), 0) into v_group
    from deals d join tree on d.agent_id = tree.id
    where d.stage = 'closed' and d.stage_changed_at >= v_y0;

  select coalesce(jsonb_object_agg(career_rank, n), '{}'::jsonb) into v_direct
    from (select career_rank, count(*) as n from profiles
           where leader_id = v_me and status = 'active'
           group by career_rank) x;

  return jsonb_build_object('personal', v_personal, 'group', v_group, 'direct', v_direct);
end $$;

revoke all on function career_progress() from public, anon;
grant execute on function career_progress() to authenticated;
