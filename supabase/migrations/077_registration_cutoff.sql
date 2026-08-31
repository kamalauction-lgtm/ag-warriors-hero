-- 077_registration_cutoff.sql — admin controls WHEN people may register.
-- Kamal (22 Aug 2026): a per-event cutoff date/time for online registration, and
-- a switch for registering at the venue on event day (walk-in via the QR).
-- Defaults = open: no cutoff, walk-ins allowed — so nothing changes for
-- existing events unless an admin sets it.

alter table events add column if not exists registration_closes_at timestamptz;   -- null = open
alter table events add column if not exists allow_walkin boolean not null default true;
-- public may read these two (they decide what the page shows)
grant select (registration_closes_at, allow_walkin) on events to anon;

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

  -- registration window (admin-controlled; defaults open)
  if p_source = 'self' and v_ev.registration_closes_at is not null and now() > v_ev.registration_closes_at then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if p_source = 'walkin' and not v_ev.allow_walkin then
    return jsonb_build_object('ok', false, 'reason', 'walkin_closed');
  end if;

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
