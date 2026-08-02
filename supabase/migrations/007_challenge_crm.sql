-- ============================================================
-- 007_challenge_crm.sql — Challenge CRM (§12–15). ADDITIVE.
-- ch_ prefix — does NOT touch the global M4U leads tables.
-- Closing verification is HUMAN-ONLY via fn_verify_closing (§15).
-- ============================================================

-- §12 Leads (participant-private pipeline)
create table ch_leads (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid references enrolments(id) on delete cascade,
  participant_id uuid not null references profiles(id),
  country country_t,
  source text, category text,
  name text not null,
  contact text, preferred_contact text,
  interest text, need text, budget_range text, timeframe text,
  stage text not null default 'NEW' check (stage in
    ('NEW','CONTACTED','ENGAGED','QUALIFIED','APPOINTMENT_SET','PRESENTATION_OR_VIEWING',
     'FOLLOW_UP','NEGOTIATION','CLOSING_PROCESS','CLOSED_WON','CLOSED_LOST','NURTURE','DISQUALIFIED')),
  next_action text, next_action_at date, last_contact_at date,
  notes text, closing_outcome text, loss_reason text,
  consent_ok boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index idx_ch_leads_owner on ch_leads (participant_id, stage);

-- §13 Activities
create table ch_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references ch_leads(id) on delete cascade,
  participant_id uuid not null references profiles(id),
  activity_type text not null check (activity_type in
    ('call','message','email','meeting','appointment','presentation','viewing','follow_up',
     'document_request','coach_consultation','negotiation','closing_update','nurture_action')),
  outcome text, notes text,
  next_action text, next_action_date date,
  happened_at timestamptz not null default now(),
  created_at timestamptz default now()
);
create index idx_ch_act_lead on ch_lead_activities (lead_id, happened_at desc);

-- §14 Appointments & viewings (one table, kind discriminates)
create table ch_appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references ch_leads(id) on delete cascade,
  participant_id uuid not null references profiles(id),
  kind text not null default 'appointment' check (kind in ('appointment','viewing','presentation')),
  status text not null default 'SCHEDULED' check (status in
    ('DRAFT','SCHEDULED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW','RESCHEDULED',
     'PLANNED','IN_PROGRESS','FOLLOW_UP_REQUIRED')),
  starts_at timestamptz, tz text, location text,
  prep_notes text, outcome text, objections text, next_action text,
  coach_notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- §15 Closing records — COMPLETED reachable ONLY via fn_verify_closing
create table ch_closings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references ch_leads(id) on delete cascade,
  participant_id uuid not null references profiles(id),
  coach_id uuid references profiles(id),
  country country_t,
  project text,
  start_date date default current_date,
  status text not null default 'NOT_STARTED' check (status in
    ('NOT_STARTED','PREPARING','DOCUMENTATION','INTERNAL_REVIEW','CUSTOMER_DECISION',
     'COMPLETED','DELAYED','CANCELLED','UNSUCCESSFUL')),
  required_steps text, missing_items text,
  expected_review date,
  verified_at timestamptz, verified_by uuid references profiles(id),
  notes text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

alter table ch_leads enable row level security;
alter table ch_lead_activities enable row level security;
alter table ch_appointments enable row level security;
alter table ch_closings enable row level security;

-- §12 privacy: owner + assigned coach + admin/mentor ONLY. Never other participants.
create policy r_ch_leads on ch_leads for select using (
  participant_id = auth.uid() or is_my_coach_participant(participant_id)
  or has_role('super_admin') or has_role('master_mentor'));
create policy i_ch_leads on ch_leads for insert with check (participant_id = auth.uid());
create policy u_ch_leads on ch_leads for update
  using (participant_id = auth.uid()) with check (participant_id = auth.uid());

create policy r_ch_act on ch_lead_activities for select using (
  participant_id = auth.uid() or is_my_coach_participant(participant_id)
  or has_role('super_admin') or has_role('master_mentor'));
create policy i_ch_act on ch_lead_activities for insert with check (participant_id = auth.uid());

