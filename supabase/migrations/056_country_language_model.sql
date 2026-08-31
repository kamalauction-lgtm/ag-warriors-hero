-- 056_country_language_model.sql — LOCKED PLATFORM RULE (Kamal, 2026-08-07):
--   ONE PLATFORM. TWO COUNTRIES. COUNTRY-SPECIFIC CONTENT.
--   MY -> Bahasa Malaysia default, EN optional. ID -> Bahasa Indonesia default,
--   EN optional. Country first, language second. Fallback never crosses country.
--
-- Additive only. Existing progress, content ids and audit history untouched.
--
-- What changes here:
--   1. onb_lessons gains country_scope — onboarding lessons can now be MY-only
--      or ID-only variants inside a shared section (the Academy already had
--      this). Existing rows default to 'ALL', so nothing published changes.
--   2. onb_my_program() filters lessons by the participant's country.
--   3. Prescription rules gain country_scope so a dimension gap can map to a
--      MY module for Malaysians and an ID module for Indonesians (§14).
--   4. diag_submit() applies country to rule matching.
-- Language variants stay as the jsonb {"en","ms","id"} on each COUNTRY-variant
-- row — so a "BOTH" concept with different national content = two rows, one
-- per country, each carrying its own translations and media. Progress keys on
-- the lesson id, so switching display language never duplicates completion.

-- ---------- 1. onboarding lessons become country-variant rows ----------
alter table onb_lessons add column if not exists country_scope text not null default 'ALL';
do $$ begin
  alter table onb_lessons add constraint onb_lessons_country_chk
    check (country_scope in ('MY','ID','ALL'));
exception when duplicate_object then null; end $$;

-- ---------- 2. onb_my_program: country filter on lessons ----------
create or replace function onb_my_program()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_country text; v_prog onb_programs; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'not authorised'; end if;
  select country::text into v_country from profiles where id = auth.uid();

  select * into v_prog from onb_programs
   where status = 'published' and country_scope in ('ALL', v_country)
   order by created_at desc limit 1;
  if v_prog.id is null then return null; end if;

  select jsonb_build_object(
    'program', jsonb_build_object('id', v_prog.id, 'title', v_prog.title, 'subtitle', v_prog.subtitle),
    'completed_at', (select completed_at from onb_completion where agent_id = auth.uid()),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'sort', s.sort,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'type', l.type, 'title', l.title, 'subtitle', l.subtitle,
            'body', l.body, 'media', l.media,
            'duration_min', l.duration_min, 'required', l.required,
            'min_seconds', l.min_seconds, 'ack_required', l.ack_required,
            'content_version', l.content_version,
            'prerequisite_id', l.prerequisite_id, 'sort', l.sort,
            'quiz', case when l.quiz is null then null else jsonb_build_object(
              'question', l.quiz -> 'question', 'options', l.quiz -> 'options',
              'retry', coalesce(l.quiz -> 'retry', 'true'::jsonb)) end,
            'progress', (select jsonb_build_object(
                'status', p.status, 'active_seconds', p.active_seconds,
                'pages_seen', p.pages_seen, 'ack_at', p.ack_at,
                'ack_version', p.ack_version, 'quiz_passed_at', p.quiz_passed_at,
                'completed_at', p.completed_at)
              from onb_progress p where p.agent_id = auth.uid() and p.lesson_id = l.id)
          ) order by l.sort, l.id)
          from onb_lessons l
          where l.section_id = s.id and l.status = 'published'
            and l.country_scope in ('ALL', v_country)), '[]'::jsonb)
      ) order by s.sort, s.id)
      from onb_sections s where s.program_id = v_prog.id and s.status = 'published'), '[]'::jsonb)
  ) into v_out;
  return v_out;
end $$;

-- programme completion must also only count lessons the participant's country
-- can actually see — otherwise an ID agent could never finish a programme
-- containing an MY-only lesson
create or replace function onb_check_complete(p_agent uuid, p_lesson bigint)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare l onb_lessons; p onb_progress; v_pages int; v_need int; v_prog bigint; v_left int;
        v_country text;
