-- ============================================================
-- 090_governance_enforce.sql — Governance v1 becomes enforced behaviour.
-- ADDITIVE. Every value is resolved from ch_policy_versions via fn_policy /
-- fn_policy_at. Nothing in this file hardcodes a governance number.
--
-- ROLLBACK: this migration only CREATE OR REPLACEs functions and adds columns
-- to mentor_points_ledger. To roll back, re-run 087 (notification rewire) and
-- 088; the added columns are additive and harmless if unused.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ACTIVITY COUNTERS — outreach vs replies, counted honestly
--
-- OUTREACH is a DISTINCT-LEAD first-contact action on that day. Ten messages to
-- the same person is one outreach, not ten. REPLIES are tracked separately and
-- are never a target: a warrior controls the reaching out, not the answering.
-- ------------------------------------------------------------
create or replace function fn_activity_counters(p_participant uuid, p_date date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'date', p_date,
    -- distinct leads whose FIRST-EVER recorded activity happened on this date
    'outreach_distinct', (
      select count(*) from (
        select a.lead_id, min(a.happened_at) as first_at
        from ch_lead_activities a where a.participant_id = p_participant
        group by a.lead_id) f
      where f.first_at::date = p_date),
    -- every touch logged today, including repeats to the same person
    'touches_total', (select count(*) from ch_lead_activities
                      where participant_id = p_participant and happened_at::date = p_date),
    -- OUTCOME metric, never a target
    'replies', (select count(distinct a.lead_id) from ch_lead_activities a
                where a.participant_id = p_participant and a.happened_at::date = p_date
                  and a.outcome in ('engaged','qualified','follow_up')),
    'followups_due', (select count(*) from ch_leads l
                      where l.participant_id = p_participant and l.next_action_at is not null
                        and l.next_action_at <= p_date
                        and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')),
    'followups_done', (select count(*) from ch_lead_activities
                       where participant_id = p_participant and happened_at::date = p_date
                         and activity_type = 'follow_up'),
    'active_leads', (select count(*) from ch_leads where participant_id = p_participant
                     and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE')),
    'with_next_action', (select count(*) from ch_leads where participant_id = p_participant
                         and next_action_at is not null
                         and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE')));
$$;
grant execute on function fn_activity_counters(uuid,date) to authenticated;

-- resolved targets for a cohort on a date (historical reports pass the date)
create or replace function fn_targets_at(p_cohort uuid, p_on date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(fn_policy_at('daily_targets', p_cohort, p_on), '{}'::jsonb);
$$;
grant execute on function fn_targets_at(uuid,date) to authenticated;

-- ------------------------------------------------------------
-- 2. STREAK — miss-aware, on the PARTICIPANT's day chronology.
--    Seven consecutive approved days with no intervening MISSED day.
--    EXCUSED and authorised PAUSED days are neutral: they neither add to nor
--    break the run.
-- ------------------------------------------------------------
create or replace function challenge_streak(p_enrolment uuid)
returns int language plpgsql stable security definer set search_path = public as $$
declare v_max int; d int; v_run int := 0; v_state text;
begin
  select max(day_no) into v_max from task_submissions
   where enrolment_id = p_enrolment and status = 'approved';
  if v_max is null then return 0; end if;

  d := v_max;
  while d >= 1 loop
    if exists (select 1 from task_submissions
               where enrolment_id = p_enrolment and day_no = d and status = 'approved') then
      v_run := v_run + 1;
    else
      select state into v_state from ch_day_state
       where enrolment_id = p_enrolment and day_no = d;
      if v_state = 'excused' then
        null;                       -- neutral: skip without breaking or counting
      else
        exit;                       -- missed, or simply not done -> the run ends
      end if;
    end if;
    d := d - 1;
  end loop;
  return v_run;
end $$;

alter table enrolments add column if not exists paused_at timestamptz;
alter table enrolments add column if not exists coach_recommended_by uuid references profiles(id);
alter table enrolments add column if not exists coach_recommended_at timestamptz;
alter table enrolments add column if not exists completed_at timestamptz;

-- ------------------------------------------------------------
-- 3. GRACE / MISSED — the sweep may now auto-mark, because the policy exists.
-- ------------------------------------------------------------
create or replace function fn_day_due_at(p_enrolment uuid, p_day int)
returns timestamptz language sql stable security definer set search_path = public as $$
  -- a day is due at the cohort's unlock time on the day it became accessible
  select ((e.activated_at at time zone c.official_timezone)::date
          + (p_day - 1) + interval '1 day' - interval '1 second')
         at time zone c.official_timezone
  from enrolments e join cohorts c on c.id = e.cohort_id where e.id = p_enrolment;
$$;

create or replace function fn_mark_missed_days(p_enrolment uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_cohort uuid; v_acc int; v_grace int; v_n int := 0; d int; v_due timestamptz; v_p uuid;
begin
  select cohort_id, participant_id into v_cohort, v_p from enrolments where id = p_enrolment;
  v_grace := coalesce((fn_policy('grace_streak', v_cohort) ->> 'grace_hours')::int, 24);
  v_acc := participant_accessible_day(p_enrolment);
  for d in 1 .. greatest(v_acc - 1, 0) loop
    v_due := fn_day_due_at(p_enrolment, d);
    if v_due is not null and now() > v_due + make_interval(hours => v_grace)
       and not exists (select 1 from task_submissions t where t.enrolment_id = p_enrolment
                       and t.day_no = d
                       and t.status in ('approved','submitted','under_review','revision_required'))
       and not exists (select 1 from ch_day_state s where s.enrolment_id = p_enrolment and s.day_no = d)
    then
      insert into ch_day_state (enrolment_id, day_no, state, due_date, reason, marked_by)
      values (p_enrolment, d, 'missed', v_due::date,
              'Auto-marked after the ' || v_grace || 'h grace window (grace_streak policy v1).', null)
      on conflict (enrolment_id, day_no) do nothing;
      perform audit_log('day_missed','task_day', p_enrolment::text || ':' || d::text,
                        null, 'missed', 'grace expired');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- PAUSE must stop the participant clock. Record when a pause starts/ends and
-- accumulate the paused days so participant_accessible_day() holds still.
create or replace function fn_admin_set_enrolment(
  p_enrolment uuid, p_status text, p_reason text, p_catch_up_days int
) returns void language plpgsql security definer set search_path = public as $$
declare v_prev text; v_participant uuid; v_paused_at timestamptz; v_days int;
begin
  select status, participant_id, paused_at into v_prev, v_participant, v_paused_at
    from enrolments where id = p_enrolment;
  if v_prev is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_participant) then raise exception 'not authorised'; end if;
  if p_status is not null and p_status not in
     ('draft','invited','onboarding','ready','active','paused','completed','graduated','withdrawn') then
    raise exception 'bad status %', p_status;
  end if;
  if p_status in ('paused','withdrawn') and (p_reason is null or length(trim(p_reason)) < 3) then
    raise exception 'a reason is required';
  end if;

  -- resuming: bank the paused days so the clock did not run during the pause
  v_days := 0;
  if v_prev = 'paused' and p_status is not null and p_status <> 'paused' and v_paused_at is not null then
    v_days := greatest(0, extract(day from (now() - v_paused_at))::int);
  end if;

  update enrolments set
    status        = coalesce(p_status, status),
    status_reason = coalesce(p_reason, status_reason),
    status_by     = auth.uid(),
    catch_up_days = coalesce(p_catch_up_days, catch_up_days),
    catch_up      = (coalesce(p_catch_up_days, catch_up_days) > 0),
    activated_at  = case when p_status = 'active' then coalesce(activated_at, now()) else activated_at end,
    paused_at     = case when p_status = 'paused' then coalesce(paused_at, now())
                         when p_status is not null and p_status <> 'paused' then null
                         else paused_at end,
    paused_days   = paused_days + v_days,
    updated_at    = now()
  where id = p_enrolment;

  perform audit_log('enrolment_status','enrolment', p_enrolment::text, v_prev,
                    coalesce(p_status, v_prev),
                    coalesce(p_reason,'') || case when v_days > 0 then ' · +'||v_days||' paused day(s) banked' else '' end);
  if p_status is not null and p_status <> v_prev then
    perform fn_notify_t(v_participant, 'enrolment_status',
      jsonb_build_object('review_status', upper(p_status), 'reason', coalesce(p_reason,'')), '#/challenge');
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. COACH SLA
-- ------------------------------------------------------------
alter table task_submissions add column if not exists is_urgent boolean not null default false;
comment on column task_submissions.is_urgent is
  'Explicitly marked urgent (live opportunity / closing readiness). Drives the 4h SLA target.';

create or replace function fn_sla_hours(p_cohort uuid, p_kind text, p_urgent boolean default false)
returns int language sql stable security definer set search_path = public as $$
  select case
    when p_urgent then coalesce((fn_policy('coach_sla', p_cohort) ->> 'urgent_hours')::int, 4)
    when p_kind = 'readiness' then coalesce((fn_policy('coach_sla', p_cohort) ->> 'readiness_hours')::int, 12)
    else coalesce((fn_policy('coach_sla', p_cohort) ->> 'evidence_hours')::int, 24) end;
$$;

create or replace function fn_sla_board()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach')) then
    raise exception 'not authorised';
  end if;
  select coalesce(jsonb_agg(x order by x->>'hours_over' desc), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'kind', k.kind, 'id', k.id, 'participant_id', k.participant_id, 'name', p.name,
      'submitted_at', k.submitted_at, 'urgent', k.urgent,
      'sla_hours', fn_sla_hours(e.cohort_id, k.kind, k.urgent),
      'hours_waiting', round(extract(epoch from (now() - k.submitted_at))/3600),
      'hours_over', greatest(0, round(extract(epoch from (now() - k.submitted_at))/3600)
                               - fn_sla_hours(e.cohort_id, k.kind, k.urgent)),
      'state', case
        when round(extract(epoch from (now() - k.submitted_at))/3600) <= fn_sla_hours(e.cohort_id, k.kind, k.urgent) then 'on_time'
        when round(extract(epoch from (now() - k.submitted_at))/3600) <= fn_sla_hours(e.cohort_id, k.kind, k.urgent)
             + coalesce((fn_policy('coach_sla', e.cohort_id)->>'escalate_master_mentor_after_hours')::int,12) then 'overdue'
        when round(extract(epoch from (now() - k.submitted_at))/3600) <= fn_sla_hours(e.cohort_id, k.kind, k.urgent)
             + coalesce((fn_policy('coach_sla', e.cohort_id)->>'escalate_admin_after_hours')::int,24) then 'escalated_mentor'
        else 'escalated_admin' end,
      'timezone', c.official_timezone) as x
    from (
      select 'readiness' as kind, r.id, e2.participant_id, r.submitted_at, false as urgent, r.enrolment_id
        from readiness_submissions r join enrolments e2 on e2.id = r.enrolment_id
       where r.status in ('submitted','under_review') and r.submitted_at is not null
      union all
      select 'evidence', t.id, e3.participant_id, t.submitted_at, t.is_urgent, t.enrolment_id
        from task_submissions t join enrolments e3 on e3.id = t.enrolment_id
       where t.status in ('submitted','under_review') and t.submitted_at is not null
    ) k
    join enrolments e on e.id = k.enrolment_id
    join cohorts c on c.id = e.cohort_id
    join profiles p on p.id = k.participant_id
    where has_role('super_admin') or has_role('master_mentor')
       or is_my_coach_participant(k.participant_id)
  ) t;
  return v;
end $$;
grant execute on function fn_sla_board() to authenticated;

-- SLA notification templates (managed content — no ad-hoc strings)
do $sla$
declare v uuid; c text;
begin
  foreach c in array array['sla_overdue_coach','sla_escalate_mentor','sla_escalate_admin'] loop
    insert into ch_notification_templates (code, purpose, audience, notify_type, variables, status)
    values (c,
      case c when 'sla_overdue_coach'   then 'Reviewer told a submission has passed its SLA target'
             when 'sla_escalate_mentor' then 'Master Mentor told a review is well past SLA'
             else 'Admin told a review is far past SLA' end,
      case c when 'sla_overdue_coach' then 'coach' when 'sla_escalate_mentor' then 'admin' else 'admin' end,
      'review', array['participant_name','hours_waiting','sla_hours','kind']::text[], 'active')
    on conflict (code) do nothing;
    insert into ch_notification_template_versions (template_code, version, status, published_at)
    values (c, 1, 'published', now())
    on conflict (template_code, version) do nothing returning id into v;
    if v is null then
      select id into v from ch_notification_template_versions where template_code = c and version = 1;
    end if;
    insert into ch_notification_template_translations (version_id, country, locale, title, body) values
      (v,'MY','ms-MY',
        case c when 'sla_overdue_coach' then '⏳ Semakan melepasi sasaran masa'
               when 'sla_escalate_mentor' then '⚠ Semakan jauh melepasi sasaran'
               else '🚨 Semakan sangat lewat' end,
        '{{participant_name}} — {{kind}} menunggu {{hours_waiting}} jam (sasaran {{sla_hours}} jam). Keputusan tetap milik manusia; tiada apa-apa diluluskan atau ditolak secara automatik.'),
      (v,'MY','en',
        case c when 'sla_overdue_coach' then '⏳ A review has passed its target time'
               when 'sla_escalate_mentor' then '⚠ A review is well past target'
               else '🚨 A review is far past target' end,
        '{{participant_name}} — {{kind}} has been waiting {{hours_waiting}}h (target {{sla_hours}}h). The decision stays human; nothing is auto-approved or auto-rejected.'),
      (v,'ID','id-ID',
        case c when 'sla_overdue_coach' then '⏳ Tinjauan melewati target waktu'
               when 'sla_escalate_mentor' then '⚠ Tinjauan jauh melewati target'
               else '🚨 Tinjauan sangat terlambat' end,
        '{{participant_name}} — {{kind}} menunggu {{hours_waiting}} jam (target {{sla_hours}} jam). Keputusan tetap milik manusia; tidak ada yang disetujui atau ditolak otomatis.'),
      (v,'ID','en',
        case c when 'sla_overdue_coach' then '⏳ A review has passed its target time'
               when 'sla_escalate_mentor' then '⚠ A review is well past target'
               else '🚨 A review is far past target' end,
        '{{participant_name}} — {{kind}} has been waiting {{hours_waiting}}h (target {{sla_hours}}h). The decision stays human; nothing is auto-approved or auto-rejected.')
    on conflict (version_id, country, locale) do nothing;
  end loop;
end $sla$;

-- ------------------------------------------------------------
-- 5. COMPLETION / GRADUATION GATES
-- ------------------------------------------------------------
create or replace function fn_graduation_readiness(p_enrolment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_p uuid; v_cohort uuid; v_ver uuid; v_country country_t; v_cfg jsonb;
  v_required int; v_approved int; v_pct numeric;
  v_crit_total int; v_crit_done int; v_open_crit int;
  v_d27 boolean; v_d30 boolean; v_rec boolean;
begin
  select e.participant_id, e.cohort_id, c.curriculum_version_id, c.country,
         (e.coach_recommended_at is not null)
    into v_p, v_cohort, v_ver, v_country, v_rec
  from enrolments e join cohorts c on c.id = e.cohort_id where e.id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not (v_p = auth.uid() or is_reviewer_of(v_p)) then raise exception 'not authorised'; end if;
  v_cfg := fn_policy('completion_graduation', v_cohort);

  select count(*) into v_required from curriculum_days
   where version_id = v_ver and (country_override is null or country_override = v_country);
  select count(distinct day_no) into v_approved from task_submissions
   where enrolment_id = p_enrolment and status = 'approved';
  v_pct := case when v_required > 0 then round(v_approved * 100.0 / v_required, 1) else 0 end;

  select count(*) into v_crit_total from curriculum_days
   where version_id = v_ver and is_critical
     and (country_override is null or country_override = v_country);
  select count(distinct t.day_no) into v_crit_done
    from task_submissions t join curriculum_days cd on cd.id = t.day_id
   where t.enrolment_id = p_enrolment and t.status = 'approved' and cd.is_critical;
  select count(distinct t.day_no) into v_open_crit
    from task_submissions t join curriculum_days cd on cd.id = t.day_id
   where t.enrolment_id = p_enrolment and cd.is_critical
     and t.status in ('revision_required','rejected');

  v_d27 := exists (select 1 from audit_events
                   where entity_id = p_enrolment::text and action = 'day27_review_done');
  v_d30 := exists (select 1 from audit_events
                   where entity_id = p_enrolment::text and action = 'day30_review_done');

  return jsonb_build_object(
    'required_days', v_required, 'approved_days', v_approved, 'pct', v_pct,
    'completion_pct_required', (v_cfg->>'completion_pct')::numeric,
    'graduation_pct_required', (v_cfg->>'graduation_pct')::numeric,
    'critical_total', v_crit_total, 'critical_done', v_crit_done,
    'critical_unresolved_revisions', v_open_crit,
    'day27_review_done', v_d27, 'day30_review_done', v_d30,
    'coach_recommended', v_rec,
    'verified_closing_required', (v_cfg->>'verified_closing_required')::boolean,
    'programme_complete', (v_pct >= (v_cfg->>'completion_pct')::numeric and v_d30),
    'graduation_eligible', (
        v_pct >= (v_cfg->>'graduation_pct')::numeric
        and (v_crit_total = 0 or v_crit_done >= v_crit_total)
        and v_open_crit = 0 and v_d27 and v_d30 and v_rec),
    'blockers', (
      select coalesce(jsonb_agg(b), '[]'::jsonb) from (
        select 'below_graduation_threshold' as b where v_pct < (v_cfg->>'graduation_pct')::numeric
        union all select 'critical_items_incomplete' where v_crit_total > 0 and v_crit_done < v_crit_total
        union all select 'unresolved_critical_revision' where v_open_crit > 0
        union all select 'day27_review_missing' where not v_d27
        union all select 'day30_review_missing' where not v_d30
        union all select 'coach_recommendation_missing' where not v_rec) q));
end $$;
grant execute on function fn_graduation_readiness(uuid) to authenticated;

-- a reviewer records that the structured review actually happened
create or replace function fn_record_review(p_enrolment uuid, p_which text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_p uuid;
begin
  if p_which not in ('day27','day30') then raise exception 'unknown review %', p_which; end if;
  select participant_id into v_p from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_p) then raise exception 'not authorised'; end if;
  perform audit_log(p_which || '_review_done','enrolment', p_enrolment::text, null, 'done', p_note);
end $$;
grant execute on function fn_record_review(uuid,text,text) to authenticated;

create or replace function fn_coach_recommend(p_enrolment uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_p uuid;
begin
  select participant_id into v_p from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not is_reviewer_of(v_p) then raise exception 'not authorised'; end if;
  update enrolments set coach_recommended_by = auth.uid(), coach_recommended_at = now()
   where id = p_enrolment;
  perform audit_log('coach_recommendation','enrolment', p_enrolment::text, null, 'recommended', p_note);
end $$;
grant execute on function fn_coach_recommend(uuid,text) to authenticated;

create or replace function fn_mark_complete(p_enrolment uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_p uuid; v_r jsonb;
begin
  select participant_id into v_p from enrolments where id = p_enrolment;
  if not is_reviewer_of(v_p) then raise exception 'not authorised'; end if;
  v_r := fn_graduation_readiness(p_enrolment);
  if not (v_r->>'programme_complete')::boolean then
    raise exception 'not complete: % percent of required days approved (need %), day30_review=%',
      v_r->>'pct', v_r->>'completion_pct_required', v_r->>'day30_review_done';
  end if;
  update enrolments set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_enrolment;
  perform audit_log('programme_completed','enrolment', p_enrolment::text, 'active', 'completed', p_note);
end $$;
grant execute on function fn_mark_complete(uuid,text) to authenticated;

-- graduation: every gate, then a human. Elite is NOT granted here.
create or replace function fn_graduate(p_enrolment uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_p uuid; v_r jsonb; v_b jsonb;
begin
  select participant_id into v_p from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if v_p = auth.uid() then raise exception 'cannot graduate yourself'; end if;
  if not (has_role('super_admin') or has_role('master_mentor')) then
    raise exception 'graduation requires an authorised human approver';
  end if;
  v_r := fn_graduation_readiness(p_enrolment);
  if not (v_r->>'graduation_eligible')::boolean then
    v_b := v_r->'blockers';
    raise exception 'graduation blocked: %', v_b::text;
  end if;
  update enrolments set status = 'graduated', updated_at = now() where id = p_enrolment;
  perform award_badge(v_p, 'graduate', auth.uid());
  perform audit_log('graduated','enrolment', p_enrolment::text, 'completed', 'graduated', p_note);
  -- Elite Warrior is a separate human-reviewed status. Nothing is granted here.
end $$;
grant execute on function fn_graduate(uuid,text) to authenticated;

-- ------------------------------------------------------------
-- 6. CLOSING VERIFICATION — country-scoped permission, no name hardcoded
-- ------------------------------------------------------------
create or replace function fn_verify_closing(p_closing uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v ch_closings; v_pts int; v_cohort uuid; v_country country_t; v_cfg jsonb;
begin
  select * into v from ch_closings where id = p_closing;
  if v.id is null then raise exception 'not found'; end if;
  if coalesce(v.participant_id = auth.uid(), false) then
    raise exception 'a participant may never verify their own closing';
  end if;
  select country into v_country from profiles where id = v.participant_id;
  v_country := coalesce(v.country, v_country);
  v_cfg := fn_policy('closing_verification', null);

  -- being the assigned Coach is NOT enough: the country permission is required
  if not has_permission('closing.verify', v_country) then
    raise exception 'final verification requires the closing.verify permission for %', v_country;
  end if;

  if p_approve then
    if v.status = 'COMPLETED' then raise exception 'this closing is already verified'; end if;
    update ch_closings set status = 'COMPLETED', verified_at = now(), verified_by = auth.uid(),
      notes = coalesce(p_note, notes), updated_at = now() where id = p_closing;
    update ch_leads set stage = 'CLOSED_WON', closing_outcome = 'verified', updated_at = now()
      where id = v.lead_id;
    select points into v_pts from xp_rules where code = 'closing_verified' and active;
    select cohort_id into v_cohort from enrolments
      where participant_id = v.participant_id
        and status in ('active','paused','completed','graduated') order by created_at desc limit 1;
    perform fn_award_xp(v.participant_id, v_cohort, 'closing_verified', v_pts,
      'closing_verified:'||p_closing::text, 'Human-verified closing', 'ch_closings', p_closing);
    perform award_badge(v.participant_id, 'first_closing', auth.uid());
    perform audit_log('closing_verified','ch_closing', p_closing::text, v.status, 'COMPLETED',
      coalesce(p_note,'') || ' · verifier permission closing.verify.' || v_country::text);
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
-- 7. BADGE RULES — activate the audited five, none renamed
-- ------------------------------------------------------------
update ch_badges set rule = r.rule, rule_active = true
from (values
  ('first_lead',    'First lead record the warrior creates in Hero. Trigger on ch_leads insert. Once per warrior.'),
  ('committed',     'Day 1 (Hero Commitment) approved by an authorised reviewer. Once per warrior.'),
  ('streak_7',      'Seven consecutive approved participant days with no intervening MISSED day. EXCUSED and authorised PAUSED days are neutral. Once per warrior.'),
  ('graduate',      'Human graduation approval under the completion_graduation policy. Once per warrior.'),
  ('first_closing', 'First closing verified by a holder of closing.verify for the participant country. Never from a self-declared CLOSED_WON. Once per warrior.')
) as r(code, rule)
where ch_badges.code = r.code;

-- ------------------------------------------------------------
-- 8. MENTOR POINTS v1
-- ------------------------------------------------------------
alter table mentor_points_ledger add column if not exists award_key text;
alter table mentor_points_ledger add column if not exists code text;
alter table mentor_points_ledger add column if not exists ref_type text;
alter table mentor_points_ledger add column if not exists ref_id uuid;
alter table mentor_points_ledger add column if not exists reversal_of uuid references mentor_points_ledger(id);
create unique index if not exists uq_mp_award_key on mentor_points_ledger (award_key)
  where award_key is not null and status = 'verified';

create or replace function fn_award_mp(
  p_user uuid, p_code text, p_key text, p_reason text, p_ref_type text, p_ref_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cfg jsonb; v_amt int; v_cap int; v_used int; v_week date;
begin
  if not (has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach')) then
    raise exception 'not authorised';
  end if;
  if coalesce(p_user = auth.uid(), false) then
    raise exception 'Mentor Points may never be self-awarded';
  end if;
  v_cfg := fn_policy('mentor_points', null);
  v_amt := (v_cfg #>> array['amounts', p_code, 'mp'])::int;
  if v_amt is null then raise exception 'unknown Mentor Point code %', p_code; end if;

  if exists (select 1 from mentor_points_ledger
             where award_key = p_key and status = 'verified') then
    return jsonb_build_object('awarded', false, 'reason', 'already awarded', 'code', p_code);
  end if;

  -- weekly category cap
  v_cap := (v_cfg #>> array['weekly_cap', p_code])::int;
  if v_cap is not null then
    v_week := date_trunc('week', now())::date;
    select coalesce(sum(amount),0) into v_used from mentor_points_ledger
     where user_id = p_user and code = p_code and status = 'verified'
       and created_at >= v_week;
    if v_used + v_amt > v_cap then
      return jsonb_build_object('awarded', false, 'reason', 'weekly cap reached',
                                'cap', v_cap, 'used', v_used, 'code', p_code);
    end if;
  end if;

  insert into mentor_points_ledger (user_id, source, amount, status, reason, awarded_by,
                                    award_key, code, ref_type, ref_id)
  values (p_user, p_code, v_amt, 'verified', p_reason, auth.uid(), p_key, p_code, p_ref_type, p_ref_id);
  perform audit_log('mentor_points_awarded','mentor_points', p_key, null, p_code || ' +' || v_amt, p_reason);
  return jsonb_build_object('awarded', true, 'code', p_code, 'mp', v_amt);
end $$;
grant execute on function fn_award_mp(uuid,text,text,text,text,uuid) to authenticated;

create or replace function fn_reverse_mp(p_ledger uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v mentor_points_ledger;
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then raise exception 'not authorised'; end if;
  if p_reason is null or length(trim(p_reason)) < 5 then raise exception 'a reason is required'; end if;
  select * into v from mentor_points_ledger where id = p_ledger;
  if v.id is null then raise exception 'not found'; end if;
  if v.status <> 'verified' then raise exception 'only verified Mentor Points can be reversed'; end if;
  update mentor_points_ledger set status = 'reversed' where id = v.id;
  insert into mentor_points_ledger (user_id, source, amount, status, reason, awarded_by,
                                    code, ref_type, ref_id, reversal_of)
  values (v.user_id, v.source, -v.amount, 'reversed', p_reason, auth.uid(),
          v.code, v.ref_type, v.ref_id, v.id);
  perform audit_log('mentor_points_reversed','mentor_points', coalesce(v.award_key, v.id::text),
                    'verified', 'reversed', p_reason);
end $$;
grant execute on function fn_reverse_mp(uuid,text) to authenticated;

create or replace function fn_my_mentor_points(p_user uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', coalesce((select sum(amount) from mentor_points_ledger
                       where user_id = coalesce(p_user, auth.uid()) and status = 'verified'), 0),
    'by_code', coalesce((select jsonb_object_agg(code, n) from (
        select code, sum(amount) n from mentor_points_ledger
         where user_id = coalesce(p_user, auth.uid()) and status = 'verified' and code is not null
         group by code) q), '{}'::jsonb),
    'appoints_elite_coach', false)
  where coalesce(p_user, auth.uid()) = auth.uid()
     or has_role('super_admin') or has_role('master_mentor');
$$;
grant execute on function fn_my_mentor_points(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. COUNTRY CONTENT OWNERSHIP — publishing gate
-- ------------------------------------------------------------
create or replace function fn_admin_publish_version(p_version uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_days int; v_missing int; v_prev text; v_cfg jsonb; r record;
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  select status into v_prev from curriculum_versions where id = p_version;
  if v_prev is null then raise exception 'not found'; end if;
  select count(*) into v_days from curriculum_days where version_id = p_version and country_override is null;
  if v_days <> 30 then raise exception 'this version has % generic days, expected 30', v_days; end if;
  select count(*) into v_missing from curriculum_days
   where version_id = p_version and content_status = 'draft';
  if v_missing > 0 then raise exception '% day(s) are still marked draft', v_missing; end if;

  -- country-sensitive variants marked ok must have been reviewed by a holder of
  -- content.review for that country
  v_cfg := fn_policy('country_content_ownership', null);
  for r in select cd.day_no, cd.country_override from curriculum_days cd
           where cd.version_id = p_version and cd.country_override is not null
             and cd.content_status = 'ok'
             and cd.day_no in (select jsonb_array_elements_text(v_cfg->'country_variant_days')::int)
  loop
    if not exists (select 1 from audit_events
                   where action = 'country_content_reviewed'
                     and entity_id = p_version::text || ':' || r.day_no::text || ':' || r.country_override::text) then
      raise exception 'Day % (%) is country-sensitive and has no authorised local review on record', r.day_no, r.country_override;
    end if;
  end loop;

  update curriculum_versions set status = 'published', published_at = now() where id = p_version;
  perform audit_log('curriculum_published','curriculum_version', p_version::text, v_prev, 'published', p_note);
end $$;

create or replace function fn_review_country_content(p_version uuid, p_day int, p_country text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_permission('content.review', p_country::country_t) then
    raise exception 'authorised local review for % requires the content.review permission', p_country;
  end if;
  perform audit_log('country_content_reviewed','curriculum_day',
    p_version::text || ':' || p_day::text || ':' || p_country, null, 'reviewed', p_note);
end $$;
grant execute on function fn_review_country_content(uuid,int,text,text) to authenticated;

-- ------------------------------------------------------------
-- 10. SWEEP — now enforces grace, SLA escalation and Mentor Points
-- ------------------------------------------------------------
create or replace function fn_challenge_sweep(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; s record; v_inactive int := 0; v_overdue int := 0;
  v_d27 int := 0; v_d30 int := 0; v_missed int := 0; v_n int;
  v_sla_coach int := 0; v_sla_mentor int := 0; v_sla_admin int := 0;
begin
  if not p_force and exists (select 1 from audit_events
      where action = 'challenge_sweep' and at > now() - interval '12 hours') then
    return jsonb_build_object('skipped', 'already swept within 12h');
  end if;
  perform audit_log('challenge_sweep','system','challenge', null, 'running', null);

  for r in
    select e.id, e.participant_id, e.cohort_id, p.name, participant_accessible_day(e.id) as acc
    from enrolments e join profiles p on p.id = e.participant_id where e.status = 'active'
  loop
    -- grace policy is decided: days past grace are now MARKED, not just flagged
    v_missed := v_missed + fn_mark_missed_days(r.id);

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

  -- SLA escalation. Nothing is ever auto-approved or auto-rejected.
  for s in
    select k.kind, k.id, k.participant_id, k.submitted_at, k.urgent, e.cohort_id, p.name,
           round(extract(epoch from (now() - k.submitted_at))/3600) as waited,
           fn_sla_hours(e.cohort_id, k.kind, k.urgent) as target,
           coalesce((fn_policy('coach_sla', e.cohort_id)->>'escalate_master_mentor_after_hours')::int,12) as m_after,
           coalesce((fn_policy('coach_sla', e.cohort_id)->>'escalate_admin_after_hours')::int,24) as a_after
    from (
      select 'readiness' as kind, r2.id, e2.participant_id, r2.submitted_at, false as urgent, r2.enrolment_id
        from readiness_submissions r2 join enrolments e2 on e2.id = r2.enrolment_id
       where r2.status in ('submitted','under_review') and r2.submitted_at is not null
      union all
      select 'evidence', t.id, e3.participant_id, t.submitted_at, t.is_urgent, t.enrolment_id
        from task_submissions t join enrolments e3 on e3.id = t.enrolment_id
       where t.status in ('submitted','under_review') and t.submitted_at is not null
    ) k join enrolments e on e.id = k.enrolment_id join profiles p on p.id = k.participant_id
  loop
    if s.waited > s.target + s.a_after then
      if not exists (select 1 from audit_events where action = 'sla_escalated_admin'
                     and entity_id = s.id::text) then
        perform audit_log('sla_escalated_admin', s.kind, s.id::text, null, 'escalated',
                          s.name || ' waited ' || s.waited || 'h (target ' || s.target || 'h)');
        for r in select id from profiles where is_commander loop
          perform fn_notify_t(r.id, 'sla_escalate_admin',
            jsonb_build_object('participant_name', s.name, 'hours_waiting', s.waited::text,
                               'sla_hours', s.target::text, 'kind', s.kind), '#/coach');
        end loop;
        v_sla_admin := v_sla_admin + 1;
      end if;
    elsif s.waited > s.target + s.m_after then
      if not exists (select 1 from audit_events where action = 'sla_escalated_mentor'
                     and entity_id = s.id::text) then
        perform audit_log('sla_escalated_mentor', s.kind, s.id::text, null, 'escalated',
                          s.name || ' waited ' || s.waited || 'h');
        for r in select user_id as id from user_roles where role in ('master_mentor','super_admin') loop
          perform fn_notify_t(r.id, 'sla_escalate_mentor',
            jsonb_build_object('participant_name', s.name, 'hours_waiting', s.waited::text,
                               'sla_hours', s.target::text, 'kind', s.kind), '#/coach');
        end loop;
        v_sla_mentor := v_sla_mentor + 1;
      end if;
    elsif s.waited > s.target then
      if not exists (select 1 from audit_events where action = 'sla_overdue'
                     and entity_id = s.id::text) then
        perform audit_log('sla_overdue', s.kind, s.id::text, null, 'overdue',
                          s.name || ' waited ' || s.waited || 'h');
        perform fn_notify_reviewers_t(s.participant_id, 'sla_overdue_coach',
          jsonb_build_object('participant_name', s.name, 'hours_waiting', s.waited::text,
                             'sla_hours', s.target::text, 'kind', s.kind), '#/coach');
        v_sla_coach := v_sla_coach + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'inactive_notified', v_inactive, 'overdue_notified', v_overdue,
    'days_marked_missed', v_missed, 'day27_raised', v_d27, 'day30_raised', v_d30,
    'sla_overdue', v_sla_coach, 'sla_escalated_mentor', v_sla_mentor, 'sla_escalated_admin', v_sla_admin,
    'governance', 'v1');
end $$;
revoke execute on function fn_challenge_sweep(boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 11. MISSION / PROGRESS now carry the resolved targets
-- ------------------------------------------------------------
create or replace function fn_targets_for(p_enrolment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p uuid; v_cohort uuid; v_today date; v_cfg jsonb; v_c jsonb;
begin
  select participant_id, cohort_id into v_p, v_cohort from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not (v_p = auth.uid() or is_reviewer_of(v_p)) then raise exception 'not authorised'; end if;
  v_today := cohort_local_date(v_cohort);
  v_cfg := fn_targets_at(v_cohort, v_today);
  v_c := fn_activity_counters(v_p, v_today);
  return jsonb_build_object(
    'policy_active', v_cfg ? 'new_outreach_per_day',
    'outreach', jsonb_build_object('done', v_c->'outreach_distinct', 'target', v_cfg->'new_outreach_per_day'),
    'followups', jsonb_build_object('done', v_c->'followups_done', 'due', v_c->'followups_due'),
    'next_action', jsonb_build_object('done', v_c->'with_next_action', 'of', v_c->'active_leads'),
    'replies_outcome_only', v_c->'replies',
    'touches_total', v_c->'touches_total',
    'language', v_cfg->>'language');
end $$;
grant execute on function fn_targets_for(uuid) to authenticated;

-- ------------------------------------------------------------
-- 12. VERIFY
-- ------------------------------------------------------------
select 'sla templates published' as check, count(*) as n
  from ch_notification_template_versions
 where template_code like 'sla_%' and status = 'published';
select 'badge rules active (must be 5)' as check, count(*) as n from ch_badges where rule_active;
select 'governance functions' as check, count(*) as n from pg_proc
 where proname in ('fn_activity_counters','fn_targets_for','fn_sla_board','fn_mark_missed_days',
                   'fn_graduation_readiness','fn_award_mp','fn_reverse_mp','fn_coach_recommend',
                   'fn_record_review','fn_mark_complete','fn_review_country_content');
select 'streak is miss-aware' as check, prosrc like '%ch_day_state%' as ok
  from pg_proc where proname = 'challenge_streak';
