-- ============================================================
-- 025_talent_schema.sql — Hero Talent Compass (TestMe). ADDITIVE.
-- Spec: "02 BUILD - Hero Talent Compass TestMe Module.md"
--
-- Participants are NOT registered users. Access is by event code, and every
-- participant write goes through a SECURITY DEFINER RPC holding an unguessable
-- attempt token — the tables themselves grant nothing to anon (§17 isolation).
--
-- Deterministic scores live in their own tables that the AI path cannot write
-- to, so AI structurally cannot alter a score or ranking (§10).
-- ============================================================

-- pgcrypto gives us digest() and gen_random_bytes() for the resume tokens.
-- Supabase installs it into the `extensions` schema, so every function below
-- puts `extensions` on its search_path — without that, digest() will not resolve.
create extension if not exists pgcrypto with schema extensions;

-- ---------- content: versions, sections, questions ----------
create table talent_versions (
  id bigint generated always as identity primary key,
  code text unique not null,                    -- e.g. 'v1'
  name text not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

create table talent_sections (
  id bigint generated always as identity primary key,
  version_id bigint not null references talent_versions(id) on delete cascade,
  code text not null,                           -- A..F
  title jsonb not null,                         -- {"en":…,"ms-MY":…,"id-ID":…}
  intro jsonb,
  sort_order int not null default 0,
  unique (version_id, code)
);

create table talent_questions (
  id bigint generated always as identity primary key,
  section_id bigint not null references talent_sections(id) on delete cascade,
  code text not null,                           -- stable key, e.g. 'A1'
  kind text not null check (kind in ('scale5','choice','frequency','tradeoff','scenario','text')),
  stem jsonb not null,                          -- trilingual question text
  helper jsonb,
  dimension text,                               -- which dimension it feeds
  reverse_scored boolean not null default false,
  weight numeric not null default 1,
  randomise_options boolean not null default false,
  required boolean not null default true,
  max_length int,                               -- for 'text' items (§17)
  sort_order int not null default 0,
  unique (section_id, code)
);

-- One row per selectable answer. `contributes` lets a single choice feed several
-- scores, e.g. {"role.closer":2,"motivation.achievement":1}
create table talent_options (
  id bigint generated always as identity primary key,
  question_id bigint not null references talent_questions(id) on delete cascade,
  value int not null,
  label jsonb not null,
  contributes jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  unique (question_id, value)
);

-- ---------- events ----------
create table talent_events (
  id bigint generated always as identity primary key,
  code text not null,                           -- compared case-insensitively
  name text not null,
  version_id bigint references talent_versions(id),
  country_scope text not null default 'MY' check (country_scope in ('MY','ID','MIXED')),
  languages text[] not null default array['en','ms-MY','id-ID'],
  starts_at timestamptz,
  expires_at timestamptz,
  timezone text not null default 'Asia/Kuala_Lumpur',
  max_participants int,
  retention_days int not null default 365,
  status text not null default 'draft' check (status in ('draft','active','closed','archived')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create unique index talent_event_code on talent_events (lower(code));

-- ---------- attempts (one per participant sitting) ----------
create table talent_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id bigint not null references talent_events(id) on delete cascade,
  version_id bigint not null references talent_versions(id),
  token_hash text not null,                     -- sha256 of the resume token; raw never stored
  language text not null default 'en',
  status text not null default 'in_progress'
    check (status in ('in_progress','submitted','scored','reported','abandoned')),
  started_at timestamptz default now(),
  submitted_at timestamptz,
  duration_seconds int,
  user_agent text,
  created_at timestamptz default now()
);
create index talent_attempt_event on talent_attempts (event_id, status);
create unique index talent_attempt_token on talent_attempts (token_hash);

create table talent_participants (
  attempt_id uuid primary key references talent_attempts(id) on delete cascade,
  full_name text not null,
  preferred_name text,
  country text,
  contact text,                                 -- phone or email, participant's choice
  experience text,                              -- real-estate experience band
  leadership text,                              -- current leadership responsibility
  created_at timestamptz default now()
);

create table talent_consents (
  attempt_id uuid primary key references talent_attempts(id) on delete cascade,
  developmental_ack boolean not null default false,
  not_clinical_ack boolean not null default false,
  self_reported_ack boolean not null default false,
  data_use_ack boolean not null default false,
  sharing text not null default 'private' check (sharing in ('private','summary','full')),
  agreed_at timestamptz default now()
);

create table talent_responses (
  attempt_id uuid not null references talent_attempts(id) on delete cascade,
  question_id bigint not null references talent_questions(id),
  option_value int,
  text_value text,
  answered_at timestamptz default now(),
  primary key (attempt_id, question_id)
);

-- ---------- deterministic scores (AI has no write path here) ----------
create table talent_scores (
  attempt_id uuid not null references talent_attempts(id) on delete cascade,
  kind text not null check (kind in ('dimension','motivation','demotivator','role')),
  key text not null,
  raw numeric not null,
  normalised numeric,                            -- 0..100
  band text,                                     -- Strong/Good/Emerging/Development/Insufficient
  rank int,
  primary key (attempt_id, kind, key)
);

create table talent_flags (
  attempt_id uuid not null references talent_attempts(id) on delete cascade,
  flag text not null,                            -- neutral review flags (§10)
  detail text,
  primary key (attempt_id, flag)
);

-- ---------- reports ----------
create table talent_reports (
  attempt_id uuid primary key references talent_attempts(id) on delete cascade,
  language text not null,
  generated_by text not null check (generated_by in ('ai','fallback')),
  model text,
  content jsonb not null,                        -- structured, never one text blob (§16)
  generated_at timestamptz default now(),
  regenerated_count int not null default 0
);

create table talent_audit (
  id bigint generated always as identity primary key,
  attempt_id uuid,
  event_id bigint,
  action text not null,
  actor uuid references profiles(id),            -- null for participants
  detail text,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS — participants reach everything through RPCs only.
-- ============================================================
alter table talent_versions     enable row level security;
alter table talent_sections     enable row level security;
alter table talent_questions    enable row level security;
alter table talent_options      enable row level security;
alter table talent_events       enable row level security;
alter table talent_attempts     enable row level security;
alter table talent_participants enable row level security;
alter table talent_consents     enable row level security;
alter table talent_responses    enable row level security;
alter table talent_scores       enable row level security;
alter table talent_flags        enable row level security;
alter table talent_reports      enable row level security;
alter table talent_audit        enable row level security;

-- Facilitators = existing admins. Consent is enforced in the read RPCs, not here.
create policy r_talent_events on talent_events for select using (is_admin());
create policy w_talent_events on talent_events for all
  using (is_admin()) with check (is_admin());
create policy r_talent_attempts on talent_attempts for select using (is_admin());
create policy r_talent_participants on talent_participants for select using (is_admin());
create policy r_talent_consents on talent_consents for select using (is_admin());
create policy r_talent_scores on talent_scores for select using (is_admin());
create policy r_talent_flags on talent_flags for select using (is_admin());
create policy r_talent_reports on talent_reports for select using (is_admin());
create policy r_talent_audit on talent_audit for select using (is_admin());
-- Raw item-level answers are deliberately NOT readable by facilitators (§6).

-- Content is readable by signed-in staff for the admin screens; participants get
-- it through the anon RPC below (which filters to their event's version).
create policy r_talent_versions on talent_versions for select using (auth.uid() is not null);
create policy r_talent_sections on talent_sections for select using (auth.uid() is not null);
create policy r_talent_questions on talent_questions for select using (auth.uid() is not null);
create policy r_talent_options on talent_options for select using (auth.uid() is not null);

-- ============================================================
-- Event-code entry. Codes are NOT passwords: validated, rate-limited,
-- and they hand back a per-attempt token that gates everything after.
-- ============================================================
create table talent_code_attempts (           -- crude but effective rate limiter
  id bigint generated always as identity primary key,
  code text, ip text, ok boolean, at timestamptz default now()
);
alter table talent_code_attempts enable row level security;
create index talent_code_rl on talent_code_attempts (code, at desc);

create or replace function talent_start(
  p_code text, p_language text, p_ip text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_ev talent_events; v_fails int; v_count int; v_token text; v_id uuid;
begin
  -- rate limit: 10 failures per code per 10 minutes
  select count(*) into v_fails from talent_code_attempts
   where code = lower(p_code) and not ok and at > now() - interval '10 minutes';
  if v_fails >= 10 then
    raise exception 'too many attempts, please wait a few minutes';
  end if;

  select * into v_ev from talent_events where lower(code) = lower(btrim(p_code));

  if v_ev.id is null or v_ev.status <> 'active'
     or (v_ev.starts_at is not null and now() < v_ev.starts_at)
     or (v_ev.expires_at is not null and now() > v_ev.expires_at) then
    insert into talent_code_attempts (code, ip, ok) values (lower(p_code), p_ip, false);
    raise exception 'invalid or inactive event code';
  end if;

  if v_ev.max_participants is not null then
    select count(*) into v_count from talent_attempts where event_id = v_ev.id;
    if v_count >= v_ev.max_participants then
      raise exception 'this event is full';
    end if;
  end if;

  if not (p_language = any (v_ev.languages)) then
    raise exception 'language not available for this event';
  end if;

  v_token := encode(gen_random_bytes(24), 'hex');
  insert into talent_attempts (event_id, version_id, token_hash, language)
  values (v_ev.id, v_ev.version_id, encode(digest(v_token, 'sha256'), 'hex'), p_language)
  returning id into v_id;

  insert into talent_code_attempts (code, ip, ok) values (lower(p_code), p_ip, true);
  insert into talent_audit (attempt_id, event_id, action, detail)
  values (v_id, v_ev.id, 'attempt_started', p_language);

  return jsonb_build_object(
    'attempt_id', v_id, 'token', v_token, 'language', p_language,
    'event_name', v_ev.name, 'version_id', v_ev.version_id,
    'country_scope', v_ev.country_scope);
end $$;

-- Resolve an attempt from its token; every participant RPC starts here.
create or replace function talent_attempt_of(p_token text)
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select id from talent_attempts
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and status <> 'abandoned'
$$;

grant execute on function talent_start(text,text,text) to anon, authenticated;
grant execute on function talent_attempt_of(text) to anon, authenticated;
