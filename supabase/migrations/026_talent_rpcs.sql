-- ============================================================
-- 026_talent_rpcs.sql — participant API for Hero Talent Compass. ADDITIVE.
-- Every function takes the resume token; nothing is reachable without it,
-- so one participant can never read or write another's attempt (§17).
-- ============================================================

-- Fetch the whole question bank for an attempt, already reduced to one language.
create or replace function talent_form(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_att talent_attempts; v_lang text; v_out jsonb;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  select * into v_att from talent_attempts where id = v_id;
  v_lang := v_att.language;

  select jsonb_build_object(
    'attempt_id', v_att.id,
    'language', v_lang,
    'status', v_att.status,
    'sections', coalesce(jsonb_agg(sec order by sec->>'sort_order'), '[]'::jsonb)
  ) into v_out
  from (
    select jsonb_build_object(
      'code', s.code,
      'sort_order', s.sort_order,
      'title', coalesce(s.title->>v_lang, s.title->>'en'),
      'intro', coalesce(s.intro->>v_lang, s.intro->>'en'),
      'questions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'code', q.code, 'kind', q.kind,
          'stem', coalesce(q.stem->>v_lang, q.stem->>'en'),
          'helper', coalesce(q.helper->>v_lang, q.helper->>'en'),
          'required', q.required, 'max_length', q.max_length,
          'randomise', q.randomise_options,
          'options', (
            select coalesce(jsonb_agg(jsonb_build_object(
              'value', o.value,
              'label', coalesce(o.label->>v_lang, o.label->>'en')
            ) order by o.sort_order), '[]'::jsonb)
            from talent_options o where o.question_id = q.id
          )
        ) order by q.sort_order), '[]'::jsonb)
        from talent_questions q where q.section_id = s.id
      )
    ) as sec
    from talent_sections s
    where s.version_id = v_att.version_id
  ) t;

  return v_out;
end $$;

-- Save participant details + consent (§5, §6). Idempotent.
create or replace function talent_save_details(
  p_token text, p_full_name text, p_preferred text, p_country text,
  p_contact text, p_experience text, p_leadership text,
  p_developmental boolean, p_not_clinical boolean, p_self_reported boolean,
  p_data_use boolean, p_sharing text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  if not (p_developmental and p_not_clinical and p_self_reported and p_data_use) then
    raise exception 'all acknowledgements are required';
  end if;
  if p_sharing not in ('private','summary','full') then
    raise exception 'invalid sharing choice';
  end if;

  insert into talent_participants (attempt_id, full_name, preferred_name, country,
    contact, experience, leadership)
  values (v_id, btrim(p_full_name), nullif(btrim(coalesce(p_preferred,'')),''), p_country,
    nullif(btrim(coalesce(p_contact,'')),''), p_experience, p_leadership)
  on conflict (attempt_id) do update set
    full_name = excluded.full_name, preferred_name = excluded.preferred_name,
    country = excluded.country, contact = excluded.contact,
    experience = excluded.experience, leadership = excluded.leadership;

  insert into talent_consents (attempt_id, developmental_ack, not_clinical_ack,
    self_reported_ack, data_use_ack, sharing)
  values (v_id, true, true, true, true, p_sharing)
  on conflict (attempt_id) do update set sharing = excluded.sharing, agreed_at = now();

  insert into talent_audit (attempt_id, action, detail) values (v_id, 'details_saved', p_sharing);
end $$;

-- Autosave a single answer (§2). Rejects writes once submitted (§9).
create or replace function talent_answer(
  p_token text, p_question bigint, p_value int default null, p_text text default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_status text; v_max int; v_kind text;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  select status into v_status from talent_attempts where id = v_id;
  if v_status <> 'in_progress' then raise exception 'this assessment is already submitted'; end if;

  select kind, coalesce(max_length, 1500) into v_kind, v_max
    from talent_questions where id = p_question;
  if v_kind is null then raise exception 'unknown question'; end if;

  insert into talent_responses (attempt_id, question_id, option_value, text_value, answered_at)
  values (v_id, p_question, p_value,
          case when p_text is null then null else left(btrim(p_text), v_max) end, now())
  on conflict (attempt_id, question_id) do update set
    option_value = excluded.option_value,
    text_value = excluded.text_value,
    answered_at = now();
end $$;

-- Resume: answers already given, so a refresh loses nothing (§2, §19).
create or replace function talent_progress(p_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  return (
    select jsonb_build_object(
      'status', (select status from talent_attempts where id = v_id),
      'details', (select to_jsonb(p) - 'attempt_id' from talent_participants p where p.attempt_id = v_id),
      'sharing', (select sharing from talent_consents where attempt_id = v_id),
      'answers', coalesce((
        select jsonb_object_agg(question_id::text,
                 jsonb_build_object('value', option_value, 'text', text_value))
        from talent_responses where attempt_id = v_id), '{}'::jsonb)
    )
  );
end $$;

-- Submit: locks the attempt, then scoring runs (027).
create or replace function talent_submit(p_token text, p_seconds int default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_status text; v_missing int;
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;
  select status into v_status from talent_attempts where id = v_id;
  if v_status <> 'in_progress' then raise exception 'already submitted'; end if;

  if not exists (select 1 from talent_consents where attempt_id = v_id) then
    raise exception 'consent is required before submitting';
  end if;

  select count(*) into v_missing
  from talent_questions q
  join talent_sections s on s.id = q.section_id
  join talent_attempts a on a.version_id = s.version_id and a.id = v_id
  where q.required
    and not exists (
      select 1 from talent_responses r
      where r.attempt_id = v_id and r.question_id = q.id
        and (r.option_value is not null or nullif(btrim(coalesce(r.text_value,'')),'') is not null));

  update talent_attempts
     set status = 'submitted', submitted_at = now(), duration_seconds = p_seconds
   where id = v_id;

  insert into talent_audit (attempt_id, action, detail)
  values (v_id, 'submitted', v_missing || ' unanswered');

  return jsonb_build_object('attempt_id', v_id, 'unanswered', v_missing);
end $$;

grant execute on function talent_form(text) to anon, authenticated;
grant execute on function talent_save_details(text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,text) to anon, authenticated;
grant execute on function talent_answer(text,bigint,int,text) to anon, authenticated;
grant execute on function talent_progress(text) to anon, authenticated;
grant execute on function talent_submit(text,int) to anon, authenticated;
