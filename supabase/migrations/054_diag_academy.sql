-- 054_diag_academy.sql — GROW → DIAG ACADEMY (Development Diagnostic Academy).
--
-- DIAGNOSE → PRESCRIBE → LEARN → PRACTICE → CHECK → IMPROVE.
--
-- Architecture decision (spec §1/§35): onb_* stays onboarding-specific — its
-- completion drives the Grow card and the 🎓 moment. Academy gets its own
-- diag_* / academy_* tables that MIRROR the proven onb_* shapes, and the React
-- learning engine is shared (modules/learn/LessonEngine.tsx). Same protections:
-- participants read only via RPCs (answer keys never leave the DB), writes via
-- SECURITY DEFINER functions, heartbeat capped server-side, soft archive,
-- trilingual jsonb {"en","ms","id"}, country scope MY/ID/ALL.
--
-- Versioning (§33): every attempt stores diag_version + scoring_version, and
-- results + prescription items are materialised rows — later rule changes can
-- never silently reinterpret an old attempt.
--
-- Scoring is DETERMINISTIC (§13). AI never touches scores, bands, answer keys
-- or prescriptions — the worker may only rephrase explanations later.

-- ========== DIAGNOSTIC ==========
create table if not exists diag_dimensions (
  key text primary key,
  category text not null check (category in ('foundation','business','process','marketing','leadership')),
  title jsonb not null,
  sort int not null default 100,
  country_scope text not null default 'ALL' check (country_scope in ('MY','ID','ALL')),
  active boolean not null default true,
  version int not null default 1
);

create table if not exists diag_questions (
  id bigint generated always as identity primary key,
  dimension_key text not null references diag_dimensions(key),
  qtype text not null check (qtype in ('single','scenario','confidence')),
  question jsonb not null,
  options jsonb not null,                 -- [{"en","ms","id"}, ...]
  correct int,                            -- null for confidence questions
  explanation jsonb,
  difficulty int not null default 1,
  country_scope text not null default 'ALL' check (country_scope in ('MY','ID','ALL')),
  status text not null default 'published' check (status in ('draft','published','archived')),
  version int not null default 1,
  created_at timestamptz default now()
);

create table if not exists diag_attempts (
  id bigint generated always as identity primary key,
  agent_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  diag_version int not null default 1,
  scoring_version int not null default 1,
  talent_snapshot jsonb,                  -- {top_roles:[..], low_confidence, source:'talent_compass'}
  started_at timestamptz default now(),
  submitted_at timestamptz
);
create index if not exists diag_attempts_agent on diag_attempts (agent_id, started_at desc);

create table if not exists diag_responses (
  attempt_id bigint not null references diag_attempts(id) on delete cascade,
  question_id bigint not null references diag_questions(id),
  answer int not null,
  correct boolean,                        -- null for confidence
  answered_at timestamptz default now(),
  primary key (attempt_id, question_id)
);

create table if not exists diag_results (
  attempt_id bigint not null references diag_attempts(id) on delete cascade,
  dimension_key text not null references diag_dimensions(key),
  knowledge_pct int,                      -- null when no objective questions answered
  confidence_level int,                   -- 1 low · 2 medium · 3 high · null
  band text not null check (band in ('foundation','developing','working','ready','accelerator','unknown')),
  primary key (attempt_id, dimension_key)
);

-- ========== ACADEMY CONTENT ==========
create table if not exists academy_tracks (
  id bigint generated always as identity primary key,
  title jsonb not null,
  sort int not null default 100,
  status text not null default 'published' check (status in ('draft','published','archived'))
);

create table if not exists academy_modules (
  id bigint generated always as identity primary key,
  track_id bigint not null references academy_tracks(id) on delete cascade,
  title jsonb not null,
  subtitle jsonb,
  dimension_key text references diag_dimensions(key),
  sort int not null default 100,
  status text not null default 'published' check (status in ('draft','published','archived'))
);

