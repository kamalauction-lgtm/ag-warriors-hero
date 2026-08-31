-- ============================================================
-- 084_fix_day_proof.sql — URGENT. Fixes fn_day_proof, which is throwing
-- 22P02 in production and taking fn_daily_mission (the Today screen) with it.
--
-- REGRESSION, introduced by me in 081.
--
-- 081 originally had:
--     select e.participant_id, fn_curriculum_day(...) into v_p, v_row   -- 42601
-- I fixed that by splitting it, but wrote:
--     select fn_curriculum_day(...) into v_row                          -- 22P02
--
-- Both are wrong for the same underlying reason. A composite-returning function
-- in the SELECT list produces ONE COLUMN whose type is the composite. SELECT ...
-- INTO a rowtype variable maps COLUMNS onto FIELDS, so it tried to force the
-- whole row literal into curriculum_days.id (a uuid) — hence
--   invalid input syntax for type uuid: "(e669ef7b-...,fb6f10f2-...,1,1,{...})"
--
-- The correct form is plain assignment, which is what fn_submit_task and
-- fn_daily_mission already use and why those two were never affected:
--     v_row := fn_curriculum_day(v_ver, p_day, v_country);
--
-- Scope: fn_day_proof only. Nothing else changes.
-- ============================================================

create or replace function fn_day_proof(p_enrolment uuid, p_day int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_p uuid; v_ver uuid; v_country country_t; v_row curriculum_days;
  v_cfg jsonb; v_src text; v_min int; v_win int; v_have int;
begin
  -- every INTO target here is a scalar; the composite is fetched by assignment below
  select e.participant_id, c.curriculum_version_id, c.country
    into v_p, v_ver, v_country
  from enrolments e join cohorts c on c.id = e.cohort_id
  where e.id = p_enrolment;
  if v_p is null then return jsonb_build_object('applicable', false); end if;

  v_row := fn_curriculum_day(v_ver, p_day, v_country);

  if v_row.proof_type is distinct from 'native_record' or v_row.proof_config is null then
    return jsonb_build_object('applicable', false, 'proof_type', v_row.proof_type);
  end if;
  v_cfg := v_row.proof_config;
  v_src := v_cfg->>'source';
  v_min := coalesce((v_cfg->>'min_count')::int, 1);
  v_win := coalesce((v_cfg->>'window_days')::int, 3650);
  v_have := case v_src
    when 'leads'        then (select count(*) from ch_leads l           where l.participant_id  = v_p and l.created_at  > now() - make_interval(days => v_win))
    when 'activities'   then (select count(*) from ch_lead_activities a where a.participant_id  = v_p and a.happened_at > now() - make_interval(days => v_win))
    when 'appointments' then (select count(*) from ch_appointments ap   where ap.participant_id = v_p and ap.created_at > now() - make_interval(days => v_win))
    when 'closings'     then (select count(*) from ch_closings cl       where cl.participant_id = v_p and cl.created_at > now() - make_interval(days => v_win))
    else 0 end;
  return jsonb_build_object('applicable', true, 'proof_type', v_row.proof_type, 'source', v_src,
    'required', v_min, 'have', v_have, 'satisfied', v_have >= v_min);
end $$;

-- ------------------------------------------------------------
-- VERIFY — both must return a row, not an error
-- ------------------------------------------------------------
select 'fn_day_proof on tary day 1' as check,
       fn_day_proof('e2d3b2c2-3ec9-4064-9338-b57abf2bd415', 1) as result;
select 'fn_daily_mission on tary (Today screen)' as check,
       fn_daily_mission('e2d3b2c2-3ec9-4064-9338-b57abf2bd415') -> 'curriculum' as curriculum,
       fn_daily_mission('e2d3b2c2-3ec9-4064-9338-b57abf2bd415') -> 'accessible_day' as accessible_day;
