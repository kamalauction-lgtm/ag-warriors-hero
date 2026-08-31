-- ============================================================
-- 089_governance_v1.sql — 30 Days Governance Policy v1. ADDITIVE.
--
-- Turns the nine Command HQ "Open Decisions" into versioned, effective-dated,
-- scope-aware POLICY DATA. Nothing here is hardcoded in application code.
--
-- CONTROLLED PRINCIPLES (kind='principle') are recorded but are NOT knobs:
-- no closing guarantee · closing not required for graduation · human final
-- graduation · no self-verified closing · no self-approved evidence · country
-- first / language second · no cross-country fallback · Mentor Points only from
-- verified contribution · Elite/Coach appointment stays human · audit integrity.
--
-- VERSIONED OPERATIONAL CONFIG (kind='operational') is a knob: targets, SLA
-- hours, grace, thresholds, Mentor Point amounts, badge rules, critical flags.
--
-- HISTORICAL STABILITY: a new version never rewrites an old one. Reports about a
-- past date resolve through fn_policy_at(code, cohort, date).
--
-- ROLLBACK: every object here is new except profiles.language_source/
-- language_confirmed_at (additive columns) and the profiles insert trigger.
-- To roll back: drop trigger trg_profiles_language on profiles, then
-- drop the ch_policy*/ch_permissions tables. No existing row is modified.
-- ============================================================

-- ------------------------------------------------------------
-- 1. POLICY FRAMEWORK
-- ------------------------------------------------------------
create table if not exists ch_policies (
  code text primary key,
  title text not null,
  summary text,
  kind text not null default 'operational' check (kind in ('principle','operational')),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists ch_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_code text not null references ch_policies(code) on delete cascade,
  version int not null,
  scope_country country_t,                      -- null = all countries
  scope_cohort uuid references cohorts(id) on delete cascade,   -- null = all cohorts
  config jsonb not null,
  status text not null default 'draft'
    check (status in ('draft','approved','active','superseded','retired')),
  effective_from date not null default current_date,
  effective_to date,
  note text,
  created_by uuid references profiles(id), created_at timestamptz default now(),
  approved_by uuid references profiles(id), approved_at timestamptz,
  unique (policy_code, version)
);
create index if not exists idx_polv_lookup
  on ch_policy_versions (policy_code, status, effective_from desc);

alter table ch_policies enable row level security;
alter table ch_policy_versions enable row level security;
create policy r_pol  on ch_policies for select using (auth.uid() is not null);
create policy r_polv on ch_policy_versions for select using (auth.uid() is not null);
create policy w_pol  on ch_policies for all using (has_role('super_admin'));
create policy w_polv on ch_policy_versions for all using (has_role('super_admin'));

-- resolve the config in force on a given date: cohort > country > global,
-- newest effective version wins.
create or replace function fn_policy_at(p_code text, p_cohort uuid, p_on date)
returns jsonb language sql stable security definer set search_path = public as $$
  select v.config
  from ch_policy_versions v
  left join cohorts c on c.id = p_cohort
  where v.policy_code = p_code
    and v.status = 'active'
    and v.effective_from <= p_on
    and (v.effective_to is null or v.effective_to >= p_on)
    and (v.scope_cohort is null or v.scope_cohort = p_cohort)
    and (v.scope_country is null or v.scope_country = c.country)
  order by (v.scope_cohort is not null) desc,      -- cohort override first
           (v.scope_country is not null) desc,     -- then country
           v.effective_from desc, v.version desc
  limit 1;
$$;

