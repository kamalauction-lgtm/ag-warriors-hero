-- ============================================================
-- 099_komunikasi.sql — Command Radio in Hero. ADDITIVE.
--
-- The one ren module with no Hero equivalent: team messaging. This is the lean
-- v1 from the migration plan — country War Rooms, per-pod Squad channels, and
-- direct messages. Membership is COMPUTED from what already exists (your
-- country, your Elite pods) so there is no membership table to keep in sync;
-- only DMs store explicit members.
--
-- Push: a DM notifies the recipient through the existing notifications→cron
-- path (064). Channel messages raise an unread badge but do NOT push — pushing
-- every warroom message to a whole country would be the spam this app avoids.
-- @mention push is a deliberate phase-2, noted not faked.
--
-- ROLLBACK: drop the four tables + functions; nothing else references them.
-- ============================================================

create table if not exists comms_channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('warroom', 'squad', 'dm')),
  country country_t,                          -- warroom + squad
  pod_id uuid references pods(id) on delete cascade,   -- squad only
  title text,
  created_at timestamptz not null default now()
);
create unique index if not exists comms_one_warroom on comms_channels (country) where kind = 'warroom';
create unique index if not exists comms_one_squad on comms_channels (pod_id) where kind = 'squad';

create table if not exists comms_members (        -- DMs only; channels are computed
  channel_id uuid not null references comms_channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (channel_id, user_id)
);

