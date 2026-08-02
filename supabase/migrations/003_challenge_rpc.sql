-- ============================================================
-- 003_challenge_rpc.sql — domain layer (spec §28): server-side state
-- transitions with role checks + audit. Client can only call these RPCs;
-- approvals & XP are unreachable any other way. ADDITIVE ONLY.
-- ============================================================

-- ---------- private evidence bucket + storage policies ----------
insert into storage.buckets (id, name, public)
values ('evidence','evidence', false)
on conflict (id) do nothing;

create policy "evidence upload own folder" on storage.objects
  for insert with check (
    bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "evidence read own or coach" on storage.objects
  for select using (
    bucket_id = 'evidence' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_my_coach_participant(((storage.foldername(name))[1])::uuid)
      or has_role('super_admin') or has_role('master_mentor')
    )
  );

-- ---------- helpers ----------
create or replace function audit_log(
  p_action text, p_entity text, p_id text,
  p_prev text, p_new text, p_reason text default null
) returns void language sql security definer set search_path = public as $$
  insert into audit_events (actor, actor_role, action, entity_type, entity_id, prev_state, new_state, reason)
  values (
    auth.uid(),
    coalesce((select string_agg(role, ',') from user_roles where user_id = auth.uid()),
             (select role::text from profiles where id = auth.uid())),
    p_action, p_entity, p_id, p_prev, p_new, p_reason
  );
$$;

-- cohort's current programme day per its OFFICIAL clock (0 = not started)
create or replace function cohort_day(p_cohort uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, least(30,
    (current_date at time zone c.official_timezone)::date - c.official_start_date + 1
  ))::int
  from cohorts c where c.id = p_cohort;
$$;

-- ---------- 1) participant enrols self (challenge layer, after global gate) ----------
create or replace function fn_enrol_self(
  p_cohort uuid, p_experience text, p_baseline int,
  p_goal text, p_motivation text, p_commitment text, p_acks jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if not exists (select 1 from cohorts where id = p_cohort and status in ('open','active')) then
    raise exception 'cohort not open';
  end if;
  insert into enrolments (cohort_id, participant_id, status, experience_level,
    pipeline_baseline, goal_30d, motivation, daily_commitment, acknowledgements)
  values (p_cohort, auth.uid(), 'onboarding', p_experience, p_baseline,
    p_goal, p_motivation, p_commitment, p_acks)
  on conflict (cohort_id, participant_id) do update set
    experience_level = excluded.experience_level,
    pipeline_baseline = excluded.pipeline_baseline,
    goal_30d = excluded.goal_30d, motivation = excluded.motivation,
    daily_commitment = excluded.daily_commitment,
    acknowledgements = excluded.acknowledgements, updated_at = now()
  returning id into v_id;
  perform audit_log('enrol','enrolment', v_id::text, null, 'onboarding', null);
  -- ensure participant role exists (configurable role table)
  insert into user_roles (user_id, role) values (auth.uid(), 'participant')
  on conflict do nothing;
  return v_id;
end $$;

-- ---------- 2) participant submits readiness ----------
create or replace function fn_submit_readiness(p_enrolment uuid, p_checklist jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from enrolments where id = p_enrolment and participant_id = auth.uid()) then
    raise exception 'not your enrolment';
  end if;
  insert into readiness_submissions (enrolment_id, status, checklist, submitted_at)
  values (p_enrolment, 'submitted', p_checklist, now())
  returning id into v_id;
  perform audit_log('readiness_submit','readiness', v_id::text, 'in_progress', 'submitted', null);
  return v_id;
end $$;

