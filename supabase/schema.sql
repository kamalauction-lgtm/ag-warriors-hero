-- ============================================================
-- AG WARRIORS SUPER-APP — Phase 0 schema (hero.iqiaggroup.com)
-- Country-aware: every business row carries country MY|ID.
-- Sources: BLUEPRINT.md · SPEC-CALLER-M4U.md · SPEC-INCOME-SUBSALE.md
-- ============================================================

create type country_t as enum ('MY','ID');
create type app_role_t as enum ('agent','leader','country_admin','master_admin');
create type career_rank_t as enum ('REN','L','TL','HOT','TM','VP');           -- career track (REN→VP)
create type primary_pos_t as enum ('AGENT','L','TL','HOT','TM','VP','GVP');   -- income position (→GVP)
create type lead_status_t as enum ('pool','assigned','locked','dead');
create type agent_status_t as enum ('pending','active','paused');
create type deal_stage_t as enum ('calling','follow_up','appointment','booking','loan','closed');
create type task_status_t as enum ('pending','done','notdone','postponed');

-- ---------- PEOPLE (three independent rankings + elite overlay) ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  phone text unique not null,                -- normalized +60…/+62…
  email text unique,
  country country_t not null default 'MY',   -- editable by admin; phone prefix only pre-fills
  role app_role_t not null default 'agent',
  status agent_status_t not null default 'pending',
  career_rank career_rank_t not null default 'REN',
  subsale_rank text not null default 'TROOPER',       -- payout tier (ladder in income_cfg)
  primary_pos primary_pos_t not null default 'AGENT', -- income position (L…GVP)
  is_elite boolean not null default false,            -- Elit Tim: member = CAPTAIN
  is_commander boolean not null default false,        -- exactly ONE (Kamal)
  leader_id uuid references profiles(id),
  recruited_by uuid references profiles(id),          -- RGR payee chain (L1)
  language text not null default 'en',                -- en|bm|id
  photo_url text,
  module_admin text[] not null default '{}',          -- delegated: e.g. {caller,rewards}
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- COUNTRY SETTINGS / BRAND / INCOME CONFIG ----------
create table country_settings (
  country country_t primary key,
  currency text not null, tax_name text not null, tax_rate numeric not null,
  default_language text not null, phone_prefix text not null, timezone text not null,
  ghl_location_id text, ghl_token_enc text,          -- same token kept, stored encrypted
  m4u_secret text, updated_at timestamptz default now()
);
insert into country_settings values
 ('MY','RM','SST',0.08,'en','+60','Asia/Kuala_Lumpur',null,null,null,now()),
 ('ID','Rp','PPN',0.11,'id','+62','Asia/Jakarta',null,null,null,now());