create table if not exists comms_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references comms_channels(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comms_msg_channel on comms_messages (channel_id, created_at desc);

create table if not exists comms_reads (
  channel_id uuid not null references comms_channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- ------------------------------------------------------------
-- ACCESS — the single source of truth for who is in a channel.
-- ------------------------------------------------------------
create or replace function comms_can_access(p_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from comms_channels c where c.id = p_channel and (
      (c.kind = 'warroom' and c.country::text = my_country()::text)
      or (c.kind = 'squad' and exists (
            select 1 from pod_members pm where pm.pod_id = c.pod_id and pm.agent_id = auth.uid()))
      or (c.kind = 'dm' and exists (
            select 1 from comms_members m where m.channel_id = c.id and m.user_id = auth.uid()))));
$$;
grant execute on function comms_can_access(uuid) to authenticated;

alter table comms_channels enable row level security;
alter table comms_members enable row level security;
alter table comms_messages enable row level security;
alter table comms_reads enable row level security;

-- messages: read/write only where you belong; you can only send AS yourself
drop policy if exists r_comms_msg on comms_messages;
create policy r_comms_msg on comms_messages for select using (comms_can_access(channel_id));
drop policy if exists i_comms_msg on comms_messages;
create policy i_comms_msg on comms_messages for insert
  with check (comms_can_access(channel_id) and sender_id = auth.uid());
-- reads: your own marker only
drop policy if exists rw_comms_reads on comms_reads;
create policy rw_comms_reads on comms_reads for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- channels + members are read through RPCs; no direct client writes
drop policy if exists r_comms_ch on comms_channels;
create policy r_comms_ch on comms_channels for select using (comms_can_access(id));
drop policy if exists r_comms_mem on comms_members;
create policy r_comms_mem on comms_members for select using (user_id = auth.uid());

-- ------------------------------------------------------------
-- OVERVIEW — the channel list with last message + unread count. Ensures the
-- caller's warroom and squad channels exist (lazily created, idempotent).
-- ------------------------------------------------------------
create or replace function fn_comms_overview()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_country text;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select country::text into v_country from profiles where id = v_me;

  -- lazily materialise the country War Room
  insert into comms_channels (kind, country, title)
  values ('warroom', v_country::country_t, 'War Room ' || v_country)
  on conflict (country) where kind = 'warroom' do nothing;

  -- and a Squad channel for every pod the caller belongs to
  insert into comms_channels (kind, country, pod_id, title)
  select 'squad', p.country, p.id, 'Squad · ' || p.name
  from pods p join pod_members pm on pm.pod_id = p.id
  where pm.agent_id = v_me
  on conflict (pod_id) where kind = 'squad' do nothing;

  return coalesce((
    select jsonb_agg(x order by (x->>'last_at') desc nulls last) from (
      select jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'title',
          case when c.kind = 'dm' then (
                 select p.name from comms_members m2 join profiles p on p.id = m2.user_id
                  where m2.channel_id = c.id and m2.user_id <> v_me limit 1)
               else c.title end,
        'last_body', (select body from comms_messages m where m.channel_id = c.id
                       order by created_at desc limit 1),
        'last_at', (select created_at from comms_messages m where m.channel_id = c.id
                     order by created_at desc limit 1),
        'unread', (select count(*) from comms_messages m
                    where m.channel_id = c.id and m.sender_id <> v_me
                      and m.created_at > coalesce(
                        (select last_read_at from comms_reads r where r.channel_id = c.id and r.user_id = v_me),
                        'epoch'::timestamptz))) as x
      from comms_channels c
      where comms_can_access(c.id)) q), '[]'::jsonb);
end $$;
grant execute on function fn_comms_overview() to authenticated;

-- ------------------------------------------------------------
-- SEND — one message, with a DM push to the other party.
-- ------------------------------------------------------------
create or replace function fn_comms_send(p_channel uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid; v_kind text; v_other uuid; v_myname text;
begin
  if v_me is null then raise exception 'auth required'; end if;
  if not comms_can_access(p_channel) then raise exception 'not a member of this channel'; end if;
  if btrim(coalesce(p_body, '')) = '' then raise exception 'empty message'; end if;

  insert into comms_messages (channel_id, sender_id, body)
  values (p_channel, v_me, left(btrim(p_body), 4000)) returning id into v_id;
  -- the sender has, by definition, read up to their own message
  insert into comms_reads (channel_id, user_id, last_read_at) values (p_channel, v_me, now())
  on conflict (channel_id, user_id) do update set last_read_at = now();

  select kind into v_kind from comms_channels where id = p_channel;
  if v_kind = 'dm' then
    select user_id into v_other from comms_members
      where channel_id = p_channel and user_id <> v_me limit 1;
    select name into v_myname from profiles where id = v_me;
    if v_other is not null then
      insert into notifications (to_agent, type, title, body, link, pushed)
      values (v_other, 'comms_dm', v_myname, left(btrim(p_body), 120), '/komunikasi', false);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
grant execute on function fn_comms_send(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- START A DM — find-or-create the 1:1 channel with another person in scope.
-- ------------------------------------------------------------
create or replace function fn_comms_start_dm(p_other uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid; v_country text; v_ocountry text;
begin
  if v_me is null then raise exception 'auth required'; end if;
  if p_other = v_me then raise exception 'cannot DM yourself'; end if;
  select country::text into v_country from profiles where id = v_me;
  select country::text into v_ocountry from profiles where id = p_other;
  if v_ocountry is null then raise exception 'no such person'; end if;
  -- country-first: a DM stays within a country unless a master admin starts it
  if v_ocountry <> v_country and my_role() <> 'master_admin' then
    raise exception 'that person is in another country';
  end if;

  select c.id into v_id from comms_channels c
   where c.kind = 'dm'
     and exists (select 1 from comms_members m where m.channel_id = c.id and m.user_id = v_me)
     and exists (select 1 from comms_members m where m.channel_id = c.id and m.user_id = p_other)
   limit 1;
  if v_id is not null then return jsonb_build_object('ok', true, 'channel_id', v_id, 'existing', true); end if;

  insert into comms_channels (kind, title) values ('dm', 'Direct message') returning id into v_id;
  insert into comms_members (channel_id, user_id) values (v_id, v_me), (v_id, p_other);
  return jsonb_build_object('ok', true, 'channel_id', v_id, 'existing', false);
end $$;
grant execute on function fn_comms_start_dm(uuid) to authenticated;

-- ------------------------------------------------------------
-- MARK READ — clears the unread badge for one channel.
-- ------------------------------------------------------------
create or replace function fn_comms_mark_read(p_channel uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not comms_can_access(p_channel) then raise exception 'not a member'; end if;
  insert into comms_reads (channel_id, user_id, last_read_at) values (p_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = now();
end $$;
grant execute on function fn_comms_mark_read(uuid) to authenticated;

-- total unread across all my channels, for the nav badge
create or replace function fn_comms_unread_total()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(cnt), 0)::int from (
    select (select count(*) from comms_messages m
             where m.channel_id = c.id and m.sender_id <> auth.uid()
               and m.created_at > coalesce(
                 (select last_read_at from comms_reads r where r.channel_id = c.id and r.user_id = auth.uid()),
                 'epoch'::timestamptz)) as cnt
    from comms_channels c where comms_can_access(c.id)) q;
$$;
grant execute on function fn_comms_unread_total() to authenticated;

-- ------------------------------------------------------------
-- VERIFY
-- ------------------------------------------------------------
select 'comms tables' as check, table_name from information_schema.tables
 where table_name like 'comms_%' order by table_name;