create table if not exists academy_lessons (
  id bigint generated always as identity primary key,
  module_id bigint not null references academy_modules(id) on delete cascade,
  type text not null default 'article'
    check (type in ('article','video','image','carousel','slides','document','link','ack','practice','scenario','reflection','action')),
  title jsonb not null,
  subtitle jsonb,
  body jsonb,
  media jsonb,
  duration_min int,
  required boolean not null default true,
  min_seconds int not null default 0,
  ack_required boolean not null default false,
  quiz jsonb,
  prerequisite_id bigint references academy_lessons(id),
  country_scope text not null default 'ALL' check (country_scope in ('MY','ID','ALL')),
  sort int not null default 100,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  content_version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists academy_lessons_module on academy_lessons (module_id, sort);

create table if not exists academy_progress (
  agent_id uuid not null references profiles(id) on delete cascade,
  lesson_id bigint not null references academy_lessons(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  first_opened_at timestamptz default now(),
  last_opened_at timestamptz default now(),
  completed_at timestamptz,
  active_seconds int not null default 0,
  pages_seen jsonb not null default '[]'::jsonb,
  ack_at timestamptz,
  ack_version int,
  quiz_score int,
  quiz_passed_at timestamptz,
  primary key (agent_id, lesson_id)
);

-- ========== PRESCRIPTION RULES + RESULTS ==========
create table if not exists academy_dimension_rules (
  dimension_key text not null references diag_dimensions(key),
  band text not null check (band in ('foundation','developing','working','ready','accelerator')),
  module_id bigint not null references academy_modules(id) on delete cascade,
  primary key (dimension_key, band, module_id)
);

create table if not exists academy_role_rules (
  role_key text not null,                 -- talent compass pathway key
  module_id bigint not null references academy_modules(id) on delete cascade,
  rank int not null default 1,
  primary key (role_key, module_id)
);

create table if not exists academy_prescriptions (
  id bigint generated always as identity primary key,
  agent_id uuid not null references profiles(id) on delete cascade,
  attempt_id bigint references diag_attempts(id),
  created_at timestamptz default now()
);
create index if not exists academy_rx_agent on academy_prescriptions (agent_id, created_at desc);

create table if not exists academy_prescription_items (
  prescription_id bigint not null references academy_prescriptions(id) on delete cascade,
  module_id bigint not null references academy_modules(id),
  category text not null check (category in ('required','priority','accelerator','optional','assigned')),
  dimension_key text,
  rank int not null default 100,
  added_by uuid references profiles(id),  -- human override (§39); null = engine
  reason text,
  primary key (prescription_id, module_id)
);

-- ========== RLS ==========
alter table diag_dimensions   enable row level security;
alter table diag_questions    enable row level security;
alter table diag_attempts     enable row level security;
alter table diag_responses    enable row level security;
alter table diag_results      enable row level security;
alter table academy_tracks    enable row level security;
alter table academy_modules   enable row level security;
alter table academy_lessons   enable row level security;
alter table academy_progress  enable row level security;
alter table academy_dimension_rules enable row level security;
alter table academy_role_rules      enable row level security;
alter table academy_prescriptions   enable row level security;
alter table academy_prescription_items enable row level security;

-- content + rules: admin manages; participants read only through RPCs
do $$ declare t text;
begin
  foreach t in array array['diag_dimensions','diag_questions','academy_tracks','academy_modules',
                           'academy_lessons','academy_dimension_rules','academy_role_rules'] loop
    execute format('drop policy if exists rw_%s on %s', t, t);
    execute format('create policy rw_%s on %s for all using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;

-- participant state: read own; all writes via RPC
drop policy if exists r_diag_attempts on diag_attempts;
create policy r_diag_attempts on diag_attempts for select
  using (agent_id = auth.uid() or is_admin());
drop policy if exists r_diag_results on diag_results;
create policy r_diag_results on diag_results for select
  using (is_admin() or exists (select 1 from diag_attempts a
          where a.id = attempt_id and a.agent_id = auth.uid()));
drop policy if exists r_diag_responses on diag_responses;
create policy r_diag_responses on diag_responses for select using (is_admin());
drop policy if exists r_academy_progress on academy_progress;
create policy r_academy_progress on academy_progress for select
  using (agent_id = auth.uid() or is_admin());
drop policy if exists r_academy_rx on academy_prescriptions;
create policy r_academy_rx on academy_prescriptions for select
  using (agent_id = auth.uid() or is_admin());
drop policy if exists r_academy_rx_items on academy_prescription_items;
create policy r_academy_rx_items on academy_prescription_items for select
  using (is_admin() or exists (select 1 from academy_prescriptions rx
          where rx.id = prescription_id and rx.agent_id = auth.uid()));

-- ========== AUDIT ==========
drop trigger if exists academy_tracks_audit  on academy_tracks;
create trigger academy_tracks_audit  after insert or update on academy_tracks  for each row execute function onb_audit();
drop trigger if exists academy_modules_audit on academy_modules;
create trigger academy_modules_audit after insert or update on academy_modules for each row execute function onb_audit();
drop trigger if exists academy_lessons_audit on academy_lessons;
create trigger academy_lessons_audit after insert or update on academy_lessons for each row execute function onb_audit();

create or replace function diag_q_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform audit_log(tg_op || ':diag_questions', 'diag', new.id::text,
    case when tg_op = 'UPDATE' then old.status else null end, new.status,
    left(coalesce(new.question ->> 'en', ''), 80));
  return new;
end $$;
drop trigger if exists diag_questions_audit on diag_questions;
create trigger diag_questions_audit after insert or update on diag_questions
  for each row execute function diag_q_audit();

-- ========== DIAGNOSTIC ENGINE ==========
-- band thresholds (scoring_version 1)
create or replace function diag_band(p_pct int) returns text
language sql immutable as $$
  select case when p_pct is null then 'unknown'
              when p_pct < 40 then 'foundation'
              when p_pct < 60 then 'developing'
              when p_pct < 80 then 'working'
              when p_pct < 95 then 'ready'
              else 'accelerator' end
$$;

-- start (or resume) an attempt; returns the sanitized question set + answers so far
create or replace function diag_start()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_country text; v_attempt bigint;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  select country::text into v_country from profiles where id = v_me;

  select id into v_attempt from diag_attempts
   where agent_id = v_me and status = 'in_progress'
   order by started_at desc limit 1;
  if v_attempt is null then
    insert into diag_attempts (agent_id) values (v_me) returning id into v_attempt;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'qtype', q.qtype, 'dimension_key', q.dimension_key,
        'dimension', d.title, 'question', q.question, 'options', q.options,
        'answer', (select r.answer from diag_responses r
                    where r.attempt_id = v_attempt and r.question_id = q.id))
        order by case q.qtype when 'confidence' then 2 else 1 end, q.dimension_key, q.id)
      from diag_questions q join diag_dimensions d on d.key = q.dimension_key
      where q.status = 'published' and d.active
        and q.country_scope in ('ALL', v_country)
        and d.country_scope in ('ALL', v_country)), '[]'::jsonb));
