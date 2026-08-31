-- ============================================================
-- 088_progress_next_actions.sql — P1: Today / Week / 30 Days, and
-- Next-Action Discipline. ADDITIVE.
--
-- Everything here is derived from records the warrior already created. Nothing
-- asks them to re-enter what the CRM holds, and no benchmark conversion rate is
-- assumed anywhere — the only comparison offered is the warrior against their
-- OWN previous week.
-- ============================================================

-- ------------------------------------------------------------
-- 1. NEXT-ACTION DISCIPLINE — six buckets, all structural facts
-- ------------------------------------------------------------
create or replace function fn_next_actions(p_participant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_today date; v_country country_t;
begin
  if not (p_participant = auth.uid() or is_reviewer_of(p_participant)) then
    raise exception 'not authorised';
  end if;
  select country into v_country from profiles where id = p_participant;
  -- the warrior's own local date, from their cohort clock when they have one
  select coalesce((select cohort_local_date(e.cohort_id) from enrolments e
                   where e.participant_id = p_participant
                     and e.status in ('active','paused') order by e.created_at desc limit 1),
                  (now() at time zone case when v_country = 'ID' then 'Asia/Jakarta'
                                           else 'Asia/Kuala_Lumpur' end)::date)
    into v_today;

  return jsonb_build_object(
    'as_of', v_today,
    'overdue', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'stage', l.stage,
               'next_action', l.next_action, 'next_action_at', l.next_action_at,
               'days_late', (v_today - l.next_action_at)) order by l.next_action_at)
      from ch_leads l where l.participant_id = p_participant
        and l.next_action_at is not null and l.next_action_at < v_today
        and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')), '[]'::jsonb),
    'due_today', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'stage', l.stage,
               'next_action', l.next_action) order by l.name)
      from ch_leads l where l.participant_id = p_participant
        and l.next_action_at = v_today
        and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')), '[]'::jsonb),
    'upcoming', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'stage', l.stage,
               'next_action', l.next_action, 'next_action_at', l.next_action_at) order by l.next_action_at)
      from ch_leads l where l.participant_id = p_participant
        and l.next_action_at > v_today and l.next_action_at <= v_today + 7
        and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')), '[]'::jsonb),
    'no_next_action', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'stage', l.stage,
               'last_contact_at', l.last_contact_at) order by l.updated_at)
      from ch_leads l where l.participant_id = p_participant
        and l.next_action_at is null
        and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE')), '[]'::jsonb),
    'qualified_no_appointment', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'interest', l.interest) order by l.updated_at)
      from ch_leads l where l.participant_id = p_participant and l.stage = 'QUALIFIED'
        and not exists (select 1 from ch_appointments ap where ap.lead_id = l.id)), '[]'::jsonb),
    'viewing_no_followup', coalesce((
      select jsonb_agg(jsonb_build_object('id', ap.id, 'lead_id', ap.lead_id, 'lead_name', l.name,
               'kind', ap.kind, 'when', ap.starts_at) order by ap.starts_at)
      from ch_appointments ap join ch_leads l on l.id = ap.lead_id
      where ap.participant_id = p_participant and ap.status = 'COMPLETED'
        and not exists (select 1 from ch_lead_activities a
                        where a.lead_id = ap.lead_id and a.happened_at > ap.starts_at)), '[]'::jsonb));
end $$;
grant execute on function fn_next_actions(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. TODAY / WEEK / 30 DAYS in one call
--    Week compares the warrior to their OWN previous week — never to an
--    invented AG benchmark.
-- ------------------------------------------------------------
create or replace function fn_progress(p_enrolment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_p uuid; v_cohort uuid; v_today date; v_start date; v_acc int;
  v_this jsonb; v_prev jsonb;
begin
  select participant_id, cohort_id into v_p, v_cohort from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not (v_p = auth.uid() or is_reviewer_of(v_p)) then raise exception 'not authorised'; end if;
  v_today := cohort_local_date(v_cohort);
  v_acc   := participant_accessible_day(p_enrolment);
  select coalesce((activated_at at time zone c.official_timezone)::date, v_today)
    into v_start from enrolments e join cohorts c on c.id = e.cohort_id where e.id = p_enrolment;

  v_this := fn_weekly_review(p_enrolment, 0);
  v_prev := fn_weekly_review(p_enrolment, 1);

  return jsonb_build_object(
    'today', fn_day_summary(p_enrolment, v_today),
    'week', jsonb_build_object(
      'current', v_this,
      'previous', v_prev,
      -- deltas against the warrior's OWN previous week
      'delta', jsonb_build_object(
        'active_days', (v_this->>'active_days')::int - (v_prev->>'active_days')::int,
        'new_leads',   (v_this->>'new_leads')::int   - (v_prev->>'new_leads')::int,
        'touches',     (v_this->>'touches')::int     - (v_prev->>'touches')::int,
        'follow_ups',  (v_this->>'follow_ups')::int  - (v_prev->>'follow_ups')::int,
        'appointments',(v_this->>'appointments')::int- (v_prev->>'appointments')::int,
        'days_approved',(v_this->>'days_approved')::int-(v_prev->>'days_approved')::int)),
    'programme', jsonb_build_object(
      'accessible_day', v_acc,
      'cohort_day', cohort_day(v_cohort),
      'started_on', v_start,
      'days_approved', (select count(distinct day_no) from task_submissions
                        where enrolment_id = p_enrolment and status = 'approved'),
      'days_awaiting', (select count(distinct day_no) from task_submissions
                        where enrolment_id = p_enrolment and status in ('submitted','under_review')),
      'days_revision', (select count(distinct day_no) from task_submissions
                        where enrolment_id = p_enrolment and status = 'revision_required'),
      'streak', challenge_streak(p_enrolment),
      'verified_xp', (select coalesce(sum(amount),0) from points_ledger
                      where user_id = v_p and status = 'verified'),
      'badges', (select count(*) from user_badges where user_id = v_p),
      'active_days_total', (select count(distinct happened_at::date) from ch_lead_activities
                            where participant_id = v_p and happened_at::date >= v_start),
      'funnel', fn_funnel(v_p)));
end $$;
grant execute on function fn_progress(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. COACH WEEKLY VIEW — one call, the pod's week
-- ------------------------------------------------------------
create or replace function fn_coach_week()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not (has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach')) then
    raise exception 'not authorised';
  end if;
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'participant_id', e.participant_id, 'enrolment_id', e.id,
      'name', p.name, 'country', p.country,
      'accessible_day', participant_accessible_day(e.id),
      'days_approved', (select count(distinct day_no) from task_submissions
                        where enrolment_id = e.id and status = 'approved'),
      'this_week', fn_weekly_review(e.id, 0),
      'previous_week', fn_weekly_review(e.id, 1),
      'next_actions', fn_next_actions(e.participant_id)
    ) as x
    from enrolments e join profiles p on p.id = e.participant_id
    where e.status = 'active'
      and e.participant_id <> auth.uid()
      and (has_role('super_admin') or has_role('master_mentor')
           or is_my_coach_participant(e.participant_id))
  ) t;
  return v;
end $$;
grant execute on function fn_coach_week() to authenticated;

-- ------------------------------------------------------------
-- 4. VERIFY
-- ------------------------------------------------------------
select 'fn_next_actions / fn_progress installed' as check,
       (select count(*) from pg_proc where proname in ('fn_next_actions','fn_progress','fn_coach_week')) as n;