create table brand_assets (                            -- Brand Studio (versioned)
  id bigint generated always as identity primary key,
  country text not null,                               -- MY|ID|GLOBAL
  slot text not null,                                  -- logo_iqi|logo_ag|mascot_home|mascot_login|shield
  version int not null default 1,
  storage_path text not null,                          -- supabase storage: brand/<country>/<slot>/v<N>
  active boolean not null default true,
  uploaded_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table income_cfg (                              -- whole engine config as JSONB per country
  country country_t primary key,
  subsale jsonb not null,      -- baseRate, ladder[8], agencyDefault, agencyMax(3|6), ovMinRate, ovCap, rgrHighMin, rgrStd, rgrHigh, combinedCap, properties[]
  my_primary jsonb,            -- MY §E projects [{name,price,ren,vp,hot,hotOn,tlOn,lOn,rgrOn,rgrPct,rgrFrom,rgrTo,tnc,appear[]}]
  id_primary jsonb,            -- ID pool: {slices{AGENT..IQI_HQ}, projects[{name,price,devPct,agentPct,appear[]}]}
  updated_by uuid references profiles(id),
  updated_at timestamptz default now()
);

create table career_ladder (                           -- per-country requirements (from career_ladder.json)
  country country_t not null, code career_rank_t not null,
  ord int not null, name text not null, color text not null,
  personal_sales numeric, group_sales numeric, group_note text,
  downline_req text, requires_approval boolean default false, focus text,
  primary key (country, code)
);

-- ---------- SALES PIPELINE (AG Playbook) ----------
create table deals (
  id uuid primary key default gen_random_uuid(),
  country country_t not null,
  agent_id uuid not null references profiles(id),
  client_name text not null, client_phone text,
  project text, unit_no text,
  price numeric not null default 0, commission numeric not null default 0,
  stage deal_stage_t not null default 'calling',
  stage_changed_at timestamptz default now(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on deals (country, stage, updated_at);

-- ---------- TIMEBOX (M5) ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references profiles(id),
  day date not null, label text not null, slot time,
  status task_status_t not null default 'pending',
  reason text, postponed_to date, carried boolean default false,
  created_at timestamptz default now()
);
create index on tasks (agent_id, day);
create table points (
  agent_id uuid references profiles(id), day date, pts int not null default 0,
  primary key (agent_id, day)
);

-- ---------- ELIT TIM (pods · balang · pod leads · KPI) ----------
create table pods (
  id uuid primary key default gen_random_uuid(),
  country country_t not null, name text not null,
  captain_id uuid not null references profiles(id),
  created_at timestamptz default now()
);
create table pod_members (
  pod_id uuid references pods(id) on delete cascade,
  agent_id uuid references profiles(id) on delete cascade,
  segment text,                                        -- hijau|kuning|merah
  primary key (pod_id, agent_id)
);
create table pod_leads (                               -- 5-minute rule queue
  id uuid primary key default gen_random_uuid(),
  pod_id uuid references pods(id), country country_t not null,
  name text, phone text, note text,
  assigned_to uuid references profiles(id),
  status text not null default 'new',                  -- new|called|booked|callback|noanswer|notinterested|pool
  funded_by text not null default 'commander',         -- commander|own
  callback_until timestamptz, reminded boolean default false,
  booking jsonb,                                       -- {projectId,price,renPct,commGross,closerRM,adsFund,funderRM,poolIn,rgrPct,rgrRM,rgrTo} 60/10/15/15
  m4u_at timestamptz, forwarded_to_m4u boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table kpi_checks (
  agent_id uuid references profiles(id), key text, done boolean default true,
  primary key (agent_id, key)                          -- key = period:periodKey:itemId
);

-- ---------- CALLER / MARKETING4U (SPEC-CALLER-M4U §1) ----------
create table m4u_properties (
  id bigint generated always as identity primary key,
  country country_t not null, name text not null,
  ad_source text, type text not null default 'property',        -- property|recruitment|other
  description text, created_at timestamptz default now()
);
create table m4u_grants (                              -- approved+active gate
  agent_id uuid references profiles(id) on delete cascade,
  property_id bigint references m4u_properties(id) on delete cascade,
  approved boolean default false, active boolean default true,
  requested_at timestamptz, approved_at timestamptz,
  primary key (agent_id, property_id)
);
create table m4u_leads (
  id bigint generated always as identity primary key,
  country country_t not null,
  ghl_contact_id text unique, ghl_opportunity_id text,
  property_id bigint references m4u_properties(id),
  phone text, phone_norm text not null, name text,
  custom_fields jsonb, current_label text not null default 'New',
  attempt_count int not null default 0,
  status lead_status_t not null default 'pool',
  owner_agent_id uuid references profiles(id),
  reserved_for uuid references profiles(id), reserved_until timestamptz,
  cooldown_until timestamptz,
  assigned_to uuid references profiles(id), assigned_until timestamptz,
  ghl_sync_pending boolean default false, ghl_pending_label text,
  received_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index m4u_pick on m4u_leads (status, property_id, cooldown_until, updated_at);
create unique index m4u_phone on m4u_leads (country, phone_norm);
create table m4u_lead_props (
  lead_id bigint references m4u_leads(id) on delete cascade,
  property_id bigint references m4u_properties(id) on delete cascade,
  added_while_locked boolean default false, added_at timestamptz default now(),
  primary key (lead_id, property_id)
);
create table m4u_attempts (
  id bigint generated always as identity primary key,
  lead_id bigint references m4u_leads(id) on delete cascade,
  agent_id uuid references profiles(id),
  disposition text not null, note text, attempt_no int not null,
  called_at timestamptz default now()
);
create table m4u_pipeline_map (
  ghl_pipeline_id text primary key, ghl_pipeline_name text,
  country country_t not null, property_id bigint references m4u_properties(id)
);
create table m4u_field_settings (
  country country_t not null, field_key text not null,
  label text not null, visible_to_agent boolean default true,
  aliases text, sort_order int default 100,
  primary key (country, field_key)
);
create table m4u_webhook_log (
  id bigint generated always as identity primary key,
  country country_t, phone_norm text, lead_id bigint, result text,
  raw_json jsonb, received_at timestamptz default now()
);
create table bop_sessions (
  id bigint generated always as identity primary key,
  country country_t not null, type text not null,      -- online|physical
  title text not null, starts_at timestamptz not null,
  link text, location text, map_url text, notes text,
  active boolean default true, created_by uuid references profiles(id)
);
create table bop_roster (
  session_id bigint references bop_sessions(id) on delete cascade,
  lead_id bigint references m4u_leads(id) on delete cascade,
  caller_id uuid references profiles(id),
  attended text default 'pending',                     -- pending|attended|no_show
  joined boolean default false, joined_at timestamptz, confirmed_at timestamptz,
  primary key (session_id, lead_id)
);
create table m4u_notes (                               -- admin↔agent Q&A
  id bigint generated always as identity primary key,
  lead_id bigint references m4u_leads(id) on delete cascade,
  parent_id bigint, author_id uuid references profiles(id), author_role text,
  target_agent_id uuid references profiles(id), bucket_label text,
  body text not null, requires_response boolean default false,
  resolved_at timestamptz, created_at timestamptz default now()
);
create table quotes (
  id bigint generated always as identity primary key,
  country country_t not null, body text not null, author text,
  active boolean default true
);

-- ---------- CONTENT / REWARDS / BOOTHS / NOTIFICATIONS ----------
create table rewards (
  id uuid primary key default gen_random_uuid(),
  country country_t not null, title text not null, tier text, category text,
  target_label text, poster_path text, tnc_path text,
  active boolean default true, sort int default 0, data jsonb
);
create table booths (
  id uuid primary key default gen_random_uuid(),
  country country_t not null, title text not null, location text,
  date_start date, date_end date, poster_path text,
  shifts jsonb not null default '[]'                   -- [{id,date,shift,label,headcount,registered[]}]
);
create table notifications (
  id bigint generated always as identity primary key,
  to_agent uuid not null references profiles(id),
  type text, title text, body text, link text,
  read boolean default false, created_at timestamptz default now()
);
create table announcements (
  id uuid primary key default gen_random_uuid(),
  country text not null,                               -- MY|ID|ALL
  title text not null, body text, category text,
  created_by uuid references profiles(id), created_at timestamptz default now()
);

-- ============================================================
-- RLS — country + role isolation (agents: own country + own rows)
-- ============================================================
alter table profiles enable row level security;
alter table deals enable row level security;
alter table tasks enable row level security;
alter table m4u_leads enable row level security;
alter table pod_leads enable row level security;
alter table notifications enable row level security;
alter table rewards enable row level security;
alter table announcements enable row level security;

create or replace function my_country() returns country_t language sql stable as
  $$ select country from profiles where id = auth.uid() $$;
create or replace function my_role() returns app_role_t language sql stable as
  $$ select role from profiles where id = auth.uid() $$;
create or replace function is_admin() returns boolean language sql stable as
  $$ select my_role() in ('country_admin','master_admin') $$;

-- profiles: read own country; edit own row; admins edit all in scope
create policy p_profiles_read on profiles for select using
  (country = my_country() or my_role() = 'master_admin');
create policy p_profiles_self on profiles for update using (id = auth.uid());
create policy p_profiles_admin on profiles for all using
  (is_admin() and (country = my_country() or my_role() = 'master_admin'));

-- deals: agent own; leader their team; admin country
create policy p_deals on deals for all using (
  agent_id = auth.uid()
  or (my_role() = 'leader' and agent_id in (select id from profiles where leader_id = auth.uid()))
  or (is_admin() and (country = my_country() or my_role() = 'master_admin'))
);

create policy p_tasks on tasks for all using
  (agent_id = auth.uid() or is_admin()
   or (my_role() = 'leader' and agent_id in (select id from profiles where leader_id = auth.uid())));

create policy p_notif on notifications for all using (to_agent = auth.uid() or is_admin());
create policy p_rewards on rewards for select using (country = my_country() or is_admin());
create policy p_ann on announcements for select using
  (country = 'ALL' or country = my_country()::text or is_admin());

-- m4u leads / pod leads: assignee, owner, reserved-for, or admin (writes via Edge Functions
-- with service role — the engine's row-lock transactions live server-side)
create policy p_m4u on m4u_leads for select using (
  assigned_to = auth.uid() or owner_agent_id = auth.uid()
  or reserved_for = auth.uid()
  or (is_admin() and (country = my_country() or my_role() = 'master_admin'))
);
create policy p_podleads on pod_leads for select using (
  assigned_to = auth.uid() or is_admin()
  or pod_id in (select id from pods where captain_id = auth.uid())
);

-- config tables: readable by all logged-in, writable by admins only
alter table country_settings enable row level security;
alter table income_cfg enable row level security;
alter table career_ladder enable row level security;
alter table brand_assets enable row level security;
create policy p_cs_r on country_settings for select using (auth.uid() is not null);
create policy p_cs_w on country_settings for all using (is_admin());
create policy p_ic_r on income_cfg for select using (auth.uid() is not null);
create policy p_ic_w on income_cfg for all using (is_admin());
create policy p_cl_r on career_ladder for select using (auth.uid() is not null);
create policy p_cl_w on career_ladder for all using (is_admin());
create policy p_ba_r on brand_assets for select using (true);
create policy p_ba_w on brand_assets for all using (is_admin());