end $$;

create or replace function diag_answer(p_question bigint, p_answer int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_attempt bigint; q diag_questions;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  select id into v_attempt from diag_attempts
   where agent_id = v_me and status = 'in_progress' order by started_at desc limit 1;
  if v_attempt is null then raise exception 'no attempt in progress'; end if;
  select * into q from diag_questions where id = p_question and status = 'published';
  if q.id is null then raise exception 'question not available'; end if;
  insert into diag_responses (attempt_id, question_id, answer, correct)
  values (v_attempt, p_question, p_answer,
          case when q.qtype = 'confidence' then null else q.correct = p_answer end)
  on conflict (attempt_id, question_id) do update set
    answer = excluded.answer, correct = excluded.correct, answered_at = now();
end $$;

-- submit: deterministic scoring + talent snapshot + prescription. THE core.
create or replace function diag_submit()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := auth.uid(); v_attempt bigint; v_rx bigint;
  v_snapshot jsonb; r record;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  select id into v_attempt from diag_attempts
   where agent_id = v_me and status = 'in_progress' order by started_at desc limit 1;
  if v_attempt is null then raise exception 'no attempt in progress'; end if;

  -- 1. deterministic dimension results: knowledge separate from confidence (§7)
  insert into diag_results (attempt_id, dimension_key, knowledge_pct, confidence_level, band)
  select v_attempt, d.key,
         k.pct,
         c.level,
         diag_band(k.pct)
  from diag_dimensions d
  left join lateral (
    select round(100.0 * count(*) filter (where r2.correct) / nullif(count(*), 0))::int as pct
    from diag_responses r2 join diag_questions q2 on q2.id = r2.question_id
    where r2.attempt_id = v_attempt and q2.dimension_key = d.key and q2.qtype <> 'confidence'
  ) k on true
  left join lateral (
    select case when avg(r3.answer) is null then null
                when avg(r3.answer) < 1.5 then 1
                when avg(r3.answer) < 3 then 2 else 3 end::int as level
    from diag_responses r3 join diag_questions q3 on q3.id = r3.question_id
    where r3.attempt_id = v_attempt and q3.dimension_key = d.key and q3.qtype = 'confidence'
  ) c on true
  where d.active and (k.pct is not null or c.level is not null)
  on conflict (attempt_id, dimension_key) do update
    set knowledge_pct = excluded.knowledge_pct,
        confidence_level = excluded.confidence_level, band = excluded.band;

  -- 2. talent snapshot: structured outputs ONLY, consent-gated, no raw answers (§5/§36)
  select jsonb_build_object(
      'source', 'talent_compass', 'captured_at', now(),
      'low_confidence',
        exists (select 1 from talent_flags f where f.attempt_id = a.id
                 and f.flag in ('uniform_responding','unrealistically_fast')),
      'top_roles', (select jsonb_agg(jsonb_build_object('key', s.key, 'band', s.band) order by s.rank)
                    from talent_scores s where s.attempt_id = a.id and s.kind = 'role' and s.rank <= 3))
    into v_snapshot
  from talent_attempts a
  join talent_versions v on v.id = a.version_id and v.code not like 'myself%'
  join talent_participants tp on tp.attempt_id = a.id
  join talent_consents tc on tc.attempt_id = a.id
  join profiles pr on pr.id = v_me
  where lower(btrim(tp.email)) = lower(btrim(coalesce(pr.email, '')))
    and a.status in ('scored','reported') and tc.sharing in ('summary','full')
  order by a.submitted_at desc limit 1;

  update diag_attempts set status = 'completed', submitted_at = now(),
    talent_snapshot = v_snapshot where id = v_attempt;

  -- 3. prescription (deterministic; materialised so history is immutable)
  insert into academy_prescriptions (agent_id, attempt_id)
  values (v_me, v_attempt) returning id into v_rx;

  -- required: foundation-category gaps
  insert into academy_prescription_items (prescription_id, module_id, category, dimension_key, rank)
  select distinct v_rx, adr.module_id, 'required', dr.dimension_key, 10
  from diag_results dr
  join diag_dimensions d on d.key = dr.dimension_key and d.category = 'foundation'
  join academy_dimension_rules adr on adr.dimension_key = dr.dimension_key and adr.band = dr.band
  where dr.attempt_id = v_attempt
  on conflict do nothing;

  -- priority: the two lowest-knowledge non-foundation dimensions with a rule match
  insert into academy_prescription_items (prescription_id, module_id, category, dimension_key, rank)
  select v_rx, adr.module_id, 'priority', ranked.dimension_key, ranked.rn * 10
  from (
    select dr.dimension_key, dr.band, dr.knowledge_pct,
           row_number() over (order by dr.knowledge_pct asc nulls last) as rn
    from diag_results dr
    join diag_dimensions d on d.key = dr.dimension_key and d.category <> 'foundation'
    where dr.attempt_id = v_attempt and dr.knowledge_pct is not null
      and dr.band in ('foundation','developing','working')
  ) ranked
  join academy_dimension_rules adr on adr.dimension_key = ranked.dimension_key and adr.band = ranked.band
  where ranked.rn <= 2
  on conflict do nothing;

  -- role accelerator: talent top role (skipped entirely when low_confidence)
  if v_snapshot is not null and not coalesce((v_snapshot ->> 'low_confidence')::boolean, false) then
    insert into academy_prescription_items (prescription_id, module_id, category, dimension_key, rank)
    select v_rx, rr.module_id, 'accelerator', null, rr.rank
    from academy_role_rules rr
    where rr.role_key = v_snapshot -> 'top_roles' -> 0 ->> 'key'
    order by rr.rank limit 3
    on conflict do nothing;

    insert into academy_prescription_items (prescription_id, module_id, category, dimension_key, rank)
    select v_rx, rr.module_id, 'optional', null, 50 + rr.rank
    from academy_role_rules rr
    where rr.role_key in (v_snapshot -> 'top_roles' -> 1 ->> 'key',
                          v_snapshot -> 'top_roles' -> 2 ->> 'key')
    order by rr.rank limit 2
    on conflict do nothing;
  end if;

  perform audit_log('diag_completed', 'diag', v_attempt::text, null, 'completed', null);
  perform audit_log('prescription_generated', 'diag', v_rx::text, null, 'generated', null);
  return jsonb_build_object('attempt_id', v_attempt, 'prescription_id', v_rx);
end $$;

-- ========== ACADEMY PARTICIPANT READ ==========
create or replace function aca_my()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_country text; v_attempt bigint; v_rx bigint;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  select country::text into v_country from profiles where id = v_me;
  select id into v_attempt from diag_attempts
   where agent_id = v_me and status = 'completed' order by submitted_at desc limit 1;
  select id into v_rx from academy_prescriptions
   where agent_id = v_me order by created_at desc limit 1;

  return jsonb_build_object(
    'diag_completed', v_attempt is not null,
    'in_progress', exists (select 1 from diag_attempts
                            where agent_id = v_me and status = 'in_progress'),
    'attempt', case when v_attempt is null then null else (
      select jsonb_build_object('id', a.id, 'submitted_at', a.submitted_at,
        'talent', a.talent_snapshot,
        'results', coalesce((select jsonb_agg(jsonb_build_object(
            'dimension_key', dr.dimension_key, 'title', d.title, 'category', d.category,
            'knowledge_pct', dr.knowledge_pct, 'confidence_level', dr.confidence_level,
            'band', dr.band) order by dr.knowledge_pct asc nulls last)
          from diag_results dr join diag_dimensions d on d.key = dr.dimension_key
          where dr.attempt_id = a.id), '[]'::jsonb),
        'history', (select jsonb_agg(jsonb_build_object('id', h.id, 'submitted_at', h.submitted_at)
                     order by h.submitted_at desc)
                    from diag_attempts h where h.agent_id = v_me and h.status = 'completed'))
      from diag_attempts a where a.id = v_attempt) end,
    'prescription', case when v_rx is null then null else (
      select jsonb_build_object('id', v_rx, 'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'category', i.category, 'rank', i.rank, 'dimension_key', i.dimension_key,
          'module', jsonb_build_object('id', m.id, 'title', m.title, 'subtitle', m.subtitle),
          'lessons', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', l.id, 'type', l.type, 'title', l.title, 'subtitle', l.subtitle,
              'body', l.body, 'media', l.media, 'duration_min', l.duration_min,
              'required', l.required, 'min_seconds', l.min_seconds,
              'ack_required', l.ack_required, 'content_version', l.content_version,
              'prerequisite_id', l.prerequisite_id, 'sort', l.sort,
              'quiz', case when l.quiz is null then null else jsonb_build_object(
                'question', l.quiz -> 'question', 'options', l.quiz -> 'options',
                'retry', coalesce(l.quiz -> 'retry', 'true'::jsonb)) end,
              'progress', (select jsonb_build_object('status', p.status,
                  'active_seconds', p.active_seconds, 'pages_seen', p.pages_seen,
                  'ack_at', p.ack_at, 'ack_version', p.ack_version,
                  'quiz_passed_at', p.quiz_passed_at, 'completed_at', p.completed_at)
                from academy_progress p where p.agent_id = v_me and p.lesson_id = l.id)
            ) order by l.sort, l.id)
            from academy_lessons l
            where l.module_id = m.id and l.status = 'published'
              and l.country_scope in ('ALL', v_country)), '[]'::jsonb)
        ) order by case i.category when 'required' then 1 when 'priority' then 2
                        when 'assigned' then 3 when 'accelerator' then 4 else 5 end, i.rank)
        from academy_prescription_items i
        join academy_modules m on m.id = i.module_id and m.status = 'published'
        where i.prescription_id = v_rx), '[]'::jsonb))) end);
