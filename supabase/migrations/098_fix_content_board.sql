-- ============================================================
-- 098_fix_content_board.sql — fix an overload I created in 097.
--
-- 081 already defined fn_content_gaps(p_version uuid default null). 097 added
-- a ZERO-ARG fn_content_gaps(), and because both can be called with no
-- arguments, PostgREST can no longer choose between them: every call returns
-- HTTP 300 / PGRST203. Caught by tools/test_phase3.py within the hour.
--
-- The 097 function is renamed to fn_content_board (it returns owners as well
-- as gaps, so the name is truer anyway); 081's function is restored as the
-- only fn_content_gaps.
-- ============================================================

drop function if exists fn_content_gaps();   -- the 097 zero-arg twin only

create or replace function fn_content_board()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (has_role('super_admin') or has_role('master_mentor')
          or exists (select 1 from ch_permissions
                      where user_id = auth.uid()
                        and permission in ('content.own', 'content.review'))) then
    raise exception 'not authorised';
  end if;
  return jsonb_build_object(
    'gaps', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day_no', cd.day_no, 'country', cd.country_override,
               'title', cd.title, 'content_status', cd.content_status)
             order by cd.country_override, cd.day_no)
      from curriculum_days cd
      where cd.content_status = 'content_required'), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object('name', p.name, 'permission', pm.permission,
                                          'country', pm.country))
      from ch_permissions pm join profiles p on p.id = pm.user_id
      where pm.permission in ('content.own', 'content.review')), '[]'::jsonb));
end $$;
revoke all on function fn_content_board() from public, anon;
grant execute on function fn_content_board() to authenticated;

-- verify: exactly ONE fn_content_gaps remains (081's uuid version) + the board
select 'content functions' as check, proname, pg_get_function_identity_arguments(oid) as args
  from pg_proc where proname in ('fn_content_gaps', 'fn_content_board') order by proname;
