-- ============================================================
-- 080_challenge_v2_ops.sql — 30 DAYS v2, P1: the daily operating system
--
-- Turns "30 curriculum days + task completion" into LEARN → TALK → FOLLOW UP →
-- MOVE → REVIEW, driven by the real CRM records Hero already owns.
--
-- ADDITIVE ONLY. Nothing in 002–079 is dropped.
--
-- POLICY DISCIPLINE: no numeric activity target, grace period, SLA, graduation
-- criterion, badge threshold or Mentor Point amount is invented here. Every one
-- of them is a row in ch_targets / ch_bottleneck_rules / ch_open_decisions with
-- active = false until Commander approves it. Rules that ARE active use only
-- structural facts (a lead has no next action; a follow-up date has passed;
-- qualified leads exist but no appointment does) — never a performance benchmark.
-- ============================================================

-- ------------------------------------------------------------
-- 1. OPEN DECISION REGISTER — visible in Admin, blocks nothing
-- ------------------------------------------------------------
create table if not exists ch_open_decisions (
  code text primary key,
  question text not null,
  why_it_matters text,
  blocks text,                       -- what stays disabled until decided
  proposed jsonb,                    -- a suggestion, NEVER auto-applied
  decided boolean not null default false,
  decision jsonb, decided_by uuid references profiles(id), decided_at timestamptz
);
alter table ch_open_decisions enable row level security;
create policy r_open_dec on ch_open_decisions for select using (auth.uid() is not null);
create policy w_open_dec on ch_open_decisions for all using (has_role('super_admin'));

insert into ch_open_decisions (code, question, why_it_matters, blocks) values
 ('daily_targets','What are the daily numeric activity targets (new conversations, follow-ups, leads with a next action)?',
  'Without them Hero can show counts but cannot say "on track".','Target rings on Today; "on track" wording everywhere'),
 ('grace_excused','How late may a day be submitted, who may excuse a miss, and does an excused day break the streak?',
  'Determines when a day becomes MISSED and whether XP/streak survive.','Automatic missed-day marking'),
 ('coach_sla','How many hours may a submission wait before it escalates, and to whom?',
  'Without it a submission can sit forever with nobody accountable.','Review-overdue escalation'),
 ('graduation','Is 30 approved days enough to graduate, or is a verified closing required?',
  'Day 30 must never auto-graduate; a human needs written criteria.','Graduation criteria display'),
 ('closing_verifier','Who holds closing-verification authority in MY and in ID?',
  'Verification writes 100 XP and the first_closing badge.','Per-country verifier routing'),
 ('mentor_points','What are the Mentor Point amounts?','The concept exists in the vault with no amounts anywhere.','Mentor Point awards'),
 ('evidence_threshold','What makes evidence acceptable vs rejected?','Coaches currently review with no rubric content.','coach_guidance content on all 30 days'),
 ('badge_thresholds','What are the badge award rules?','ch_badges.rule is NULL on all 5 and evaluated by nothing.','Declarative badge rules'),
 ('country_content_owner','Who owns country curriculum content for MY and for ID?',
  'Days 3/4/8/13/16/21/22/24 need authorised local legal & process content.','Country curriculum variants')
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- 2. CONFIGURABLE DAILY TARGETS — DRAFT until approved
-- ------------------------------------------------------------
create table if not exists ch_targets (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global','country','cohort')),
  country country_t,
  cohort_id uuid references cohorts(id) on delete cascade,
  code text not null check (code in
    ('new_conversations','followups_cleared','active_leads_with_next_action','curriculum_day')),
  target int not null check (target >= 0),
  active boolean not null default false,        -- DRAFT: nothing reads an inactive target
  note text,
  updated_by uuid references profiles(id), updated_at timestamptz default now()
);
create unique index if not exists uq_target_global  on ch_targets (code) where scope = 'global';
create unique index if not exists uq_target_country on ch_targets (code, country) where scope = 'country';
create unique index if not exists uq_target_cohort  on ch_targets (code, cohort_id) where scope = 'cohort';
alter table ch_targets enable row level security;
create policy r_targets on ch_targets for select using (auth.uid() is not null);
create policy w_targets on ch_targets for all using (has_role('super_admin'));

-- DRAFT working values for product testing. active = false → Hero shows the count
-- but never says "on track". Flipping active is a Commander decision.
insert into ch_targets (scope, code, target, active, note) values
 ('global','new_conversations', 10, false, 'DRAFT working example for product testing — not approved AG policy'),
 ('global','followups_cleared', 0, false, 'DRAFT — meaning: clear everything due today'),
 ('global','active_leads_with_next_action', 0, false, 'DRAFT — structural: every active lead should carry a next action'),
 ('global','curriculum_day', 1, false, 'DRAFT — one curriculum day per active day')
on conflict do nothing;

-- cohort > country > global; NULL when no ACTIVE target exists at any level
create or replace function fn_target(p_cohort uuid, p_code text) returns int
language sql stable security definer set search_path = public as $$
  select t.target from ch_targets t
  left join cohorts c on c.id = p_cohort
  where t.active and t.code = p_code
    and ( (t.scope = 'cohort'  and t.cohort_id = p_cohort)
       or (t.scope = 'country' and t.country = c.country)
       or  t.scope = 'global' )
  order by case t.scope when 'cohort' then 1 when 'country' then 2 else 3 end
  limit 1;
$$;
grant execute on function fn_target(uuid,text) to authenticated;

-- ------------------------------------------------------------
-- 3. NO DUPLICATE ENTRY — a day can be proven by a Hero record
-- ------------------------------------------------------------
alter table curriculum_days add column if not exists proof_type text
  check (proof_type in ('upload','structured','native_record','coach_observed'));
