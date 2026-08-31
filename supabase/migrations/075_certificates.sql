-- 075_certificates.sql — EVENT ATTENDANCE → E-CERTIFICATE SYSTEM (additive).
--
-- Principle: ATTENDANCE CREATES ELIGIBILITY · ADMIN AUTHORISES ISSUANCE ·
-- THE SYSTEM CREATES EVIDENCE · THE RECIPIENT GETS A VERIFIABLE CERTIFICATE.
--
-- Eligibility source of truth = the EXISTING attendance record:
--   bop_roster(session_id, lead_id) with attended = 'attended'
-- (set by event_checkin QR or the admin toggle). Nothing here re-invents it.
-- One certificate per valid attendance is enforced by a partial unique index.
-- Issued certificates are frozen snapshots; reissue = new row + superseded_by.
-- Public sees NOTHING from these tables except through 3 limited RPCs.
-- Audit → existing audit_events. Flag → existing ch_feature_flags.

-- ---------- permission helper: admin OR delegated module admin, country scoped ----------
create or replace function is_cert_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(is_admin(), false)
      or exists (select 1 from profiles p where p.id = auth.uid()
                   and 'certificates' = any(p.module_admin) and p.status = 'active')
$$;
revoke all on function is_cert_admin() from public, anon;
grant execute on function is_cert_admin() to authenticated;

-- ---------- master templates + immutable versions ----------
create table if not exists certificate_templates (
  id uuid primary key default gen_random_uuid(),
  country country_t not null,
  name text not null,
  orientation text not null default 'landscape' check (orientation in ('landscape','portrait')),
  status text not null default 'active' check (status in ('active','archived')),
  current_version int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists certificate_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references certificate_templates(id) on delete cascade,
  version int not null,
  layout_json jsonb not null default '{}'::jsonb,      -- structured elements + positions + colours + font keys (no code)
  text_json jsonb not null default '{}'::jsonb,        -- {"en":{...},"ms-MY":{...},"id-ID":{...}}: title, heading, body, attendance, footer, verify_wording, disclaimer
  assets_json jsonb not null default '{}'::jsonb,      -- {background, logo_left, logo_right, partner_logos[]} storage paths in certificate-assets
  signatories_json jsonb not null default '[]'::jsonb, -- [{name, title, signature_path}]
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (template_id, version)
);
create index if not exists ctv_template on certificate_template_versions (template_id, version desc);

