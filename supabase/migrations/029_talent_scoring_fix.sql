-- ============================================================
-- 029_talent_scoring_fix.sql — corrects two faults in 028. ADDITIVE.
--
-- 1. talent_scores.kind is CHECK-constrained to
--    (dimension|motivation|demotivator|role), but 028 inserted the raw prefix
--    (style/ent/success) and only mapped it afterwards — the constraint fires
--    on INSERT, so scoring aborted.
-- 2. Mapping all three prefixes to 'dimension' while shortening the key would
--    have collided: style.adaptability and ent.adaptability both exist and
--    share the primary key (attempt_id, kind, key).
--
-- Fix: map the family at INSERT time, and keep the FULL dotted key for
-- dimensions so the two adaptability measures stay distinct.
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

  insert into talent_scores (attempt_id, kind, key, raw, normalised, band)
  with chosen as (
    select c.key, (c.value)::numeric as val
    from talent_responses r
    join talent_options o on o.question_id = r.question_id and o.value = r.option_value
    cross join lateral jsonb_each_text(o.contributes) as c(key, value)
    where r.attempt_id = p_attempt
  ), raw_totals as (
    select key, sum(val) as raw from chosen group by key
  ), best_per_question as (
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
    -- family, mapped at insert time so the CHECK constraint is satisfied
    case when split_part(t.key,'.',1) in ('style','ent','success') then 'dimension'
         else split_part(t.key,'.',1) end,
    -- dimensions keep the full dotted key: style.adaptability and
    -- ent.adaptability are different measures and must not merge
    case when split_part(t.key,'.',1) in ('style','ent','success') then t.key
         else split_part(t.key,'.',2) end,
    t.raw,
    case when p.best is null or p.best = 0 then null
         when split_part(t.key,'.',1) in ('style','ent','success')
           then greatest(0, least(100, round(((t.raw + p.best) / (2 * p.best)) * 100, 1)))
         else greatest(0, least(100, round((t.raw / p.best) * 100, 1)))
    end,
    null
  from raw_totals t left join possible p on p.key = t.key
  where split_part(t.key,'.',1) in ('style','ent','success','motivation','demotivator','role');

  update talent_scores s set band = case
      when s.normalised is null then 'Insufficient Information'
      when s.normalised >= 75 then 'Strong Alignment'
      when s.normalised >= 60 then 'Good Alignment'
      when s.normalised >= 45 then 'Emerging Alignment'
      else 'Development Opportunity' end
   where s.attempt_id = p_attempt;

  with r as (
    select kind, key, row_number() over (partition by kind order by normalised desc nulls last, raw desc) rn
    from talent_scores where attempt_id = p_attempt and kind in ('role','motivation','demotivator')
  )
  update talent_scores s set rank = r.rn
    from r where s.attempt_id = p_attempt and s.kind = r.kind and s.key = r.key;

  -- ---------- neutral review flags (§10) ----------
  select count(*) into v_answered from talent_responses
   where attempt_id = p_attempt
     and (option_value is not null or nullif(btrim(coalesce(text_value,'')),'') is not null);
  select count(*) into v_required from talent_questions q
    join talent_sections s on s.id = q.section_id
   where s.version_id = v_version and q.required;

  select count(distinct r.option_value) = 1 and count(*) >= 20 into v_uniform
    from talent_responses r
    join talent_questions q on q.id = r.question_id
   where r.attempt_id = p_attempt and q.kind in ('scale5','frequency');
  if coalesce(v_uniform, false) then
    insert into talent_flags values (p_attempt, 'uniform_responding',
      'Almost every scale answer is the same value — worth a gentle conversation, not an accusation.');
  end if;

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
