-- ============================================================
-- 014_m4u_engine.sql — Marketing4U caller ENGINE (spec: docs/SPEC-CALLER-M4U.md)
-- Tables already exist from schema.sql (m4u_leads, m4u_grants, …). This adds:
--   · config + disposition rules AS DATA (admin-editable, nothing hardcoded)
--   · pull-based assignment with FOR UPDATE SKIP LOCKED  (invariant #1)
--   · the DispositionEngine, ownership-gated, append-only attempts
--   · expiry sweep with pause-on-expiry, and reactivate
-- English keys are load-bearing (engine joins, GHL tags, reports) — invariant #2.
-- updated_at = queue position; every touch sends the lead to the back — invariant #3.
-- ============================================================

-- ---------- config (per country) ----------
create table if not exists m4u_config (
  country country_t primary key,
  expiry_minutes int not null default 25,
  no_answer_cap int not null default 10,
  auto_reactivate boolean not null default true,
  remind_seconds int not null default 120,       -- warn when hold has ≤ this left
  updated_at timestamptz default now()
);
insert into m4u_config (country) values ('MY'), ('ID') on conflict do nothing;

-- ---------- disposition rules as DATA ----------
create table if not exists m4u_dispositions (
  country country_t not null,
  project_type text not null check (project_type in ('property','recruitment','other')),
  key text not null,                    -- ENGLISH key, load-bearing
  label text not null,                  -- label written onto the lead + GHL tag
  outcome text not null check (outcome in ('lock','pool','reserve','dead')),
  cooldown_minutes int not null default 0,
  reserve_hours int not null default 0,
  counts_attempt boolean not null default false,   -- No Answer only
  is_win boolean not null default false,
  bop_type text,                        -- online|physical (recruitment wins)
  hint text,
  sort_order int not null default 100,
  active boolean not null default true,
  primary key (country, project_type, key)
);

-- Property projects (spec §4)
insert into m4u_dispositions (country, project_type, key, label, outcome, cooldown_minutes, reserve_hours, counts_attempt, is_win, hint, sort_order)
select c, 'property', k, l, o, cd, rh, ca, w, h, s from (values
  ('Booked','Booked','lock',0,0,false,true,'locks this lead to you forever',10),
  ('No Answer','No Answer','pool',20,0,true,false,'back to queue · 20 min',20),
  ('Call Back Later','Callback','reserve',0,8,false,false,'reserved for you · 8 h',30),
  ('Interested Not Ready','Warm','pool',2880,0,false,false,'warm · returns in 48 h',40),
  ('Not Interested','Not Interested','pool',2880,0,false,false,'cooldown 48 h',50),
  ('Wrong Number','Wrong Number','pool',4320,0,false,false,'cooldown 72 h',60)
) as t(k,l,o,cd,rh,ca,w,h,s), (values ('MY'::country_t),('ID'::country_t)) as x(c)
on conflict do nothing;

-- Recruitment projects (spec §4)
insert into m4u_dispositions (country, project_type, key, label, outcome, cooldown_minutes, reserve_hours, counts_attempt, is_win, bop_type, hint, sort_order)
select c, 'recruitment', k, l, o, cd, rh, false, w, bt, h, s from (values
  ('Attend Online BOP','BOP Online','lock',0,0,true,'online','book a session · locks to you',10),
  ('Attend Physical BOP','BOP Physical','lock',0,0,true,'physical','book a session · locks to you',20),
  ('Link Referral Sent','Referral Sent','reserve',0,72,false,null,'reserved for you · 72 h',30),
  ('Call Back Later','Callback','reserve',0,8,false,null,'reserved for you · 8 h',40),
  ('Working Full-Time','Working Full-Time','pool',43200,0,false,null,'cooldown 30 days',50),
  ('Wrong Number','Wrong Number','dead',0,0,false,null,'removed from queue',60),
  ('Not a Real Number','Not a Real Number','dead',0,0,false,null,'removed from queue',70)
) as t(k,l,o,cd,rh,w,bt,h,s), (values ('MY'::country_t),('ID'::country_t)) as x(c)
on conflict do nothing;

alter table m4u_config enable row level security;
alter table m4u_dispositions enable row level security;
create policy r_m4u_config on m4u_config for select using (true);
create policy w_m4u_config on m4u_config for all using (is_admin()) with check (is_admin());
create policy r_m4u_disp on m4u_dispositions for select using (true);
create policy w_m4u_disp on m4u_dispositions for all using (is_admin()) with check (is_admin());

-- ============================================================
-- ASSIGNMENT — pull based, one live lead at a time (spec §5)
-- ============================================================
create or replace function m4u_next_lead()
returns table (lead_id bigint, seconds_left int, resumed boolean)
language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_country country_t; v_status agent_status_t; v_exp int; v_lead bigint; v_held bigint;
begin
  v_me := auth.uid();
  if v_me is null then raise exception 'auth required'; end if;
  select country, status into v_country, v_status from profiles where id = v_me;
  if v_status = 'paused' then raise exception 'paused'; end if;
  if v_status <> 'active' then raise exception 'account not active'; end if;
  select expiry_minutes into v_exp from m4u_config where country = v_country;

  -- already holding one? re-serve it (spec: one live lead at a time)
  select id into v_held from m4u_leads
  where assigned_to = v_me and status = 'assigned' and assigned_until > now() limit 1;
  if v_held is not null then
    return query select v_held, greatest(0, extract(epoch from (
      (select assigned_until from m4u_leads where id = v_held) - now()))::int), true;
    return;
  end if;

  -- pick the oldest eligible lead; SKIP LOCKED so concurrent callers never collide
  select l.id into v_lead
  from m4u_leads l
  where l.country = v_country
    and l.status = 'pool'
    and (l.cooldown_until is null or l.cooldown_until <= now())
    and (l.reserved_for is null or l.reserved_for = v_me or l.reserved_until <= now())
    and (
      exists (select 1 from m4u_grants g where g.agent_id = v_me
              and g.property_id = l.property_id and g.approved and g.active)
      or exists (select 1 from m4u_lead_props lp join m4u_grants g2
                 on g2.property_id = lp.property_id and g2.agent_id = v_me
                 where lp.lead_id = l.id and g2.approved and g2.active)
    )
  order by l.updated_at asc
  limit 1
  for update of l skip locked;

  if v_lead is null then return; end if;

  update m4u_leads set status = 'assigned', assigned_to = v_me,
    assigned_until = now() + make_interval(mins => v_exp)
  where id = v_lead;
  -- NOTE: deliberately does NOT touch updated_at — holding is not a disposition,
  -- so an expired hold returns the lead to its original queue position.
  return query select v_lead, v_exp * 60, false;
end $$;

-- ============================================================
-- DISPOSITION ENGINE (spec §4) — the core
-- ============================================================
create or replace function m4u_disposition(
  p_lead bigint, p_key text, p_note text default null, p_bop_session bigint default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid; v_country country_t; v_lead m4u_leads; v_type text; v_rule m4u_dispositions;
  v_cap int; v_attempt int; v_label text; v_status lead_status_t; v_dead boolean := false;
begin
  v_me := auth.uid();
  if v_me is null then raise exception 'auth required'; end if;

  select * into v_lead from m4u_leads where id = p_lead for update;   -- row lock
  if v_lead.id is null then raise exception 'lead not found'; end if;

  -- ownership gate — 409 in the API; UI fetches the next lead
  if v_lead.assigned_to <> v_me or v_lead.status <> 'assigned' then
    raise exception 'conflict: lead no longer yours' using errcode = '55000';
  end if;

  select country into v_country from profiles where id = v_me;
  select coalesce(p.type, 'property') into v_type from m4u_properties p where p.id = v_lead.property_id;
  select * into v_rule from m4u_dispositions
   where country = v_country and project_type = v_type and key = p_key and active;
  if v_rule.key is null then raise exception 'unknown disposition % for %', p_key, v_type; end if;

  select no_answer_cap into v_cap from m4u_config where country = v_country;
  v_attempt := v_lead.attempt_count + case when v_rule.counts_attempt then 1 else 0 end;
  v_label := v_rule.label;
  v_status := 'pool';

  -- No-Answer cap → dead 'Unreachable'
  if v_rule.counts_attempt and v_attempt >= v_cap then
    v_status := 'dead'; v_label := 'Unreachable'; v_dead := true;
  elsif v_rule.outcome = 'lock' then v_status := 'locked';
  elsif v_rule.outcome = 'dead' then v_status := 'dead'; v_dead := true;
  end if;

  -- reset every pointer, then apply the rule (spec §4)
  update m4u_leads set
    status = v_status,
    current_label = v_label,
    attempt_count = v_attempt,
    owner_agent_id = case when v_rule.outcome = 'lock' then v_me else owner_agent_id end,
    assigned_to = null,
    assigned_until = null,
    reserved_for = case when v_rule.outcome = 'reserve' then v_me else null end,
    reserved_until = case when v_rule.outcome = 'reserve'
                     then now() + make_interval(hours => v_rule.reserve_hours) else null end,
    -- reserve wins over cooldown (spec §4: Call Back Later has NO cooldown)
    cooldown_until = case when v_rule.outcome = 'reserve' or v_dead then null
                     when v_rule.cooldown_minutes > 0
                     then now() + make_interval(mins => v_rule.cooldown_minutes) else null end,
    ghl_sync_pending = true,               -- writeback owed; Worker reconciles
    ghl_pending_label = v_label,
    updated_at = now()                     -- back of the queue (invariant #3)
  where id = p_lead;

  insert into m4u_attempts (lead_id, agent_id, disposition, note, attempt_no)
  values (p_lead, v_me, p_key, p_note, v_attempt);

  -- recruitment wins: roster the lead onto a BOP session
  if v_rule.bop_type is not null and p_bop_session is not null then
    insert into bop_roster (session_id, lead_id, caller_id, attended, confirmed_at)
    values (p_bop_session, p_lead, v_me, 'pending', now())
    on conflict (session_id, lead_id) do update set caller_id = excluded.caller_id;
  end if;

  return jsonb_build_object(
    'status', v_status, 'label', v_label, 'attempt', v_attempt,
    'dead', v_dead, 'locked', v_status = 'locked',
    'bop_type', v_rule.bop_type, 'hint', v_rule.hint);
end $$;

-- ============================================================
-- EXPIRY SWEEP (spec §6) — lapsed holds return; holder is paused
-- ============================================================
create or replace function m4u_expire_holds()
returns int language plpgsql security definer set search_path = public as $$
declare v_freed int := 0; r record;
begin
  for r in
    select id, assigned_to from m4u_leads
    where status = 'assigned' and assigned_until <= now()
    for update skip locked
  loop
    -- lead returns to the pool UNCHANGED (keeps its queue position)
    update m4u_leads set status = 'pool', assigned_to = null, assigned_until = null
    where id = r.id;
    -- pause the holder (admins exempt) — the only enforcement in a pull system
    update profiles set status = 'paused'
    where id = r.assigned_to and status = 'active'
      and role not in ('master_admin','country_admin');
    v_freed := v_freed + 1;
  end loop;
  return v_freed;
end $$;

-- Agent asks to continue after a pause (AUTO_REACTIVATE)
create or replace function m4u_reactivate()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_auto boolean; v_country country_t;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select country into v_country from profiles where id = auth.uid();
  select auto_reactivate into v_auto from m4u_config where country = v_country;
  if not coalesce(v_auto, true) then return false; end if;
  update profiles set status = 'active' where id = auth.uid() and status = 'paused';
  return true;
end $$;

-- Release a held lead without dispositioning (agent closes the card)
create or replace function m4u_release(p_lead bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update m4u_leads set status = 'pool', assigned_to = null, assigned_until = null
  where id = p_lead and assigned_to = auth.uid() and status = 'assigned';
end $$;

grant execute on function m4u_next_lead() to authenticated;
grant execute on function m4u_disposition(bigint,text,text,bigint) to authenticated;
grant execute on function m4u_expire_holds() to authenticated;
grant execute on function m4u_reactivate() to authenticated;
grant execute on function m4u_release(bigint) to authenticated;
