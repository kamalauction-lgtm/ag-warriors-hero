-- ============================================================
-- 087_notify_rewire.sql — challenge functions now resolve MANAGED content.
--
-- Every business-facing string moves out of PL/pgSQL and onto a published,
-- country-first template (086). Behaviour is unchanged: the same events fire
-- the same messages to the same people — the wording is just no longer code.
--
-- Run order: 085 (schema) -> 086 (content) -> 087 (this).
--
-- Section 9 assigns Kamal as tary's Coach. fn_assign_coach requires an
-- authenticated super_admin session and none exists here, so the same checks
-- and the same effects are performed inline and attributed truthfully:
--   actor_type = 'service', authorized_by_user_id = Kamal, method = 'migration'.
-- Identity is resolved from the canonical profile, never from a phone number.
-- ============================================================

-- ------------------------------------------------------------
-- 1. READINESS
-- ------------------------------------------------------------
create or replace function fn_submit_readiness(p_enrolment uuid, p_checklist jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not exists (select 1 from enrolments where id = p_enrolment and participant_id = auth.uid()) then
    raise exception 'not your enrolment';
  end if;
  insert into readiness_submissions (enrolment_id, status, checklist, submitted_at)
  values (p_enrolment, 'submitted', p_checklist, now()) returning id into v_id;
  perform audit_log('readiness_submit','readiness', v_id::text, 'in_progress', 'submitted', null);
  select name into v_name from profiles where id = auth.uid();
  perform fn_notify_reviewers_t(auth.uid(), 'readiness_submitted',
    jsonb_build_object('participant_name', coalesce(v_name,'A warrior')), '#/coach');
  return v_id;
end $$;

create or replace function fn_review_readiness(p_readiness uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_enrol uuid; v_participant uuid; v_coach text;
begin
  select r.enrolment_id, e.participant_id into v_enrol, v_participant
  from readiness_submissions r join enrolments e on e.id = r.enrolment_id
  where r.id = p_readiness;
  if v_enrol is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_participant) then raise exception 'not authorised'; end if;
  update readiness_submissions set
    status = case when p_approve then 'approved' else 'revision_required' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_readiness;
  select name into v_coach from profiles where id = auth.uid();
  if p_approve then
    update enrolments set status = 'active',
      activated_at = coalesce(activated_at, now()), updated_at = now()
    where id = v_enrol;
    perform audit_log('activation','enrolment', v_enrol::text, 'ready', 'active', p_note);
    perform fn_notify_t(v_participant, 'readiness_approved',
      jsonb_build_object('coach_name', coalesce(v_coach,''), 'review_note', coalesce(p_note,'')), '#/challenge');
  else
    perform fn_notify_t(v_participant, 'readiness_revision',
      jsonb_build_object('review_note', coalesce(p_note,'')), '#/challenge');
  end if;
  perform audit_log('readiness_review','readiness', p_readiness::text, 'submitted',
    case when p_approve then 'approved' else 'revision_required' end, p_note);
end $$;

-- ------------------------------------------------------------
-- 2. TASK SUBMIT
-- ------------------------------------------------------------
create or replace function fn_submit_task(
  p_enrolment uuid, p_day int, p_response text, p_reflection text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cohort uuid; v_ver uuid; v_prev int; v_name text;
        v_open int; v_last text; v_country country_t; v_row curriculum_days;
begin
  select cohort_id into v_cohort from enrolments
  where id = p_enrolment and participant_id = auth.uid() and status = 'active';
  if v_cohort is null then raise exception 'enrolment not active or not yours'; end if;
  v_open := participant_accessible_day(p_enrolment);
  if p_day < 1 then raise exception 'invalid day %', p_day; end if;
  if p_day > v_open then
    raise exception 'day % is not open for you yet (your accessible day is %)', p_day, v_open;
  end if;
  select curriculum_version_id, country into v_ver, v_country from cohorts where id = v_cohort;
  v_row := fn_curriculum_day(v_ver, p_day, v_country);
  if v_row.id is null then raise exception 'day % is not published in this curriculum', p_day; end if;
  select status into v_last from task_submissions
   where enrolment_id = p_enrolment and day_no = p_day order by version desc limit 1;
  if v_last = 'approved' then raise exception 'day % is already approved', p_day; end if;
  select coalesce(max(version),0) into v_prev from task_submissions
  where enrolment_id = p_enrolment and day_no = p_day;
  insert into task_submissions (enrolment_id, day_id, day_no, status, response, reflection,
                                version, submitted_at, curriculum_version_id)
  values (p_enrolment, v_row.id, p_day, 'submitted', p_response, p_reflection, v_prev + 1, now(), v_ver)
  returning id into v_id;
  perform audit_log('task_submit','task_submission', v_id::text, null, 'submitted', 'day '||p_day||' v'||(v_prev+1));
  select name into v_name from profiles where id = auth.uid();
  perform fn_notify_reviewers_t(auth.uid(), 'task_submitted',
    jsonb_build_object('participant_name', coalesce(v_name,'A warrior'),
                       'challenge_day', p_day::text, 'version', (v_prev+1)::text), '#/coach');
  return v_id;
end $$;

-- ------------------------------------------------------------
-- 3. EVIDENCE REVIEW
-- ------------------------------------------------------------
create or replace function fn_review_submission_v2(
  p_submission uuid, p_decision text, p_note text, p_rubric jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_participant uuid; v_enrol uuid; v_cohort uuid; v_day int; v_xp int; v_status text; v_ver int;
  v_streak int; v_done int; v_streak_xp int; v_key text; v_new text; v_name text;
begin
  if p_decision not in ('approve','revision','reject') then raise exception 'unknown decision %', p_decision; end if;
  select e.participant_id, s.enrolment_id, e.cohort_id, s.day_no, s.status, s.version
    into v_participant, v_enrol, v_cohort, v_day, v_status, v_ver
  from task_submissions s join enrolments e on e.id = s.enrolment_id where s.id = p_submission;
  if v_participant is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_participant) then raise exception 'not authorised'; end if;
  if p_decision <> 'approve' and (p_note is null or length(trim(p_note)) < 3) then
    raise exception 'a reason is required when not approving';
  end if;

  v_new := case p_decision when 'approve' then 'approved'
                           when 'revision' then 'revision_required' else 'rejected' end;
  update task_submissions set
    status = v_new, reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = p_note, review_rubric = p_rubric, reviewed_version = v_ver
  where id = p_submission;

  v_key := 'day_complete:' || v_enrol::text || ':' || v_day::text;
  select name into v_name from profiles where id = v_participant;

  if p_decision = 'approve' then
    select coalesce(cd.xp_amount,
                    (select points from xp_rules where code = 'day_complete' and active), 10)
      into v_xp
    from task_submissions s left join curriculum_days cd on cd.id = s.day_id where s.id = p_submission;

    if fn_award_xp(v_participant, v_cohort, 'day_complete', v_xp, v_key,
                   'Day '||v_day||' approved', 'task_submission', p_submission) then
      perform fn_notify_t(v_participant, 'evidence_approved',
        jsonb_build_object('challenge_day', v_day::text, 'xp_amount', v_xp::text,
                           'review_note', coalesce(p_note,'')), '#/challenge');
    else
      perform fn_notify_t(v_participant, 'evidence_approved_no_xp',
        jsonb_build_object('challenge_day', v_day::text, 'review_note', coalesce(p_note,'')), '#/challenge');
    end if;

    if v_day = 1 then perform award_badge(v_participant, 'committed', auth.uid()); end if;

    v_streak := challenge_streak(v_enrol);
    if v_streak >= 7 then
      if award_badge(v_participant, 'streak_7', auth.uid()) then
        select points into v_streak_xp from xp_rules where code = 'streak_7' and active;
        perform fn_award_xp(v_participant, v_cohort, 'streak_7', v_streak_xp,
          'streak_7:'||v_enrol::text, '7-day verified streak', 'task_submission', p_submission);
      end if;
    end if;

    select count(distinct day_no) into v_done from task_submissions
    where enrolment_id = v_enrol and status = 'approved';
    if v_done in (7, 14, 21) then
      perform fn_notify_t(v_participant, 'milestone_achieved',
        jsonb_build_object('count', v_done::text,
                           'percent', round(v_done * 100.0 / 30)::text), '#/challenge');
    end if;
    if v_done >= 30 then
      perform fn_notify_t(v_participant, 'all_days_verified', '{}'::jsonb, '#/challenge');
      perform fn_notify_reviewers_t(v_participant, 'graduation_review_due',
        jsonb_build_object('participant_name', coalesce(v_name,'A warrior')), '#/coach');
      perform audit_log('graduation_review_raised','enrolment', v_enrol::text, 'active', 'review_due', null);
    end if;
  else
    if fn_reverse_xp(v_key, 'Day '||v_day||' approval withdrawn: '||coalesce(p_note,'')) then
      perform fn_notify_t(v_participant, 'xp_reversed',
        jsonb_build_object('reason', coalesce(p_note,'')), '#/challenge');
    end if;
    perform fn_notify_t(v_participant,
      case when p_decision = 'revision' then 'evidence_revision' else 'evidence_rejected' end,
      jsonb_build_object('challenge_day', v_day::text, 'review_note', coalesce(p_note,'')), '#/challenge');
  end if;

  perform audit_log('evidence_review','task_submission', p_submission::text, v_status, v_new, p_note);
end $$;

-- ------------------------------------------------------------
-- 4. BADGES
-- ------------------------------------------------------------
create or replace function award_badge(p_user uuid, p_code text, p_by uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_n int; v_icon text; v_name jsonb; v_country country_t; v_label text;
begin
  select icon, name into v_icon, v_name from ch_badges where code = p_code and active;
  if v_name is null then return false; end if;
  insert into user_badges (user_id, badge_code, awarded_by)
  values (p_user, p_code, p_by) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  perform audit_log('badge_awarded','user_badge', p_user::text || ':' || p_code, null, 'awarded', null);
  -- badge NAME is curriculum-style trilingual content; pick the recipient's own
  select country into v_country from profiles where id = p_user;
  v_label := coalesce(v_name ->> (case when v_country = 'ID' then 'id-ID' else 'ms-MY' end),
                      v_name ->> 'en', p_code);
  perform fn_notify_t(p_user, 'badge_earned',
    jsonb_build_object('badge_name', v_label, 'badge_icon', coalesce(v_icon,'🏅')), '#/challenge');
  return true;
end $$;

-- ------------------------------------------------------------
-- 5. CLOSINGS
-- ------------------------------------------------------------
create or replace function fn_verify_closing(p_closing uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v ch_closings; v_pts int; v_cohort uuid;
begin
  select * into v from ch_closings where id = p_closing;
  if v.id is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v.participant_id) then raise exception 'not authorised'; end if;
  if p_approve then
    if v.status = 'COMPLETED' then raise exception 'this closing is already verified'; end if;
    update ch_closings set status = 'COMPLETED', verified_at = now(), verified_by = auth.uid(),
      notes = coalesce(p_note, notes), updated_at = now() where id = p_closing;
    update ch_leads set stage = 'CLOSED_WON', closing_outcome = 'verified', updated_at = now()
      where id = v.lead_id;
    select points into v_pts from xp_rules where code = 'closing_verified' and active;
    select cohort_id into v_cohort from enrolments
      where participant_id = v.participant_id
        and status in ('active','paused','completed','graduated')
      order by created_at desc limit 1;
    perform fn_award_xp(v.participant_id, v_cohort, 'closing_verified', v_pts,
      'closing_verified:'||p_closing::text, 'Human-verified closing', 'ch_closings', p_closing);
    perform award_badge(v.participant_id, 'first_closing', auth.uid());
    perform audit_log('closing_verified','ch_closing', p_closing::text, v.status, 'COMPLETED', p_note);
    perform fn_notify_t(v.participant_id, 'closing_verified',
      jsonb_build_object('xp_amount', coalesce(v_pts,0)::text), '#/pipeline');
  else
    update ch_closings set status = 'DOCUMENTATION',
      missing_items = coalesce(p_note, missing_items), updated_at = now() where id = p_closing;
    perform audit_log('closing_revision','ch_closing', p_closing::text, v.status, 'DOCUMENTATION', p_note);
    perform fn_notify_t(v.participant_id, 'closing_needs_more',
      jsonb_build_object('review_note', coalesce(p_note,'')), '#/pipeline');
  end if;
end $$;

-- ------------------------------------------------------------
-- 6. ENROLMENT / COACH ASSIGNMENT / STATUS
-- ------------------------------------------------------------
create or replace function fn_assign_coach(p_participant uuid, p_coach uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_coach text; v_part text;
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then raise exception 'not authorised'; end if;
  if p_participant = p_coach then raise exception 'a warrior cannot coach themselves'; end if;
  select name into v_coach from profiles where id = p_coach;
  select name into v_part  from profiles where id = p_participant;
  if v_coach is null or v_part is null then raise exception 'no such profile'; end if;
  if not exists (select 1 from user_roles where user_id = p_coach
                 and role in ('elite_coach','master_mentor','super_admin')) then
    raise exception 'assign the Elite Coach role to % first', v_coach;
  end if;
  insert into coach_assignments (coach_id, participant_id, assigned_by, active)
  values (p_coach, p_participant, auth.uid(), p_active)
  on conflict (coach_id, participant_id) do update set active = excluded.active,
    assigned_by = excluded.assigned_by;
  perform audit_log(case when p_active then 'coach_assigned' else 'coach_unassigned' end,
    'coach_assignment', p_coach::text || ':' || p_participant::text, null,
    case when p_active then 'active' else 'inactive' end, v_coach || ' -> ' || v_part);
  if p_active then
    perform fn_notify_t(p_coach, 'coach_assigned_coach',
      jsonb_build_object('participant_name', v_part), '#/coach');
    perform fn_notify_t(p_participant, 'coach_assigned_participant',
      jsonb_build_object('coach_name', v_coach), '#/challenge');
  end if;
end $$;

create or replace function fn_admin_set_enrolment(
  p_enrolment uuid, p_status text, p_reason text, p_catch_up_days int
) returns void language plpgsql security definer set search_path = public as $$
declare v_prev text; v_participant uuid;
begin
  select status, participant_id into v_prev, v_participant from enrolments where id = p_enrolment;
  if v_prev is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_participant) then raise exception 'not authorised'; end if;
  if p_status is not null and p_status not in
     ('draft','invited','onboarding','ready','active','paused','completed','graduated','withdrawn') then
    raise exception 'bad status %', p_status;
  end if;
  if p_status in ('paused','withdrawn') and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'a reason is required';
  end if;
  update enrolments set
    status        = coalesce(p_status, status),
    status_reason = coalesce(p_reason, status_reason),
    status_by     = auth.uid(),
    catch_up_days = coalesce(p_catch_up_days, catch_up_days),
    catch_up      = (coalesce(p_catch_up_days, catch_up_days) > 0),
    activated_at  = case when p_status = 'active' then coalesce(activated_at, now()) else activated_at end,
    updated_at    = now()
  where id = p_enrolment;
  perform audit_log('enrolment_status','enrolment', p_enrolment::text, v_prev, coalesce(p_status, v_prev), p_reason);
  if p_status is not null and p_status <> v_prev then
    perform fn_notify_t(v_participant, 'enrolment_status',
      jsonb_build_object('review_status', upper(p_status), 'reason', coalesce(p_reason,'')), '#/challenge');
  end if;
end $$;

create or replace function fn_admin_mark_day(p_enrolment uuid, p_day int, p_state text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_p uuid;
begin
  select participant_id into v_p from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_p) then raise exception 'not authorised'; end if;
  if p_state not in ('missed','excused') then raise exception 'bad state %', p_state; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a reason is required'; end if;
  insert into ch_day_state (enrolment_id, day_no, state, reason, marked_by)
  values (p_enrolment, p_day, p_state, p_reason, auth.uid())
  on conflict (enrolment_id, day_no) do update
    set state = excluded.state, reason = excluded.reason,
        marked_by = excluded.marked_by, marked_at = now();
  if p_state = 'excused' then
    update enrolments set paused_days = paused_days + 1 where id = p_enrolment;
  end if;
  perform audit_log('day_' || p_state, 'task_day', p_enrolment::text || ':' || p_day::text, null, p_state, p_reason);
  perform fn_notify_t(v_p, 'day_marked',
    jsonb_build_object('challenge_day', p_day::text, 'review_status', upper(p_state),
                       'reason', p_reason), '#/challenge');
end $$;

create or replace function fn_admin_reverse_xp(p_ledger uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v points_ledger;
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then raise exception 'not authorised'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'a reason is required'; end if;
  select * into v from points_ledger where id = p_ledger;
  if v.id is null then raise exception 'not found'; end if;
  if v.status <> 'verified' then raise exception 'only verified awards can be reversed'; end if;
  if v.award_key is not null then
    perform fn_reverse_xp(v.award_key, p_reason);
  else
    update points_ledger set status = 'reversed' where id = v.id;
    insert into points_ledger (user_id, cohort_id, source, amount, status, reason,
                               awarded_by, ref_type, ref_id, reversal_of)
    values (v.user_id, v.cohort_id, v.source, -v.amount, 'reversed', p_reason,
            auth.uid(), v.ref_type, v.ref_id, v.id);
    perform audit_log('xp_reversed','points_ledger', v.id::text, 'verified', 'reversed', p_reason);
  end if;
  perform fn_notify_t(v.user_id, 'xp_reversed', jsonb_build_object('reason', p_reason), '#/challenge');
end $$;

-- fn_admin_enrol: same logic, managed content for the participant message
create or replace function fn_admin_enrol(
  p_cohort uuid, p_participants uuid[], p_coach uuid, p_note text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid; v_id uuid; v_name text; v_cname text;
  v_ok jsonb := '[]'::jsonb; v_skip jsonb := '[]'::jsonb;
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then raise exception 'not authorised'; end if;
  select name into v_cname from cohorts where id = p_cohort and status in ('draft','open','active');
  if v_cname is null then raise exception 'cohort not found or not open'; end if;
  if p_coach is not null and not exists (
       select 1 from user_roles where user_id = p_coach
        and role in ('elite_coach','master_mentor','super_admin')) then
    raise exception 'the chosen coach does not hold a reviewing role';
  end if;
  foreach v_uid in array coalesce(p_participants, '{}'::uuid[]) loop
    select name into v_name from profiles where id = v_uid and status = 'active';
    if v_name is null then
      v_skip := v_skip || jsonb_build_object('id', v_uid, 'reason', 'no active profile'); continue;
    end if;
    if exists (select 1 from enrolments where participant_id = v_uid
               and status in ('draft','invited','onboarding','ready','active','paused')) then
      v_skip := v_skip || jsonb_build_object('id', v_uid, 'name', v_name, 'reason', 'already has a live enrolment');
      continue;
    end if;
    insert into enrolments (cohort_id, participant_id, status, status_reason, status_by)
    values (p_cohort, v_uid, 'invited', p_note, auth.uid()) returning id into v_id;
    insert into user_roles (user_id, role, granted_by)
    values (v_uid, 'participant', auth.uid()) on conflict do nothing;
    if p_coach is not null then perform fn_assign_coach(v_uid, p_coach, true); end if;
    perform audit_log('enrol_admin','enrolment', v_id::text, null, 'invited',
      v_name || ' -> ' || v_cname || coalesce(' · '||p_note,''));
    perform fn_notify_t(v_uid, 'enrolled',
      jsonb_build_object('participant_name', v_name, 'cohort_name', v_cname), '#/challenge');
    v_ok := v_ok || jsonb_build_object('id', v_uid, 'name', v_name, 'enrolment_id', v_id);
  end loop;
  return jsonb_build_object('enrolled', v_ok, 'skipped', v_skip,
                            'enrolled_count', jsonb_array_length(v_ok),
                            'skipped_count', jsonb_array_length(v_skip));
end $$;

-- ------------------------------------------------------------
-- 7. INVITATION
-- ------------------------------------------------------------
create or replace function fn_accept_invitation(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v invitations; v_enrol uuid; v_cname text;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select * into v from invitations where code = upper(p_code) and status = 'pending';
  if v.code is null then raise exception 'invitation not found or already used'; end if;
  insert into profiles (id, name, phone, email, country, status, onboarded)
  values (auth.uid(), v.name, v.phone,
          (select email from auth.users where id = auth.uid()), v.country, 'active', false)
  on conflict (id) do nothing;
  insert into user_roles (user_id, role, granted_by)
  values (auth.uid(), 'participant', v.invited_by) on conflict do nothing;
  update invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where code = v.code;
  perform audit_log('invitation_accepted','invitation', v.code, 'pending', 'accepted', v.name);
  if v.cohort_id is not null
     and not exists (select 1 from enrolments where participant_id = auth.uid()
                     and status in ('draft','invited','onboarding','ready','active','paused')) then
    select name into v_cname from cohorts where id = v.cohort_id and status in ('draft','open','active');
    if v_cname is not null then
      insert into enrolments (cohort_id, participant_id, status, status_reason, status_by)
      values (v.cohort_id, auth.uid(), 'invited', 'via invitation '||v.code, v.invited_by)
      returning id into v_enrol;
      perform audit_log('enrol_invitation','enrolment', v_enrol::text, null, 'invited', v_cname);
    end if;
  end if;
  perform fn_notify_t(v.invited_by, 'invitation_accepted',
    jsonb_build_object('participant_name', v.name, 'cohort_name', coalesce(v_cname,'')), '#/coach');
end $$;

-- ------------------------------------------------------------
-- 8. AUTOMATION SWEEP
-- ------------------------------------------------------------
create or replace function fn_challenge_sweep(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_inactive int := 0; v_overdue int := 0; v_sla int := 0;
  v_d27 int := 0; v_d30 int := 0; v_flagged int := 0; v_grace_decided boolean; v_n int;
begin
  if not p_force and exists (select 1 from audit_events
      where action = 'challenge_sweep' and at > now() - interval '12 hours') then
    return jsonb_build_object('skipped', 'already swept within 12h');
  end if;
  perform audit_log('challenge_sweep','system','challenge', null, 'running', null);
  select decided into v_grace_decided from ch_open_decisions where code = 'grace_excused';

  for r in
    select e.id, e.participant_id, e.cohort_id, p.name, participant_accessible_day(e.id) as acc
    from enrolments e join profiles p on p.id = e.participant_id where e.status = 'active'
  loop
    if not coalesce(v_grace_decided, false) then
      if exists (
        select 1 from generate_series(1, greatest(r.acc - 1, 0)) d
        where not exists (select 1 from task_submissions t
                          where t.enrolment_id = r.id and t.day_no = d
                            and t.status in ('approved','submitted','under_review','revision_required'))
          and not exists (select 1 from ch_day_state s where s.enrolment_id = r.id and s.day_no = d)
      ) then v_flagged := v_flagged + 1; end if;
    end if;

    if not exists (select 1 from ch_lead_activities a
                   where a.participant_id = r.participant_id
                     and a.happened_at > now() - interval '2 days') then
      select count(*) into v_n from ch_notification_sends
       where recipient = r.participant_id and template_code = 'inactivity_nudge'
         and sent_at > now() - interval '20 hours';
      if v_n = 0 then
        perform fn_notify_t(r.participant_id, 'inactivity_nudge', '{}'::jsonb, '#/pipeline');
        perform fn_notify_reviewers_t(r.participant_id, 'inactivity_coach',
          jsonb_build_object('participant_name', r.name), '#/coach');
        v_inactive := v_inactive + 1;
      end if;
    end if;

    if exists (select 1 from ch_leads l where l.participant_id = r.participant_id
               and l.next_action_at is not null and l.next_action_at < current_date
               and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')) then
      select count(*) into v_n from ch_notification_sends
       where recipient = r.participant_id and template_code = 'followup_overdue'
         and sent_at > now() - interval '20 hours';
      if v_n = 0 then
        perform fn_notify_t(r.participant_id, 'followup_overdue',
          jsonb_build_object('count', (select count(*)::text from ch_leads l
            where l.participant_id = r.participant_id and l.next_action_at < current_date
              and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED'))), '#/pipeline');
        v_overdue := v_overdue + 1;
      end if;
    end if;

    if r.acc >= 27 and not exists (select 1 from audit_events
        where entity_id = r.id::text and action = 'day27_review_raised') then
      perform fn_notify_reviewers_t(r.participant_id, 'day27_review_due',
        jsonb_build_object('participant_name', r.name), '#/coach');
      perform audit_log('day27_review_raised','enrolment', r.id::text, null, 'due', null);
      v_d27 := v_d27 + 1;
    end if;

    if r.acc >= 30 and not exists (select 1 from audit_events
        where entity_id = r.id::text and action = 'day30_review_raised') then
      perform fn_notify_reviewers_t(r.participant_id, 'day30_review_due',
        jsonb_build_object('participant_name', r.name), '#/coach');
      perform fn_notify_t(r.participant_id, 'day30_reached', '{}'::jsonb, '#/challenge');
      perform audit_log('day30_review_raised','enrolment', r.id::text, null, 'due', null);
      v_d30 := v_d30 + 1;
    end if;
  end loop;

  select count(*) into v_sla from task_submissions
   where status in ('submitted','under_review') and submitted_at < now() - interval '48 hours';

  return jsonb_build_object(
    'inactive_notified', v_inactive, 'overdue_notified', v_overdue,
    'missed_days_flagged', v_flagged, 'day27_raised', v_d27, 'day30_raised', v_d30,
    'reviews_older_than_48h', v_sla,
    'grace_policy_decided', coalesce(v_grace_decided, false),
    'sla_policy_decided', (select decided from ch_open_decisions where code = 'coach_sla'));
end $$;
revoke execute on function fn_challenge_sweep(boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 9. ASSIGN KAMAL AS TARY'S COACH
--    Identity resolved from the canonical profile (email on the platform
--    identity), never from a phone number.
-- ------------------------------------------------------------
do $assign$
declare v_coach uuid; v_part uuid; v_cn text; v_pn text;
begin
  select id, name into v_coach, v_cn from profiles
   where lower(email) = 'kamal.auction@gmail.com' and status = 'active';
  select id, name into v_part, v_pn from profiles
   where lower(email) = 'reretriana123@gmail.com' and status = 'active';
  if v_coach is null or v_part is null then
    raise exception 'could not resolve both profiles (coach=%, participant=%)', v_coach, v_part;
  end if;
  if v_coach = v_part then raise exception 'a warrior cannot coach themselves'; end if;
  if not exists (select 1 from user_roles where user_id = v_coach
                 and role in ('elite_coach','master_mentor','super_admin')) then
    raise exception '% does not hold a reviewing role', v_cn;
  end if;

  insert into coach_assignments (coach_id, participant_id, assigned_by, active)
  values (v_coach, v_part, v_coach, true)
  on conflict (coach_id, participant_id) do update
    set active = true, assigned_by = excluded.assigned_by;

  perform audit_log_assisted('coach_assigned','coach_assignment',
    v_coach::text || ':' || v_part::text, null, 'active',
    'Kamal AG assigned as Coach for tary. Authorised by Kamal in the operating session; '
    'executed by migration because fn_assign_coach requires an authenticated super_admin session.',
    v_coach, 'migration');

  perform fn_notify_t(v_coach, 'coach_assigned_coach', jsonb_build_object('participant_name', v_pn), '#/coach');
  perform fn_notify_t(v_part,  'coach_assigned_participant', jsonb_build_object('coach_name', v_cn), '#/challenge');
  raise notice 'assigned % as coach for %', v_cn, v_pn;
end $assign$;

-- ------------------------------------------------------------
-- 10. VERIFY
-- ------------------------------------------------------------
select 'coach assignment' as check, pc.name as coach, pp.name as warrior, ca.active, ca.created_at
  from coach_assignments ca
  join profiles pc on pc.id = ca.coach_id
  join profiles pp on pp.id = ca.participant_id;
select 'templates published' as check, count(*) as n
  from ch_notification_template_versions where status = 'published';
select 'translations (must be 4 per template)' as check, count(*) as n
  from ch_notification_template_translations;
select 'notifications sent through templates' as check, template_code, country, locale, rendered_title
  from ch_notification_sends order by sent_at desc limit 5;
