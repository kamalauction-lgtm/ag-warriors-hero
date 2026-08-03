-- ============================================================
-- 010_badges_streaks.sql — Gamification automation (§17). ADDITIVE.
-- Badges/streaks are DERIVED from human approvals — never a substitute for one.
-- Day 30 does NOT auto-graduate (§6): it raises a graduation review for a human.
-- ============================================================

-- Idempotent badge award + notification
create or replace function award_badge(p_user uuid, p_code text, p_by uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_n int; v_icon text; v_name jsonb;
begin
  select icon, name into v_icon, v_name from ch_badges where code = p_code and active;
  if v_name is null then return false; end if;
  insert into user_badges (user_id, badge_code, awarded_by)
  values (p_user, p_code, p_by) on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;
  perform audit_log('badge_awarded','user_badge', p_user::text || ':' || p_code, null, 'awarded', null);
  perform fn_notify(p_user, 'badge', coalesce(v_icon,'🏅') || ' Badge earned: ' || (v_name->>'en'),
    'Keep building. Consistency compounds.', '#/challenge');
  return true;
end $$;

-- Consecutive approved days ending at the latest approved day
create or replace function challenge_streak(p_enrolment uuid)
returns int language sql stable security definer set search_path = public as $$
  with approved as (
    select distinct day_no from task_submissions
    where enrolment_id = p_enrolment and status = 'approved'
  ), m as (select max(day_no) as mx from approved)
  select coalesce(count(*), 0)::int from (
    select a.day_no, row_number() over (order by a.day_no desc) as rn
    from approved a
  ) t, m
  where t.day_no = m.mx - t.rn + 1
$$;

-- First lead = activity badge only (no XP, nothing approved) — §17 activity recognition
create or replace function trg_first_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform award_badge(new.participant_id, 'first_lead', null);
  return new;
end $$;
drop trigger if exists t_first_lead on ch_leads;
create trigger t_first_lead after insert on ch_leads
for each row execute function trg_first_lead();

-- ---------- fn_review_submission: same human gate, now with milestones ----------
create or replace function fn_review_submission(p_submission uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_participant uuid; v_enrol uuid; v_cohort uuid; v_day int; v_xp int; v_status text;
  v_streak int; v_done int; v_streak_xp int;
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

    -- Day 1 commitment badge
    if v_day = 1 then perform award_badge(v_participant, 'committed', auth.uid()); end if;

    -- 7-day streak: badge once, and its configured XP once (caused by this human approval).
    -- NOTE: nested IFs on purpose — Postgres does not guarantee AND short-circuits,
    -- so award_badge() must never sit in a compound condition (it has side effects).
    v_streak := challenge_streak(v_enrol);
    if v_streak >= 7 then
      if award_badge(v_participant, 'streak_7', auth.uid()) then
        select points into v_streak_xp from xp_rules where code = 'streak_7' and active;
        if coalesce(v_streak_xp, 0) > 0 then
          insert into points_ledger (user_id, cohort_id, source, amount, status, reason, awarded_by, ref_type, ref_id)
          values (v_participant, v_cohort, 'streak_7', v_streak_xp, 'verified',
            '7-day verified streak', auth.uid(), 'task_submission', p_submission);
        end if;
      end if;
    end if;

    -- milestones on distinct approved days
    select count(distinct day_no) into v_done from task_submissions
    where enrolment_id = v_enrol and status = 'approved';
    if v_done in (7, 14, 21) then
      perform fn_notify(v_participant, 'milestone', '🎯 Milestone: '||v_done||' days verified',
        'You are '||round(v_done * 100.0 / 30)||'% through the challenge. Momentum is yours.', '#/challenge');
    end if;

    -- §6: Day 30 never auto-graduates — it raises a human graduation review
    if v_done >= 30 then
      perform fn_notify(v_participant, 'milestone', '🏁 All 30 days verified',
        'Your Coach will now review your programme completion.', '#/challenge');
      perform notify_reviewers(v_participant, '🎓 Graduation review required',
        'A warrior completed 30 verified days. Graduation is your decision — not automatic.', '#/coach');
      perform audit_log('graduation_review_raised','enrolment', v_enrol::text, 'active', 'completed', null);
    end if;
  else
    perform fn_notify(v_participant, 'evidence', '🔄 Day '||v_day||' — revision required',
      coalesce(p_note,'Your original is preserved. Resubmit when ready.'), '#/challenge');
  end if;

  perform audit_log('evidence_review','task_submission', p_submission::text, v_status,
    case when p_approve then 'approved' else 'revision_required' end, p_note);
end $$;

grant execute on function award_badge(uuid,text,uuid) to authenticated;
grant execute on function challenge_streak(uuid) to authenticated;

-- graduation badge (awarded by a human via fn_graduate)
insert into ch_badges (code, name, icon) values
 ('graduate', '{"en":"30DC Graduate","ms-MY":"Graduan 30DC","id-ID":"Lulusan 30DC"}', '🎓')
on conflict (code) do nothing;

-- Human-only graduation (§6: requires completion criteria AND Coach review)
create or replace function fn_graduate(p_enrolment uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_participant uuid; v_done int;
begin
  select participant_id into v_participant from enrolments where id = p_enrolment;
  if v_participant is null then raise exception 'not found'; end if;
  if v_participant = auth.uid() then raise exception 'cannot graduate yourself'; end if;
  if not (has_role('super_admin') or has_role('master_mentor')
          or (has_role('elite_coach') and is_my_coach_participant(v_participant))) then
    raise exception 'not authorised';
  end if;
  select count(distinct day_no) into v_done from task_submissions
  where enrolment_id = p_enrolment and status = 'approved';
  update enrolments set status = 'graduated', status_by = auth.uid(),
    status_reason = coalesce(p_note, v_done || ' verified days'), updated_at = now()
  where id = p_enrolment;
  perform award_badge(v_participant, 'graduate', auth.uid());
  perform audit_log('graduated','enrolment', p_enrolment::text, 'active', 'graduated',
    coalesce(p_note, v_done || ' verified days'));
  perform fn_notify(v_participant, 'milestone', '🎓 GRADUATED — 30 Days Closing Challenge',
    coalesce(p_note, 'Your Coach confirmed your completion. Become Better. Build Better. Give Better.'), '#/challenge');
end $$;
grant execute on function fn_graduate(uuid,text) to authenticated;
