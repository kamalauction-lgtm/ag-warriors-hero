-- 034_talent_language.sql — let a participant switch language mid-assessment.
--
-- Until now the language was fixed by talent_start() and talent_form() read it
-- off the attempt row, so someone who started in English and found Bahasa
-- easier had to abandon and start again. For a MY/ID audience that is a real
-- drop-off, not a nicety.
--
-- Answers are NOT affected: talent_responses stores question_id + option_value,
-- both language-independent, so switching re-renders the same questions and the
-- same chosen options with translated wording. Nothing is re-asked or lost.
--
-- Only while in_progress. After submission the language is part of what was
-- scored and reported, and silently rewriting it would misrepresent the record.

create or replace function talent_set_language(p_token text, p_language text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid; v_status text; v_event bigint; v_langs text[];
begin
  v_id := talent_attempt_of(p_token);
  if v_id is null then raise exception 'invalid session'; end if;

  select a.status, a.event_id, e.languages
    into v_status, v_event, v_langs
    from talent_attempts a join talent_events e on e.id = a.event_id
   where a.id = v_id;

  if v_status <> 'in_progress' then
    raise exception 'this assessment is already submitted';
  end if;
  if not (p_language = any (v_langs)) then
    raise exception 'language not available for this event';
  end if;

  update talent_attempts set language = p_language where id = v_id;

  insert into talent_audit (attempt_id, event_id, action, detail)
  values (v_id, v_event, 'language_changed', p_language);

  return jsonb_build_object('language', p_language);
end $$;

grant execute on function talent_set_language(text, text) to anon, authenticated;