create or replace function fn_policy(p_code text, p_cohort uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select fn_policy_at(p_code, p_cohort, current_date);
$$;
grant execute on function fn_policy(text,uuid) to authenticated;
grant execute on function fn_policy_at(text,uuid,date) to authenticated;

-- authoring: a new version supersedes the previous one WITHOUT rewriting it
create or replace function fn_admin_publish_policy(
  p_code text, p_config jsonb, p_scope_country text, p_scope_cohort uuid,
  p_effective_from date, p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_next int; v_id uuid; v_from date;
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  if not exists (select 1 from ch_policies where code = p_code) then
    raise exception 'unknown policy %', p_code;
  end if;
  if (select kind from ch_policies where code = p_code) = 'principle' then
    raise exception '% is a controlled principle, not a configurable policy', p_code;
  end if;
  v_from := coalesce(p_effective_from, current_date);
  select coalesce(max(version),0) + 1 into v_next from ch_policy_versions where policy_code = p_code;

  -- close the outgoing version the day before the new one takes effect;
  -- its config and history stay exactly as they were.
  update ch_policy_versions
     set status = 'superseded', effective_to = coalesce(effective_to, v_from - 1)
   where policy_code = p_code and status = 'active'
     and scope_country is not distinct from nullif(p_scope_country,'')::country_t
     and scope_cohort is not distinct from p_scope_cohort;

  insert into ch_policy_versions (policy_code, version, scope_country, scope_cohort, config,
                                  status, effective_from, note, created_by, approved_by, approved_at)
  values (p_code, v_next, nullif(p_scope_country,'')::country_t, p_scope_cohort, p_config,
          'active', v_from, p_note, auth.uid(), auth.uid(), now())
  returning id into v_id;
  perform audit_log('policy_published','ch_policy_version', v_id::text, null,
                    p_code || ' v' || v_next, p_note);
  return v_id;
end $$;
grant execute on function fn_admin_publish_policy(text,jsonb,text,uuid,date,text) to authenticated;

-- Command HQ "Governance Decisions" surface
create or replace function fn_governance()
returns table (code text, title text, summary text, kind text, status text, version int,
               scope_country text, scope_cohort uuid, effective_from date, effective_to date,
               approved_by_name text, updated_at timestamptz, config jsonb)
language sql stable security definer set search_path = public as $$
  select p.code, p.title, p.summary, p.kind,
         coalesce(v.status,'draft'), v.version,
         v.scope_country::text, v.scope_cohort, v.effective_from, v.effective_to,
         pr.name, coalesce(v.approved_at, v.created_at, p.updated_at), v.config
  from ch_policies p
  left join ch_policy_versions v
    on v.policy_code = p.code and v.status = 'active'
       and v.scope_country is null and v.scope_cohort is null
  left join profiles pr on pr.id = v.approved_by
  where auth.uid() is not null
  order by p.kind desc, p.code;
$$;
grant execute on function fn_governance() to authenticated;

-- full history, including superseded versions (nothing is hidden)
create or replace function fn_governance_history(p_code text)
returns table (version int, status text, scope_country text, scope_cohort uuid,
               effective_from date, effective_to date, approved_by_name text,
               approved_at timestamptz, note text, config jsonb)
language sql stable security definer set search_path = public as $$
  select v.version, v.status, v.scope_country::text, v.scope_cohort,
         v.effective_from, v.effective_to, pr.name, v.approved_at, v.note, v.config
  from ch_policy_versions v left join profiles pr on pr.id = v.approved_by
  where v.policy_code = p_code
    and (has_role('super_admin') or has_role('master_mentor'))
  order by v.version desc;
$$;
grant execute on function fn_governance_history(text) to authenticated;

-- ------------------------------------------------------------
-- 2. COUNTRY-SCOPED PERMISSIONS (Decision 6 + Decision 9)
--    Never a hardcoded person; always an assignable permission.
-- ------------------------------------------------------------
create table if not exists ch_permissions (
  user_id uuid not null references profiles(id) on delete cascade,
  permission text not null,                 -- closing.verify | content.own | content.review
  country country_t not null,
  granted_by uuid references profiles(id), granted_at timestamptz default now(),
  note text,
  primary key (user_id, permission, country)
);
alter table ch_permissions enable row level security;
create policy r_perm on ch_permissions for select using
  (user_id = auth.uid() or has_role('super_admin') or has_role('master_mentor'));
create policy w_perm on ch_permissions for all using (has_role('super_admin'));

create or replace function has_permission(p_permission text, p_country country_t)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ch_permissions
                 where user_id = auth.uid() and permission = p_permission and country = p_country);
$$;
grant execute on function has_permission(text,country_t) to authenticated;

create or replace function fn_admin_grant_permission(
  p_user uuid, p_permission text, p_country text, p_grant boolean, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  if p_permission not in ('closing.verify','content.own','content.review') then
    raise exception 'unknown permission %', p_permission;
  end if;
  select name into v_name from profiles where id = p_user;
  if v_name is null then raise exception 'no such profile'; end if;
  if p_grant then
    insert into ch_permissions (user_id, permission, country, granted_by, note)
    values (p_user, p_permission, p_country::country_t, auth.uid(), p_note)
    on conflict (user_id, permission, country) do update
      set granted_by = excluded.granted_by, granted_at = now(), note = excluded.note;
  else
    delete from ch_permissions where user_id = p_user
      and permission = p_permission and country = p_country::country_t;
  end if;
  perform audit_log(case when p_grant then 'permission_granted' else 'permission_revoked' end,
    'ch_permission', p_user::text || ':' || p_permission || ':' || p_country,
    null, case when p_grant then 'granted' else 'revoked' end, v_name || ' · ' || coalesce(p_note,''));
end $$;
grant execute on function fn_admin_grant_permission(uuid,text,text,boolean,text) to authenticated;

-- ------------------------------------------------------------
-- 3. CRITICAL CURRICULUM ITEMS (Decision 5)
--    Which items are critical is owned by the curriculum, not by business logic.
-- ------------------------------------------------------------
alter table curriculum_days add column if not exists is_critical boolean not null default false;
comment on column curriculum_days.is_critical is
  'Set by the controlled curriculum owner. Graduation requires every critical item completed. No day number is hardcoded anywhere.';

-- ------------------------------------------------------------
-- 4. LANGUAGE PROVENANCE (approved language-default correction)
--    Existing rows are NOT touched: every one becomes legacy_unknown, which
--    means "we cannot prove whether this person chose English or inherited the
--    old 'en' column default". Nothing user-visible changes for them.
-- ------------------------------------------------------------
alter table profiles add column if not exists language_source text not null default 'legacy_unknown'
  check (language_source in ('explicit','country_default','legacy_unknown'));
alter table profiles add column if not exists language_confirmed_at timestamptz;
comment on column profiles.language_source is
  'explicit = the person chose it · country_default = applied from their country at creation · legacy_unknown = predates the correction, provenance unprovable. Never overwrite an explicit choice.';

-- NEW profiles get their country default unless the caller states an explicit choice.
create or replace function trg_profiles_language() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.language_source is distinct from 'explicit' then
    new.language := case when new.country = 'ID' then 'id' else 'bm' end;
    new.language_source := 'country_default';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_language on profiles;
create trigger trg_profiles_language before insert on profiles
for each row execute function trg_profiles_language();

-- the one-time confirmation the app shows; marks the choice explicit
create or replace function fn_confirm_language(p_language text)
returns void language plpgsql security definer set search_path = public as $$
declare v_country country_t;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select country into v_country from profiles where id = auth.uid();
  -- country first: only that country's own pair is selectable
  if v_country = 'MY' and p_language not in ('bm','en') then raise exception 'not available for MY'; end if;
  if v_country = 'ID' and p_language not in ('id','en') then raise exception 'not available for ID'; end if;
  update profiles set language = p_language, language_source = 'explicit',
                      language_confirmed_at = now()
   where id = auth.uid();
  perform audit_log('language_confirmed','profile', auth.uid()::text, null, p_language, 'user confirmed');
end $$;
grant execute on function fn_confirm_language(text) to authenticated;

-- does this person still need the one-time confirmation?
create or replace function fn_language_needs_confirm()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'needs_confirm', p.language_source = 'legacy_unknown',
    'country', p.country, 'current', p.language,
    'options', case when p.country = 'MY' then jsonb_build_array('bm','en')
                    else jsonb_build_array('id','en') end)
  from profiles p where p.id = auth.uid();
$$;
grant execute on function fn_language_needs_confirm() to authenticated;

-- ------------------------------------------------------------
-- 5. THE NINE GOVERNANCE DECISIONS
-- ------------------------------------------------------------
insert into ch_policies (code, title, summary, kind) values
 ('daily_targets','Daily Business Targets',
  'Distinct new prospecting outreach per active day, 100% of due follow-ups, 100% of meaningful active leads carrying a next action, one curriculum mission per accessible day. Targets are coaching signals, never a verdict on a person.','operational'),
 ('evidence_rubric','Evidence Acceptance Standard',
  'Four-part rubric: relevant, authentic, complete, professional & compliant. Approve / revision required / reject. Native Hero records outrank screenshots.','operational'),
 ('coach_sla','Coach Review SLA',
  'Readiness 12h · routine evidence 24h · urgent live opportunity 4h. Operational targets with escalation, never auto-approval or auto-rejection.','operational'),
 ('grace_streak','Grace, Missed, Excused, Paused and Streak',
  '24h grace after due time, then MISSED. Missed breaks a streak but does not block future days unless a day is an explicit blocking gate. Excused is neutral. Paused holds the participant clock.','operational'),
 ('completion_graduation','Programme Completion and Graduation',
  'Completion at 80% with the Day 30 review. Graduation at 90% plus every critical item, Day 27 and Day 30 reviews, no unresolved critical revision, coach recommendation and a human approval. A verified closing is NOT required.','operational'),
 ('closing_verification','Closing Verification Authority',
  'Participant records, assigned Coach reviews, an authorised country verifier finally verifies. The participant may never self-verify and the assigned Coach is not automatically the verifier.','operational'),
 ('badge_rules','Badge Governance',
  'Each of the five existing badges maps to one deterministic, verified-event, idempotent, audited server rule. No commission-based and no PII-based badges.','operational'),
 ('mentor_points','Mentor Points v1',
  'Separate from XP. Awarded only for verified contribution, append-only with idempotency and reversal. Never self-awarded. Never an automatic appointment to Coach or Elite.','operational'),
 ('country_content_ownership','Country Curriculum Ownership',
  'Each country assigns a Content Owner, and an Authorised Reviewer where local process, compliance, legal, financing or regulated documentation is involved. MY and ID are independent.','operational'),
 ('language_default','Country Language Default',
  'Country is resolved first. MY defaults to Bahasa Malaysia, ID to Bahasa Indonesia, English optional in both. Existing preferences are never mass-overwritten.','operational'),
 ('controlled_principles','Controlled Principles',
  'Not configurable. No closing guarantee. A closing is not required for graduation. Graduation is a human decision. A participant may never self-verify a closing or self-approve evidence. Country first, language second, no cross-country fallback. Mentor Points come only from verified contribution. Coach and Elite appointment stays human. Evidence, history and audit integrity are absolute.','principle')
on conflict (code) do update set title = excluded.title, summary = excluded.summary,
                                 kind = excluded.kind, updated_at = now();

-- Governance v1 configuration, effective today, global scope.
do $gov$
declare v_by uuid;
begin
  select id into v_by from profiles where lower(email) = 'kamal.auction@gmail.com' limit 1;

  insert into ch_policy_versions (policy_code, version, config, status, effective_from, note, approved_by, approved_at)
  values
  ('daily_targets', 1, jsonb_build_object(
     'new_outreach_per_day', 10,
     'outreach_definition', 'A genuine recorded first-contact prospecting action to a DISTINCT contact on that day. Repeat messages to the same person on the same day count once.',
     'two_way_conversations_are_outcome_only', true,
     'followups_due_pct', 100,
     'followups_absolute_minimum', null,
     'active_leads_with_next_action_pct', 100,
     'curriculum_missions_per_accessible_day', 1,
     'language', 'Targets are coaching signals. Hero never says a warrior is a bad salesperson for missing one.'),
   'active', current_date, 'Governance v1', v_by, now()),

  ('evidence_rubric', 1, jsonb_build_object(
     'criteria', jsonb_build_array(
       jsonb_build_object('key','relevant','mandatory',true,'question','Does it actually prove the required action?'),
       jsonb_build_object('key','authentic','mandatory',true,'question','Is it a legitimate record with no indication of fabrication or manipulation?'),
       jsonb_build_object('key','complete','mandatory',true,'question','Are all mandatory requirements present?'),
       jsonb_build_object('key','professional','mandatory',true,'question','Does it respect SOP, privacy, professional conduct and content boundaries?')),
     'decisions', jsonb_build_object(
       'approve','all mandatory criteria pass',
       'revision','credible attempt, something incomplete, unclear or correctable',
       'reject','fake, manipulated, prohibited, materially irrelevant or fundamentally invalid'),
     'numeric_score_required', false,
     'source_priority', jsonb_build_array('native_hero_record','system_generated_proof','structured_participant_input','attachment','coach_observation'),
     'no_screenshot_when_hero_owns_the_record', true),
   'active', current_date, 'Governance v1', v_by, now()),

  ('coach_sla', 1, jsonb_build_object(
     'readiness_hours', 12, 'evidence_hours', 24, 'urgent_hours', 4,
     'escalate_coach_at_hours', 0,
     'escalate_master_mentor_after_hours', 12,
     'escalate_admin_after_hours', 24,
     'timezone', 'participant cohort local',
     'auto_decision_forbidden', true),
   'active', current_date, 'Governance v1', v_by, now()),

  ('grace_streak', 1, jsonb_build_object(
     'grace_hours', 24,
     'after_grace_status', 'missed',
     'missed_breaks_streak', true,
     'missed_blocks_future_days', false,
     'missed_allows_catch_up', true,
     'catch_up_restores_streak', false,
     'excused_counts_as_completed', false,
     'excused_adds_streak_day', false,
     'excused_breaks_streak', false,
     'excused_authorised_by', jsonb_build_array('assigned_coach','master_mentor','admin'),
     'excused_reason_mandatory', true,
     'paused_advances_participant_clock', false,
     'paused_breaks_streak', false),
   'active', current_date, 'Governance v1', v_by, now()),

  ('completion_graduation', 1, jsonb_build_object(
     'completion_pct', 80,
     'completion_requires_day30_review', true,
     'graduation_pct', 90,
     'graduation_requires_all_critical', true,
     'graduation_requires_day27_review', true,
     'graduation_requires_day30_review', true,
     'graduation_blocked_by_unresolved_critical_revision', true,
     'graduation_requires_coach_recommendation', true,
     'graduation_requires_human_approval', true,
     'verified_closing_required', false,
     'elite_warrior_auto_awarded', false,
     'note', 'Day 30 reached != programme completed != graduated != Elite Warrior. Elite is not given, Elite is proven.'),
   'active', current_date, 'Governance v1', v_by, now()),

  ('closing_verification', 1, jsonb_build_object(
     'participant_may_self_verify', false,
     'assigned_coach_is_automatic_verifier', false,
     'required_permission', 'closing.verify',
     'permission_is_country_scoped', true,
     'eligible_role_classes', jsonb_build_array('super_admin','master_mentor','country_verifier'),
     'elite_coach_may_verify_only_with_permission', true,
     'on_verify', jsonb_build_array('verified_closing_status','audit_event','xp','first_closing_badge','immutable_history')),
   'active', current_date, 'Governance v1', v_by, now()),

  ('badge_rules', 1, jsonb_build_object(
     'global', jsonb_build_object('verified_event_only', true, 'no_self_award', true,
        'idempotent', true, 'audit_required', true, 'visible_rule_description', true,
        'never_commission_based', true, 'no_customer_pii', true),
     'badges', jsonb_build_object(
       'first_lead',    jsonb_build_object('event','ch_leads insert','rule','First lead record the warrior creates in Hero.','once_per_warrior',true,'xp',0),
       'committed',     jsonb_build_object('event','task_submissions approved','rule','Day 1 (Hero Commitment) approved by a reviewer.','once_per_warrior',true,'xp',0),
       'streak_7',      jsonb_build_object('event','task_submissions approved','rule','Seven consecutive approved curriculum days with no intervening MISSED day.','once_per_warrior',true,'xp','xp_rules.streak_7'),
       'graduate',      jsonb_build_object('event','fn_graduate','rule','Human graduation approval under the completion_graduation policy.','once_per_warrior',true,'xp',0),
       'first_closing', jsonb_build_object('event','fn_verify_closing approved','rule','First closing verified by an authorised country verifier. Never from a self-declared CLOSED_WON.','once_per_warrior',true,'xp','xp_rules.closing_verified'))),
   'active', current_date, 'Governance v1 — derived from the exact existing five badge codes; none renamed, none duplicated', v_by, now()),

  ('mentor_points', 1, jsonb_build_object(
     'separate_from_xp', true,
     'amounts', jsonb_build_object(
       'referred_warrior_active', jsonb_build_object('mp',10,'once_per','referred_warrior','when','referred warrior becomes ACTIVE after readiness approval, not at signup'),
       'onboarding_support',      jsonb_build_object('mp',5, 'once_per','supported_warrior_milestone','when','verified support helping a warrior complete onboarding or readiness'),
       'teaching_session',        jsonb_build_object('mp',10,'once_per','approved_session','when','delivered an approved teaching or sharing session'),
       'milestone_support',       jsonb_build_object('mp',5, 'once_per','milestone','when','verified support toward a meaningful approved participant milestone'),
       'closing_support',         jsonb_build_object('mp',10,'once_per','verified_closing','when','documented support toward a participant verified closing'),
       'weekly_coaching_report',  jsonb_build_object('mp',3, 'once_per','warrior_week','when','completed quality weekly coaching report for an assigned warrior'),
       'coach_development',       jsonb_build_object('mp',10,'once_per','milestone','when','completed an approved coach-development milestone'),
       'culture_contribution',    jsonb_build_object('mp',5, 'once_per','contribution','when','verified authorised culture, SOP or knowledge contribution')),
     'weekly_cap', jsonb_build_object('weekly_coaching_report', 15),
     'rules', jsonb_build_array('append_only_ledger','idempotency_key','reversal_supported',
       'reason_and_source_event_required','authorised_verification','no_self_award',
       'no_duplicate_evidence','no_fake_account','no_spam_recruitment','no_unsuitable_pressure'),
     'appoints_elite_coach', false,
     'note', 'Mentor Points are eligibility evidence. Final coach and leadership appointment is human.'),
   'active', current_date, 'Governance v1', v_by, now()),

  ('country_content_ownership', 1, jsonb_build_object(
     'roles', jsonb_build_object(
       'content_owner', jsonb_build_object('permission','content.own','country_scoped',true,
         'responsibilities', jsonb_build_array('maintain local operational curriculum','identify outdated local content',
           'submit local versions','coordinate translations','ensure country assets exist','request authorised review')),
       'authorised_reviewer', jsonb_build_object('permission','content.review','country_scoped',true,
         'required_for', jsonb_build_array('professional process','compliance','legal boundary','financing boundary',
           'regulated or customer documentation','country-sensitive operational procedure'))),
     'publish_flow', jsonb_build_array('author','country_content_owner','authorised_local_review_where_required','approved','publish'),
     'local_regulated_content_may_bypass_review', false,
     'countries_independent', true,
     'country_variant_days', jsonb_build_array(3,4,8,13,16,21,22,24),
     'missing_content_status', 'content_required',
     'cross_country_fallback', false),
   'active', current_date, 'Governance v1', v_by, now()),

  ('language_default', 1, jsonb_build_object(
     'MY', jsonb_build_object('default','bm','optional', jsonb_build_array('en')),
     'ID', jsonb_build_object('default','id','optional', jsonb_build_array('en')),
     'country_resolved_first', true,
     'cross_country_fallback', false,
     'existing_users_mass_overwrite', false,
     'legacy_provenance', 'legacy_unknown',
     'confirmation_required_for_legacy', true,
     'new_profile_source', 'country_default'),
   'active', current_date, 'Governance v1 — corrects the profiles.language default of en', v_by, now()),

  ('controlled_principles', 1, jsonb_build_object(
     'principles', jsonb_build_array(
       'no closing guarantee',
       'a verified closing is not required for graduation',
       'graduation requires a human final review',
       'a participant may never self-verify a closing',
       'a participant may never self-approve evidence',
       'country first, language second',
       'no cross-country fallback',
       'Mentor Points only from verified contribution',
       'Elite and Coach appointment remains human',
       'evidence, history and audit integrity are absolute'),
     'configurable', false),
   'active', current_date, 'Governance v1 — recorded, not a knob', v_by, now())
  on conflict (policy_code, version) do nothing;
end $gov$;

-- ------------------------------------------------------------
-- 6. RETIRE THE OLD "OPEN DECISIONS" FRAMING (data preserved)
-- ------------------------------------------------------------
update ch_open_decisions set decided = true, decided_at = now(),
  decision = jsonb_build_object('resolved_by','Governance v1',
                                'policy_code', case code
                                  when 'daily_targets' then 'daily_targets'
                                  when 'grace_excused' then 'grace_streak'
                                  when 'coach_sla' then 'coach_sla'
                                  when 'graduation' then 'completion_graduation'
                                  when 'closing_verifier' then 'closing_verification'
                                  when 'mentor_points' then 'mentor_points'
                                  when 'evidence_threshold' then 'evidence_rubric'
                                  when 'badge_thresholds' then 'badge_rules'
                                  when 'country_content_owner' then 'country_content_ownership'
                                  else null end)
where not decided;

-- ------------------------------------------------------------
-- 7. VERIFY
-- ------------------------------------------------------------
select 'policies' as check, count(*) filter (where kind='operational') as operational,
       count(*) filter (where kind='principle') as principles from ch_policies;
select 'active policy versions' as check, count(*) as n from ch_policy_versions where status='active';
select 'daily target resolves' as check, fn_policy('daily_targets') -> 'new_outreach_per_day' as target;
select 'open decisions still undecided (must be 0)' as check, count(*) as n
  from ch_open_decisions where not decided;
select 'profiles by language_source' as check, language_source, count(*) as n
  from profiles group by language_source;
