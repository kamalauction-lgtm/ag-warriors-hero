-- ============================================================
-- 079_challenge_p0.sql — 30 DAYS v2, P0: data / access / security / activation
-- Closes the 7 critical findings of AUDIT-30-DAYS-2026-08-23.md.
--
-- ADDITIVE ONLY. No table dropped, no historical row deleted.
-- Policies are replaced (drop+create) because the originals are unsafe.
--
-- P0.1 Admin enrolment path            → fn_admin_create_cohort / fn_admin_enrol / fn_admin_set_enrolment
-- P0.2 participant accessible day      → enrolments.activated_at + participant_accessible_day()
-- P0.3 RLS INSERT holes                → w_subs_self / w_ready_self replaced (RPC-only writes)
-- P0.4 award_badge lockdown            → execute revoked from authenticated
-- P0.5 XP idempotency + reversal       → points_ledger.award_key + fn_award_xp / fn_reverse_xp
-- P0.6 evidence review                 → fn_review_detail + decision/rubric on task_submissions
-- P0.7 role reconciliation             → has_role() maps profiles.role → challenge roles
-- ============================================================

-- ------------------------------------------------------------
-- 1. SCHEMA (additive)
-- ------------------------------------------------------------

-- P0.2 — a participant's own clock, independent of the cohort calendar
alter table enrolments add column if not exists activated_at   timestamptz;
alter table enrolments add column if not exists start_offset   int not null default 0;  -- head start granted at enrolment
alter table enrolments add column if not exists catch_up_days  int not null default 0;  -- extra days granted by a coach
alter table enrolments add column if not exists paused_days    int not null default 0;  -- days excluded (pause / excused)
comment on column enrolments.activated_at  is 'Set when readiness is approved. Anchor for participant_accessible_day().';
comment on column enrolments.start_offset  is 'Days of head start granted at enrolment (0 = starts at Day 1).';
comment on column enrolments.catch_up_days is 'Extra accessible days granted by an authorised coach.';
comment on column enrolments.paused_days   is 'Calendar days excluded from the participant clock (pause / excused).';

-- one live enrolment per warrior across all cohorts
create unique index if not exists uq_enrol_one_live on enrolments (participant_id)
  where status in ('draft','invited','onboarding','ready','active','paused');

-- P0.5 — stable logical identity for an XP award
alter table points_ledger add column if not exists award_key text;
comment on column points_ledger.award_key is
  'Stable logical identity of the award (e.g. day_complete:<enrolment>:<day>). Unique — makes awarding idempotent.';
-- Predicate is on status = 'verified', NOT on the row's existence: a reversed award
-- drops out of the index, so a later legitimate re-approval can award again, while a
-- second approval of a still-verified award cannot.
create unique index if not exists uq_points_award_key on points_ledger (award_key)
  where award_key is not null and status = 'verified';

-- P0.6 — reviews need a decision vocabulary wider than approve/revise, and a rubric
alter table task_submissions add column if not exists curriculum_version_id uuid references curriculum_versions(id);
alter table task_submissions add column if not exists review_rubric jsonb;
alter table task_submissions add column if not exists reviewed_version int;
comment on column task_submissions.curriculum_version_id is
  'Curriculum version this submission was answered against. Frozen at submit time.';
comment on column task_submissions.review_rubric is 'Reviewer rubric scores/flags, jsonb. Structure is admin-configurable.';
comment on column task_submissions.reviewed_version is 'submission.version at the moment of review (audit anchor).';

-- allow an explicit reject decision
alter table task_submissions drop constraint if exists task_submissions_status_check;
alter table task_submissions add constraint task_submissions_status_check check (status in
  ('locked','available','in_progress','submitted','under_review','approved','revision_required','rejected','missed','excused'));

-- ------------------------------------------------------------
-- 2. P0.7 — ONE canonical authorisation resolution
--    profiles.role (platform) is mapped onto the challenge role vocabulary.
--    user_roles stays authoritative for explicit grants; nothing is destroyed.
-- ------------------------------------------------------------
create or replace function has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = r)
      or exists (
        select 1 from profiles p where p.id = auth.uid() and (
          -- master_admin is every challenge role
          p.role = 'master_admin'
          -- country_admin governs a country → master_mentor authority
          or (p.role = 'country_admin' and r in ('master_mentor','elite_coach'))
          -- leader / Captain reviews their assigned warriors → elite_coach authority
          or (p.role = 'leader' and r = 'elite_coach')
        )
      );