begin
  select * into l from onb_lessons where id = p_lesson;
  select * into p from onb_progress where agent_id = p_agent and lesson_id = p_lesson;
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

  update onb_progress set status = 'completed', completed_at = now()
   where agent_id = p_agent and lesson_id = p_lesson;

  select country::text into v_country from profiles where id = p_agent;
  select s.program_id into v_prog from onb_sections s where s.id = l.section_id;
  select count(*) into v_left
    from onb_lessons ll join onb_sections ss on ss.id = ll.section_id
   where ss.program_id = v_prog and ss.status = 'published'
     and ll.status = 'published' and ll.required
     and ll.country_scope in ('ALL', v_country)
     and not exists (select 1 from onb_progress pp
                      where pp.agent_id = p_agent and pp.lesson_id = ll.id
                        and pp.status = 'completed');
  if v_left = 0 and not exists (select 1 from onb_completion where agent_id = p_agent) then
    insert into onb_completion (agent_id, program_id) values (p_agent, v_prog);
    insert into notifications (to_agent, type, title, body, link)
    values (p_agent, 'onboarding', '🎓 Onboarding complete!',
            'You have completed your AG foundation. Become Better. Build Better. Give Better.',
            '#/grow/onboarding');
  end if;
  return true;
end $$;

-- ---------- 3. country-aware prescription rules ----------
alter table academy_dimension_rules add column if not exists country_scope text not null default 'ALL';
do $$ begin
  alter table academy_dimension_rules add constraint aca_dim_rules_country_chk
    check (country_scope in ('MY','ID','ALL'));
exception when duplicate_object then null; end $$;

alter table academy_role_rules add column if not exists country_scope text not null default 'ALL';
do $$ begin
  alter table academy_role_rules add constraint aca_role_rules_country_chk
    check (country_scope in ('MY','ID','ALL'));
exception when duplicate_object then null; end $$;

-- ---------- 4. diag_submit: rules filtered by participant country ----------
create or replace function diag_submit()
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_me uuid := auth.uid(); v_attempt bigint; v_rx bigint;
  v_snapshot jsonb; v_country text;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  select country::text into v_country from profiles where id = v_me;
  select id into v_attempt from diag_attempts
   where agent_id = v_me and status = 'in_progress' order by started_at desc limit 1;
  if v_attempt is null then raise exception 'no attempt in progress'; end if;

  insert into diag_results (attempt_id, dimension_key, knowledge_pct, confidence_level, band)
  select v_attempt, d.key, k.pct, c.level, diag_band(k.pct)
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

  insert into academy_prescriptions (agent_id, attempt_id)
  values (v_me, v_attempt) returning id into v_rx;

  -- required: foundation gaps — COUNTRY-eligible rules only
  insert into academy_prescription_items (prescription_id, module_id, category, dimension_key, rank)
  select distinct v_rx, adr.module_id, 'required', dr.dimension_key, 10
  from diag_results dr
  join diag_dimensions d on d.key = dr.dimension_key and d.category = 'foundation'
  join academy_dimension_rules adr on adr.dimension_key = dr.dimension_key and adr.band = dr.band
   and adr.country_scope in ('ALL', v_country)
  where dr.attempt_id = v_attempt
  on conflict do nothing;

  -- priority: two lowest non-foundation gaps
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
   and adr.country_scope in ('ALL', v_country)
  where ranked.rn <= 2
  on conflict do nothing;

  -- role accelerator, country-eligible; skipped entirely on low_confidence talent
  if v_snapshot is not null and not coalesce((v_snapshot ->> 'low_confidence')::boolean, false) then
    insert into academy_prescription_items (prescription_id, module_id, category, dimension_key, rank)
    select v_rx, rr.module_id, 'accelerator', null, rr.rank
    from academy_role_rules rr
    where rr.role_key = v_snapshot -> 'top_roles' -> 0 ->> 'key'
      and rr.country_scope in ('ALL', v_country)
    order by rr.rank limit 3
    on conflict do nothing;

    insert into academy_prescription_items (prescription_id, module_id, category, dimension_key, rank)
    select v_rx, rr.module_id, 'optional', null, 50 + rr.rank
    from academy_role_rules rr
    where rr.role_key in (v_snapshot -> 'top_roles' -> 1 ->> 'key',
                          v_snapshot -> 'top_roles' -> 2 ->> 'key')
      and rr.country_scope in ('ALL', v_country)
    order by rr.rank limit 2
    on conflict do nothing;
  end if;

  perform audit_log('diag_completed', 'diag', v_attempt::text, null, 'completed', null);
  perform audit_log('prescription_generated', 'diag', v_rx::text, null, 'generated', null);
  return jsonb_build_object('attempt_id', v_attempt, 'prescription_id', v_rx);
end $$;