alter table curriculum_days add column if not exists proof_config jsonb;
comment on column curriculum_days.proof_type is
  'How this day is proven. native_record = a real Hero record satisfies it (no screenshot). NULL = legacy behaviour (free-text + optional upload).';
comment on column curriculum_days.proof_config is
  'For native_record: {"source":"leads|activities|appointments|closings|timebox|social","min_count":N,"window_days":N}.';

-- what Hero can already prove for this warrior, right now
create or replace function fn_day_proof(p_enrolment uuid, p_day int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p uuid; v_cfg jsonb; v_type text; v_src text; v_min int; v_win int; v_have int;
begin
  select e.participant_id, cd.proof_type, cd.proof_config
    into v_p, v_type, v_cfg
  from enrolments e
  join cohorts c on c.id = e.cohort_id
  left join curriculum_days cd on cd.version_id = c.curriculum_version_id and cd.day_no = p_day
   and (cd.country_override is null or cd.country_override = c.country)
  where e.id = p_enrolment
  order by (cd.country_override is null) limit 1;
  if v_p is null then return jsonb_build_object('applicable', false); end if;
  if v_type is distinct from 'native_record' or v_cfg is null then
    return jsonb_build_object('applicable', false, 'proof_type', v_type);
  end if;
  v_src := v_cfg->>'source';
  v_min := coalesce((v_cfg->>'min_count')::int, 1);
  v_win := coalesce((v_cfg->>'window_days')::int, 3650);
  v_have := case v_src
    when 'leads'        then (select count(*) from ch_leads l where l.participant_id = v_p and l.created_at > now() - make_interval(days => v_win))
    when 'activities'   then (select count(*) from ch_lead_activities a where a.participant_id = v_p and a.happened_at > now() - make_interval(days => v_win))
    when 'appointments' then (select count(*) from ch_appointments ap where ap.participant_id = v_p and ap.created_at > now() - make_interval(days => v_win))
    when 'closings'     then (select count(*) from ch_closings cl where cl.participant_id = v_p and cl.created_at > now() - make_interval(days => v_win))
    else 0 end;
  return jsonb_build_object('applicable', true, 'proof_type', v_type, 'source', v_src,
    'required', v_min, 'have', v_have, 'satisfied', v_have >= v_min);
end $$;
grant execute on function fn_day_proof(uuid,int) to authenticated;

-- ------------------------------------------------------------
-- 4. FAST CRM ENTRY — one call logs the touch AND moves the pipeline
-- ------------------------------------------------------------
create or replace function fn_log_touch(
  p_lead uuid, p_type text, p_outcome text, p_notes text,
  p_next_action text, p_next_date date, p_stage text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_prev text; v_act uuid;
begin
  select participant_id, stage into v_owner, v_prev from ch_leads where id = p_lead;
  if v_owner is null then raise exception 'lead not found'; end if;
  if v_owner <> auth.uid() and not is_reviewer_of(v_owner) then raise exception 'not your lead'; end if;
  -- a participant may never declare their own verified closing (see 079)
  if p_stage = 'CLOSED_WON' and v_owner = auth.uid() then
    raise exception 'a verified closing is confirmed by your Coach — submit the closing record instead';
  end if;

  insert into ch_lead_activities (lead_id, participant_id, activity_type, outcome, notes,
                                  next_action, next_action_date, happened_at)
  values (p_lead, v_owner, p_type, p_outcome, p_notes, p_next_action, p_next_date, now())
  returning id into v_act;

  update ch_leads set
    stage           = coalesce(nullif(p_stage,''), stage),
    next_action     = coalesce(p_next_action, next_action),
    next_action_at  = coalesce(p_next_date, next_action_at),
    last_contact_at = current_date,
    updated_at      = now()
  where id = p_lead;

  if p_stage is not null and p_stage <> '' and p_stage is distinct from v_prev then
    perform audit_log('lead_stage','ch_lead', p_lead::text, v_prev, p_stage, p_outcome);
  end if;
  return jsonb_build_object('ok', true, 'activity_id', v_act, 'prev_stage', v_prev, 'stage', coalesce(nullif(p_stage,''), v_prev));
end $$;
grant execute on function fn_log_touch(uuid,text,text,text,text,date,text) to authenticated;

-- ------------------------------------------------------------
-- 5. FUNNEL — actual counts from actual records, no benchmarks
-- ------------------------------------------------------------
create or replace function fn_funnel(p_participant uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_participant = auth.uid() or is_reviewer_of(p_participant)
    then jsonb_build_object(
      'conversations', (select count(distinct l.id) from ch_leads l
                        where l.participant_id = p_participant
                          and exists (select 1 from ch_lead_activities a where a.lead_id = l.id)),
      'leads',         (select count(*) from ch_leads where participant_id = p_participant),
      'engaged',       (select count(*) from ch_leads where participant_id = p_participant
                        and stage in ('ENGAGED','QUALIFIED','APPOINTMENT_SET','PRESENTATION_OR_VIEWING',
                                      'FOLLOW_UP','NEGOTIATION','CLOSING_PROCESS','CLOSED_WON')),
      'qualified',     (select count(*) from ch_leads where participant_id = p_participant
                        and stage in ('QUALIFIED','APPOINTMENT_SET','PRESENTATION_OR_VIEWING',
                                      'NEGOTIATION','CLOSING_PROCESS','CLOSED_WON')),
      'appointments',  (select count(*) from ch_appointments where participant_id = p_participant and kind = 'appointment'),
      'viewings',      (select count(*) from ch_appointments where participant_id = p_participant and kind in ('viewing','presentation')),
      'viewings_done', (select count(*) from ch_appointments where participant_id = p_participant
                        and kind in ('viewing','presentation') and status = 'COMPLETED'),
      'follow_ups',    (select count(*) from ch_lead_activities where participant_id = p_participant and activity_type = 'follow_up'),
      'negotiation',   (select count(*) from ch_leads where participant_id = p_participant
                        and stage in ('NEGOTIATION','CLOSING_PROCESS','CLOSED_WON')),
      'closing_process',(select count(*) from ch_closings where participant_id = p_participant
                        and status not in ('CANCELLED','UNSUCCESSFUL')),
      'verified_closings',(select count(*) from ch_closings where participant_id = p_participant and status = 'COMPLETED'))
    else null end;
$$;
grant execute on function fn_funnel(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. BOTTLENECK DIAGNOSIS — process, never personality
--    The LOGIC lives in the function (readable, testable). The ORDER,
--    ACTIVATION, WORDING, staleness windows and recommended day are DATA.
--    We do not repeat the ch_badges.rule mistake of storing an expression
--    nothing can evaluate.
-- ------------------------------------------------------------
create table if not exists ch_bottleneck_rules (
  code text primary key,
  seq int not null,
  label jsonb not null,             -- {en, ms-MY, id-ID}
  explanation jsonb not null,
  recommend_day int,                -- curriculum day to revisit
  params jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  version int not null default 1
);
alter table ch_bottleneck_rules enable row level security;
create policy r_bnr on ch_bottleneck_rules for select using (auth.uid() is not null);
create policy w_bnr on ch_bottleneck_rules for all using (has_role('super_admin'));

insert into ch_bottleneck_rules (code, seq, label, explanation, recommend_day, params) values
 ('PROSPECTING_GAP', 10,
  '{"en":"Prospecting","ms-MY":"Prospek","id-ID":"Prospek"}',
  '{"en":"You have very few live conversations. New pipeline has to come first — everything downstream is starved without it.","ms-MY":"Perbualan hidup anda sangat sedikit. Pipeline baharu mesti didahulukan — semua peringkat seterusnya kelaparan tanpanya.","id-ID":"Percakapan aktif Anda sangat sedikit. Pipeline baru harus didahulukan — semua tahap berikutnya kekurangan tanpa itu."}',
  7, '{"window_days":7}'),
 ('OPENING_GAP', 20,
  '{"en":"Opening & relevance","ms-MY":"Pembukaan & relevan","id-ID":"Pembuka & relevansi"}',
  '{"en":"You are reaching people but conversations are not starting. The opener is where to look.","ms-MY":"Anda menghubungi ramai orang tetapi perbualan tidak bermula. Ayat pembuka yang perlu disemak.","id-ID":"Anda menghubungi banyak orang tetapi percakapan tidak dimulai. Kalimat pembuka yang perlu ditinjau."}',
  8, '{}'),
 ('DISCOVERY_GAP', 30,
  '{"en":"Needs discovery","ms-MY":"Menggali keperluan","id-ID":"Menggali kebutuhan"}',
  '{"en":"People are engaging but nothing is becoming qualified. The missing piece is usually need, timing or budget never being asked.","ms-MY":"Orang melayan tetapi tiada yang menjadi layak. Yang selalu tertinggal ialah keperluan, masa atau bajet tidak pernah ditanya.","id-ID":"Orang merespons tetapi tidak ada yang menjadi qualified. Yang sering terlewat: kebutuhan, waktu atau anggaran tidak pernah ditanyakan."}',
  9, '{}'),
 ('NEXT_STEP_GAP', 40,
  '{"en":"Qualified → Appointment","ms-MY":"Layak → Temujanji","id-ID":"Qualified → Janji temu"}',
  '{"en":"You have qualified conversations with no appointment yet. This is the single most common place pipeline stalls.","ms-MY":"Anda ada perbualan layak tanpa temujanji. Inilah tempat pipeline paling kerap tersekat.","id-ID":"Anda punya percakapan qualified tanpa janji temu. Ini titik pipeline paling sering macet."}',
  12, '{}'),
 ('FOLLOW_UP_GAP', 50,
  '{"en":"Follow-up discipline","ms-MY":"Disiplin susulan","id-ID":"Disiplin follow-up"}',
  '{"en":"Leads are going quiet because the agreed follow-up date passed. Clearing these usually moves the pipeline more than new leads do.","ms-MY":"Lead menjadi sepi kerana tarikh susulan yang dijanjikan sudah berlalu. Membersihkannya selalunya menggerakkan pipeline lebih daripada lead baharu.","id-ID":"Lead menjadi sepi karena tanggal follow-up yang dijanjikan sudah lewat. Menyelesaikannya biasanya menggerakkan pipeline lebih dari lead baru."}',
  11, '{"stale_days":7}'),
 ('PRESENTATION_GAP', 60,
  '{"en":"Presentation & fit","ms-MY":"Persembahan & kesesuaian","id-ID":"Presentasi & kecocokan"}',
  '{"en":"Viewings and presentations are happening but nothing progresses afterwards. Look at discovery, product fit and the value story.","ms-MY":"Viewing dan persembahan berlaku tetapi tiada yang bergerak selepas itu. Semak penggalian keperluan, kesesuaian produk dan cerita nilai.","id-ID":"Viewing dan presentasi terjadi tetapi tidak ada yang berlanjut. Tinjau penggalian kebutuhan, kecocokan produk dan cerita nilai."}',
  14, '{}'),
 ('OBJECTION_GAP', 70,
  '{"en":"Objection handling","ms-MY":"Mengendali bantahan","id-ID":"Menangani keberatan"}',
  '{"en":"Conversations are sitting still after an objection was raised. Diagnose the objection type before answering it.","ms-MY":"Perbualan terhenti selepas bantahan dibangkitkan. Kenal pasti jenis bantahan sebelum menjawabnya.","id-ID":"Percakapan berhenti setelah keberatan muncul. Kenali jenis keberatannya sebelum menjawab."}',
  20, '{"stale_days":7}'),
 ('CLOSING_READINESS_GAP', 80,
  '{"en":"Closing readiness","ms-MY":"Kesediaan closing","id-ID":"Kesiapan closing"}',
  '{"en":"You are in negotiation but items, owners or dates are missing. Audit the strongest opportunity and name what is outstanding.","ms-MY":"Anda dalam rundingan tetapi item, pemilik atau tarikh tiada. Audit peluang terkuat dan namakan apa yang tertunggak.","id-ID":"Anda dalam negosiasi tetapi item, pemilik atau tanggal belum ada. Audit peluang terkuat dan sebutkan apa yang tertunda."}',
  22, '{}')
on conflict (code) do nothing;

-- First ACTIVE rule that matches, evaluated in funnel order (fix upstream first).
-- Every branch is a structural fact about the warrior's own records.
create or replace function fn_bottleneck(p_participant uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_leads int; v_recent_act int; v_contacted int; v_engaged int; v_qualified int;
  v_appt int; v_view_done int; v_neg int; v_overdue int; v_no_next int; v_obj_stale int;
  v_close_gap int; r record; v_hit text; v_ev jsonb;
begin
  if not (p_participant = auth.uid() or is_reviewer_of(p_participant)) then
    raise exception 'not authorised';
  end if;

  select count(*) into v_leads from ch_leads
   where participant_id = p_participant
     and stage not in ('CLOSED_LOST','DISQUALIFIED');
  select count(*) into v_recent_act from ch_lead_activities
   where participant_id = p_participant and happened_at > now() - interval '7 days';
  select count(*) into v_contacted from ch_leads
   where participant_id = p_participant and stage <> 'NEW'
     and stage not in ('CLOSED_LOST','DISQUALIFIED','NURTURE');
  select count(*) into v_engaged from ch_leads
   where participant_id = p_participant and stage in
     ('ENGAGED','QUALIFIED','APPOINTMENT_SET','PRESENTATION_OR_VIEWING','FOLLOW_UP','NEGOTIATION','CLOSING_PROCESS','CLOSED_WON');
  select count(*) into v_qualified from ch_leads
   where participant_id = p_participant and stage in
     ('QUALIFIED','APPOINTMENT_SET','PRESENTATION_OR_VIEWING','NEGOTIATION','CLOSING_PROCESS','CLOSED_WON');
  select count(*) into v_appt from ch_appointments where participant_id = p_participant;
  select count(*) into v_view_done from ch_appointments
   where participant_id = p_participant and kind in ('viewing','presentation') and status = 'COMPLETED';
  select count(*) into v_neg from ch_leads
   where participant_id = p_participant and stage in ('NEGOTIATION','CLOSING_PROCESS');
  select count(*) into v_overdue from ch_leads
   where participant_id = p_participant and next_action_at is not null and next_action_at < current_date
     and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED');
  select count(*) into v_no_next from ch_leads
   where participant_id = p_participant and next_action_at is null
     and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE');
  select count(*) into v_obj_stale from ch_leads l
   where l.participant_id = p_participant and l.stage = 'FOLLOW_UP'
     and exists (select 1 from ch_lead_activities a where a.lead_id = l.id and a.outcome ilike '%object%')
     and l.updated_at < now() - interval '7 days';
  select count(*) into v_close_gap from ch_closings
   where participant_id = p_participant
     and status in ('PREPARING','DOCUMENTATION','CUSTOMER_DECISION','DELAYED')
     and (missing_items is null or expected_review is null);

  for r in select * from ch_bottleneck_rules where active order by seq loop
    v_hit := null;
    if r.code = 'PROSPECTING_GAP'        and (v_leads = 0 or v_recent_act = 0) then v_hit := r.code;
    elsif r.code = 'OPENING_GAP'         and v_contacted > 0 and v_engaged = 0 then v_hit := r.code;
    elsif r.code = 'DISCOVERY_GAP'       and v_engaged > 0 and v_qualified = 0 then v_hit := r.code;
    elsif r.code = 'NEXT_STEP_GAP'       and v_qualified > 0 and v_appt = 0 then v_hit := r.code;
    elsif r.code = 'FOLLOW_UP_GAP'       and v_overdue > 0 then v_hit := r.code;
    elsif r.code = 'PRESENTATION_GAP'    and v_view_done > 0 and v_neg = 0 then v_hit := r.code;
    elsif r.code = 'OBJECTION_GAP'       and v_obj_stale > 0 then v_hit := r.code;
    elsif r.code = 'CLOSING_READINESS_GAP' and v_close_gap > 0 then v_hit := r.code;
    end if;
    if v_hit is not null then
      v_ev := jsonb_build_object('leads', v_leads, 'activity_7d', v_recent_act, 'contacted', v_contacted,
        'engaged', v_engaged, 'qualified', v_qualified, 'appointments', v_appt,
        'viewings_done', v_view_done, 'negotiation', v_neg, 'overdue_followups', v_overdue,
        'leads_without_next_action', v_no_next);
      return jsonb_build_object('code', r.code, 'label', r.label, 'explanation', r.explanation,
        'recommend_day', r.recommend_day, 'rule_version', r.version, 'evidence', v_ev);
    end if;
  end loop;

  return jsonb_build_object('code', null, 'evidence', jsonb_build_object(
    'leads', v_leads, 'activity_7d', v_recent_act, 'qualified', v_qualified,
    'appointments', v_appt, 'overdue_followups', v_overdue, 'leads_without_next_action', v_no_next));
end $$;
grant execute on function fn_bottleneck(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. DAILY MISSION — the one call the Today screen makes
-- ------------------------------------------------------------
create or replace function fn_daily_mission(p_enrolment uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_p uuid; v_cohort uuid; v_day int; v_today date; v_row curriculum_days%rowtype;
  v_new_today int; v_due int; v_cleared int; v_active int; v_no_next int;
  v_sub text; v_pri jsonb; v_appt_soon int; v_view_no_fu int; v_qual_no_appt int;
begin
  select e.participant_id, e.cohort_id into v_p, v_cohort from enrolments e where e.id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not (v_p = auth.uid() or is_reviewer_of(v_p)) then raise exception 'not authorised'; end if;

  v_day   := participant_accessible_day(p_enrolment);
  v_today := cohort_local_date(v_cohort);

  select cd.* into v_row from curriculum_days cd
   join cohorts c on c.id = v_cohort
   where cd.version_id = c.curriculum_version_id and cd.day_no = greatest(v_day, 1)
     and (cd.country_override is null or cd.country_override = c.country)
   order by (cd.country_override is null) limit 1;

  select status into v_sub from task_submissions
   where enrolment_id = p_enrolment and day_no = v_day order by version desc limit 1;

  -- TALK / FOLLOW UP / MOVE — real records only
  select count(*) into v_new_today from ch_leads
   where participant_id = v_p and created_at >= v_today::timestamptz;
  select count(*) into v_due from ch_leads
   where participant_id = v_p and next_action_at is not null and next_action_at <= v_today
     and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED');
  select count(*) into v_cleared from ch_lead_activities
   where participant_id = v_p and happened_at >= v_today::timestamptz;
  select count(*) into v_active from ch_leads
   where participant_id = v_p and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE');
  select count(*) into v_no_next from ch_leads
   where participant_id = v_p and next_action_at is null
     and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE');

  -- PIPELINE-TRIGGERED MISSION: a live customer commitment outranks the curriculum
  select count(*) into v_appt_soon from ch_appointments
   where participant_id = v_p and status in ('SCHEDULED','CONFIRMED')
     and starts_at between now() and now() + interval '36 hours';
  select count(*) into v_view_no_fu from ch_appointments ap
   where ap.participant_id = v_p and ap.status = 'COMPLETED'
     and not exists (select 1 from ch_lead_activities a
                     where a.lead_id = ap.lead_id and a.happened_at > ap.starts_at);
  select count(*) into v_qual_no_appt from ch_leads l
   where l.participant_id = v_p and l.stage = 'QUALIFIED'
     and not exists (select 1 from ch_appointments ap where ap.lead_id = l.id);

  v_pri := case
    when v_appt_soon  > 0 then jsonb_build_object('code','VIEWING_PREP','count',v_appt_soon,'link','#/pipeline')
    when v_view_no_fu > 0 then jsonb_build_object('code','POST_VIEWING_FOLLOW_UP','count',v_view_no_fu,'link','#/pipeline')
    when v_due        > 0 then jsonb_build_object('code','FOLLOW_UPS_DUE','count',v_due,'link','#/pipeline')
    when v_qual_no_appt > 0 then jsonb_build_object('code','SET_APPOINTMENT','count',v_qual_no_appt,'link','#/pipeline')
    else null end;

  return jsonb_build_object(
    'enrolment_id', p_enrolment,
    'local_date', v_today,
    'cohort_day', cohort_day(v_cohort),
    'accessible_day', v_day,
    'curriculum', case when v_row.id is null then null else jsonb_build_object(
        'day_no', v_row.day_no, 'phase', v_row.phase, 'title', v_row.title,
        'objective', v_row.objective, 'xp_amount', v_row.xp_amount,
        'proof_type', v_row.proof_type, 'status', coalesce(v_sub,'not_started')) end,
    'proof', fn_day_proof(p_enrolment, greatest(v_day,1)),
    'business', jsonb_build_object(
        'new_conversations', v_new_today,
        'followups_due', v_due,
        'touches_today', v_cleared,
        'active_leads', v_active,
        'leads_without_next_action', v_no_next),
    'targets', jsonb_strip_nulls(jsonb_build_object(
        'new_conversations', fn_target(v_cohort,'new_conversations'),
        'followups_cleared', fn_target(v_cohort,'followups_cleared'),
        'active_leads_with_next_action', fn_target(v_cohort,'active_leads_with_next_action'))),
    'priority', v_pri);
end $$;
grant execute on function fn_daily_mission(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. END-OF-DAY + WEEKLY REVIEW — generated, not a form to fill
-- ------------------------------------------------------------
create or replace function fn_day_summary(p_enrolment uuid, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p uuid; v_cohort uuid; v_d date; v_out jsonb;
begin
  select participant_id, cohort_id into v_p, v_cohort from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not (v_p = auth.uid() or is_reviewer_of(v_p)) then raise exception 'not authorised'; end if;
  v_d := coalesce(p_date, cohort_local_date(v_cohort));
  select jsonb_build_object(
    'date', v_d,
    'new_conversations', (select count(*) from ch_leads where participant_id = v_p and created_at::date = v_d),
    'touches',           (select count(*) from ch_lead_activities where participant_id = v_p and happened_at::date = v_d),
    'followups_done',    (select count(*) from ch_lead_activities where participant_id = v_p
                          and happened_at::date = v_d and activity_type = 'follow_up'),
    'followups_left',    (select count(*) from ch_leads where participant_id = v_p
                          and next_action_at is not null and next_action_at <= v_d
                          and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')),
    'appointments_made', (select count(*) from ch_appointments where participant_id = v_p and created_at::date = v_d),
    'active_leads',      (select count(*) from ch_leads where participant_id = v_p
                          and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE')),
    'with_next_action',  (select count(*) from ch_leads where participant_id = v_p and next_action_at is not null
                          and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE')),
    'stage_moves',       (select count(*) from audit_events where actor = v_p and action = 'lead_stage' and at::date = v_d),
    'curriculum',        (select jsonb_build_object('day_no', day_no, 'status', status)
                          from task_submissions where enrolment_id = p_enrolment
                          and submitted_at::date = v_d order by version desc limit 1)
  ) into v_out;
  return v_out;
end $$;
grant execute on function fn_day_summary(uuid,date) to authenticated;

create or replace function fn_weekly_review(p_enrolment uuid, p_weeks_back int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p uuid; v_cohort uuid; v_to date; v_from date;
begin
  select participant_id, cohort_id into v_p, v_cohort from enrolments where id = p_enrolment;
  if v_p is null then raise exception 'not found'; end if;
  if not (v_p = auth.uid() or is_reviewer_of(v_p)) then raise exception 'not authorised'; end if;
  v_to   := cohort_local_date(v_cohort) - (p_weeks_back * 7);
  v_from := v_to - 6;
  return jsonb_build_object(
    'from', v_from, 'to', v_to,
    'active_days',    (select count(distinct happened_at::date) from ch_lead_activities
                       where participant_id = v_p and happened_at::date between v_from and v_to),
    'new_leads',      (select count(*) from ch_leads where participant_id = v_p and created_at::date between v_from and v_to),
    'touches',        (select count(*) from ch_lead_activities where participant_id = v_p and happened_at::date between v_from and v_to),
    'follow_ups',     (select count(*) from ch_lead_activities where participant_id = v_p
                       and activity_type = 'follow_up' and happened_at::date between v_from and v_to),
    'appointments',   (select count(*) from ch_appointments where participant_id = v_p and created_at::date between v_from and v_to),
    'viewings_done',  (select count(*) from ch_appointments where participant_id = v_p
                       and kind in ('viewing','presentation') and status = 'COMPLETED'
                       and updated_at::date between v_from and v_to),
    'days_approved',  (select count(distinct day_no) from task_submissions
                       where enrolment_id = p_enrolment and status = 'approved'
                       and reviewed_at::date between v_from and v_to),
    'stage_moves',    (select count(*) from audit_events where actor = v_p and action = 'lead_stage'
                       and at::date between v_from and v_to),
    'overdue_now',    (select count(*) from ch_leads where participant_id = v_p
                       and next_action_at is not null and next_action_at < current_date
                       and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')),
    'bottleneck',     fn_bottleneck(v_p),
    'funnel',         fn_funnel(v_p));
end $$;
grant execute on function fn_weekly_review(uuid,int) to authenticated;

-- ------------------------------------------------------------
-- 9. COACH OPERATING MODEL — who is moving, who is stuck, who needs me today
-- ------------------------------------------------------------
create or replace function fn_coach_pod()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if not (has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach')) then
    raise exception 'not authorised';
  end if;
  select coalesce(jsonb_agg(x order by x->>'urgency' desc, x->>'name'), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'enrolment_id', e.id, 'participant_id', e.participant_id,
      'name', p.name, 'country', p.country, 'stage', e.status,
      'cohort', c.name, 'cohort_day', cohort_day(e.cohort_id),
      'accessible_day', participant_accessible_day(e.id),
      'days_approved', (select count(distinct day_no) from task_submissions
                        where enrolment_id = e.id and status = 'approved'),
      'pending_reviews', (select count(*) from task_submissions
                          where enrolment_id = e.id and status in ('submitted','under_review')),
      'oldest_pending_hours', (select round(extract(epoch from (now() - min(submitted_at)))/3600)
                               from task_submissions where enrolment_id = e.id
                               and status in ('submitted','under_review')),
      'readiness_pending', (select count(*) from readiness_submissions
                            where enrolment_id = e.id and status in ('submitted','under_review')),
      'days_inactive', (select coalesce(extract(day from now() - max(happened_at))::int, 999)
                        from ch_lead_activities where participant_id = e.participant_id),
      'overdue_followups', (select count(*) from ch_leads where participant_id = e.participant_id
                            and next_action_at is not null and next_action_at < current_date
                            and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')),
      'active_leads', (select count(*) from ch_leads where participant_id = e.participant_id
                       and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED','NURTURE')),
      'bottleneck', fn_bottleneck(e.participant_id)->>'code',
      -- urgency is a SORT KEY built from facts, not a judgement about the person
      'urgency', case
        when (select count(*) from readiness_submissions where enrolment_id = e.id
              and status in ('submitted','under_review')) > 0 then '3'
        when (select count(*) from task_submissions where enrolment_id = e.id
              and status in ('submitted','under_review')) > 0 then '3'
        when (select coalesce(extract(day from now() - max(happened_at))::int, 999)
              from ch_lead_activities where participant_id = e.participant_id) >= 2 then '2'
        when (select count(*) from ch_leads where participant_id = e.participant_id
              and next_action_at is not null and next_action_at < current_date
              and stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')) > 0 then '1'
        else '0' end
    ) as x
    from enrolments e
    join profiles p on p.id = e.participant_id
    join cohorts  c on c.id = e.cohort_id
    where e.status in ('invited','onboarding','ready','active','paused')
      and (has_role('super_admin') or has_role('master_mentor')
           or is_my_coach_participant(e.participant_id))
  ) t;
  return v_rows;
end $$;
grant execute on function fn_coach_pod() to authenticated;

-- ------------------------------------------------------------
-- 10. MASTER MENTOR — programme health, not raw noise
-- ------------------------------------------------------------
create or replace function fn_programme_health(p_country text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_bn jsonb;
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then raise exception 'not authorised'; end if;
  with scope as (
    select e.id, e.participant_id, e.status, e.cohort_id
    from enrolments e join profiles p on p.id = e.participant_id
    where (p_country is null or p_country = '' or p.country::text = p_country)
  )
  select jsonb_build_object(
    'warriors',   (select count(*) from scope),
    'active',     (select count(*) from scope where status = 'active'),
    'onboarding', (select count(*) from scope where status in ('invited','onboarding','ready')),
    'paused',     (select count(*) from scope where status = 'paused'),
    'active_today', (select count(distinct s.participant_id) from scope s
                     join ch_lead_activities a on a.participant_id = s.participant_id
                     where a.happened_at > now() - interval '24 hours'),
    'inactive_2d',  (select count(*) from scope s where not exists (
                       select 1 from ch_lead_activities a where a.participant_id = s.participant_id
                       and a.happened_at > now() - interval '2 days')),
    'review_backlog', (select count(*) from task_submissions t join scope s on s.id = t.enrolment_id
                       where t.status in ('submitted','under_review')),
    'readiness_backlog', (select count(*) from readiness_submissions r join scope s on s.id = r.enrolment_id
                          where r.status in ('submitted','under_review')),
    'oldest_pending_hours', (select round(extract(epoch from (now() - min(t.submitted_at)))/3600)
                             from task_submissions t join scope s on s.id = t.enrolment_id
                             where t.status in ('submitted','under_review')),
    'leads',        (select count(*) from ch_leads l join scope s on s.participant_id = l.participant_id),
    'qualified',    (select count(*) from ch_leads l join scope s on s.participant_id = l.participant_id
                     where l.stage in ('QUALIFIED','APPOINTMENT_SET','PRESENTATION_OR_VIEWING','NEGOTIATION','CLOSING_PROCESS','CLOSED_WON')),
    'appointments', (select count(*) from ch_appointments a join scope s on s.participant_id = a.participant_id),
    'viewings_done',(select count(*) from ch_appointments a join scope s on s.participant_id = a.participant_id
                     where a.kind in ('viewing','presentation') and a.status = 'COMPLETED'),
    'negotiation',  (select count(*) from ch_leads l join scope s on s.participant_id = l.participant_id
                     where l.stage in ('NEGOTIATION','CLOSING_PROCESS')),
    'closing_process', (select count(*) from ch_closings c join scope s on s.participant_id = c.participant_id
                        where c.status not in ('CANCELLED','UNSUCCESSFUL','COMPLETED')),
    'verified_closings', (select count(*) from ch_closings c join scope s on s.participant_id = c.participant_id
                          where c.status = 'COMPLETED'),
    'coach_load', (select coalesce(jsonb_agg(jsonb_build_object('coach', pr.name, 'warriors', n) order by n desc), '[]'::jsonb)
                   from (select ca.coach_id, count(*) n from coach_assignments ca
                         join scope s on s.participant_id = ca.participant_id
                         where ca.active group by ca.coach_id) q
                   join profiles pr on pr.id = q.coach_id),
    'unassigned', (select count(*) from scope s where not exists (
                     select 1 from coach_assignments ca where ca.participant_id = s.participant_id and ca.active))
  ) into v;

  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'n', n) order by n desc), '[]'::jsonb) into v_bn
  from (
    select coalesce(fn_bottleneck(e.participant_id)->>'code','NONE') as code, count(*) n
    from enrolments e join profiles p on p.id = e.participant_id
    where e.status = 'active' and (p_country is null or p_country = '' or p.country::text = p_country)
    group by 1
  ) b;
  return v || jsonb_build_object('bottlenecks', v_bn);
end $$;
grant execute on function fn_programme_health(text) to authenticated;

-- ------------------------------------------------------------
-- 11. DAY STATE — the record automation needs (missed / excused)
-- ------------------------------------------------------------
create table if not exists ch_day_state (
  enrolment_id uuid not null references enrolments(id) on delete cascade,
  day_no int not null,
  state text not null check (state in ('missed','excused')),
  due_date date,
  reason text,
  marked_by uuid references profiles(id),
  marked_at timestamptz default now(),
  primary key (enrolment_id, day_no)
);
alter table ch_day_state enable row level security;
create policy r_day_state on ch_day_state for select using (
  exists (select 1 from enrolments e where e.id = enrolment_id
          and (e.participant_id = auth.uid() or is_reviewer_of(e.participant_id))));
-- writes are RPC-only (fn_admin_mark_day / the worker sweep)

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
  -- An excused day must not punish the warrior: holding their clock back by one day
  -- gives them the time back instead of letting the programme run away from them.
  if p_state = 'excused' then
    update enrolments set paused_days = paused_days + 1 where id = p_enrolment;
  end if;
  perform audit_log('day_' || p_state, 'task_day', p_enrolment::text || ':' || p_day::text, null, p_state, p_reason);
  perform fn_notify(v_p, 'challenge',
    case when p_state = 'excused' then '🕊 Day ' || p_day || ' excused' else '⚠ Day ' || p_day || ' marked missed' end,
    p_reason, '#/challenge');
end $$;
grant execute on function fn_admin_mark_day(uuid,int,text,text) to authenticated;

-- ------------------------------------------------------------
-- 12. AUTOMATION — one sweep the worker cron calls with the service role.
--     Returns what it did so the cron log is honest about coverage.
--     GRACE PERIOD IS AN OPEN DECISION: until ch_open_decisions.grace_excused is
--     decided, days are only FLAGGED to the coach, never auto-marked missed.
-- ------------------------------------------------------------
create or replace function fn_challenge_sweep(p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_inactive int := 0; v_overdue int := 0; v_sla int := 0;
  v_d27 int := 0; v_d30 int := 0; v_flagged int := 0; v_grace_decided boolean;
begin
  -- The worker cron fires every 5 minutes; this is a once-a-day job. Self-guard so
  -- the caller can stay dumb and a missed tick simply runs on the next one.
  if not p_force and exists (select 1 from audit_events
      where action = 'challenge_sweep' and at > now() - interval '12 hours') then
    return jsonb_build_object('skipped', 'already swept within 12h');
  end if;
  perform audit_log('challenge_sweep','system','challenge', null, 'running', null);
  select decided into v_grace_decided from ch_open_decisions where code = 'grace_excused';

  for r in
    select e.id, e.participant_id, e.cohort_id, p.name,
           participant_accessible_day(e.id) as acc
    from enrolments e join profiles p on p.id = e.participant_id
    where e.status = 'active'
  loop
    -- missed days: FLAG to the coach; do not auto-mark until the grace policy exists
    if not coalesce(v_grace_decided, false) then
      if exists (
        select 1 from generate_series(1, greatest(r.acc - 1, 0)) d
        where not exists (select 1 from task_submissions t
                          where t.enrolment_id = r.id and t.day_no = d
                            and t.status in ('approved','submitted','under_review','revision_required'))
          and not exists (select 1 from ch_day_state s where s.enrolment_id = r.id and s.day_no = d)
      ) then
        v_flagged := v_flagged + 1;
      end if;
    end if;

    -- inactivity: no CRM activity for 2+ days
    if not exists (select 1 from ch_lead_activities a
                   where a.participant_id = r.participant_id
                     and a.happened_at > now() - interval '2 days') then
      if not exists (select 1 from notifications n
                     where n.to_agent = r.participant_id and n.type = 'challenge'
                       and n.created_at > now() - interval '20 hours'
                       and n.title like '%quiet%') then
        perform fn_notify(r.participant_id, 'challenge', '👋 Your pipeline has been quiet',
          'No conversations logged for two days. One real conversation today keeps the momentum.', '#/pipeline');
        perform notify_reviewers(r.participant_id, '⚠ ' || r.name || ' has been inactive 2+ days',
          'No CRM activity logged. A short check-in usually turns this around.', '#/coach');
        v_inactive := v_inactive + 1;
      end if;
    end if;

    -- follow-ups whose agreed date has passed
    if exists (select 1 from ch_leads l where l.participant_id = r.participant_id
               and l.next_action_at is not null and l.next_action_at < current_date
               and l.stage not in ('CLOSED_WON','CLOSED_LOST','DISQUALIFIED')) then
      if not exists (select 1 from notifications n
                     where n.to_agent = r.participant_id and n.created_at > now() - interval '20 hours'
                       and n.title like '%follow-up%') then
        perform fn_notify(r.participant_id, 'challenge', '⏰ Overdue follow-up',
          'Some agreed follow-up dates have passed. Clearing them usually moves the pipeline more than new leads.', '#/pipeline');
        v_overdue := v_overdue + 1;
      end if;
    end if;

    -- Day 27 structured coach review
    if r.acc >= 27 and not exists (select 1 from audit_events
        where entity_id = r.id::text and action = 'day27_review_raised') then
      perform notify_reviewers(r.participant_id, '🧭 Day 27 — structured review due for ' || r.name,
        'Hero has generated the summary. Review activity, pipeline, bottleneck and agreed next actions.', '#/coach');
      perform audit_log('day27_review_raised','enrolment', r.id::text, null, 'due', null);
      v_d27 := v_d27 + 1;
    end if;

    -- Day 30 final review — raises a HUMAN review, never a graduation
    if r.acc >= 30 and not exists (select 1 from audit_events
        where entity_id = r.id::text and action = 'day30_review_raised') then
      perform notify_reviewers(r.participant_id, '🏁 Day 30 — final review due for ' || r.name,
        'Programme completion, capability, pipeline progress and next journey. Graduation stays a human decision.', '#/coach');
      perform fn_notify(r.participant_id, 'milestone', '🏁 You have reached Day 30',
        'Your Coach will now run your final review.', '#/challenge');
      perform audit_log('day30_review_raised','enrolment', r.id::text, null, 'due', null);
      v_d30 := v_d30 + 1;
    end if;
  end loop;

  -- coach SLA: OPEN DECISION. Until coach_sla is decided we report the backlog age
  -- in the sweep result but escalate nobody.
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
-- 13. VERIFY
-- ------------------------------------------------------------
select 'open decisions seeded' as check, count(*) as n from ch_open_decisions;
select 'targets seeded (all inactive)' as check, count(*) filter (where active) as active_must_be_0,
       count(*) as total from ch_targets;
select 'bottleneck rules' as check, count(*) as n from ch_bottleneck_rules where active;
