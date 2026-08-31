-- 072_events.sql — EVENTS: public recruitment/BOP event pages on hero, built ON
-- TOP of the caller's bop_sessions + bop_roster (one lead pipeline, every door).
-- Honours Kamal's rule from 070/071: a person who REGISTERS for a session is
-- taken OUT of the calling pool (m4u_mark_registered → dead/'Registered',
-- never revived) — follow-up belongs to the referring agent, the event board
-- and GHL automations, never to cold callers.
--
--   hero.iqiaggroup.com/my/<slug>  ·  hero.iqiaggroup.com/id/<slug>
--
-- events        = the public page (country, slug, title, kind, status, QR code)
-- bop_sessions  = the dates under it (existing table; event_id links them)
-- bop_roster    = every registrant (existing; now carries HOW they came in:
--                 self link / walk-in / caller / referred_by agent) and the
--                 full journey: registered → attended/no_show → rebooked → joined.
-- A self-registration becomes an m4u_lead (source 'event') through the same
-- m4u_intake as GHL — so callers can follow it up, dedupe by phone holds, and
-- "which agent brought them" is a column, not a guess.
-- Security model ported from kamalag.com/sesi (attacked + verified there):
-- public sees only published events + session dates (never the join link nor
-- the check-in code); registration + check-in happen only through SECURITY
-- DEFINER RPCs; attendee lists are admin/owner only.

-- ---------- events ----------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  country country_t not null,
  slug text not null,
  title text not null,
  description text,
  kind text not null default 'recruitment'
    check (kind in ('recruitment','training','bop','launch','other')),
  status text not null default 'draft'
    check (status in ('draft','published','closed','archived')),
  capacity int,
  checkin_code text,                           -- secret, revealed only at the venue (QR)
  cover_path text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, slug)
);

alter table events enable row level security;

