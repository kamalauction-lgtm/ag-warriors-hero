-- 041_elite_pods_fix.sql — enum casts that 040 missed.
--
-- pods.country is the enum `country_t`, not text, so text comparisons in the
-- 040 policies and functions raised "operator does not exist: text = country_t"
-- the moment they ran. Every comparison now goes through ::text, and the insert
-- casts the validated input the other way.

-- ---------- policies ----------
drop policy if exists w_pods on pods;
create policy w_pods on pods for all
  using (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
  with check (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'));

drop policy if exists w_pod_members on pod_members;
create policy w_pod_members on pod_members for all
  using (is_admin() and exists (select 1 from pods p where p.id = pod_id
           and (p.country::text = my_country()::text or my_role() = 'master_admin')))
  with check (is_admin() and exists (select 1 from pods p where p.id = pod_id
           and (p.country::text = my_country()::text or my_role() = 'master_admin')));

-- ---------- fn_set_elite: cast the profile country before comparing ----------
create or replace function fn_set_elite(p_user uuid, p_elite boolean)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_name text; v_country text; v_pod text;
begin
  select name, country::text into v_name, v_country from profiles where id = p_user;
  if v_name is null then raise exception 'no such profile'; end if;
  if not (is_admin() and (v_country = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;

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

-- ---------- fn_create_pod: validate as text, insert as enum ----------
create or replace function fn_create_pod(p_name text, p_captain uuid, p_country text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_elite boolean; v_cap_name text; v_id uuid;
begin
  if p_country not in ('MY','ID') then raise exception 'country must be MY or ID'; end if;
  if not (is_admin() and (p_country = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  if btrim(coalesce(p_name,'')) = '' then raise exception 'pod needs a name'; end if;

  select is_elite, name into v_elite, v_cap_name from profiles where id = p_captain;
  if v_cap_name is null then raise exception 'no such profile'; end if;
  if not coalesce(v_elite, false) then
    raise exception '% is not an Elite member — appoint them to Tim Elit first', v_cap_name;
  end if;

  insert into pods (name, captain_id, country)
  values (upper(btrim(p_name)), p_captain, p_country::country_t)
  returning id into v_id;

  insert into pod_members (pod_id, agent_id, segment) values (v_id, p_captain, 'hijau')
  on conflict do nothing;

  perform audit_log('pod_created', 'pod', v_id::text, null, upper(btrim(p_name)), v_cap_name);
  perform fn_notify(p_captain, 'role', '👑 You lead pod ' || upper(btrim(p_name)),
    'Leadership appointed you Captain.', '#/team/elite');
  return v_id;
end $$;