end $$;

-- ========== ACADEMY LESSON WRITES (mirror the proven onb engine) ==========
create or replace function aca_check_complete(p_agent uuid, p_lesson bigint)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare l academy_lessons; p academy_progress; v_pages int; v_need int;
begin
  select * into l from academy_lessons where id = p_lesson;
  select * into p from academy_progress where agent_id = p_agent and lesson_id = p_lesson;
  if l.id is null or p.agent_id is null or p.status = 'completed' then
    return coalesce(p.status = 'completed', false);
  end if;
  if p.active_seconds < coalesce(l.min_seconds, 0) then return false; end if;
  if l.ack_required and (p.ack_at is null or coalesce(p.ack_version, 0) < l.content_version) then
    return false;
  end if;
  if l.quiz is not null and p.quiz_passed_at is null then return false; end if;
  if l.type = 'carousel' then
    v_need := coalesce(jsonb_array_length(l.media -> 'images'), 0);
    v_pages := (select count(distinct x) from jsonb_array_elements_text(p.pages_seen) x);
    if v_pages < v_need then return false; end if;
  end if;
  update academy_progress set status = 'completed', completed_at = now()
   where agent_id = p_agent and lesson_id = p_lesson;
  return true;
end $$;

create or replace function aca_touch(p_lesson bigint, p_seconds int default 0, p_page int default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_secs int; v_done boolean;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  if not exists (select 1 from academy_lessons where id = p_lesson and status = 'published') then
    raise exception 'lesson not available';
  end if;
  v_secs := greatest(0, least(coalesce(p_seconds, 0), 45));
  insert into academy_progress (agent_id, lesson_id, active_seconds, pages_seen)
  values (auth.uid(), p_lesson, v_secs,
          case when p_page is null then '[]'::jsonb else jsonb_build_array(p_page::text) end)
  on conflict (agent_id, lesson_id) do update set
    active_seconds = academy_progress.active_seconds + v_secs,
    last_opened_at = now(),
    pages_seen = case when p_page is null then academy_progress.pages_seen
      when academy_progress.pages_seen @> jsonb_build_array(p_page::text) then academy_progress.pages_seen
      else academy_progress.pages_seen || jsonb_build_array(p_page::text) end;
  v_done := aca_check_complete(auth.uid(), p_lesson);
  return jsonb_build_object('completed', v_done,
    'active_seconds', (select active_seconds from academy_progress
                        where agent_id = auth.uid() and lesson_id = p_lesson));
end $$;

create or replace function aca_ack(p_lesson bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ver int; v_done boolean;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  select content_version into v_ver from academy_lessons where id = p_lesson and status = 'published';
  if v_ver is null then raise exception 'lesson not available'; end if;
  insert into academy_progress (agent_id, lesson_id, ack_at, ack_version)
  values (auth.uid(), p_lesson, now(), v_ver)
  on conflict (agent_id, lesson_id) do update set
    ack_at = now(), ack_version = v_ver, last_opened_at = now();
  v_done := aca_check_complete(auth.uid(), p_lesson);
  return jsonb_build_object('completed', v_done);
end $$;

create or replace function aca_quiz(p_lesson bigint, p_answer int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare l academy_lessons; v_ok boolean; v_retry boolean; v_done boolean;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  select * into l from academy_lessons where id = p_lesson and status = 'published';
  if l.id is null or l.quiz is null then raise exception 'no quiz on this lesson'; end if;
  v_ok := (l.quiz ->> 'correct')::int = p_answer;
  v_retry := coalesce((l.quiz ->> 'retry')::boolean, true);
  if not v_retry and exists (select 1 from academy_progress
      where agent_id = auth.uid() and lesson_id = p_lesson and quiz_score is not null) then
    raise exception 'no retries allowed on this check';
  end if;
  insert into academy_progress (agent_id, lesson_id, quiz_score, quiz_passed_at)
  values (auth.uid(), p_lesson, case when v_ok then 100 else 0 end,
          case when v_ok then now() else null end)
  on conflict (agent_id, lesson_id) do update set
    quiz_score = case when v_ok then 100 else 0 end,
    quiz_passed_at = case when v_ok then now() else academy_progress.quiz_passed_at end,
    last_opened_at = now();
  v_done := aca_check_complete(auth.uid(), p_lesson);
  return jsonb_build_object('correct', v_ok, 'completed', v_done,
    'explanation', case when v_ok then l.quiz -> 'explanation' else null end);
end $$;

-- ========== HUMAN OVERRIDE (§39) + TEAM VIEW (§31) ==========
create or replace function aca_prescribe_add(p_agent uuid, p_module bigint, p_reason text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_rx bigint;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select id into v_rx from academy_prescriptions
   where agent_id = p_agent order by created_at desc limit 1;
  if v_rx is null then
    insert into academy_prescriptions (agent_id) values (p_agent) returning id into v_rx;
  end if;
  insert into academy_prescription_items (prescription_id, module_id, category, rank, added_by, reason)
  values (v_rx, p_module, 'assigned', 5, auth.uid(), p_reason)
  on conflict (prescription_id, module_id) do update
    set category = 'assigned', added_by = auth.uid(), reason = excluded.reason;
  perform audit_log('prescription_override', 'diag', v_rx::text, null, 'assigned',
                    p_module::text || ': ' || coalesce(p_reason, ''));
end $$;

create or replace function aca_team_progress()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authorised'; end if;
  return coalesce((select jsonb_agg(row_out order by row_out ->> 'name') from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'country', p.country::text,
      'diag_done', exists (select 1 from diag_attempts a
                            where a.agent_id = p.id and a.status = 'completed'),
      'priorities', (select jsonb_agg(d.title -> 'en' order by dr.knowledge_pct asc nulls last)
                     from diag_results dr
                     join diag_attempts a on a.id = dr.attempt_id and a.agent_id = p.id
                       and a.status = 'completed'
                     join diag_dimensions d on d.key = dr.dimension_key
                     where dr.band in ('foundation','developing')
                     limit 3),
      'lessons_done', (select count(*) from academy_progress ap
                        where ap.agent_id = p.id and ap.status = 'completed'),
      'last_activity', (select max(last_opened_at) from academy_progress
                         where agent_id = p.id)
    ) as row_out
    from profiles p
    where p.status = 'active'
      and (
        (is_admin() and (p.country::text = my_country()::text or my_role() = 'master_admin'))
        or p.leader_id = v_me
        or exists (select 1 from coach_assignments ca
                    where ca.coach_id = v_me and ca.participant_id = p.id and ca.active)
        or exists (select 1 from pod_members pm join pods pd on pd.id = pm.pod_id
                    where pd.captain_id = v_me and pm.agent_id = p.id)
      )
  ) rows), '[]'::jsonb);
end $$;

-- ========== GRANTS ==========
revoke all on function diag_start() from public, anon;
revoke all on function diag_answer(bigint, int) from public, anon;
revoke all on function diag_submit() from public, anon;
revoke all on function aca_my() from public, anon;
revoke all on function aca_touch(bigint, int, int) from public, anon;
revoke all on function aca_ack(bigint) from public, anon;
revoke all on function aca_quiz(bigint, int) from public, anon;
revoke all on function aca_prescribe_add(uuid, bigint, text) from public, anon;
revoke all on function aca_team_progress() from public, anon;
revoke all on function aca_check_complete(uuid, bigint) from public, anon, authenticated;
revoke all on function diag_band(int) from public, anon;
grant execute on function diag_start() to authenticated;
grant execute on function diag_answer(bigint, int) to authenticated;
grant execute on function diag_submit() to authenticated;
grant execute on function aca_my() to authenticated;
grant execute on function aca_touch(bigint, int, int) to authenticated;
grant execute on function aca_ack(bigint) to authenticated;
grant execute on function aca_quiz(bigint, int) to authenticated;
grant execute on function aca_prescribe_add(uuid, bigint, text) to authenticated;
grant execute on function aca_team_progress() to authenticated;
grant execute on function diag_band(int) to authenticated;

-- ========== STORAGE: private academy bucket ==========
drop policy if exists aca_assets_read on storage.objects;
create policy aca_assets_read on storage.objects for select
  using (bucket_id = 'academy' and auth.uid() is not null);
drop policy if exists aca_assets_admin_write on storage.objects;
create policy aca_assets_admin_write on storage.objects for insert
  with check (bucket_id = 'academy' and is_admin());
drop policy if exists aca_assets_admin_del on storage.objects;
create policy aca_assets_admin_del on storage.objects for delete
  using (bucket_id = 'academy' and is_admin());