-- admins manage events in their country (master: both)
drop policy if exists w_events_admin on events;
create policy w_events_admin on events for all
  using (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
  with check (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'));

-- signed-in agents see published events of their country (to share links)
drop policy if exists r_events_agents on events;
create policy r_events_agents on events for select
  using (status = 'published' and country::text = my_country()::text);

-- the public (anon) sees published events — but NEVER the check-in code:
-- Supabase grants anon table-wide SELECT by default, so revoke first, then
-- grant only the public columns (the /sesi lesson).
drop policy if exists r_events_public on events;
create policy r_events_public on events for select to anon
  using (status = 'published');
revoke select on events from anon;
grant select (id, country, slug, title, description, kind, status, capacity, cover_path) on events to anon;

-- ---------- sessions (existing bop_sessions) ----------
alter table bop_sessions add column if not exists event_id uuid references events(id) on delete set null;
alter table bop_sessions add column if not exists capacity int;
create index if not exists bop_sessions_event on bop_sessions (event_id, starts_at);

-- public sees the DATES of published events, but not the join link
drop policy if exists r_bop_sessions_public on bop_sessions;
create policy r_bop_sessions_public on bop_sessions for select to anon
  using (active and event_id in (select id from events where status = 'published'));
revoke select on bop_sessions from anon;
grant select (id, event_id, country, type, title, starts_at, location, map_url, capacity, active, notes)
  on bop_sessions to anon;

-- ---------- roster (existing bop_roster) = registrations + journey ----------
alter table bop_roster add column if not exists source text not null default 'caller';  -- caller|self|walkin|agent
alter table bop_roster add column if not exists referred_by uuid references profiles(id);
alter table bop_roster add column if not exists registered_at timestamptz not null default now();
alter table bop_roster add column if not exists checkin_method text;                    -- qr|admin|caller
alter table bop_roster add column if not exists attended_at timestamptz;
alter table bop_roster add column if not exists friends text;
alter table bop_roster add column if not exists remarks text;
alter table bop_roster add column if not exists rebooked_to bigint references bop_sessions(id);
alter table bop_roster add column if not exists ghl_sent boolean not null default false;
alter table bop_roster add column if not exists noshow_notified boolean not null default false;

-- admin manages the roster (country via the session); caller/referrer update their own rows
drop policy if exists w_bop_roster_admin on bop_roster;
create policy w_bop_roster_admin on bop_roster for all
  using (is_admin() and exists (select 1 from bop_sessions s where s.id = session_id
          and (s.country::text = my_country()::text or my_role() = 'master_admin')))
  with check (is_admin());
drop policy if exists u_bop_roster_owner on bop_roster;
create policy u_bop_roster_owner on bop_roster for update
  using (caller_id = auth.uid() or referred_by = auth.uid())
  with check (caller_id = auth.uid() or referred_by = auth.uid());
-- owners (caller / referrer) read their own registrants
drop policy if exists r_bop_roster_owner on bop_roster;
create policy r_bop_roster_owner on bop_roster for select
  using (caller_id = auth.uid() or referred_by = auth.uid() or is_admin());

-- ---------- public registration ----------
-- Finds/creates the lead identity via m4u_intake (dedupe by phone), then
-- immediately takes it OUT of the calling pool with m4u_mark_registered
-- (Kamal: "once registered, nobody calls them"), books the roster row, and
-- returns the join details ONLY now (link / venue) — the /sesi "reveal after
-- sign-up" rule, so the attendee list is always captured.
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
  select * into v_ev from events where country::text = p_country and slug = p_slug and status = 'published';
  if v_ev.id is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  select * into v_s from bop_sessions where id = p_session and event_id = v_ev.id and active;
  if v_s.id is null then return jsonb_build_object('ok', false, 'reason', 'no_session'); end if;

  -- capacity (session first, event as fallback)
  select count(*) into v_count from bop_roster where session_id = v_s.id;
  if coalesce(v_s.capacity, v_ev.capacity) is not null and v_count >= coalesce(v_s.capacity, v_ev.capacity) then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  -- referrer: profile id, or a phone number of an agent (for ?ref=)
  if p_ref is not null then
    begin v_ref := p_ref::uuid; exception when others then v_ref := null; end;
    if v_ref is null then
      select id into v_ref from profiles where phone = p_ref and status = 'active' limit 1;
    end if;
  end if;

  -- the lead, through the one intake engine
  v_lead := m4u_intake(v_ev.country, btrim(p_name), btrim(p_phone), null, null, null, null,
    jsonb_strip_nulls(jsonb_build_object('event', v_ev.slug, 'email', p_email, 'friends', p_friends)),
    'event', jsonb_build_object('event_id', v_ev.id, 'session_id', v_s.id, 'ref', v_ref, 'source', p_source));
  v_lead_id := (v_lead->>'lead_id')::bigint;
  if v_lead_id is null then return jsonb_build_object('ok', false, 'reason', 'intake_failed', 'detail', v_lead); end if;

  -- registered = OUT of the calling pool (dead/'Registered', GHL tag via reconcile)
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

-- ---------- venue check-in (QR + secret code = proof of presence) ----------
-- Finds the registrant by phone across the event's sessions (nearest to now);
-- walk-in: when p_name is given and nobody is registered, registers them into
-- the session happening now and marks them present in one go.
create or replace function event_checkin(
  p_country text, p_slug text, p_code text, p_phone text, p_name text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_ev events; v_s bop_sessions; v_norm text; v_lead bigint; v_row bop_roster; v_reg jsonb;
begin
  select * into v_ev from events where country::text = p_country and slug = p_slug and status = 'published';
  if v_ev.id is null then return jsonb_build_object('ok', false, 'reason', 'no_event'); end if;
  if v_ev.checkin_code is null or upper(btrim(coalesce(p_code,''))) <> upper(v_ev.checkin_code) then
    return jsonb_build_object('ok', false, 'reason', 'bad_code');
  end if;
  -- the session happening now-ish (closest start within ±6h), else the next one
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
    v_reg := event_register(p_country, p_slug, v_s.id, p_name, p_phone, null, null, null, 'walkin');
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
revoke all on function event_checkin(text,text,text,text,text) from public;
grant execute on function event_checkin(text,text,text,text,text) to anon, authenticated;

-- ---------- admin/agent: event board (registrants with lead + owner names) ----------
create or replace function event_board(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev events;
begin
  select * into v_ev from events where id = p_event;
  if v_ev.id is null then raise exception 'no event'; end if;
  if not (is_admin() and (v_ev.country::text = my_country()::text or my_role() = 'master_admin')) then
    -- non-admins get ONLY their own registrants (referred or called by them)
    return coalesce((select jsonb_agg(row_to_json(x)) from (
      select r.session_id, s.title as session_title, s.starts_at, s.type,
             r.lead_id, l.name, l.phone_norm, r.source, r.attended, r.attended_at, r.checkin_method,
             r.joined, r.friends, r.remarks, r.registered_at, r.rebooked_to,
             r.referred_by, (select name from profiles where id = r.referred_by) as referred_name,
             r.caller_id, (select name from profiles where id = r.caller_id) as caller_name
        from bop_roster r join bop_sessions s on s.id = r.session_id join m4u_leads l on l.id = r.lead_id
       where s.event_id = p_event and (r.referred_by = auth.uid() or r.caller_id = auth.uid())
       order by r.registered_at desc) x), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(row_to_json(x)) from (
    select r.session_id, s.title as session_title, s.starts_at, s.type,
           r.lead_id, l.name, l.phone_norm, r.source, r.attended, r.attended_at, r.checkin_method,
           r.joined, r.friends, r.remarks, r.registered_at, r.rebooked_to,
           r.referred_by, (select name from profiles where id = r.referred_by) as referred_name,
           r.caller_id, (select name from profiles where id = r.caller_id) as caller_name
      from bop_roster r join bop_sessions s on s.id = r.session_id join m4u_leads l on l.id = r.lead_id
     where s.event_id = p_event
     order by r.registered_at desc) x), '[]'::jsonb);
end $$;
revoke all on function event_board(uuid) from public, anon;
grant execute on function event_board(uuid) to authenticated;

-- ---------- no-show → rebook onto another date (admin or owner) ----------
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
