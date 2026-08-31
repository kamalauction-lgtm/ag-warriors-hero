-- 073_events_rebook_fix.sql — authorisation bug in event_rebook (caught by probe).
-- bop_roster.caller_id is NULL for self-registrations, so
--   not (is_admin() or caller_id = auth.uid() or referred_by = auth.uid())
-- evaluated to NULL (three-valued logic) and the IF never fired: any signed-in
-- agent could rebook anyone's registrant. coalesce() closes it.

create or replace function event_rebook(p_session bigint, p_lead bigint, p_new_session bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_row bop_roster; v_new bop_sessions;
begin
  select * into v_row from bop_roster where session_id = p_session and lead_id = p_lead;
  if v_row.lead_id is null then raise exception 'not registered'; end if;
  if not (coalesce(is_admin(), false)
          or coalesce(v_row.caller_id = auth.uid(), false)
          or coalesce(v_row.referred_by = auth.uid(), false)) then
    raise exception 'not authorised';
  end if;
  select * into v_new from bop_sessions where id = p_new_session and active;
  if v_new.id is null then raise exception 'new session not found'; end if;
  update bop_roster set attended = case when attended = 'pending' then 'no_show' else attended end,
         rebooked_to = p_new_session where session_id = p_session and lead_id = p_lead;
  insert into bop_roster (session_id, lead_id, caller_id, attended, source, referred_by, friends, registered_at)
  values (p_new_session, p_lead, v_row.caller_id, 'pending', 'rebook', v_row.referred_by, v_row.friends, now())
  on conflict (session_id, lead_id) do nothing;
  return jsonb_build_object('ok', true, 'session_id', p_new_session, 'starts_at', v_new.starts_at,
    'type', v_new.type, 'link', v_new.link, 'location', v_new.location);
end $$;
revoke all on function event_rebook(bigint,bigint,bigint) from public, anon;
grant execute on function event_rebook(bigint,bigint,bigint) to authenticated;