$$;
comment on function has_role(text) is
  'Canonical challenge authorisation. Resolves explicit user_roles grants AND the platform profiles.role hierarchy: master_admin=all, country_admin=master_mentor+elite_coach, leader=elite_coach.';

-- what the UI should gate on (never profiles.role directly)
create or replace function my_challenge_roles() returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when has_role('super_admin')   then 'super_admin'   end,
    case when has_role('master_mentor') then 'master_mentor' end,
    case when has_role('elite_coach')   then 'elite_coach'   end,
    case when has_role('participant')   then 'participant'   end
  ], null);
$$;
grant execute on function my_challenge_roles() to authenticated;

-- is the caller allowed to review this participant?
create or replace function is_reviewer_of(p_participant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_participant <> auth.uid(), false) and (
    has_role('super_admin') or has_role('master_mentor')
    or (has_role('elite_coach') and is_my_coach_participant(p_participant))
  );
$$;
grant execute on function is_reviewer_of(uuid) to authenticated;

-- does the caller have any coaching surface at all? (gates /coach in the UI)
create or replace function has_coach_surface() returns boolean
language sql stable security definer set search_path = public as $$
  select has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach');
$$;
comment on function has_coach_surface() is
  'Gates /coach. An elite_coach with no assignments yet still reaches the page (they see an empty queue) — what they may act on is enforced per-participant by is_reviewer_of().';
grant execute on function has_coach_surface() to authenticated;

-- ------------------------------------------------------------
-- 3. P0.2 — THREE SEPARATE DAY CONCEPTS, resolved server-side
-- ------------------------------------------------------------

-- the cohort's *local* programme date, honouring daily_unlock_time
create or replace function cohort_local_date(p_cohort uuid) returns date
language sql stable security definer set search_path = public as $$
  select case
           when (now() at time zone c.official_timezone)::time < c.daily_unlock_time
             then ((now() at time zone c.official_timezone)::date - 1)
           else (now() at time zone c.official_timezone)::date
         end
  from cohorts c where c.id = p_cohort;
$$;

-- COHORT DAY — where the shared cohort is on the calendar. Unchanged meaning, correct clock.
create or replace function cohort_day(p_cohort uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, least(30, cohort_local_date(c.id) - c.official_start_date + 1))::int
  from cohorts c where c.id = p_cohort;
$$;

-- PARTICIPANT ACCESSIBLE DAY — the latest day THIS warrior may open.
-- 0 = nothing accessible (not active yet). Never exceeds the cohort day.
create or replace function participant_accessible_day(p_enrolment uuid) returns int
language sql stable security definer set search_path = public as $$
  select case
    when e.status <> 'active' then 0
    when e.activated_at is null then 0
    else greatest(0, least(
      30,
      cohort_day(e.cohort_id),                                  -- never ahead of the cohort
      (cohort_local_date(e.cohort_id)
        - (e.activated_at at time zone c.official_timezone)::date + 1)
        + e.start_offset + e.catch_up_days - e.paused_days      -- the warrior's own clock
    ))::int
  end
  from enrolments e join cohorts c on c.id = e.cohort_id
  where e.id = p_enrolment;
$$;
comment on function participant_accessible_day(uuid) is
  'P0.2 — min(cohort_day, days_since_activation + start_offset + catch_up_days - paused_days), 0 unless ACTIVE. Authoritative; the client must never compute day access.';
grant execute on function participant_accessible_day(uuid) to authenticated;
grant execute on function cohort_day(uuid) to authenticated;
grant execute on function cohort_local_date(uuid) to authenticated;

