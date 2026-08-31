-- 076_checkin_confirm.sql — venue check-in confirms the certificate identity.
-- Kamal (22 Aug 2026): at the venue, after the phone number, show the person
-- their full name + email, let them correct it (this is what goes on the
-- e-certificate), THEN they press "I'm here".
--   event_checkin_lookup  — code-gated, phone-matched preview (no attendance yet)
--   event_checkin         — now accepts p_name/p_email for a REGISTERED person
--                           too: updates the registration (lead) and audits the
--                           change, then marks present. Walk-in path unchanged.

create or replace function event_checkin_lookup(
  p_country text, p_slug text, p_code text, p_phone text
) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev events; v_norm text; v_row record;
begin
  select * into v_ev from events where country::text = p_country and slug = p_slug and status = 'published';
  if v_ev.id is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  if v_ev.checkin_code is null or upper(btrim(coalesce(p_code,''))) <> upper(v_ev.checkin_code) then
    return jsonb_build_object('ok', false, 'reason', 'bad_code');
  end if;
  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  if length(v_norm) < 9 then return jsonb_build_object('ok', false, 'reason', 'bad_phone'); end if;
  select l.name, l.custom_fields->>'email' as email, s.title as session_title, s.starts_at, r.attended
    into v_row
    from bop_roster r join m4u_leads l on l.id = r.lead_id join bop_sessions s on s.id = r.session_id
    where s.event_id = v_ev.id
      and regexp_replace(coalesce(l.phone_norm,''), '[^0-9+]', '', 'g') like '%' || right(v_norm, 9)
    order by abs(extract(epoch from (s.starts_at - now()))) limit 1;
  if v_row is null then return jsonb_build_object('ok', false, 'reason', 'not_registered'); end if;
  return jsonb_build_object('ok', true, 'name', v_row.name, 'email', v_row.email,
    'session_title', v_row.session_title, 'starts_at', v_row.starts_at, 'already_present', v_row.attended = 'attended');
end $$;
revoke all on function event_checkin_lookup(text,text,text,text) from public;
grant execute on function event_checkin_lookup(text,text,text,text) to anon, authenticated;

drop function if exists event_checkin(text,text,text,text,text,text);
create or replace function event_checkin(
  p_country text, p_slug text, p_code text, p_phone text, p_name text default null, p_email text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ev events; v_s bop_sessions; v_norm text; v_lead bigint; v_row bop_roster; v_reg jsonb;
        v_old_name text; v_old_email text; v_new_name text; v_new_email text;
begin
  select * into v_ev from events where country::text = p_country and slug = p_slug and status = 'published';
  if v_ev.id is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  if v_ev.checkin_code is null or upper(btrim(coalesce(p_code,''))) <> upper(v_ev.checkin_code) then
    return jsonb_build_object('ok', false, 'reason', 'bad_code');
  end if;
  select * into v_s from bop_sessions where event_id = v_ev.id and active
    order by abs(extract(epoch from (starts_at - now()))) limit 1;
  if v_s.id is null then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;

  v_norm := regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g');
  select r.* into v_row from bop_roster r join m4u_leads l on l.id = r.lead_id
    join bop_sessions s on s.id = r.session_id
    where s.event_id = v_ev.id and regexp_replace(coalesce(l.phone_norm,''), '[^0-9+]', '', 'g') like '%' || right(v_norm, 9)
    order by abs(extract(epoch from (s.starts_at - now()))) limit 1;

  if v_row.lead_id is null then
    -- walk-in: name + email required, registered and marked present in one go
    if btrim(coalesce(p_name,'')) = '' then return jsonb_build_object('ok', false, 'reason', 'not_registered'); end if;
    v_reg := event_register(p_country, p_slug, v_s.id, p_name, p_phone, p_email, null, null, 'walkin');
    if not coalesce((v_reg->>'ok')::boolean, false) then return v_reg; end if;
    v_lead := (v_reg->>'lead_id')::bigint;
    update bop_roster set attended = 'attended', attended_at = now(), checkin_method = 'qr'
      where session_id = v_s.id and lead_id = v_lead;
    return jsonb_build_object('ok', true, 'walkin', true, 'session_id', v_s.id, 'title', v_s.title);
  end if;

  -- registered: the person confirms / corrects the identity that goes on the certificate
  select name, custom_fields->>'email' into v_old_name, v_old_email from m4u_leads where id = v_row.lead_id;
  v_new_name := nullif(btrim(coalesce(p_name,'')), '');
  v_new_email := nullif(lower(btrim(coalesce(p_email,''))), '');
  if v_new_email is not null and v_new_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_email');
  end if;
  if (v_new_name is not null and v_new_name is distinct from v_old_name)
     or (v_new_email is not null and v_new_email is distinct from v_old_email) then
    update m4u_leads set
      name = coalesce(v_new_name, name),
      custom_fields = coalesce(custom_fields, '{}'::jsonb) || case when v_new_email is not null then jsonb_build_object('email', v_new_email) else '{}'::jsonb end,
      updated_at = now()
    where id = v_row.lead_id;
    insert into audit_events (actor, actor_role, country, action, entity_type, entity_id, prev_state, new_state, meta)
    values (null, 'participant', v_ev.country::text, 'event_registration.self_corrected', 'm4u_lead', v_row.lead_id::text,
            coalesce(v_old_name,'') || ' <' || coalesce(v_old_email,'') || '>',
            coalesce(v_new_name, v_old_name, '') || ' <' || coalesce(v_new_email, v_old_email, '') || '>',
            jsonb_build_object('event_id', v_ev.id, 'session_id', v_row.session_id, 'via', 'venue_qr'));
  end if;

  update bop_roster set attended = 'attended', attended_at = coalesce(attended_at, now()), checkin_method = 'qr'
    where session_id = v_row.session_id and lead_id = v_row.lead_id;
  return jsonb_build_object('ok', true, 'session_id', v_row.session_id, 'title', v_s.title,
    'name', coalesce(v_new_name, v_old_name), 'email', coalesce(v_new_email, v_old_email));
end $$;
revoke all on function event_checkin(text,text,text,text,text,text) from public;
grant execute on function event_checkin(text,text,text,text,text,text) to anon, authenticated;