-- ---------- admin-managed email templates (3 languages, country scoped) ----------
create table if not exists certificate_email_templates (
  id uuid primary key default gen_random_uuid(),
  country country_t not null,
  name text not null,
  language text not null default 'en' check (language in ('en','ms-MY','id-ID')),
  subject text not null,
  heading text,
  body text not null,                                  -- plain text / limited markdown; variables {{participant_name}} etc.
  cta_label text not null default 'View Certificate',
  footer text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- per-event configuration (snapshot of chosen template version + overrides) ----------
create table if not exists event_certificate_configs (
  event_id uuid primary key references events(id) on delete cascade,
  enabled boolean not null default false,
  template_version_id uuid references certificate_template_versions(id),
  overrides_json jsonb not null default '{}'::jsonb,   -- same shape as text_json/assets_json/signatories — wins over the version
  language text not null default 'en' check (language in ('en','ms-MY','id-ID')),
  email_template_id uuid references certificate_email_templates(id),
  number_prefix text,                                  -- default AG-<country>-<year>
  certificate_title text,                              -- quick override of the title shown on board/email
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
alter table events add column if not exists certificate_enabled boolean not null default false;

-- ---------- issued certificates (frozen evidence) ----------
create table if not exists issued_certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  session_id bigint not null references bop_sessions(id),
  lead_id bigint not null references m4u_leads(id),
  config_snapshot jsonb not null,                      -- config + template version + overrides at issue time
  template_version_id uuid references certificate_template_versions(id),
  country country_t not null,
  language text not null,
  recipient_name text not null,                        -- registered name, or the audited override
  name_override boolean not null default false,
  recipient_email text,
  certificate_number text not null unique,
  verification_token text not null unique,             -- random 48-hex capability: QR + verify URL (admin-read only; anon has no SELECT)
  access_token text not null unique,                   -- participant page token (different from verification)
  verification_token_hash text not null unique,        -- sha256 — what the public RPCs compare
  access_token_hash text not null unique,
  status text not null default 'issued' check (status in ('issued','revoked','superseded')),
  snapshot_json jsonb not null,                        -- everything the PDF/online page renders: texts, names, dates, venue, signatories, asset paths
  pdf_path text,                                       -- certificates bucket; null until the worker rendered it
  pdf_error text,
  issued_by uuid references profiles(id),
  issued_at timestamptz not null default now(),
  revoked_by uuid references profiles(id),
  revoked_at timestamptz,
  revoke_reason text,
  superseded_by uuid references issued_certificates(id),
  reissue_of uuid references issued_certificates(id),
  reissue_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ONE valid certificate per attendance (revoked still blocks a silent duplicate; superseded frees the slot for the reissue)
create unique index if not exists issued_cert_one_per_attendance
  on issued_certificates (session_id, lead_id) where status <> 'superseded';
create index if not exists issued_cert_event on issued_certificates (event_id, status);
create index if not exists issued_cert_email on issued_certificates (recipient_email);
create index if not exists issued_cert_issued_at on issued_certificates (issued_at desc);

-- ---------- per-country-year counters (numbers are sequential; tokens are random — no enumeration) ----------
create table if not exists certificate_counters (
  country country_t not null, year int not null, last_no int not null default 0,
  primary key (country, year)
);

-- ---------- email delivery attempts (queue processed by the worker cron) ----------
create table if not exists certificate_email_deliveries (
  id bigint generated always as identity primary key,
  certificate_id uuid not null references issued_certificates(id) on delete cascade,
  to_email text not null,
  email_template_id uuid references certificate_email_templates(id),
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  provider_id text,
  error text,
  attempt int not null default 1,
  queued_by uuid references profiles(id),
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists cert_deliv_cert on certificate_email_deliveries (certificate_id, queued_at desc);
create index if not exists cert_deliv_queue on certificate_email_deliveries (status) where status = 'queued';

-- ---------- bulk jobs (issue / send) — idempotent per certificate ----------
create table if not exists certificate_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null check (kind in ('issue','send','resend')),
  payload_json jsonb not null,                         -- [{session_id, lead_id}] or [certificate_id]
  total int not null default 0, done int not null default 0, failed int not null default 0,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  last_error text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists cert_jobs_event on certificate_jobs (event_id, status);

-- ---------- RLS: admins (country scoped) only; anon NOTHING ----------
alter table certificate_templates enable row level security;
alter table certificate_template_versions enable row level security;
alter table certificate_email_templates enable row level security;
alter table event_certificate_configs enable row level security;
alter table issued_certificates enable row level security;
alter table certificate_counters enable row level security;
alter table certificate_email_deliveries enable row level security;
alter table certificate_jobs enable row level security;

drop policy if exists p_cert_templates on certificate_templates;
create policy p_cert_templates on certificate_templates for all
  using (is_cert_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
  with check (is_cert_admin() and (country::text = my_country()::text or my_role() = 'master_admin'));
drop policy if exists p_cert_versions on certificate_template_versions;
create policy p_cert_versions on certificate_template_versions for all
  using (exists (select 1 from certificate_templates t where t.id = template_id
           and is_cert_admin() and (t.country::text = my_country()::text or my_role() = 'master_admin')))
  with check (exists (select 1 from certificate_templates t where t.id = template_id
           and is_cert_admin() and (t.country::text = my_country()::text or my_role() = 'master_admin')));
drop policy if exists p_cert_email_templates on certificate_email_templates;
create policy p_cert_email_templates on certificate_email_templates for all
  using (is_cert_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
  with check (is_cert_admin() and (country::text = my_country()::text or my_role() = 'master_admin'));
drop policy if exists p_cert_configs on event_certificate_configs;
create policy p_cert_configs on event_certificate_configs for all
  using (exists (select 1 from events e where e.id = event_id
           and is_cert_admin() and (e.country::text = my_country()::text or my_role() = 'master_admin')))
  with check (exists (select 1 from events e where e.id = event_id
           and is_cert_admin() and (e.country::text = my_country()::text or my_role() = 'master_admin')));
-- issued certificates: admins READ in their country; all writes go through RPCs / the worker
drop policy if exists r_issued_certs on issued_certificates;
create policy r_issued_certs on issued_certificates for select
  using (is_cert_admin() and (country::text = my_country()::text or my_role() = 'master_admin'));
drop policy if exists r_cert_deliveries on certificate_email_deliveries;
create policy r_cert_deliveries on certificate_email_deliveries for select
  using (exists (select 1 from issued_certificates c where c.id = certificate_id
           and is_cert_admin() and (c.country::text = my_country()::text or my_role() = 'master_admin')));
drop policy if exists p_cert_jobs on certificate_jobs;
create policy p_cert_jobs on certificate_jobs for all
  using (exists (select 1 from events e where e.id = event_id
           and is_cert_admin() and (e.country::text = my_country()::text or my_role() = 'master_admin')))
  with check (exists (select 1 from events e where e.id = event_id
           and is_cert_admin() and (e.country::text = my_country()::text or my_role() = 'master_admin')));
-- anon: no grants at all on these tables
revoke all on certificate_templates, certificate_template_versions, certificate_email_templates,
  event_certificate_configs, issued_certificates, certificate_counters,
  certificate_email_deliveries, certificate_jobs from anon;

-- ---------- storage: private buckets ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('certificates', 'certificates', false, 10485760),
       ('certificate-assets', 'certificate-assets', false, 5242880)
on conflict (id) do nothing;
drop policy if exists cert_assets_admin on storage.objects;
create policy cert_assets_admin on storage.objects for all
  using (bucket_id in ('certificate-assets') and is_cert_admin())
  with check (bucket_id in ('certificate-assets') and is_cert_admin());
drop policy if exists cert_pdf_admin_read on storage.objects;
create policy cert_pdf_admin_read on storage.objects for select
  using (bucket_id = 'certificates' and is_cert_admin());

-- ---------- audit trigger → existing audit_events ----------
create or replace function cert_audit_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_events (actor, actor_role, country, action, entity_type, entity_id, new_state, meta)
    values (auth.uid(), my_role(), new.country::text, 'certificate.issued', 'issued_certificate', new.id::text,
            new.status, jsonb_build_object('number', new.certificate_number, 'event_id', new.event_id,
              'session_id', new.session_id, 'lead_id', new.lead_id, 'reissue_of', new.reissue_of,
              'name_override', new.name_override));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into audit_events (actor, actor_role, country, action, entity_type, entity_id, prev_state, new_state, reason, meta)
    values (auth.uid(), my_role(), new.country::text, 'certificate.' || new.status, 'issued_certificate', new.id::text,
            old.status, new.status, coalesce(new.revoke_reason, new.reissue_reason),
            jsonb_build_object('number', new.certificate_number, 'superseded_by', new.superseded_by));
  end if;
  return new;
end $$;
drop trigger if exists trg_cert_audit on issued_certificates;
create trigger trg_cert_audit after insert or update on issued_certificates
  for each row execute function cert_audit_trg();

create or replace function cert_config_audit_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_events (actor, actor_role, action, entity_type, entity_id, prev_state, new_state, meta)
  values (auth.uid(), my_role(),
          case when tg_op = 'INSERT' then 'event_certificate.enabled' else 'event_certificate.config_updated' end,
          'event_certificate_config', new.event_id::text,
          case when tg_op = 'UPDATE' then old.enabled::text end, new.enabled::text,
          jsonb_build_object('language', new.language, 'template_version_id', new.template_version_id));
  return new;
end $$;
drop trigger if exists trg_cert_config_audit on event_certificate_configs;
create trigger trg_cert_config_audit after insert or update on event_certificate_configs
  for each row execute function cert_config_audit_trg();

-- ---------- eligibility board for one event (admin) ----------
-- registered → present → eligible → issued/sent/failed/revoked, one row per attendance
create or replace function cert_eligibility(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ev events; v_cfg event_certificate_configs;
begin
  select * into v_ev from events where id = p_event;
  if v_ev.id is null then raise exception 'no event'; end if;
  if not (is_cert_admin() and (v_ev.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  select * into v_cfg from event_certificate_configs where event_id = p_event;
  return coalesce((select jsonb_agg(row_to_json(x)) from (
    select r.session_id, s.title as session_title, s.starts_at, s.type,
           r.lead_id, l.name, l.phone_norm, l.custom_fields->>'email' as email,
           r.attended, r.attended_at, r.checkin_method, r.source,
           (r.attended = 'attended' and coalesce(v_cfg.enabled, false)) as eligible,
           c.id as certificate_id, c.certificate_number, c.status as cert_status, c.recipient_name,
           c.pdf_path is not null as has_pdf, c.issued_at,
           (select d.status from certificate_email_deliveries d where d.certificate_id = c.id
              order by d.queued_at desc limit 1) as email_status,
           (select d.sent_at from certificate_email_deliveries d where d.certificate_id = c.id
              and d.status = 'sent' order by d.sent_at desc limit 1) as email_sent_at,
           (select count(*) from certificate_email_deliveries d where d.certificate_id = c.id) as email_attempts
      from bop_roster r
      join bop_sessions s on s.id = r.session_id
      join m4u_leads l on l.id = r.lead_id
      left join issued_certificates c on c.session_id = r.session_id and c.lead_id = r.lead_id and c.status <> 'superseded'
     where s.event_id = p_event
     order by r.attended = 'attended' desc, r.registered_at desc) x), '[]'::jsonb);
end $$;
revoke all on function cert_eligibility(uuid) from public, anon;
grant execute on function cert_eligibility(uuid) to authenticated;

-- ---------- number + tokens ----------
create or replace function cert_next_number(p_country country_t, p_prefix text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_year int := extract(year from now())::int; v_n int;
begin
  insert into certificate_counters (country, year, last_no) values (p_country, v_year, 1)
  on conflict (country, year) do update set last_no = certificate_counters.last_no + 1
  returning last_no into v_n;
  return coalesce(nullif(btrim(p_prefix), ''), 'AG-' || p_country::text || '-' || v_year) || '-' || lpad(v_n::text, 6, '0');
end $$;
revoke all on function cert_next_number(country_t, text) from public, anon, authenticated;

-- ---------- ISSUE one certificate (idempotent: returns the existing one) ----------
-- Returns the raw tokens ONCE (caller = admin UI / worker stores nothing; QR + email use them).
create or replace function cert_issue(
  p_session bigint, p_lead bigint,
  p_name_override text default null, p_override_reason text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_s bop_sessions; v_ev events; v_cfg event_certificate_configs; v_ver certificate_template_versions;
  v_r bop_roster; v_lead m4u_leads; v_existing issued_certificates;
  v_vtok text; v_atok text; v_no text; v_name text; v_id uuid; v_snapshot jsonb;
begin
  select * into v_s from bop_sessions where id = p_session;
  if v_s.id is null then raise exception 'no session'; end if;
  select * into v_ev from events where id = v_s.event_id;
  if v_ev.id is null then raise exception 'session has no event'; end if;
  if not (is_cert_admin() and (v_ev.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  select * into v_cfg from event_certificate_configs where event_id = v_ev.id;
  if v_cfg.event_id is null or not v_cfg.enabled then raise exception 'certificates not enabled for this event'; end if;
  select * into v_r from bop_roster where session_id = p_session and lead_id = p_lead;
  if v_r.lead_id is null then raise exception 'not registered'; end if;
  if v_r.attended <> 'attended' then raise exception 'not present — attendance is the eligibility source'; end if;

  -- idempotent: an existing valid certificate is simply returned (no tokens: they were shown at issue time)
  select * into v_existing from issued_certificates
    where session_id = p_session and lead_id = p_lead and status <> 'superseded';
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'already', true, 'certificate_id', v_existing.id,
      'certificate_number', v_existing.certificate_number, 'status', v_existing.status);
  end if;

  select * into v_lead from m4u_leads where id = p_lead;
  select * into v_ver from certificate_template_versions where id = v_cfg.template_version_id;
  v_name := coalesce(nullif(btrim(p_name_override), ''), v_lead.name);
  if v_name is null then raise exception 'recipient name missing'; end if;

  v_vtok := encode(extensions.gen_random_bytes(24), 'hex');   -- verification token (48 hex)
  v_atok := encode(extensions.gen_random_bytes(24), 'hex');   -- participant access token
  v_no := cert_next_number(v_ev.country, v_cfg.number_prefix);

  v_snapshot := jsonb_build_object(
    'certificate_number', v_no,
    'recipient_name', v_name,
    'event_title', v_ev.title,
    'session_title', v_s.title,
    'event_date', v_s.starts_at,
    'venue', coalesce(v_s.location, case when v_s.type = 'online' then 'Online' end),
    'mode', v_s.type,
    'country', v_ev.country,
    'language', v_cfg.language,
    'certificate_title', v_cfg.certificate_title,
    'orientation', (select orientation from certificate_templates where id = v_ver.template_id),
    'layout', coalesce(v_ver.layout_json, '{}'::jsonb),
    'text', coalesce(v_ver.text_json, '{}'::jsonb) || coalesce(v_cfg.overrides_json->'text', '{}'::jsonb),
    'assets', coalesce(v_ver.assets_json, '{}'::jsonb) || coalesce(v_cfg.overrides_json->'assets', '{}'::jsonb),
    'signatories', coalesce(v_cfg.overrides_json->'signatories', v_ver.signatories_json, '[]'::jsonb),
    'issued_at', now()
  );

  insert into issued_certificates (event_id, session_id, lead_id, config_snapshot, template_version_id, country, language,
      recipient_name, name_override, recipient_email, certificate_number,
      verification_token, access_token, verification_token_hash, access_token_hash, status, snapshot_json, issued_by)
  values (v_ev.id, p_session, p_lead, to_jsonb(v_cfg), v_cfg.template_version_id, v_ev.country, v_cfg.language,
      v_name, p_name_override is not null and btrim(p_name_override) <> '' and btrim(p_name_override) <> coalesce(v_lead.name,''),
      lower(v_lead.custom_fields->>'email'), v_no,
      v_vtok, v_atok,
      encode(extensions.digest(v_vtok, 'sha256'), 'hex'), encode(extensions.digest(v_atok, 'sha256'), 'hex'),
      'issued', v_snapshot, auth.uid())
  returning id into v_id;

  if p_name_override is not null and btrim(p_name_override) <> '' and btrim(p_name_override) <> coalesce(v_lead.name,'') then
    insert into audit_events (actor, actor_role, country, action, entity_type, entity_id, prev_state, new_state, reason)
    values (auth.uid(), my_role(), v_ev.country::text, 'certificate.name_overridden', 'issued_certificate', v_id::text,
            v_lead.name, v_name, p_override_reason);
  end if;

  return jsonb_build_object('ok', true, 'certificate_id', v_id, 'certificate_number', v_no,
    'verification_token', v_vtok, 'access_token', v_atok);
end $$;
revoke all on function cert_issue(bigint, bigint, text, text) from public, anon;
grant execute on function cert_issue(bigint, bigint, text, text) to authenticated;

-- ---------- REVOKE ----------
create or replace function cert_revoke(p_cert uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c issued_certificates;
begin
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason required'; end if;
  select * into v_c from issued_certificates where id = p_cert;
  if v_c.id is null then raise exception 'not found'; end if;
  if not (coalesce(is_admin(), false) and (v_c.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';   -- revoke = admins only, not delegated
  end if;
  if v_c.status = 'revoked' then return jsonb_build_object('ok', true, 'already', true); end if;
  update issued_certificates set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(),
    revoke_reason = btrim(p_reason), updated_at = now() where id = p_cert;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function cert_revoke(uuid, text) from public, anon;
grant execute on function cert_revoke(uuid, text) to authenticated;

-- ---------- REISSUE (name correction etc.): old → superseded, new row linked ----------
create or replace function cert_reissue(p_cert uuid, p_new_name text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_c issued_certificates; v_new jsonb;
begin
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason required'; end if;
  select * into v_c from issued_certificates where id = p_cert;
  if v_c.id is null then raise exception 'not found'; end if;
  if not (coalesce(is_admin(), false) and (v_c.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  if v_c.status = 'superseded' then raise exception 'already superseded'; end if;
  update issued_certificates set status = 'superseded', reissue_reason = btrim(p_reason), updated_at = now() where id = p_cert;
  v_new := cert_issue(v_c.session_id, v_c.lead_id, coalesce(nullif(btrim(p_new_name),''), v_c.recipient_name), p_reason);
  update issued_certificates set superseded_by = (v_new->>'certificate_id')::uuid where id = p_cert;
  update issued_certificates set reissue_of = p_cert, reissue_reason = btrim(p_reason) where id = (v_new->>'certificate_id')::uuid;
  return v_new || jsonb_build_object('superseded', p_cert);
end $$;
revoke all on function cert_reissue(uuid, text, text) from public, anon;
grant execute on function cert_reissue(uuid, text, text) to authenticated;

-- ---------- queue email (single / bulk / resend) — same certificate, new attempt ----------
create or replace function cert_queue_email(p_certs uuid[], p_template uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_c issued_certificates; v_q int := 0; v_skip int := 0;
begin
  foreach v_id in array p_certs loop
    select * into v_c from issued_certificates where id = v_id;
    if v_c.id is null then continue; end if;
    if not (is_cert_admin() and (v_c.country::text = my_country()::text or my_role() = 'master_admin')) then
      raise exception 'not authorised';
    end if;
    if v_c.status <> 'issued' or v_c.recipient_email is null or v_c.recipient_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_skip := v_skip + 1; continue;
    end if;
    insert into certificate_email_deliveries (certificate_id, to_email, email_template_id, attempt, queued_by)
    values (v_c.id, v_c.recipient_email, p_template,
            (select coalesce(max(attempt),0)+1 from certificate_email_deliveries where certificate_id = v_c.id), auth.uid());
    v_q := v_q + 1;
  end loop;
  return jsonb_build_object('ok', true, 'queued', v_q, 'skipped', v_skip);
end $$;
revoke all on function cert_queue_email(uuid[], uuid) from public, anon;
grant execute on function cert_queue_email(uuid[], uuid) to authenticated;

-- ---------- PUBLIC: verification (limited fields, enumeration-safe) ----------
create or replace function certificate_verify(p_token text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select jsonb_build_object(
      'status', c.status,
      'recipient_name', c.recipient_name,
      'certificate_title', coalesce(c.snapshot_json->>'certificate_title',
          c.snapshot_json->'text'->(c.language)->>'title', 'Certificate of Attendance'),
      'event_title', c.snapshot_json->>'event_title',
      'event_date', c.snapshot_json->>'event_date',
      'issued_at', c.issued_at,
      'certificate_number', c.certificate_number,
      'country', c.country,
      'issuer', 'IQI AG Group')
    from issued_certificates c
    where c.verification_token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')),
  jsonb_build_object('status', 'not_found'))
$$;
revoke all on function certificate_verify(text) from public;
grant execute on function certificate_verify(text) to anon, authenticated;

create or replace function certificate_verify_number(p_number text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
      'status', c.status, 'recipient_name', c.recipient_name,
      'certificate_title', coalesce(c.snapshot_json->>'certificate_title',
          c.snapshot_json->'text'->(c.language)->>'title', 'Certificate of Attendance'),
      'event_title', c.snapshot_json->>'event_title', 'event_date', c.snapshot_json->>'event_date',
      'issued_at', c.issued_at, 'certificate_number', c.certificate_number, 'country', c.country, 'issuer', 'IQI AG Group')
    from issued_certificates c where upper(c.certificate_number) = upper(btrim(coalesce(p_number,'')))),
  jsonb_build_object('status', 'not_found'))
$$;
revoke all on function certificate_verify_number(text) from public;
grant execute on function certificate_verify_number(text) to anon, authenticated;

-- participant's own page: the full snapshot (to render) — never phone
create or replace function certificate_view(p_access_token text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select jsonb_build_object(
      'id', c.id, 'status', c.status, 'certificate_number', c.certificate_number,
      'recipient_name', c.recipient_name, 'language', c.language, 'country', c.country,
      'snapshot', c.snapshot_json, 'has_pdf', c.pdf_path is not null, 'issued_at', c.issued_at)
    from issued_certificates c
    where c.access_token_hash = encode(extensions.digest(coalesce(p_access_token,''), 'sha256'), 'hex')),
  jsonb_build_object('status', 'not_found'))
$$;
revoke all on function certificate_view(text) from public;
grant execute on function certificate_view(text) to anon, authenticated;

-- ---------- feature flag (existing table) ----------
insert into ch_feature_flags (flag, enabled, note)
values ('event_certificates_enabled', true, 'Event attendance e-certificates (075)')
on conflict (flag) do nothing;