-- one call the participant screen can trust for all three concepts
create or replace function my_challenge_clock() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'enrolment_id', e.id,
      'cohort_id', e.cohort_id,
      'cohort_name', c.name,
      'cohort_country', c.country,
      'cohort_day', cohort_day(e.cohort_id),
      'participant_stage', e.status,
      'accessible_day', participant_accessible_day(e.id),
      'activated_at', e.activated_at,
      'catch_up', e.catch_up,
      'timezone', c.official_timezone
    )
    from enrolments e join cohorts c on c.id = e.cohort_id
    where e.participant_id = auth.uid()
      and e.status in ('draft','invited','onboarding','ready','active','paused')
    order by e.created_at desc limit 1
  ), jsonb_build_object('enrolment_id', null, 'participant_stage', 'none',
                        'cohort_day', 0, 'accessible_day', 0));
$$;
grant execute on function my_challenge_clock() to authenticated;

-- ------------------------------------------------------------
-- 4. P0.5 — XP: idempotent award + real reversal (append-only)
-- ------------------------------------------------------------
create or replace function fn_award_xp(
  p_user uuid, p_cohort uuid, p_source text, p_amount int, p_key text,
  p_reason text, p_ref_type text, p_ref_id uuid, p_status text default 'verified'
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount = 0 then return false; end if;
  -- idempotency: this logical award is already standing → do nothing, no error
  if exists (select 1 from points_ledger
              where award_key = p_key and status = 'verified') then
    return false;
  end if;
  begin
    insert into points_ledger (user_id, cohort_id, source, amount, status, reason,
                               awarded_by, ref_type, ref_id, award_key)
    values (p_user, p_cohort, p_source, p_amount, p_status, p_reason,
            auth.uid(), p_ref_type, p_ref_id, p_key);
  exception when unique_violation then
    return false;                       -- concurrent reviewer won the race; still exactly once
  end;
  perform audit_log('xp_awarded','points_ledger', p_key, null, p_status, p_reason);
  return true;
end $$;
comment on function fn_award_xp(uuid,uuid,text,int,text,text,text,uuid,text) is
  'P0.5 — the ONLY way challenge XP is written. award_key makes submit→approve→revise→resubmit→approve award exactly once.';

-- reverse an award without destroying it: original → reversed, plus a negative reversal row
create or replace function fn_reverse_xp(p_key text, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v points_ledger;
begin
  select * into v from points_ledger
   where award_key = p_key and reversal_of is null and status = 'verified' limit 1;
  if v.id is null then return false; end if;
  update points_ledger set status = 'reversed' where id = v.id;
  insert into points_ledger (user_id, cohort_id, source, amount, status, reason,
                             awarded_by, ref_type, ref_id, reversal_of)
  values (v.user_id, v.cohort_id, v.source, -v.amount, 'reversed',
          coalesce(p_reason,'reversal'), auth.uid(), v.ref_type, v.ref_id, v.id);
  perform audit_log('xp_reversed','points_ledger', p_key, 'verified', 'reversed', p_reason);
  return true;
end $$;

-- authorised human reversal (mis-approval repair)
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
  perform fn_notify(v.user_id, 'xp', '↩️ XP adjusted',
    'An XP award was reversed by a reviewer. Reason: ' || p_reason, '#/challenge');
end $$;
grant execute on function fn_admin_reverse_xp(uuid,text) to authenticated;
revoke execute on function fn_award_xp(uuid,uuid,text,int,text,text,text,uuid,text) from public, anon, authenticated;
revoke execute on function fn_reverse_xp(text,text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. P0.4 — badges may only be awarded by an authorised rule or human
-- ------------------------------------------------------------
revoke execute on function award_badge(uuid,text,uuid) from public, anon, authenticated;

create or replace function fn_admin_award_badge(p_user uuid, p_code text, p_reason text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_reviewer_of(p_user) then raise exception 'not authorised'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a reason is required'; end if;
  perform audit_log('badge_awarded_manual','user_badge', p_user::text||':'||p_code, null, 'awarded', p_reason);
  return award_badge(p_user, p_code, auth.uid());
end $$;
grant execute on function fn_admin_award_badge(uuid,text,text) to authenticated;

create or replace function fn_admin_revoke_badge(p_user uuid, p_code text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then raise exception 'not authorised'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'a reason is required'; end if;
  delete from user_badges where user_id = p_user and badge_code = p_code;
  perform audit_log('badge_revoked','user_badge', p_user::text||':'||p_code, 'awarded', null, p_reason);
end $$;
grant execute on function fn_admin_revoke_badge(uuid,text,text) to authenticated;

-- ch_badges.rule was designed as a declarative award expression and never wired.
-- Make its inactive state explicit rather than pretending it works. OPEN DECISION: thresholds.
alter table ch_badges add column if not exists rule_active boolean not null default false;
comment on column ch_badges.rule is
  'OPEN DECISION — declarative award expression. Not evaluated by any code. rule_active stays false until thresholds are approved.';

-- ------------------------------------------------------------
-- 6. P0.3 — RLS: close the INSERT holes.
--    Participants write submissions ONLY through the RPCs. The RPCs are the
--    single place the accessible-day and ownership rules live.
-- ------------------------------------------------------------
drop policy if exists w_subs_self  on task_submissions;
drop policy if exists w_ready_self on readiness_submissions;
drop policy if exists w_admin_enrol on enrolments;   -- replaced by fn_admin_enrol

-- readiness: no client write at all (fn_submit_readiness / fn_review_readiness only)
-- task submissions: no client write at all (fn_submit_task / fn_review_submission only)

-- evidence: participant may attach ONLY to their own, still-open submission
drop policy if exists w_evi_self on evidence_assets;
create policy w_evi_self on evidence_assets for insert with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from task_submissions s join enrolments e on e.id = s.enrolment_id
    where s.id = submission_id
      and e.participant_id = auth.uid()
      and s.status in ('in_progress','submitted','revision_required')
  )
);

-- enrolment self-update stays, but may never touch the participant clock
drop policy if exists w_enrol_self on enrolments;
create policy w_enrol_self on enrolments for update
  using (participant_id = auth.uid() and status in ('draft','invited','onboarding','ready'))
  with check (participant_id = auth.uid() and status in ('draft','invited','onboarding','ready'));

-- P1-4 down-payment: a participant may not declare their own verified closing.
-- CLOSED_WON is reachable only through fn_verify_closing (security definer).
drop policy if exists u_ch_leads on ch_leads;
create policy u_ch_leads on ch_leads for update
  using (participant_id = auth.uid() or is_reviewer_of(participant_id))
  with check (
    (is_reviewer_of(participant_id))
    or (participant_id = auth.uid() and stage <> 'CLOSED_WON')
  );

-- ------------------------------------------------------------
-- 7. P0.6 — evidence review: everything a reviewer needs, in one authorised call
-- ------------------------------------------------------------
create or replace function fn_review_detail(p_submission uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_participant uuid; v_enrol uuid; v_day int; v_out jsonb;
begin
  select e.participant_id, s.enrolment_id, s.day_no
    into v_participant, v_enrol, v_day
  from task_submissions s join enrolments e on e.id = s.enrolment_id
  where s.id = p_submission;
  if v_participant is null then raise exception 'not found'; end if;
  if not (v_participant = auth.uid() or is_reviewer_of(v_participant)) then
    raise exception 'not authorised';
  end if;

  select jsonb_build_object(
    'submission', to_jsonb(s) - 'review_rubric',
    'rubric', s.review_rubric,
    'participant', jsonb_build_object('id', p.id, 'name', p.name, 'country', p.country),
    'enrolment', jsonb_build_object(
        'id', e.id, 'status', e.status, 'cohort_id', e.cohort_id,
        'cohort_day', cohort_day(e.cohort_id),
        'accessible_day', participant_accessible_day(e.id)),
    'day', jsonb_build_object(
        'day_no', cd.day_no, 'phase', cd.phase, 'title', cd.title,
        'objective', cd.objective, 'instructions', cd.instructions,
        'required_action', cd.required_action,
        'evidence_requirement', cd.evidence_requirement,
        'reflection_question', cd.reflection_question,
        'coach_guidance', cd.coach_guidance, 'xp_amount', cd.xp_amount),
    'evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', a.id, 'kind', a.kind, 'storage_path', a.storage_path,
                 'url', a.url, 'note', a.note, 'created_at', a.created_at) order by a.created_at)
        from evidence_assets a where a.submission_id = s.id), '[]'::jsonb),
    'system_evidence', jsonb_build_object(
        'leads_total',      (select count(*) from ch_leads       l where l.participant_id = p.id),
        'leads_next_action',(select count(*) from ch_leads       l where l.participant_id = p.id and l.next_action_at is not null),
        'activities_7d',    (select count(*) from ch_lead_activities a where a.participant_id = p.id and a.created_at > now() - interval '7 days'),
        'appointments',     (select count(*) from ch_appointments ap where ap.participant_id = p.id),
        'closings',         (select count(*) from ch_closings     c2 where c2.participant_id = p.id)),
    'history', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', h.id, 'version', h.version, 'status', h.status,
                 'response', h.response, 'reflection', h.reflection,
                 'submitted_at', h.submitted_at, 'reviewed_at', h.reviewed_at,
                 'review_note', h.review_note) order by h.version)
        from task_submissions h
        where h.enrolment_id = s.enrolment_id and h.day_no = s.day_no), '[]'::jsonb)
  ) into v_out
  from task_submissions s
  join enrolments e on e.id = s.enrolment_id
  join profiles   p on p.id = e.participant_id
  left join curriculum_days cd on cd.id = s.day_id
  where s.id = p_submission;

  return v_out;
