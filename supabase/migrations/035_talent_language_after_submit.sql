-- 035_talent_language_after_submit.sql — let the report be read in another language.
--
-- 034 refused to change language once the attempt was submitted, on the reasoning
-- that the language was part of what had been reported. In practice that left the
-- report screen stuck in whatever language the person started in, which is the one
-- screen they actually keep and show to other people.
--
-- Changing it is safe because language carries NO scoring weight: talent_score()
-- works off option values, which are language-independent. Switching after
-- submission therefore re-renders the same numbers with different wording, and the
-- app immediately regenerates the report so the narrative matches. Every switch is
-- still audited, so the record shows what happened rather than hiding it.

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

  if not (p_language = any (v_langs)) then
    raise exception 'language not available for this event';
  end if;

  update talent_attempts set language = p_language where id = v_id;

  -- Keep the stored report row honest: it is about to be regenerated, and until
  -- it is, its language column would otherwise claim something untrue.
  update talent_reports set language = p_language where attempt_id = v_id;

  insert into talent_audit (attempt_id, event_id, action, detail)
  values (v_id, v_event, 'language_changed', p_language || ' (' || v_status || ')');

  return jsonb_build_object('language', p_language, 'status', v_status);
end $$;

grant execute on function talent_set_language(text, text) to anon, authenticated;
