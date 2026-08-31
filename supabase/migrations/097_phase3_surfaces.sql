-- ============================================================
-- 097_phase3_surfaces.sql — the reads behind the last three Phase-3 screens:
-- authority management, the closing verifier queue, and pilot observability.
-- ADDITIVE. No behaviour changes; fn_verify_closing (090) and
-- fn_admin_grant_permission (089) stay the only writers.
--
-- WHY THESE EXIST AS RPCs: the 28 Aug audit found the pilot warrior had
-- missed 7/7 days and NOTHING surfaced it — the data was all there, spread
-- over four tables no screen joined. These functions do the joining server-
-- side, gated once, so the screens stay thin and cannot leak.
-- ============================================================

-- ------------------------------------------------------------
-- 1. AUTHORITY: who currently holds which permission, and the roster to pick
--    new holders from. super_admin (master_admin maps to it) only.
-- ------------------------------------------------------------
create or replace function fn_authority_board()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  return jsonb_build_object(
    'grants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', pm.user_id, 'name', p.name, 'country', pm.country,
               'permission', pm.permission, 'granted_at', pm.granted_at,
               'granted_by', gb.name, 'note', pm.note)
             order by pm.permission, pm.country, p.name)
      from ch_permissions pm
      join profiles p on p.id = pm.user_id
      left join profiles gb on gb.id = pm.granted_by), '[]'::jsonb),
    -- for the AUTHORITY REQUIRED banner: which country/permission pairs are empty
    'coverage', (
      select jsonb_object_agg(perm || '.' || ctry, cnt) from (
        select perms.perm, c.ctry,
               (select count(*) from ch_permissions x
                 where x.permission = perms.perm and x.country::text = c.ctry) as cnt
        from (values ('closing.verify'), ('content.own'), ('content.review')) perms(perm)
        cross join (values ('MY'), ('ID')) c(ctry)) q));
end $$;
revoke all on function fn_authority_board() from public, anon;
grant execute on function fn_authority_board() to authenticated;

-- ------------------------------------------------------------
-- 2. VERIFIER QUEUE: closings a human must decide.
--    Readable by super_admin AND by holders of closing.verify (their queue).
--    A closing "awaits verification" when the participant/coach has pushed it
--    to CUSTOMER_DECISION or INTERNAL_REVIEW — the last stages before a human
--    verifies — or when it sits unresolved past its expected_review date.
-- ------------------------------------------------------------
create or replace function fn_verifier_queue()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean; v_countries text[];
begin
  v_admin := has_role('super_admin');
  select coalesce(array_agg(country::text), '{}') into v_countries
    from ch_permissions where user_id = auth.uid() and permission = 'closing.verify';
  if not v_admin and coalesce(array_length(v_countries, 1), 0) = 0 then
    raise exception 'closing.verify permission required';
  end if;
  return jsonb_build_object(
    'can_verify_countries', to_jsonb(v_countries),
    'is_admin_readonly', v_admin and coalesce(array_length(v_countries, 1), 0) = 0,
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object(
               'closing_id', c.id, 'status', c.status, 'country', c.country,
               'participant', p.name, 'participant_id', c.participant_id,
               'coach', ch.name, 'project', c.project,
               'lead_name', l.name, 'lead_stage', l.stage,
               'required_steps', c.required_steps, 'missing_items', c.missing_items,
               'expected_review', c.expected_review, 'updated_at', c.updated_at)
             order by c.updated_at)
      from ch_closings c
      join profiles p on p.id = c.participant_id
      left join profiles ch on ch.id = c.coach_id
      left join ch_leads l on l.id = c.lead_id
      where c.status in ('INTERNAL_REVIEW', 'CUSTOMER_DECISION')
        and (v_admin or c.country::text = any(v_countries))), '[]'::jsonb));
end $$;
revoke all on function fn_verifier_queue() from public, anon;
grant execute on function fn_verifier_queue() to authenticated;

-- ------------------------------------------------------------
-- 3. PILOT OBSERVABILITY: one row per non-withdrawn enrolment with the facts
--    that would have caught the stalled pilot: consecutive missed days, days
--    since the last submission, and pipeline touch counts.
-- ------------------------------------------------------------
create or replace function fn_pilot_watch()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then
    raise exception 'not authorised';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by (x.alert_level = 'red') desc,
                     (x.alert_level = 'amber') desc, x.activated_at) from (
      select e.id as enrolment_id, p.name as participant, p.country, e.status,
             c.name as cohort, ch.name as coach, e.activated_at,
             participant_accessible_day(e.id) as accessible_day,
             (select count(*) from task_submissions t
               where t.enrolment_id = e.id and t.status = 'approved') as days_approved,
             (select count(*) from task_submissions t
               where t.enrolment_id = e.id
                 and t.status in ('submitted', 'under_review')) as days_waiting_review,
             (select count(*) from ch_day_state s
               where s.enrolment_id = e.id and s.state = 'missed') as days_missed,
             (select max(t.submitted_at) from task_submissions t
               where t.enrolment_id = e.id) as last_submission_at,
             (select count(*) from ch_leads l
               where l.participant_id = e.participant_id) as leads,
             (select count(*) from ch_lead_activities a
               where a.participant_id = e.participant_id
                 and a.happened_at > now() - interval '7 days') as touches_7d,
             case
               when e.status <> 'active' then 'grey'
               -- red: nothing submitted and ≥3 missed days, or silent ≥5 days
               when (select count(*) from ch_day_state s
                      where s.enrolment_id = e.id and s.state = 'missed') >= 3
                    and (select count(*) from task_submissions t
                          where t.enrolment_id = e.id) = 0 then 'red'
               when (select max(t.submitted_at) from task_submissions t
                      where t.enrolment_id = e.id) is null
                    and e.activated_at < now() - interval '5 days' then 'red'
               when (select count(*) from ch_day_state s
                      where s.enrolment_id = e.id and s.state = 'missed') >= 2 then 'amber'
               when (select max(t.submitted_at) from task_submissions t
                      where t.enrolment_id = e.id) < now() - interval '3 days' then 'amber'
               else 'green' end as alert_level
      from enrolments e
      join profiles p on p.id = e.participant_id
      join cohorts c on c.id = e.cohort_id
      left join coach_assignments ca on ca.participant_id = e.participant_id and ca.active
      left join profiles ch on ch.id = ca.coach_id
      where e.status not in ('withdrawn', 'draft')) x), '[]'::jsonb);
end $$;
revoke all on function fn_pilot_watch() from public, anon;
grant execute on function fn_pilot_watch() to authenticated;

-- ------------------------------------------------------------
-- 4. CONTENT WORKFLOW: every country row still waiting for authorised content,
--    plus who (if anyone) owns content for that country.
-- (Section 4, a zero-arg fn_content_gaps(), was REMOVED after it collided
--  with 081's fn_content_gaps(uuid) and made both unroutable - HTTP 300.
--  The replacement, fn_content_board(), lives in 098_fix_content_board.sql.)


-- ------------------------------------------------------------
-- 5. VERIFY
-- ------------------------------------------------------------
select 'phase3 functions' as check, proname from pg_proc
 where proname in ('fn_authority_board','fn_verifier_queue','fn_pilot_watch','fn_content_board')
 order by proname;
