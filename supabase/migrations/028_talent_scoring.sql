-- ============================================================
-- 028_talent_scoring.sql — deterministic scoring (spec §10). ADDITIVE.
--
-- Runs entirely in SQL, BEFORE any AI is called. The AI path has no write
-- access to talent_scores or talent_flags, so a model cannot alter a score
-- or a ranking — that guarantee is structural, not a prompt instruction.
--
-- How a score is produced:
--   every chosen option carries a `contributes` map, e.g. {"role.closer": 3}
--   raw      = sum of contributions for that key
--   possible = the best obtainable total for that key given the items answered
--   norm     = 0..100 scaled against what was actually attainable
-- Keys that no answered item feeds are reported as 'Insufficient Information'
-- rather than as a zero, so an unanswered area never looks like a weakness.
-- ============================================================

create or replace function talent_score(p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_version bigint; v_answered int; v_required int; v_secs int;
  v_uniform boolean; v_contradiction int; v_written int;
begin
  select version_id, duration_seconds into v_version, v_secs
    from talent_attempts where id = p_attempt;
  if v_version is null then raise exception 'unknown attempt'; end if;

  delete from talent_scores where attempt_id = p_attempt;
  delete from talent_flags  where attempt_id = p_attempt;

  -- ---------- 1-3. raw totals, best attainable, normalise ----------
  -- CTEs rather than temp tables: this runs inside a SECURITY DEFINER function
  -- that may be called many times per session, and temp tables would collide.
  insert into talent_scores (attempt_id, kind, key, raw, normalised, band)
  with chosen as (             -- contributions from the options actually picked
    select c.key, (c.value)::numeric as val
    from talent_responses r
    join talent_options o on o.question_id = r.question_id and o.value = r.option_value
    cross join lateral jsonb_each_text(o.contributes) as c(key, value)
    where r.attempt_id = p_attempt
  ), raw_totals as (
    select key, sum(val) as raw from chosen group by key
  ), best_per_question as (    -- the most that key could have scored on each item seen
    select c.key, r.question_id, max((c.value)::numeric) as best
    from talent_responses r
    join talent_options o on o.question_id = r.question_id
    cross join lateral jsonb_each_text(o.contributes) as c(key, value)
    where r.attempt_id = p_attempt
    group by c.key, r.question_id
  ), possible as (
    select key, sum(best) as best from best_per_question group by key
  )
  select
    p_attempt,
    split_part(t.key, '.', 1),
    split_part(t.key, '.', 2),
    t.raw,
    case when p.best is null or p.best = 0 then null
         -- dimensions can go negative (reverse items), so map -best..+best onto 0..100
         when split_part(t.key,'.',1) in ('style','ent','success')
           then greatest(0, least(100, round(((t.raw + p.best) / (2 * p.best)) * 100, 1)))
         else greatest(0, least(100, round((t.raw / p.best) * 100, 1)))
    end,
    null
  from raw_totals t left join possible p on p.key = t.key;

  -- store the real family name (style/ent/success -> 'dimension')
  update talent_scores s set kind = case
      when s.kind in ('style','ent','success') then 'dimension'
      when s.kind = 'motivation' then 'motivation'
      when s.kind = 'demotivator' then 'demotivator'
      when s.kind = 'role' then 'role'
      else s.kind end
   where s.attempt_id = p_attempt;

  update talent_scores s set band = case
      when s.normalised is null then 'Insufficient Information'
      when s.normalised >= 75 then 'Strong Alignment'
      when s.normalised >= 60 then 'Good Alignment'
      when s.normalised >= 45 then 'Emerging Alignment'
      else 'Development Opportunity' end
   where s.attempt_id = p_attempt;

  -- ---------- 4. rankings ----------
  with r as (
    select kind, key, row_number() over (partition by kind order by normalised desc nulls last, raw desc) rn
    from talent_scores where attempt_id = p_attempt and kind in ('role','motivation','demotivator')
  )
  update talent_scores s set rank = r.rn
    from r where s.attempt_id = p_attempt and s.kind = r.kind and s.key = r.key;

  -- ---------- 5. neutral review flags (§10) ----------
  select count(*) into v_answered from talent_responses
   where attempt_id = p_attempt and (option_value is not null or nullif(btrim(coalesce(text_value,'')),'') is not null);
  select count(*) into v_required from talent_questions q
    join talent_sections s on s.id = q.section_id
   where s.version_id = v_version and q.required;

  -- nearly every scale answer identical
  select count(distinct r.option_value) = 1 and count(*) >= 20 into v_uniform
    from talent_responses r
    join talent_questions q on q.id = r.question_id
   where r.attempt_id = p_attempt and q.kind in ('scale5','frequency');
  if coalesce(v_uniform, false) then
    insert into talent_flags values (p_attempt, 'uniform_responding',
      'Almost every scale answer is the same value — worth a gentle conversation, not an accusation.');
  end if;

  -- reverse-scored items agreeing with their positive twins
  select count(*) into v_contradiction
    from talent_responses r
    join talent_questions q on q.id = r.question_id
   where r.attempt_id = p_attempt and q.reverse_scored and r.option_value >= 4;
  if v_contradiction >= 3 then
    insert into talent_flags values (p_attempt, 'contradictory_pairs',
      v_contradiction || ' reverse-worded items were also agreed with.');
  end if;

  if v_secs is not null and v_secs < 480 then
    insert into talent_flags values (p_attempt, 'unrealistically_fast',
      'Completed in ' || v_secs || ' seconds.');
  end if;

  if v_required - v_answered > 6 then
    insert into talent_flags values (p_attempt, 'many_skipped',
      (v_required - v_answered) || ' items left unanswered.');
  end if;

  select count(*) into v_written from talent_responses r
    join talent_questions q on q.id = r.question_id
   where r.attempt_id = p_attempt and q.kind = 'text'
     and length(btrim(coalesce(r.text_value,''))) >= 20;
  if v_written = 0 then
    insert into talent_flags values (p_attempt, 'insufficient_written_detail',
      'Written reflections were brief, so the narrative will be lighter.');
  end if;

  update talent_attempts set status = 'scored' where id = p_attempt;
  insert into talent_audit (attempt_id, action, detail) values (p_attempt, 'scored', null);

  return talent_result(p_attempt);
end $$;

-- Everything the report needs, in one shape. Used by the UI and by the AI worker.
create or replace function talent_result(p_attempt uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'attempt_id', p_attempt,
    'language', (select language from talent_attempts where id = p_attempt),
    'status', (select status from talent_attempts where id = p_attempt),
    'participant', (select jsonb_build_object(
        'preferred_name', coalesce(preferred_name, full_name),
        'experience', experience, 'leadership', leadership, 'country', country)
      from talent_participants where attempt_id = p_attempt),
    'dimensions', coalesce((select jsonb_object_agg(key, jsonb_build_object(
        'score', normalised, 'band', band))
      from talent_scores where attempt_id = p_attempt and kind = 'dimension'), '{}'::jsonb),
    'motivations', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'score', normalised) order by rank)
      from talent_scores where attempt_id = p_attempt and kind = 'motivation' and rank <= 5), '[]'::jsonb),
    'demotivators', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'score', normalised) order by rank)
      from talent_scores where attempt_id = p_attempt and kind = 'demotivator' and raw > 0 and rank <= 5), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'score', normalised, 'band', band) order by rank)
      from talent_scores where attempt_id = p_attempt and kind = 'role'), '[]'::jsonb),
    'flags', coalesce((select jsonb_agg(jsonb_build_object('flag', flag, 'detail', detail))
      from talent_flags where attempt_id = p_attempt), '[]'::jsonb),
    'reflections', coalesce((select jsonb_object_agg(q.code, r.text_value)
      from talent_responses r join talent_questions q on q.id = r.question_id
      where r.attempt_id = p_attempt and q.kind = 'text'
        and nullif(btrim(coalesce(r.text_value,'')),'') is not null), '{}'::jsonb)
  )
$$;

-- Participant-facing wrapper: submit already locked the attempt, this scores it.
create or replace function talent_score_mine(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  return talent_score(v_id);
end $$;

create or replace function talent_result_mine(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  return talent_result(v_id);
end $$;

grant execute on function talent_score_mine(text) to anon, authenticated;
grant execute on function talent_result_mine(text) to anon, authenticated;
grant execute on function talent_score(uuid) to authenticated;
grant execute on function talent_result(uuid) to authenticated;
