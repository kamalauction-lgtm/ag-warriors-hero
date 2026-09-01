-- ============================================================
-- 101_vp_edit_projects.sql — let VP/GVP + the Commander edit primary projects
-- from the Income page, not just admins in Command HQ. ADDITIVE.
--
-- income_rules writes were admin-only (061 RLS: is_admin + country). A VP could
-- see the numbers but not add or change a project — the old ren app let VP/HOT
-- manage them, so this restores that, safely and country-scoped.
--
-- Authorised: master_admin / country_admin, the Elite Commander (is_commander),
-- or career rank VP / GVP. Country scope: everyone edits their OWN country only;
-- a master_admin may target either. Only the myPrimary list is written — every
-- other income rule (ladder, RGR, subsale) stays admin-only via the table RLS.
--
-- ROLLBACK: drop the function; the table RLS already blocks non-admin writes.
-- ============================================================

create or replace function fn_set_my_primary(p_country text, p_projects jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_country text; v_rank text; v_commander boolean; v_cfg jsonb; v_it jsonb;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select role::text, country::text, coalesce(career_rank, 'REN'), coalesce(is_commander, false)
    into v_role, v_country, v_rank, v_commander
    from profiles where id = auth.uid();

  -- who may edit commission projects
  if not (v_role in ('master_admin', 'country_admin') or v_commander or v_rank in ('VP', 'GVP')) then
    raise exception 'editing projects needs VP rank, Commander, or admin';
  end if;
  -- country-first: only a master admin reaches across countries
  if v_role <> 'master_admin' and p_country is distinct from v_country then
    raise exception 'you may only edit your own country''s projects';
  end if;
  if p_country not in ('MY', 'ID') then raise exception 'bad country'; end if;
  if jsonb_typeof(p_projects) <> 'array' then raise exception 'projects must be a list'; end if;
  if jsonb_array_length(p_projects) > 100 then raise exception 'too many projects'; end if;

  -- shape guard: every project needs a name and a numeric price, so a malformed
  -- write cannot quietly corrupt the calculator for everyone.
  for v_it in select * from jsonb_array_elements(p_projects) loop
    if coalesce(btrim(v_it->>'name'), '') = '' then raise exception 'every project needs a name'; end if;
    if (v_it->>'price') is null or (v_it->>'price')::numeric < 0 then raise exception 'every project needs a price'; end if;
  end loop;

  -- merge: keep every other setting in the cfg, replace only myPrimary
  select cfg into v_cfg from income_rules where country = p_country::country_t;
  v_cfg := coalesce(v_cfg, '{}'::jsonb) || jsonb_build_object('myPrimary', p_projects);
  insert into income_rules (country, cfg, updated_by, updated_at)
  values (p_country::country_t, v_cfg, auth.uid(), now())
  on conflict (country) do update set cfg = excluded.cfg, updated_by = auth.uid(), updated_at = now();

  perform audit_log('income_projects_saved', 'income_rules', p_country, null,
                    jsonb_array_length(p_projects)::text || ' projects · by ' || v_role || '/' || v_rank, null);
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(p_projects));
end $$;
revoke all on function fn_set_my_primary(text, jsonb) from public, anon;
grant execute on function fn_set_my_primary(text, jsonb) to authenticated;

-- a lightweight "may I edit?" check the Income page uses to show/hide the editor
create or replace function fn_can_edit_projects()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid()
    and (p.role in ('master_admin', 'country_admin')
         or coalesce(p.is_commander, false)
         or coalesce(p.career_rank, 'REN') in ('VP', 'GVP')));
$$;
grant execute on function fn_can_edit_projects() to authenticated;

select 'fn ready' as check, proname from pg_proc where proname in ('fn_set_my_primary', 'fn_can_edit_projects');
