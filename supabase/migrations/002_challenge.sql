-- ============================================================
-- 002_challenge.sql — 30 Days Closing Challenge foundation (ADDITIVE ONLY)
-- Spec: docs/30-days-closing-module.md (+ §40a clarifications)
-- No existing table is modified or dropped.
-- ============================================================

-- ---------- ROLES (configurable — no personal names hardcoded) ----------
create table user_roles (
  user_id uuid references profiles(id) on delete cascade,
  role text not null check (role in ('super_admin','master_mentor','elite_coach','participant')),
  granted_by uuid references profiles(id),
  created_at timestamptz default now(),
  primary key (user_id, role)
);

create table ch_teams (
  id uuid primary key default gen_random_uuid(),
  country country_t not null, name text not null,
  created_at timestamptz default now()
);

create table coach_assignments (
  coach_id uuid references profiles(id) on delete cascade,
  participant_id uuid references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id),
  active boolean default true,
  created_at timestamptz default now(),
  primary key (coach_id, participant_id)
);

-- ---------- PROGRAMME / CURRICULUM (DB-driven, versioned) ----------
create table challenge_programs (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null, active boolean default true
);
create table curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references challenge_programs(id),
  version int not null, status text default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz, created_by uuid references profiles(id)
);
create table curriculum_days (
  id uuid primary key default gen_random_uuid(),
  version_id uuid references curriculum_versions(id) on delete cascade,
  day_no int not null, phase int not null default 1,
  title jsonb not null,            -- {"en":..,"ms-MY":..,"id-ID":..}
  objective jsonb, content jsonb, instructions jsonb,
  required_action jsonb, stretch_action jsonb,
  evidence_requirement jsonb, reflection_question jsonb, coach_guidance jsonb,
  media_url text, xp_amount int not null default 10,
  needs_review boolean not null default true,   -- Coach approval required
  country_override country_t,                    -- null = both countries
  unique (version_id, day_no, country_override)
);

-- ---------- COHORTS (shared cohort calendar — §40a) ----------
create table cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country country_t,                       -- null = cross-country (tz below is authoritative)
  curriculum_version_id uuid references curriculum_versions(id),
  official_start_date date not null,
  official_timezone text not null,         -- e.g. Asia/Kuala_Lumpur
  daily_unlock_time time not null default '06:00',
  status text default 'draft' check (status in ('draft','open','active','completed','archived')),
  created_by uuid references profiles(id), created_at timestamptz default now()
);

-- enrolment lifecycle §6 + catch-up marking §40a
create table enrolments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references cohorts(id) on delete cascade,
  participant_id uuid references profiles(id) on delete cascade,
  status text not null default 'invited' check (status in
    ('draft','invited','onboarding','ready','active','paused','completed','graduated','withdrawn')),
  catch_up boolean not null default false,          -- visibly marked, no leaderboard advantage
  experience_level text, pipeline_baseline int,
  goal_30d text, motivation text, daily_commitment text,
  acknowledgements jsonb,                            -- rules/evidence/conduct/privacy ticks
  status_reason text, status_by uuid references profiles(id),
  created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (cohort_id, participant_id)
);

create table readiness_submissions (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid references enrolments(id) on delete cascade,
  status text not null default 'not_started' check (status in
    ('not_started','in_progress','submitted','under_review','approved','revision_required')),
  checklist jsonb, submitted_at timestamptz,
  reviewed_by uuid references profiles(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz default now()
);

-- ---------- TASKS & EVIDENCE ----------
create table task_submissions (
  id uuid primary key default gen_random_uuid(),
  enrolment_id uuid references enrolments(id) on delete cascade,
  day_id uuid references curriculum_days(id),
  day_no int not null,
  status text not null default 'in_progress' check (status in
    ('locked','available','in_progress','submitted','under_review','approved','revision_required','missed','excused')),
  response text, reflection text,
  version int not null default 1,                    -- resubmissions keep history rows
  submitted_at timestamptz,
  reviewed_by uuid references profiles(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz default now()
);
create index on task_submissions (enrolment_id, day_no);

create table evidence_assets (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references task_submissions(id) on delete cascade,
  kind text not null default 'image' check (kind in
    ('text','checklist','url','image','document','audio','video','activity','system')),
  storage_path text,                                 -- private bucket; signed URLs only
  url text, note text,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ---------- GAMIFICATION (append-only ledger) ----------
create table xp_rules (
  code text primary key, points int not null, description text, active boolean default true
);
create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  cohort_id uuid references cohorts(id),
  source text not null,                              -- xp_rule code / event
  amount int not null,
  status text not null default 'provisional' check (status in ('provisional','verified','reversed','expired')),
  reason text, awarded_by uuid references profiles(id),
  ref_type text, ref_id uuid,
  reversal_of uuid references points_ledger(id),
  created_at timestamptz default now()
);
create index on points_ledger (user_id, status);
create table ch_badges (
  code text primary key, name jsonb not null, icon text, rule text, active boolean default true
);
create table user_badges (
  user_id uuid references profiles(id), badge_code text references ch_badges(code),
  awarded_by uuid references profiles(id), created_at timestamptz default now(),
  primary key (user_id, badge_code)
);
create table mentor_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  source text not null, amount int not null,
  status text not null default 'provisional' check (status in ('provisional','verified','reversed','expired')),
  reason text, awarded_by uuid references profiles(id),
  created_at timestamptz default now()
);
create table leaderboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references cohorts(id), period text not null,
  data jsonb not null, created_at timestamptz default now()
);

