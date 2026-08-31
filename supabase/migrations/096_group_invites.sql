-- ============================================================
-- 096_group_invites.sql — invite registrants into the company groups. ADDITIVE.
--
-- HOW THIS WORKS, AND WHY IT WORKS THIS WAY
--   No legitimate API can ADD a person to a WhatsApp or Telegram group:
--   WhatsApp's official API has no group membership at all, and a Telegram bot
--   may never message a person who has not messaged it first. The unofficial
--   route (puppeting a real WhatsApp session) gets the agency's number banned.
--
--   So the system does the honest version: the admin taps Invite on a
--   registrant, WhatsApp opens with a ready-written message carrying the
--   group INVITE LINKS (WhatsApp group + Telegram group), the admin hits send,
--   and the person joins themselves. Both platforms support "approve new
--   members", so a leaked link still passes a human. What Hero adds on top of
--   a bare link is management (links stored per country, changed in one
--   place) and memory (every invite is logged, so the list shows who was
--   already asked and nobody is spammed twice).
--
-- ROLLBACK: drop the two tables and three functions; nothing else references them.
-- ============================================================

-- ------------------------------------------------------------
-- 1. THE LINKS — one row per group, country-scoped
-- ------------------------------------------------------------
create table if not exists invite_links (
  id uuid primary key default gen_random_uuid(),
  country country_t not null,
  kind text not null check (kind in ('whatsapp', 'telegram')),
  label text not null,                       -- "AG HEROES MY (WhatsApp)"
  url text not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists invite_links_scope on invite_links (country, kind) where active;

-- ------------------------------------------------------------
-- 2. THE MEMORY — who has already been invited, by whom
--    Keyed on the LEAD, not the session: a person rebooked across dates is
--    still the same person and should not be re-invited per date.
-- ------------------------------------------------------------
create table if not exists group_invite_log (
  lead_id bigint not null references m4u_leads(id) on delete cascade,
  country country_t not null,
  invited_by uuid references profiles(id),
  invited_at timestamptz not null default now(),
  links_sent jsonb not null default '[]'::jsonb,   -- the labels/urls at send time
  primary key (lead_id)
);

alter table invite_links enable row level security;
alter table group_invite_log enable row level security;
-- reads go through the RPCs below; no direct client access at all
revoke select, insert, update, delete on invite_links, group_invite_log from authenticated, anon;

-- ------------------------------------------------------------
-- 3. ADMIN: manage the links
-- ------------------------------------------------------------
create or replace function fn_admin_set_invite_link(
  p_country text, p_kind text, p_label text, p_url text,
  p_active boolean default true, p_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if my_role() <> 'master_admin' and p_country is distinct from my_country()::text then
    raise exception 'that country is outside your scope';
  end if;
  if p_kind not in ('whatsapp', 'telegram') then raise exception 'kind must be whatsapp or telegram'; end if;
  if btrim(coalesce(p_label, '')) = '' then raise exception 'label required'; end if;
  -- only real invite links are accepted — a typo here would be mass-sent later
  if p_kind = 'whatsapp' and p_url !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+' then
    raise exception 'a WhatsApp group invite link looks like https://chat.whatsapp.com/…';
  end if;
  if p_kind = 'telegram' and p_url !~ '^https://t\.me/(\+[A-Za-z0-9_-]+|joinchat/[A-Za-z0-9_-]+|[A-Za-z0-9_]{5,})$' then
    raise exception 'a Telegram invite link looks like https://t.me/+…';
  end if;

  if p_id is null then
    insert into invite_links (country, kind, label, url, active, created_by)
    values (p_country::country_t, p_kind, btrim(p_label), btrim(p_url), p_active, auth.uid())
    returning id into v_id;
  else
    update invite_links set label = btrim(p_label), url = btrim(p_url), active = p_active
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'unknown link'; end if;
  end if;
  perform audit_log('invite_link_saved', 'invite_link', v_id::text, null,
                    p_country || ' ' || p_kind || ' ' || btrim(p_label), null);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function fn_admin_set_invite_link(text,text,text,text,boolean,uuid) from public, anon;
grant execute on function fn_admin_set_invite_link(text,text,text,text,boolean,uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. WHAT THE EVENTS SCREEN NEEDS: the links for one country, plus which of
--    the given leads were already invited (so the buttons can say so).
-- ------------------------------------------------------------
create or replace function fn_invite_context(p_country text, p_leads bigint[] default '{}')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if my_role() <> 'master_admin' and p_country is distinct from my_country()::text then
    raise exception 'that country is outside your scope';
  end if;
  return jsonb_build_object(
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'label', l.label,
                                          'url', l.url, 'active', l.active)
             order by l.kind, l.label)
      from invite_links l where l.country::text = p_country), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object('lead_id', g.lead_id, 'invited_at', g.invited_at))
      from group_invite_log g where g.lead_id = any(p_leads)), '[]'::jsonb));
end $$;
revoke all on function fn_invite_context(text,bigint[]) from public, anon;
grant execute on function fn_invite_context(text,bigint[]) to authenticated;

-- record the moment the admin opens the prefilled message. Idempotent: a second
-- invite refreshes the timestamp rather than erroring, and is audited each time.
create or replace function fn_log_group_invite(p_lead bigint, p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_links jsonb;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if not exists (select 1 from m4u_leads where id = p_lead) then raise exception 'unknown lead'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'url', url)), '[]'::jsonb)
    into v_links from invite_links where country::text = p_country and active;
  if v_links = '[]'::jsonb then raise exception 'no active invite links for %', p_country; end if;

  insert into group_invite_log (lead_id, country, invited_by, links_sent)
  values (p_lead, p_country::country_t, auth.uid(), v_links)
  on conflict (lead_id) do update
    set invited_at = now(), invited_by = auth.uid(), links_sent = excluded.links_sent;
  perform audit_log('group_invite_sent', 'lead', p_lead::text, null, p_country,
                    'group invite message opened in WhatsApp');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function fn_log_group_invite(bigint,text) from public, anon;
grant execute on function fn_log_group_invite(bigint,text) to authenticated;

-- ------------------------------------------------------------
-- 5. VERIFY
-- ------------------------------------------------------------
select 'invite tables' as check, table_name from information_schema.tables
 where table_name in ('invite_links', 'group_invite_log') order by table_name;
select 'links configured (expect 0 until the admin adds them)' as check, count(*) from invite_links;
