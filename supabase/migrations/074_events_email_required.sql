-- 074_events_email_required.sql — email is MANDATORY on event registration
-- (Kamal, 21 Aug 2026: attendance e-certificates go out by email).
-- event_register refuses self/walk-in sign-ups without an email; event_checkin
-- gains p_email so walk-ins give one too; event_board returns the email so the
-- admin board + CSV (and the future e-cert sender) can read it.

create or replace function event_register(
  p_country text, p_slug text, p_session bigint,
  p_name text, p_phone text, p_email text default null,
  p_friends text default null, p_ref text default null, p_source text default 'self'
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ev events; v_s bop_sessions; v_lead jsonb; v_lead_id bigint; v_ref uuid;
  v_prop bigint; v_count int;
begin
  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_phone, '')) = '' then
    raise exception 'name and phone required';
  end if;
  if p_source in ('self', 'walkin') and (p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('ok', false, 'reason', 'email_required');
  end if;
  select * into v_ev from events where country::text = p_country and slug = p_slug and status = 'published';
  if v_ev.id is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  select * into v_s from bop_sessions where id = p_session and event_id = v_ev.id and active;
  if v_s.id is null then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;

  select count(*) into v_count from bop_roster where session_id = v_s.id;
  if coalesce(v_s.capacity, v_ev.capacity) is not null and v_count >= coalesce(v_s.capacity, v_ev.capacity) then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  if p_ref is not null then
    begin v_ref := p_ref::uuid; exception when others then v_ref := null; end;
    if v_ref is null then
      select id into v_ref from profiles where phone = p_ref and status = 'active' limit 1;
    end if;
  end if;

  v_lead := m4u_intake(v_ev.country, btrim(p_name), btrim(p_phone), null, null, null, null,
    jsonb_strip_nulls(jsonb_build_object('event', v_ev.slug, 'email', lower(btrim(p_email)), 'friends', p_friends)),
    'event', jsonb_build_object('event_id', v_ev.id, 'session_id', v_s.id, 'ref', v_ref, 'source', p_source));
  v_lead_id := (v_lead->>'lead_id')::bigint;
  if v_lead_id is null then return jsonb_build_object('ok', false, 'reason', 'intake_failed', 'detail', v_lead); end if;

  perform m4u_mark_registered(btrim(p_phone), btrim(p_name));
  v_prop := null;

  insert into bop_roster (session_id, lead_id, caller_id, attended, source, referred_by, friends, registered_at)
  values (v_s.id, v_lead_id, null, 'pending', p_source, v_ref, nullif(btrim(coalesce(p_friends,'')), ''), now())
  on conflict (session_id, lead_id) do update
    set friends = coalesce(excluded.friends, bop_roster.friends),
        referred_by = coalesce(bop_roster.referred_by, excluded.referred_by);

  return jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'session_id', v_s.id,
    'type', v_s.type, 'title', v_s.title, 'starts_at', v_s.starts_at,
    'link', v_s.link, 'location', v_s.location, 'map_url', v_s.map_url);
end $$;
revoke all on function event_register(text,text,bigint,text,text,text,text,text,text) from public;
grant execute on function event_register(text,text,bigint,text,text,text,text,text,text) to anon, authenticated;

-- check-in: walk-ins must leave an email too
drop function if exists event_checkin(text,text,text,text,text);
create or replace function event_checkin(
  p_country text, p_slug text, p_code text, p_phone text, p_name text default null, p_email text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ev events; v_s bop_sessions; v_norm text; v_lead bigint; v_row bop_roster; v_reg jsonb;
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
    if btrim(coalesce(p_name,'')) = '' then return jsonb_build_object('ok', false, 'reason', 'not_registered'); end if;
    v_reg := event_register(p_country, p_slug, v_s.id, p_name, p_phone, p_email, null, null, 'walkin');
    if not coalesce((v_reg->>'ok')::boolean, false) then return v_reg; end if;
    v_lead := (v_reg->>'lead_id')::bigint;
    update bop_roster set attended = 'attended', attended_at = now(), checkin_method = 'qr'
      where session_id = v_s.id and lead_id = v_lead;
    return jsonb_build_object('ok', true, 'walkin', true, 'session_id', v_s.id, 'title', v_s.title);
  end if;

  update bop_roster set attended = 'attended', attended_at = coalesce(attended_at, now()), checkin_method = 'qr'
    where session_id = v_row.session_id and lead_id = v_row.lead_id;
  return jsonb_build_object('ok', true, 'session_id', v_row.session_id, 'title', v_s.title);
end $$;
revoke all on function event_checkin(text,text,text,text,text,text) from public;
grant execute on function event_checkin(text,text,text,text,text,text) to anon, authenticated;

-- board: expose the email (from the lead's custom fields) for admin + CSV + e-cert
create or replace function event_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev events; v_all boolean;
begin
  select * into v_ev from events where id = p_event;
  if v_ev.id is null then raise exception 'no event'; end if;
  v_all := coalesce(is_admin(), false) and (v_ev.country::text = my_country()::text or my_role() = 'master_admin');
  return coalesce((select jsonb_agg(row_to_json(x)) from (
    select r.session_id, s.title as session_title, s.starts_at, s.type,
           r.lead_id, l.name, l.phone_norm, l.custom_fields->>'email' as email,
           r.source, r.attended, r.attended_at, r.checkin_method,
           r.joined, r.friends, r.remarks, r.registered_at, r.rebooked_to,
           r.referred_by, (select name from profiles where id = r.referred_by) as referred_name,
           r.caller_id, (select name from profiles where id = r.caller_id) as caller_name
      from bop_roster r join bop_sessions s on s.id = r.session_id join m4u_leads l on l.id = r.lead_id
     where s.event_id = p_event
       and (v_all or coalesce(r.referred_by = auth.uid(), false) or coalesce(r.caller_id = auth.uid(), false))
     order by r.registered_at desc) x), '[]'::jsonb);
end $$;
revoke all on function event_board(uuid) from public, anon;
grant execute on function event_board(uuid) to authenticated;