-- ---------- AUDIT (immutable, insert-only) ----------
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor uuid, actor_role text, country text,
  action text not null, entity_type text, entity_id text,
  prev_state text, new_state text, reason text, meta jsonb
);
create table ch_feature_flags (
  flag text primary key, enabled boolean not null default false, note text
);

-- ---------- RLS ----------
create or replace function has_role(r text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from user_roles where user_id = auth.uid() and role = r)
   or coalesce((select role from profiles where id = auth.uid()) = 'master_admin', false) $$;

create or replace function is_my_coach_participant(p uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from coach_assignments
   where coach_id = auth.uid() and participant_id = p and active) $$;

alter table user_roles enable row level security;
alter table coach_assignments enable row level security;
alter table cohorts enable row level security;
alter table enrolments enable row level security;
alter table readiness_submissions enable row level security;
alter table task_submissions enable row level security;
alter table evidence_assets enable row level security;
alter table points_ledger enable row level security;
alter table mentor_points_ledger enable row level security;
alter table audit_events enable row level security;
alter table curriculum_days enable row level security;
alter table curriculum_versions enable row level security;
alter table challenge_programs enable row level security;
alter table ch_badges enable row level security;
alter table user_badges enable row level security;
alter table xp_rules enable row level security;
alter table ch_feature_flags enable row level security;
alter table leaderboard_snapshots enable row level security;
alter table ch_teams enable row level security;

-- reads
create policy r_roles on user_roles for select using (user_id = auth.uid() or has_role('super_admin') or has_role('master_mentor'));
create policy r_coach on coach_assignments for select using (coach_id = auth.uid() or participant_id = auth.uid() or has_role('super_admin') or has_role('master_mentor'));
create policy r_cohorts on cohorts for select using (auth.uid() is not null);
create policy r_enrol on enrolments for select using
  (participant_id = auth.uid() or is_my_coach_participant(participant_id) or has_role('super_admin') or has_role('master_mentor'));
create policy r_ready on readiness_submissions for select using
  (exists (select 1 from enrolments e where e.id = enrolment_id and
    (e.participant_id = auth.uid() or is_my_coach_participant(e.participant_id) or has_role('super_admin') or has_role('master_mentor'))));
create policy r_subs on task_submissions for select using
  (exists (select 1 from enrolments e where e.id = enrolment_id and
    (e.participant_id = auth.uid() or is_my_coach_participant(e.participant_id) or has_role('super_admin') or has_role('master_mentor'))));
create policy r_evi on evidence_assets for select using
  (exists (select 1 from task_submissions s join enrolments e on e.id = s.enrolment_id where s.id = submission_id and
    (e.participant_id = auth.uid() or is_my_coach_participant(e.participant_id) or has_role('super_admin') or has_role('master_mentor'))));
create policy r_pts on points_ledger for select using (user_id = auth.uid() or has_role('elite_coach') or has_role('super_admin') or has_role('master_mentor'));
create policy r_mpts on mentor_points_ledger for select using (user_id = auth.uid() or has_role('super_admin') or has_role('master_mentor'));
create policy r_audit on audit_events for select using (has_role('super_admin') or has_role('master_mentor'));
create policy r_pub on curriculum_days for select using (auth.uid() is not null);
create policy r_pub2 on curriculum_versions for select using (auth.uid() is not null);
create policy r_pub3 on challenge_programs for select using (auth.uid() is not null);
create policy r_pub4 on ch_badges for select using (true);
create policy r_pub5 on user_badges for select using (true);
create policy r_pub6 on xp_rules for select using (auth.uid() is not null);
create policy r_pub7 on ch_feature_flags for select using (true);
create policy r_pub8 on leaderboard_snapshots for select using (auth.uid() is not null);
create policy r_pub9 on ch_teams for select using (auth.uid() is not null);

-- participant writes (drafting only — approvals happen via service-role Edge Functions)
create policy w_enrol_self on enrolments for update using (participant_id = auth.uid())
  with check (participant_id = auth.uid() and status in ('invited','onboarding','ready'));
