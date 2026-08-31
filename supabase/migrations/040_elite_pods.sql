-- 040_elite_pods.sql — Elite Team management becomes real.
--
-- The Elite & Captains section had two buttons ("Manage Elite Team", "Create
-- Pod") that only showed a toast describing what they would do. The tables
-- (`pods`, `pod_members`, `profiles.is_elite`) have existed since the base
-- schema, but nothing could write to them: pods carries no write policy, and
-- elite appointment had no function.
--
-- Rules preserved from the Tim Elit spec:
--   * "Captain" is a POSITION (pod leader), not a rank — so a captain must be
--     an elite member first, and demoting someone from elite while they still
--     lead a pod is refused rather than silently leaving a headless pod.
--   * Exactly ONE Commander exists and it is not managed here at all.

-- ---------- RLS ----------
alter table pods         enable row level security;
alter table pod_members  enable row level security;

-- Any signed-in warrior may see the pod structure (it is shown on /team/elite);
-- only admins shape it, scoped by country like every other admin surface.
drop policy if exists r_pods on pods;
create policy r_pods on pods for select using (auth.uid() is not null);
drop policy if exists w_pods on pods;
create policy w_pods on pods for all
  using (is_admin() and (country = my_country() or my_role() = 'master_admin'))
  with check (is_admin() and (country = my_country() or my_role() = 'master_admin'));

drop policy if exists r_pod_members on pod_members;
create policy r_pod_members on pod_members for select using (auth.uid() is not null);
drop policy if exists w_pod_members on pod_members;
create policy w_pod_members on pod_members for all
  using (is_admin() and exists (select 1 from pods p where p.id = pod_id
           and (p.country = my_country() or my_role() = 'master_admin')))
  with check (is_admin() and exists (select 1 from pods p where p.id = pod_id
           and (p.country = my_country() or my_role() = 'master_admin')));

-- ---------- elite appointment ----------
create or replace function fn_set_elite(p_user uuid, p_elite boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_name text; v_country text; v_pod text;
begin
  select name, country into v_name, v_country from profiles where id = p_user;
  if v_name is null then raise exception 'no such profile'; end if;
  if not (is_admin() and (v_country = my_country() or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;

  -- a captain steps down from the pod BEFORE losing elite status, never silently
  if not p_elite then
    select name into v_pod from pods where captain_id = p_user limit 1;
    if v_pod is not null then
      raise exception 'still Captain of pod % — reassign the pod first', v_pod;
    end if;
  end if;

  update profiles set is_elite = p_elite where id = p_user;
  perform audit_log(case when p_elite then 'elite_granted' else 'elite_removed' end,
                    'profile', p_user::text, null, p_elite::text, v_name);
  if p_elite then
    perform fn_notify(p_user, 'role', '🎖 Welcome to Tim Elit',
      'Leadership appointed you to the Elite Team.', '#/team/elite');
  end if;
end $$;

grant execute on function fn_set_elite(uuid, boolean) to authenticated;

-- ---------- pod creation, with the captain rule enforced ----------
create or replace function fn_create_pod(p_name text, p_captain uuid, p_country text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_elite boolean; v_cap_name text; v_id uuid;
begin
  if not (is_admin() and (p_country = my_country() or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'pod needs a name'; end if;

  select is_elite, name into v_elite, v_cap_name from profiles where id = p_captain;
  if v_cap_name is null then raise exception 'no such profile'; end if;
  if not coalesce(v_elite, false) then
    raise exception '% is not an Elite member — appoint them to Tim Elit first', v_cap_name;
  end if;

  insert into pods (name, captain_id, country)
  values (upper(btrim(p_name)), p_captain, p_country)
  returning id into v_id;

  -- the captain is a member of their own pod
  insert into pod_members (pod_id, agent_id, segment) values (v_id, p_captain, 'hijau')
  on conflict do nothing;

  perform audit_log('pod_created', 'pod', v_id::text, null, upper(btrim(p_name)), v_cap_name);
  perform fn_notify(p_captain, 'role', '👑 You lead pod ' || upper(btrim(p_name)),
    'Leadership appointed you Captain.', '#/team/elite');
  return v_id;
end $$;

grant execute on function fn_create_pod(text, uuid, text) to authenticated;