end $$;
grant execute on function fn_review_detail(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. DOMAIN FUNCTIONS — rewritten on the new rules
-- ------------------------------------------------------------

-- readiness approval is the ONLY activation point → stamps the participant clock
create or replace function fn_review_readiness(p_readiness uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_enrol uuid; v_participant uuid;
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
  if p_approve then
    update enrolments set status = 'active',
      activated_at = coalesce(activated_at, now()), updated_at = now()
    where id = v_enrol;
    perform audit_log('activation','enrolment', v_enrol::text, 'ready', 'active', p_note);
    perform fn_notify(v_participant, 'readiness', '✅ Readiness approved',
      'You are ACTIVE — Day 1 is open. '||coalesce(p_note,''), '#/challenge');
  else
    perform fn_notify(v_participant, 'readiness', '🔄 Readiness — revision required',
      coalesce(p_note,'Please revise and resubmit.'), '#/challenge');
  end if;
  perform audit_log('readiness_review','readiness', p_readiness::text, 'submitted',
    case when p_approve then 'approved' else 'revision_required' end, p_note);
end $$;

-- submitting a day: gated on the PARTICIPANT clock, and version-stamped
create or replace function fn_submit_task(
  p_enrolment uuid, p_day int, p_response text, p_reflection text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cohort uuid; v_ver uuid; v_dayid uuid; v_prev int; v_name text;
        v_open int; v_last text; v_country country_t;
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
  -- country-specific variant wins; the generic (country_override is null) row is the
  -- fallback. Deterministic — the old `limit 1` with no ORDER BY could serve an ID
  -- warrior the MY variant depending on heap order (audit §A7).
  select id into v_dayid from curriculum_days cd
   where cd.version_id = v_ver and cd.day_no = p_day
     and (cd.country_override is null or cd.country_override = v_country)
   order by (cd.country_override is null)
   limit 1;
  if v_dayid is null then raise exception 'day % is not published in this curriculum', p_day; end if;

  -- an already-approved day may not be resubmitted (that is what caused double XP)
  select status into v_last from task_submissions
   where enrolment_id = p_enrolment and day_no = p_day order by version desc limit 1;
  if v_last = 'approved' then raise exception 'day % is already approved', p_day; end if;

  select coalesce(max(version),0) into v_prev from task_submissions
  where enrolment_id = p_enrolment and day_no = p_day;
  insert into task_submissions (enrolment_id, day_id, day_no, status, response, reflection,
                                version, submitted_at, curriculum_version_id)
  values (p_enrolment, v_dayid, p_day, 'submitted', p_response, p_reflection, v_prev + 1, now(), v_ver)
  returning id into v_id;
  perform audit_log('task_submit','task_submission', v_id::text, null, 'submitted', 'day '||p_day||' v'||(v_prev+1));
  select name into v_name from profiles where id = auth.uid();
  perform notify_reviewers(auth.uid(), '📨 Day '||p_day||' evidence submitted',
    coalesce(v_name,'A warrior')||' submitted Day '||p_day||' (v'||(v_prev+1)||')', '#/coach');
  return v_id;
end $$;

-- review: idempotent XP, real reversal, explicit decision, rubric
create or replace function fn_review_submission_v2(
  p_submission uuid, p_decision text, p_note text, p_rubric jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_participant uuid; v_enrol uuid; v_cohort uuid; v_day int; v_xp int; v_status text; v_ver int;
  v_streak int; v_done int; v_streak_xp int; v_key text; v_new text;
begin
  if p_decision not in ('approve','revision','reject') then raise exception 'unknown decision %', p_decision; end if;
  select e.participant_id, s.enrolment_id, e.cohort_id, s.day_no, s.status, s.version
    into v_participant, v_enrol, v_cohort, v_day, v_status, v_ver
  from task_submissions s join enrolments e on e.id = s.enrolment_id
  where s.id = p_submission;
  if v_participant is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_participant) then raise exception 'not authorised'; end if;
  if p_decision <> 'approve' and (p_note is null or length(trim(p_note)) < 3) then
    raise exception 'a reason is required when not approving';
  end if;

  v_new := case p_decision when 'approve' then 'approved'
                           when 'revision' then 'revision_required'
                           else 'rejected' end;
  update task_submissions set
    status = v_new, reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = p_note, review_rubric = p_rubric, reviewed_version = v_ver
  where id = p_submission;

  v_key := 'day_complete:' || v_enrol::text || ':' || v_day::text;

  if p_decision = 'approve' then
    select coalesce(cd.xp_amount,
                    (select points from xp_rules where code = 'day_complete' and active), 10)
      into v_xp
    from task_submissions s left join curriculum_days cd on cd.id = s.day_id
    where s.id = p_submission;

    -- awards exactly once per (enrolment, day) no matter how many revisions happened
    if fn_award_xp(v_participant, v_cohort, 'day_complete', v_xp, v_key,
                   'Day '||v_day||' approved', 'task_submission', p_submission) then
      perform fn_notify(v_participant, 'evidence', '🏆 Day '||v_day||' approved — +'||v_xp||' XP',
        coalesce(p_note,'Verified XP written to your ledger. Keep going!'), '#/challenge');
    else
      perform fn_notify(v_participant, 'evidence', '✅ Day '||v_day||' approved',
        coalesce(p_note,'This day was already credited — no duplicate XP.'), '#/challenge');
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
      perform fn_notify(v_participant, 'milestone', '🎯 Milestone: '||v_done||' days verified',
        'You are '||round(v_done * 100.0 / 30)||'% through the challenge.', '#/challenge');
    end if;
    if v_done >= 30 then
      perform fn_notify(v_participant, 'milestone', '🏁 All 30 days verified',
        'Your Coach will now review your programme completion.', '#/challenge');
      perform notify_reviewers(v_participant, '🎓 Graduation review required',
        'A warrior completed 30 verified days. Graduation is a human decision — never automatic.', '#/coach');
      perform audit_log('graduation_review_raised','enrolment', v_enrol::text, 'active', 'review_due', null);
    end if;
  else
    -- withdrawing a previous approval must reverse its XP, not delete it
    if fn_reverse_xp(v_key, 'Day '||v_day||' approval withdrawn: '||coalesce(p_note,'')) then
      perform fn_notify(v_participant, 'xp', '↩️ Day '||v_day||' XP reversed',
        'The previous approval was withdrawn. Reason: '||coalesce(p_note,''), '#/challenge');
    end if;
    perform fn_notify(v_participant, 'evidence',
      case when p_decision = 'revision' then '🔄 Day '||v_day||' — revision required'
           else '⛔ Day '||v_day||' — not accepted' end,
      coalesce(p_note,'Your original is preserved.'), '#/challenge');
  end if;

  perform audit_log('evidence_review','task_submission', p_submission::text, v_status, v_new, p_note);
end $$;
grant execute on function fn_review_submission_v2(uuid,text,text,jsonb) to authenticated;

-- keep the old 3-arg signature working (older clients / worker), routed through v2
create or replace function fn_review_submission(p_submission uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform fn_review_submission_v2(p_submission,
    case when p_approve then 'approve' else 'revision' end, p_note, null);
end $$;

-- closing verification: idempotent XP + the badge through the audited helper
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
    perform fn_notify(v.participant_id, 'closing', '🏆 Closing VERIFIED!',
      'Your closing was verified by a human reviewer. +' || coalesce(v_pts,0) || ' XP', '#/pipeline');
  else
    update ch_closings set status = 'DOCUMENTATION',
      missing_items = coalesce(p_note, missing_items), updated_at = now() where id = p_closing;
    perform audit_log('closing_revision','ch_closing', p_closing::text, v.status, 'DOCUMENTATION', p_note);
    perform fn_notify(v.participant_id, 'closing', '🔄 Closing needs more',
      coalesce(p_note, 'Reviewer requested more documentation.'), '#/pipeline');
  end if;
end $$;

-- ------------------------------------------------------------
-- 9. P0.1 — the real Admin enrolment path
-- ------------------------------------------------------------
create or replace function fn_admin_create_cohort(
  p_name text, p_country text, p_start date, p_timezone text,
  p_unlock time, p_version uuid, p_status text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ver uuid;
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'name required'; end if;
  if p_status not in ('draft','open','active','completed','archived') then raise exception 'bad status'; end if;
  v_ver := coalesce(p_version, (select id from curriculum_versions where status='published'
                                order by version desc limit 1));
  if v_ver is null then raise exception 'no published curriculum version'; end if;
  insert into cohorts (name, country, curriculum_version_id, official_start_date,
                       official_timezone, daily_unlock_time, status, created_by)
  values (trim(p_name), nullif(p_country,'')::country_t, v_ver, p_start,
          coalesce(p_timezone, case when p_country='ID' then 'Asia/Jakarta' else 'Asia/Kuala_Lumpur' end),
          coalesce(p_unlock, '06:00'), p_status, auth.uid())
  returning id into v_id;
  perform audit_log('cohort_created','cohort', v_id::text, null, p_status, p_name);
  return v_id;
end $$;
grant execute on function fn_admin_create_cohort(text,text,date,text,time,uuid,text) to authenticated;

create or replace function fn_admin_update_cohort(p_cohort uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev text;
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  select status into v_prev from cohorts where id = p_cohort;
  if v_prev is null then raise exception 'not found'; end if;
  update cohorts set
    name                  = coalesce(p_patch->>'name', name),
    official_start_date   = coalesce((p_patch->>'official_start_date')::date, official_start_date),
    official_timezone     = coalesce(p_patch->>'official_timezone', official_timezone),
    daily_unlock_time     = coalesce((p_patch->>'daily_unlock_time')::time, daily_unlock_time),
    status                = coalesce(p_patch->>'status', status),
    curriculum_version_id = coalesce((p_patch->>'curriculum_version_id')::uuid, curriculum_version_id)
  where id = p_cohort;
  perform audit_log('cohort_updated','cohort', p_cohort::text, v_prev, p_patch->>'status', p_patch::text);
end $$;
grant execute on function fn_admin_update_cohort(uuid,jsonb) to authenticated;

-- enrol one or many warriors; optionally assign the coach in the same action
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
      v_skip := v_skip || jsonb_build_object('id', v_uid, 'reason', 'no active profile');
      continue;
    end if;
    if exists (select 1 from enrolments where participant_id = v_uid
               and status in ('draft','invited','onboarding','ready','active','paused')) then
      v_skip := v_skip || jsonb_build_object('id', v_uid, 'name', v_name, 'reason', 'already has a live enrolment');
      continue;
    end if;
    insert into enrolments (cohort_id, participant_id, status, status_reason, status_by)
    values (p_cohort, v_uid, 'invited', p_note, auth.uid())
    returning id into v_id;
    insert into user_roles (user_id, role, granted_by)
    values (v_uid, 'participant', auth.uid()) on conflict do nothing;
    if p_coach is not null then perform fn_assign_coach(v_uid, p_coach, true); end if;
    perform audit_log('enrol_admin','enrolment', v_id::text, null, 'invited',
      v_name || ' → ' || v_cname || coalesce(' · '||p_note,''));
    perform fn_notify(v_uid, 'challenge', '🎯 You are enrolled: 30 Days Closing Challenge',
      'Cohort ' || v_cname || '. Open the challenge to complete your onboarding and readiness.', '#/challenge');
    v_ok := v_ok || jsonb_build_object('id', v_uid, 'name', v_name, 'enrolment_id', v_id);
  end loop;

  return jsonb_build_object('enrolled', v_ok, 'skipped', v_skip,
                            'enrolled_count', jsonb_array_length(v_ok),
                            'skipped_count', jsonb_array_length(v_skip));
end $$;
grant execute on function fn_admin_enrol(uuid,uuid[],uuid,text) to authenticated;

-- pause / resume / withdraw / grant catch-up — the missing admin controls
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
    perform fn_notify(v_participant, 'challenge', '📋 Your challenge status: ' || upper(p_status),
      coalesce(p_reason,'Updated by your Coach.'), '#/challenge');
  end if;
end $$;
grant execute on function fn_admin_set_enrolment(uuid,text,text,int) to authenticated;

-- who can still be enrolled? (admin picker source — never leaks beyond the caller's country scope)
create or replace function fn_admin_enrolable(p_country text)
returns table (id uuid, name text, country text, phone text, live_enrolment boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.country::text, p.phone,
         exists (select 1 from enrolments e where e.participant_id = p.id
                 and e.status in ('draft','invited','onboarding','ready','active','paused'))
  from profiles p
  where p.status = 'active'
    and (has_role('super_admin') or has_role('master_mentor'))
    and (p_country is null or p_country = '' or p.country::text = p_country)
  order by p.name;
$$;
grant execute on function fn_admin_enrolable(text) to authenticated;

-- ------------------------------------------------------------
-- 10. P0.1 — invitations finally honour the cohort they were issued for
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
          (select email from auth.users where id = auth.uid()),
          v.country, 'active', false)
  on conflict (id) do nothing;
  insert into user_roles (user_id, role, granted_by)
  values (auth.uid(), 'participant', v.invited_by) on conflict do nothing;
  update invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where code = v.code;
  perform audit_log('invitation_accepted','invitation', v.code, 'pending', 'accepted', v.name);

  -- THE FIX (audit §B3): the cohort on the invitation now actually enrols the warrior.
  -- Before this, invitations.cohort_id was collected, stored and never read.
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

  perform fn_notify(v.invited_by, 'invitation', '🎉 Invitation accepted',
    v.name || ' has joined IQI AG Hero' ||
    coalesce(' and is enrolled in ' || v_cname, ' — onboarding started') || '.', '#/coach');
end $$;
grant execute on function fn_accept_invitation(text) to authenticated;

-- ------------------------------------------------------------
-- 11. XP RULE ACTIVATION STATE — make the truth explicit, change no values
-- ------------------------------------------------------------
update xp_rules set active = false,
  description = coalesce(description,'') || ' [NOT WIRED — OPEN DECISION, see AUDIT-30-DAYS-2026-08-23 §B10]'
where code in ('day1_commitment','evidence_quality') and active;
-- day_complete is now a real fallback for curriculum_days.xp_amount (was dead before)
update xp_rules set description = coalesce(description,'') || ' [fallback when curriculum_days.xp_amount is null]'
where code = 'day_complete' and description not like '%fallback%';

-- ------------------------------------------------------------
-- 12. VERIFY (all must be as annotated)
-- ------------------------------------------------------------
select 'insert policies on task_submissions (must be 0)' as check,
       count(*) as n from pg_policies
 where tablename = 'task_submissions' and cmd in ('INSERT','ALL');
select 'insert policies on readiness_submissions (must be 0)' as check,
       count(*) as n from pg_policies
 where tablename = 'readiness_submissions' and cmd in ('INSERT','ALL');
select 'award_badge grants to authenticated (must be 0)' as check,
       count(*) as n from information_schema.role_routine_grants
 where routine_name = 'award_badge' and grantee in ('authenticated','anon','public');
select 'cohort day / accessible day' as check, c.name, cohort_day(c.id) as cohort_day
  from cohorts c order by c.name;