create policy w_ready_self on readiness_submissions for all using
  (exists (select 1 from enrolments e where e.id = enrolment_id and e.participant_id = auth.uid()))
  with check (status in ('not_started','in_progress','submitted'));
create policy w_subs_self on task_submissions for all using
  (exists (select 1 from enrolments e where e.id = enrolment_id and e.participant_id = auth.uid()))
  with check (status in ('in_progress','submitted'));
create policy w_evi_self on evidence_assets for insert with check (uploaded_by = auth.uid());
-- admin management
create policy w_admin_all on cohorts for all using (has_role('super_admin'));
create policy w_admin_roles on user_roles for all using (has_role('super_admin'));
create policy w_admin_coach on coach_assignments for all using (has_role('super_admin') or has_role('master_mentor'));
create policy w_admin_enrol on enrolments for insert with check (has_role('super_admin') or has_role('elite_coach'));
-- audit: INSERT for any authed actor; NO update/delete policies exist → immutable
create policy w_audit_insert on audit_events for insert with check (auth.uid() is not null);
-- ledger: no client insert/update policies → only service-role (Edge Functions) writes

-- ---------- SEEDS (fictional; Curriculum v1 Day 1) ----------
insert into challenge_programs (code, name) values ('30DC','30 Days Closing Challenge');
insert into curriculum_versions (id, program_id, version, status, published_at)
select gen_random_uuid(), id, 1, 'published', now() from challenge_programs where code='30DC';
insert into curriculum_days (version_id, day_no, phase, title, objective, content, required_action, evidence_requirement, reflection_question, xp_amount, needs_review)
select v.id, 1, 1,
 '{"en":"Hero Commitment","ms-MY":"Ikrar Hero","id-ID":"Komitmen Hero"}',
 '{"en":"Introduce IQI AG Hero, confirm your commitment. Closing is helping.","ms-MY":"Kenali IQI AG Hero, sahkan komitmen anda. Closing itu membantu.","id-ID":"Kenali IQI AG Hero, teguhkan komitmen Anda. Closing adalah membantu."}',
 '{"en":"Welcome, Warrior. This challenge builds character, discipline and skill — not just closings. Success = consistent verified action.","ms-MY":"Selamat datang, Warrior. Cabaran ini membina sahsiah, disiplin dan kemahiran — bukan sekadar closing.","id-ID":"Selamat datang, Warrior. Tantangan ini membangun karakter, disiplin dan keterampilan — bukan sekadar closing."}',
 '{"en":"Write your personal commitment statement, your 30-day goal, and your daily available time.","ms-MY":"Tulis ikrar peribadi, sasaran 30 hari, dan masa harian anda.","id-ID":"Tulis pernyataan komitmen, target 30 hari, dan waktu harian Anda."}',
 '{"en":"Commitment statement + 30-day goal + daily time","ms-MY":"Ikrar + sasaran 30 hari + masa harian","id-ID":"Komitmen + target 30 hari + waktu harian"}',
 '{"en":"Why did you become a Warrior?","ms-MY":"Mengapa anda menjadi Warrior?","id-ID":"Mengapa Anda menjadi Warrior?"}',
 20, true
from curriculum_versions v;

insert into cohorts (name, country, curriculum_version_id, official_start_date, official_timezone, daily_unlock_time, status)
select 'MY Cohort 1 — August', 'MY'::country_t, v.id, current_date + 3, 'Asia/Kuala_Lumpur', '06:00'::time, 'open' from curriculum_versions v
union all
select 'ID Cohort 1 — Agustus', 'ID'::country_t, v.id, current_date + 3, 'Asia/Jakarta', '06:00'::time, 'open' from curriculum_versions v;

insert into xp_rules (code, points, description) values
 ('day_complete', 10, 'Approved daily task'),
 ('day1_commitment', 20, 'Day 1 Hero Commitment approved'),
 ('streak_7', 30, '7-day streak'),
 ('evidence_quality', 5, 'Coach-awarded evidence quality');
insert into ch_badges (code, name, icon) values
 ('committed', '{"en":"Committed","ms-MY":"Beriltizam","id-ID":"Berkomitmen"}', '🎯'),
 ('first_lead', '{"en":"First Lead","ms-MY":"Lead Pertama","id-ID":"Lead Pertama"}', '📇'),
 ('streak_7', '{"en":"7-Day Streak","ms-MY":"7 Hari Berturut","id-ID":"7 Hari Beruntun"}', '🔥');
insert into ch_feature_flags (flag, enabled, note) values
 ('challenge_module', true, '30DC vertical slice'),
 ('points_ledger_authoritative', false, 'flip when ledger replaces legacy points');

-- grant Commander the governance roles (configurable — by profile lookup, not name)
insert into user_roles (user_id, role)
select id, r from profiles p cross join (values ('super_admin'),('master_mentor')) as t(r)
where p.is_commander = true
on conflict do nothing;
