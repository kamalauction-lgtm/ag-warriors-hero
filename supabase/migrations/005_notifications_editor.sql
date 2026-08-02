-- ============================================================
-- 005_notifications_editor.sql — in-app notifications (§25) wired into
-- the domain layer + admin write access for the curriculum editor. ADDITIVE.
-- ============================================================

-- admin may edit curriculum (RLS write policies)
create policy w_curr_days_admin on curriculum_days for all using (has_role('super_admin'));
create policy w_curr_ver_admin on curriculum_versions for all using (has_role('super_admin'));

-- notify helper (service-definer; RLS-safe)
create or replace function fn_notify(p_to uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public as
$$ insert into notifications (to_agent, type, title, body, link)
   values (p_to, p_type, p_title, p_body, p_link) $$;

-- notify the participant's Coach(es); fallback: Commanders
create or replace function notify_reviewers(p_participant uuid, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid; n int := 0;
begin
  for c in select coach_id from coach_assignments where participant_id = p_participant and active loop
    perform fn_notify(c, 'review', p_title, p_body, p_link); n := n + 1;
  end loop;
  if n = 0 then
    for c in select id from profiles where is_commander loop
      perform fn_notify(c, 'review', p_title, p_body, p_link);
    end loop;
  end if;
end $$;

-- ---------- re-create domain fns WITH notifications ----------
create or replace function fn_submit_readiness(p_enrolment uuid, p_checklist jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not exists (select 1 from enrolments where id = p_enrolment and participant_id = auth.uid()) then
    raise exception 'not your enrolment';
  end if;
  insert into readiness_submissions (enrolment_id, status, checklist, submitted_at)
  values (p_enrolment, 'submitted', p_checklist, now())
  returning id into v_id;
  perform audit_log('readiness_submit','readiness', v_id::text, 'in_progress', 'submitted', null);
  select name into v_name from profiles where id = auth.uid();
  perform notify_reviewers(auth.uid(), '📨 Readiness submitted',
    coalesce(v_name,'A warrior')||' submitted readiness for review', '#/coach');
  return v_id;
end $$;

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
    perform fn_notify(v_participant, 'readiness', '✅ Readiness approved',
      'You are ACTIVE — Day 1 awaits. '||coalesce(p_note,''), '#/challenge');
  else
    perform fn_notify(v_participant, 'readiness', '🔄 Readiness — revision required',
      coalesce(p_note,'Please revise and resubmit.'), '#/challenge');
  end if;
  perform audit_log('readiness_review','readiness', p_readiness::text, 'submitted',
    case when p_approve then 'approved' else 'revision_required' end, p_note);
end $$;

create or replace function fn_submit_task(
  p_enrolment uuid, p_day int, p_response text, p_reflection text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cohort uuid; v_ver uuid; v_dayid uuid; v_prev int; v_name text;
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
  select name into v_name from profiles where id = auth.uid();
  perform notify_reviewers(auth.uid(), '📨 Day '||p_day||' evidence submitted',
    coalesce(v_name,'A warrior')||' submitted Day '||p_day||' (v'||(v_prev+1)||')', '#/coach');
  return v_id;
end $$;

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
    perform fn_notify(v_participant, 'evidence', '🏆 Day '||v_day||' approved — +'||v_xp||' XP',
      coalesce(p_note,'Verified XP written to your ledger. Keep going!'), '#/challenge');
  else
    perform fn_notify(v_participant, 'evidence', '🔄 Day '||v_day||' — revision required',
      coalesce(p_note,'Your original is preserved. Resubmit when ready.'), '#/challenge');
  end if;
  perform audit_log('evidence_review','task_submission', p_submission::text, v_status,
    case when p_approve then 'approved' else 'revision_required' end, p_note);
end $$;

-- allow users to mark their own notifications read
create policy w_notif_read on notifications for update
  using (to_agent = auth.uid()) with check (to_agent = auth.uid());
