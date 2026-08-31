-- ============================================================
-- 095_poster_delivery.sql — the Win Poster becomes a real publishing tool.
-- ADDITIVE.
--
-- WHAT THIS REPLACES
--   The poster studio has always LOOKED like it published. The UI says
--   "✦ AI wishes", but genWishes() picked from three hard-coded strings per
--   language and deal type and substituted {a}/{pod}/{proj} — no model, no API
--   call, which is why leaders saw the same wording every time. The old app's
--   buildPayload() emitted route: {telegram_group: 'TG_MY_GROUP_ID',
--   whatsapp_via_ghl: 'GHL_MY_broadcast'} — placeholder strings marked
--   "Phase 2 wiring, built but never displayed". Nothing was ever sent.
--
--   Captions now come from Gemini (worker /poster/caption, falling back to the
--   old lines when the model is unavailable) and Telegram delivery is real
--   (worker /poster/send). WhatsApp stays the phone's share sheet: GHL's API
--   cannot post into WhatsApp GROUPS, only to individual contacts, so a
--   "WhatsApp group broadcast" would have been a promise we could not keep.
--
-- WHAT IS DELIBERATELY NOT HERE
--   No bot token. The Telegram bot token is a Worker secret, never a table
--   column. This table holds only chat ids, which are not credentials.
--
-- ROLLBACK: drop the three tables and the functions; nothing else references them.
-- ============================================================

-- ------------------------------------------------------------
-- 1. WHERE A POSTER MAY BE SENT
--    One row per destination. Country-scoped like everything else.
-- ------------------------------------------------------------
create table if not exists poster_channels (
  id uuid primary key default gen_random_uuid(),
  country country_t not null,
  kind text not null default 'telegram' check (kind in ('telegram')),
  label text not null,                       -- what a leader sees: "AG Warriors MY"
  chat_id text not null,                     -- Telegram chat id, e.g. -1001234567890
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (country, kind, chat_id)
);

-- ------------------------------------------------------------
-- 2. WHAT WAS ACTUALLY SENT
--    A poster announces a real closing to a whole team. Every send is recorded
--    with who sent it and what the caption said, so a wrong one can be traced.
-- ------------------------------------------------------------
create table if not exists poster_posts (
  id uuid primary key default gen_random_uuid(),
  country country_t not null,               -- the country of the CHANNEL it went to
  -- The country the POSTER was branded for (its logos and caption language).
  -- Normally identical to `country`: a leader only ever sees their own group.
  -- A master_admin sees both groups, so the two can differ — record it, so a
  -- MY-branded poster landing in the ID group is visible afterwards, not silent.
  nation text,
  channel_id uuid references poster_channels(id),
  deal_type text,
  agent_name text,
  pod text,
  project text,
  caption text not null,
  caption_source text not null default 'template'
    check (caption_source in ('ai', 'template', 'edited')),
  storage_path text,                         -- the exact image that went out
  provider_message_id text,                  -- Telegram message_id, for reference
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_by uuid references profiles(id),
  sent_at timestamptz not null default now()
);
create index if not exists poster_posts_recent on poster_posts (country, sent_at desc);

-- the image that was published, kept private (leaders and admins read via RPC)
insert into storage.buckets (id, name, public, file_size_limit)
values ('posters', 'posters', false, 8388608)
on conflict (id) do nothing;

alter table poster_channels enable row level security;
alter table poster_posts enable row level security;

-- ------------------------------------------------------------
-- 3. WHO MAY PUBLISH
--    The same leadership tier the studio itself is gated to (App.tsx: admin,
--    leader, elite, or any career rank above REN). Defined ONCE here so the
--    server does not trust the client's idea of who is a leader.
-- ------------------------------------------------------------
create or replace function can_publish_poster()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id = auth.uid() and p.status = 'active'
       and (p.role in ('master_admin', 'country_admin', 'leader')
            or coalesce(p.is_elite, false)
            or coalesce(p.career_rank, 'REN') <> 'REN'));