-- ---------- 3) COACH/ADMIN reviews readiness (HUMAN ONLY) ----------
create or replace function fn_review_readiness(p_readiness uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_enrol uuid; v_participant uuid;
begin
  select r.enrolment_id, e.participant_id into v_enrol, v_participant
  from readiness_submissions r join enrolments e on e.id = r.enrolment_id
  where r.id = p_readiness;
  if v_enrol is null then raise exception 'not found'; end if;
  if v_participant = auth.uid() then raise exception 'cannot review own readiness'; end if;
  if not (has_role('super_admin') or has_role('master_mentor')
          or (has_role('elite_coach') and is_my_coach_participant(v_participant))) then
    raise exception 'not authorised';
  end if;
  update readiness_submissions set
    status = case when p_approve then 'approved' else 'revision_required' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_readiness;
  if p_approve then
    update enrolments set status = 'active', updated_at = now() where id = v_enrol;
  end if;
  perform audit_log('readiness_review','readiness', p_readiness::text, 'submitted',
    case when p_approve then 'approved' else 'revision_required' end, p_note);
end $$;

-- ---------- 4) participant submits a day task (cohort clock enforced) ----------
create or replace function fn_submit_task(
  p_enrolment uuid, p_day int, p_response text, p_reflection text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cohort uuid; v_ver uuid; v_dayid uuid; v_prev int;
begin
  select cohort_id into v_cohort from enrolments
  where id = p_enrolment and participant_id = auth.uid() and status = 'active';
  if v_cohort is null then raise exception 'enrolment not active or not yours'; end if;
  if p_day > cohort_day(v_cohort) then raise exception 'day % is still locked', p_day; end if;
  select curriculum_version_id into v_ver from cohorts where id = v_cohort;
  select id into v_dayid from curriculum_days where version_id = v_ver and day_no = p_day limit 1;
  select coalesce(max(version),0) into v_prev from task_submissions
  where enrolment_id = p_enrolment and day_no = p_day;
  insert into task_submissions (enrolment_id, day_id, day_no, status, response, reflection, version, submitted_at)
  values (p_enrolment, v_dayid, p_day, 'submitted', p_response, p_reflection, v_prev + 1, now())
  returning id into v_id;
  perform audit_log('task_submit','task_submission', v_id::text, null, 'submitted', 'day '||p_day||' v'||(v_prev+1));
  return v_id;
end $$;

-- ---------- 5) COACH/ADMIN reviews evidence; approve → VERIFIED XP (HUMAN ONLY) ----------
create or replace function fn_review_submission(p_submission uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_participant uuid; v_enrol uuid; v_cohort uuid; v_day int; v_xp int; v_status text;
begin
  select e.participant_id, s.enrolment_id, e.cohort_id, s.day_no, s.status
    into v_participant, v_enrol, v_cohort, v_day, v_status
  from task_submissions s join enrolments e on e.id = s.enrolment_id
  where s.id = p_submission;
  if v_participant is null then raise exception 'not found'; end if;
  if v_participant = auth.uid() then raise exception 'cannot review own evidence'; end if;
  if not (has_role('super_admin') or has_role('master_mentor')
          or (has_role('elite_coach') and is_my_coach_participant(v_participant))) then
    raise exception 'not authorised';
  end if;
  update task_submissions set
    status = case when p_approve then 'approved' else 'revision_required' end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
  where id = p_submission;
  if p_approve then
    select coalesce(cd.xp_amount, 10) into v_xp
    from task_submissions s left join curriculum_days cd on cd.id = s.day_id
    where s.id = p_submission;
    insert into points_ledger (user_id, cohort_id, source, amount, status, reason, awarded_by, ref_type, ref_id)
    values (v_participant, v_cohort, 'day_complete', v_xp, 'verified',
      'Day '||v_day||' approved', auth.uid(), 'task_submission', p_submission);
  end if;
  perform audit_log('evidence_review','task_submission', p_submission::text, v_status,
    case when p_approve then 'approved' else 'revision_required' end, p_note);
end $$;

-- expose to authenticated users (checks live INSIDE the functions)
grant execute on function fn_enrol_self(uuid,text,int,text,text,text,jsonb) to authenticated;
grant execute on function fn_submit_readiness(uuid,jsonb) to authenticated;
grant execute on function fn_review_readiness(uuid,boolean,text) to authenticated;
grant execute on function fn_submit_task(uuid,int,text,text) to authenticated;
grant execute on function fn_review_submission(uuid,boolean,text) to authenticated;
grant execute on function cohort_day(uuid) to authenticated;
