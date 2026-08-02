-- ============================================================
-- 006_coaching_reports.sql — Coaching module (§16). ADDITIVE.
-- Lifecycle: draft → shared → acknowledged → action_in_progress → follow_up_required → closed
-- ============================================================

create table coaching_reports (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid references enrolments(id) on delete cascade,
  participant_id uuid not null references profiles(id),
  coach_id uuid not null references profiles(id),
  period text,
  strengths text, progress text, barriers text,
  pipeline_obs text, skill_obs text, culture_obs text,
  agreed_actions text, support_required text,
  next_review date,
  status text not null default 'draft' check (status in
    ('draft','shared','acknowledged','action_in_progress','follow_up_required','closed')),
  acknowledged_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table coaching_reports enable row level security;

create policy r_creport on coaching_reports for select using (
  (participant_id = auth.uid() and status <> 'draft')       -- participants never see drafts
  or coach_id = auth.uid()
  or has_role('super_admin') or has_role('master_mentor')
);
-- writes go through RPCs only (no client write policies)

-- Coach/Admin creates & shares a report (one step for MVP)
create or replace function fn_share_report(
  p_participant uuid, p_period text,
  p_strengths text, p_progress text, p_barriers text,
  p_actions text, p_next_review date
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_enrol uuid;
begin
  if p_participant = auth.uid() then raise exception 'cannot coach yourself'; end if;
  if not (has_role('super_admin') or has_role('master_mentor')
          or (has_role('elite_coach') and is_my_coach_participant(p_participant))) then
    raise exception 'not authorised';
  end if;
  select id into v_enrol from enrolments where participant_id = p_participant
  order by created_at desc limit 1;
  insert into coaching_reports (enrolment_id, participant_id, coach_id, period,
    strengths, progress, barriers, agreed_actions, next_review, status)
  values (v_enrol, p_participant, auth.uid(), p_period,
    p_strengths, p_progress, p_barriers, p_actions, p_next_review, 'shared')
  returning id into v_id;
  perform audit_log('coaching_report_shared','coaching_report', v_id::text, 'draft', 'shared', p_period);
  perform fn_notify(p_participant, 'coaching', '🧭 New coaching report',
    'Your Coach shared a report — read and acknowledge it.', '#/challenge');
  return v_id;
end $$;

-- Participant acknowledges
create or replace function fn_ack_report(p_report uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_coach uuid;
begin
  select coach_id into v_coach from coaching_reports
  where id = p_report and participant_id = auth.uid() and status = 'shared';
  if v_coach is null then raise exception 'not found or not yours'; end if;
  update coaching_reports set status = 'acknowledged', acknowledged_at = now(), updated_at = now()
  where id = p_report;
  perform audit_log('coaching_report_ack','coaching_report', p_report::text, 'shared', 'acknowledged', null);
  perform fn_notify(v_coach, 'coaching', '✅ Report acknowledged',
    'Your participant acknowledged the coaching report.', '#/coach');
end $$;

grant execute on function fn_share_report(uuid,text,text,text,text,text,date) to authenticated;
grant execute on function fn_ack_report(uuid) to authenticated;