$$;
revoke all on function can_publish_poster() from public, anon;
grant execute on function can_publish_poster() to authenticated;

drop policy if exists r_poster_channels on poster_channels;
create policy r_poster_channels on poster_channels for select
  using (can_publish_poster()
         and (country::text = my_country()::text or my_role() = 'master_admin'));

drop policy if exists r_poster_posts on poster_posts;
create policy r_poster_posts on poster_posts for select
  using (can_publish_poster()
         and (country::text = my_country()::text or my_role() = 'master_admin'));

-- writes are server-side only (the Worker holds the bot token and the service key)
revoke insert, update, delete on poster_channels, poster_posts from authenticated, anon;

-- ------------------------------------------------------------
-- 4. ADMIN: manage destinations
-- ------------------------------------------------------------
create or replace function fn_admin_set_poster_channel(
  p_country text, p_label text, p_chat_id text, p_active boolean default true, p_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  if my_role() <> 'master_admin' and p_country is distinct from my_country()::text then
    raise exception 'that country is outside your scope';
  end if;
  if btrim(coalesce(p_label, '')) = '' or btrim(coalesce(p_chat_id, '')) = '' then
    raise exception 'label and chat id are both required';
  end if;
  -- a Telegram group id is negative and numeric; catching it here saves a
  -- leader from a silent "chat not found" at send time
  if p_chat_id !~ '^-?\d+$' and p_chat_id !~ '^@[A-Za-z0-9_]{5,}$' then
    raise exception 'chat id must be numeric (e.g. -1001234567890) or a public @username';
  end if;

  if p_id is null then
    insert into poster_channels (country, kind, label, chat_id, active, created_by)
    values (p_country::country_t, 'telegram', btrim(p_label), btrim(p_chat_id), p_active, auth.uid())
    on conflict (country, kind, chat_id) do update
      set label = excluded.label, active = excluded.active
    returning id into v_id;
  else
    update poster_channels set label = btrim(p_label), chat_id = btrim(p_chat_id), active = p_active
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'unknown channel'; end if;
  end if;

  perform audit_log('poster_channel_saved', 'poster_channel', v_id::text, null,
                    p_country || ' ' || btrim(p_label), null);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function fn_admin_set_poster_channel(text,text,text,boolean,uuid) from public, anon;
grant execute on function fn_admin_set_poster_channel(text,text,text,boolean,uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. WHAT THE STUDIO NEEDS ON OPEN
--    Destinations the caller may actually publish to, plus their own recent
--    sends so a leader can see what already went out.
-- ------------------------------------------------------------
create or replace function fn_poster_context()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_country text;
begin
  if not can_publish_poster() then raise exception 'not authorised'; end if;
  select country::text into v_country from profiles where id = auth.uid();
  return jsonb_build_object(
    'can_publish', true,
    'country', v_country,
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'country', c.country)
             order by c.country, c.label)
      from poster_channels c
     where c.active
       and (c.country::text = v_country or my_role() = 'master_admin')), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(x order by x->>'sent_at' desc) from (
        select jsonb_build_object('agent_name', p.agent_name, 'deal_type', p.deal_type,
                 'caption', left(p.caption, 120), 'status', p.status,
                 'sent_at', p.sent_at, 'by', pr.name) as x
          from poster_posts p left join profiles pr on pr.id = p.sent_by
         where (p.country::text = v_country or my_role() = 'master_admin')
         order by p.sent_at desc limit 10) q), '[]'::jsonb));
end $$;
revoke all on function fn_poster_context() from public, anon;
grant execute on function fn_poster_context() to authenticated;

-- ------------------------------------------------------------
-- 6. VERIFY
-- ------------------------------------------------------------
select 'poster tables' as check, table_name from information_schema.tables
 where table_name in ('poster_channels', 'poster_posts') order by table_name;
select 'posters bucket' as check, id, public, file_size_limit from storage.buckets where id = 'posters';
select 'channels configured (expect 0 until the bot is set up)' as check, count(*) from poster_channels;
