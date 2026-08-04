-- ============================================================
-- 031_talent_confidence.sql — soften the participant report when the answer
-- pattern makes it unreliable. ADDITIVE.
--
-- Decision (Kamal, 2026-08-04): a participant who taps the same option 47 times
-- must not walk away with "Strong Alignment" on everything. The maths is honest
-- but the presentation would be misleading, and it quietly rewards straight-lining.
--
-- talent_result now carries a `confidence` block. Low confidence tells the UI,
-- the PDF and the AI narrative to present ranges and an invitation to revisit,
-- instead of confident bands. Wording stays warm and never accuses (§10).
-- ============================================================

create or replace function talent_result(p_attempt uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with conf as (
    select
      case when exists (
        select 1 from talent_flags
         where attempt_id = p_attempt
           and flag in ('uniform_responding','contradictory_pairs')
      ) then 'low' else 'normal' end as level,
      (select string_agg(flag, ',') from talent_flags
        where attempt_id = p_attempt
          and flag in ('uniform_responding','contradictory_pairs')) as reason
  )
  select jsonb_build_object(
    'attempt_id', p_attempt,
    'language', (select language from talent_attempts where id = p_attempt),
    'status', (select status from talent_attempts where id = p_attempt),
    'participant', (select jsonb_build_object(
        'preferred_name', coalesce(preferred_name, full_name),
        'experience', experience, 'leadership', leadership, 'country', country)
      from talent_participants where attempt_id = p_attempt),
    -- when level = 'low' the report must not show confident bands
    'confidence', (select jsonb_build_object(
        'level', c.level, 'reason', c.reason,
        'note', case when c.level = 'low' then jsonb_build_object(
            'en', 'Your answers followed a very consistent pattern, so this profile is shown as a starting point rather than a firm result. It is worth revisiting a few sections with your coach.',
            'ms-MY', 'Jawapan anda mengikut corak yang sangat konsisten, jadi profil ini ditunjukkan sebagai titik permulaan dan bukan keputusan muktamad. Berbaloi untuk menyemak semula beberapa bahagian bersama coach anda.',
            'id-ID', 'Jawaban Anda mengikuti pola yang sangat konsisten, sehingga profil ini ditampilkan sebagai titik awal, bukan hasil akhir. Ada baiknya meninjau beberapa bagian bersama coach Anda.')
          else null end)
      from conf c),
    'dimensions', coalesce((select jsonb_object_agg(key, jsonb_build_object(
        'score', normalised,
        -- hide the confident band when the pattern is unreliable
        'band', case when (select level from conf) = 'low' then 'Worth Revisiting' else band end))
      from talent_scores where attempt_id = p_attempt and kind = 'dimension'), '{}'::jsonb),
    'motivations', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'score', normalised) order by rank)
      from talent_scores where attempt_id = p_attempt and kind = 'motivation' and rank <= 5), '[]'::jsonb),
    'demotivators', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'score', normalised) order by rank)
      from talent_scores where attempt_id = p_attempt and kind = 'demotivator' and raw > 0 and rank <= 5), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object(
        'key', key, 'score', normalised,
        'band', case when (select level from conf) = 'low' then 'Worth Revisiting' else band end) order by rank)
      from talent_scores where attempt_id = p_attempt and kind = 'role'), '[]'::jsonb),
    'flags', coalesce((select jsonb_agg(jsonb_build_object('flag', flag, 'detail', detail))
      from talent_flags where attempt_id = p_attempt), '[]'::jsonb),
    'reflections', coalesce((select jsonb_object_agg(q.code, r.text_value)
      from talent_responses r join talent_questions q on q.id = r.question_id
      where r.attempt_id = p_attempt and q.kind = 'text'
        and nullif(btrim(coalesce(r.text_value,'')),'') is not null), '{}'::jsonb)
  )
$$;