create policy r_ch_appt on ch_appointments for select using (
  participant_id = auth.uid() or is_my_coach_participant(participant_id)
  or has_role('super_admin') or has_role('master_mentor'));
create policy i_ch_appt on ch_appointments for insert with check (participant_id = auth.uid());
create policy u_ch_appt on ch_appointments for update
  using (participant_id = auth.uid()) with check (participant_id = auth.uid());

create policy r_ch_close on ch_closings for select using (
  participant_id = auth.uid() or is_my_coach_participant(participant_id)
  or has_role('super_admin') or has_role('master_mentor'));
-- participants can create/update their record but can NEVER set COMPLETED or verified fields
create policy i_ch_close on ch_closings for insert with check (
  participant_id = auth.uid() and status <> 'COMPLETED' and verified_at is null and verified_by is null);
create policy u_ch_close on ch_closings for update
  using (participant_id = auth.uid())
  with check (participant_id = auth.uid() and status <> 'COMPLETED'
              and verified_at is null and verified_by is null);

-- Participant submits closing for human review → reviewers notified
create or replace function fn_submit_closing(p_closing uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_lead text;
begin
  select c.participant_id, l.name into v_owner, v_lead
  from ch_closings c join ch_leads l on l.id = c.lead_id where c.id = p_closing;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'not found or not yours'; end if;
  update ch_closings set status = 'INTERNAL_REVIEW', updated_at = now() where id = p_closing;
  perform audit_log('closing_submitted','ch_closing', p_closing::text, null, 'INTERNAL_REVIEW', v_lead);
  perform notify_reviewers(v_owner, '🏁 Closing submitted for verification',
    'Lead: ' || coalesce(v_lead,'—') || ' — human verification required.', '#/coach');
end $$;

-- §15 HUMAN verification — never automatic. Approve → COMPLETED + verified XP + badge.
create or replace function fn_verify_closing(p_closing uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v ch_closings; v_pts int; v_cohort uuid;
begin
  select * into v from ch_closings where id = p_closing;
  if v.id is null then raise exception 'not found'; end if;
  if v.participant_id = auth.uid() then raise exception 'cannot verify your own closing'; end if;
  if not (has_role('super_admin') or has_role('master_mentor')
          or (has_role('elite_coach') and is_my_coach_participant(v.participant_id))) then
    raise exception 'not authorised';
  end if;
  if p_approve then
    update ch_closings set status = 'COMPLETED', verified_at = now(), verified_by = auth.uid(),
      notes = coalesce(p_note, notes), updated_at = now() where id = p_closing;
    update ch_leads set stage = 'CLOSED_WON', closing_outcome = 'verified', updated_at = now()
      where id = v.lead_id;
    select points into v_pts from xp_rules where code = 'closing_verified' and active;
    select cohort_id into v_cohort from enrolments
      where participant_id = v.participant_id order by created_at desc limit 1;
    if v_pts is not null then
      insert into points_ledger (user_id, cohort_id, source, amount, status, reason, awarded_by, ref_type, ref_id)
      values (v.participant_id, v_cohort, 'closing_verified', v_pts, 'verified',
              'Human-verified closing', auth.uid(), 'ch_closings', p_closing);
    end if;
    if exists (select 1 from ch_badges where code = 'first_closing' and active) then
      insert into user_badges (user_id, badge_code, awarded_by)
      values (v.participant_id, 'first_closing', auth.uid())
      on conflict (user_id, badge_code) do nothing;
    end if;
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

grant execute on function fn_submit_closing(uuid) to authenticated;
grant execute on function fn_verify_closing(uuid,boolean,text) to authenticated;

insert into xp_rules (code, points, description) values
 ('closing_verified', 100, 'Human-verified closing (§15)')
on conflict (code) do nothing;
insert into ch_badges (code, name, icon) values
 ('first_closing', '{"en":"First Closing","ms-MY":"Closing Pertama","id-ID":"Closing Pertama"}', '🏆')
on conflict (code) do nothing;
