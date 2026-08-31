-- ============================================================
-- 093_cert_reissue_after_revoke.sql — a revoked certificate can be replaced,
-- on a chosen template, with a fresh number. ADDITIVE.
--
-- WHAT WAS WRONG
--  1. A revoked certificate was a dead end. The uniqueness rule was
--       unique (session_id, lead_id) where status <> 'superseded'
--     so a revoked row still occupied the one-certificate-per-attendance slot
--     and cert_issue refused to mint a replacement. The admin UI reflected that
--     honestly: a revoked row offered only "PDF (revoked)".
--
--  2. cert_reissue() could be pointed at a revoked certificate, but it set the
--     old row to 'superseded' — erasing the fact that it had been REVOKED. A
--     revocation is a public statement (verify shows REVOKED); replacing the
--     document must not quietly retract it.
--
--  3. Neither issue nor reissue could choose a template. Both always used
--     event_certificate_configs.template_version_id, so correcting a
--     certificate onto a different template meant changing the whole event's
--     config first, which would also affect everyone issued afterwards.
--
-- THE RULE THIS FILE ESTABLISHES
--   'issued'     — the one live certificate for an attendance (at most one)
--   'revoked'    — withdrawn, stays withdrawn and stays public. Frees the slot.
--   'superseded' — replaced by a corrected version. Frees the slot.
--   A replacement is always a NEW row with a NEW number from the same
--   per-country-year counter. Numbers are never reused or edited.
--
-- ROLLBACK: re-create the old index and re-run the 075 definitions of
-- cert_issue / cert_reissue. No row is modified by this migration.
-- ============================================================

-- ------------------------------------------------------------
-- 1. UNIQUENESS — only a LIVE certificate holds the slot
-- ------------------------------------------------------------
drop index if exists issued_cert_one_per_attendance;
create unique index if not exists issued_cert_one_live_per_attendance
  on issued_certificates (session_id, lead_id) where status = 'issued';

comment on column issued_certificates.superseded_by is
  'The certificate that REPLACED this one, whether this row was superseded '
  '(corrected) or revoked (withdrawn then replaced). A revoked row keeps '
  'status = revoked — see migration 093.';

-- ------------------------------------------------------------
-- 2. ISSUE, with an optional explicit template version.
--    Body is 075''s cert_issue with two changes: the template version may be
--    passed in, and the idempotency/uniqueness test is now status = 'issued'.
-- ------------------------------------------------------------
create or replace function cert_issue_v2(
  p_session bigint, p_lead bigint,
  p_name_override text default null, p_override_reason text default null,
  p_template_version uuid default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_s bop_sessions; v_ev events; v_cfg event_certificate_configs; v_ver certificate_template_versions;
  v_r bop_roster; v_lead m4u_leads; v_existing issued_certificates;
  v_vtok text; v_atok text; v_no text; v_name text; v_id uuid; v_snapshot jsonb;
  v_tver uuid; v_tpl_country text;
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

  -- a LIVE certificate is simply returned. Revoked and superseded rows no longer
  -- block, which is what makes replacement-after-revocation possible.
  select * into v_existing from issued_certificates
    where session_id = p_session and lead_id = p_lead and status = 'issued';
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'already', true, 'certificate_id', v_existing.id,
      'certificate_number', v_existing.certificate_number, 'status', v_existing.status);
  end if;

  -- chosen template, or the event default. A template from another country is
  -- refused: the certificate's country comes from the event.
  v_tver := coalesce(p_template_version, v_cfg.template_version_id);
  if v_tver is null then raise exception 'no template chosen and the event has no default template'; end if;
  select * into v_ver from certificate_template_versions where id = v_tver;
  if v_ver.id is null then raise exception 'unknown template version'; end if;
  select t.country::text into v_tpl_country from certificate_templates t where t.id = v_ver.template_id;
  if v_tpl_country is distinct from v_ev.country::text then
    raise exception 'that template is % but the event is %', v_tpl_country, v_ev.country;
  end if;

  select * into v_lead from m4u_leads where id = p_lead;
  v_name := coalesce(nullif(btrim(p_name_override), ''), v_lead.name);
  if v_name is null then raise exception 'recipient name missing'; end if;

  v_vtok := encode(extensions.gen_random_bytes(24), 'hex');
  v_atok := encode(extensions.gen_random_bytes(24), 'hex');
  v_no := cert_next_number(v_ev.country, v_cfg.number_prefix);

  v_snapshot := jsonb_build_object(
    'certificate_number', v_no,
    'recipient_name', v_name,
    'event_title', v_ev.title,
    -- from 078: the event-level wording overrides. These MUST stay — dropping
    -- them would silently revert every future certificate to the auto text.
    'event_title_override', nullif(btrim(v_cfg.overrides_json->>'event_title'), ''),
    'details_line', nullif(btrim(v_cfg.overrides_json->>'details_line'), ''),
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
  values (v_ev.id, p_session, p_lead, to_jsonb(v_cfg), v_tver, v_ev.country, v_cfg.language,
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
  if p_template_version is not null and p_template_version is distinct from v_cfg.template_version_id then
    insert into audit_events (actor, actor_role, country, action, entity_type, entity_id, prev_state, new_state, reason)
    values (auth.uid(), my_role(), v_ev.country::text, 'certificate.template_overridden', 'issued_certificate', v_id::text,
            v_cfg.template_version_id::text, v_tver::text, p_override_reason);
  end if;

  return jsonb_build_object('ok', true, 'certificate_id', v_id, 'certificate_number', v_no,
    'template_version_id', v_tver, 'verification_token', v_vtok, 'access_token', v_atok);
end $$;
revoke all on function cert_issue_v2(bigint, bigint, text, text, uuid) from public, anon;
grant execute on function cert_issue_v2(bigint, bigint, text, text, uuid) to authenticated;

-- the original 4-argument entry point keeps working, now on one implementation
create or replace function cert_issue(
  p_session bigint, p_lead bigint,
  p_name_override text default null, p_override_reason text default null
) returns jsonb language sql security definer set search_path = public, extensions as $$
  select cert_issue_v2(p_session, p_lead, p_name_override, p_override_reason, null);
$$;
revoke all on function cert_issue(bigint, bigint, text, text) from public, anon;
grant execute on function cert_issue(bigint, bigint, text, text) to authenticated;

-- ------------------------------------------------------------
-- 3. REPLACE a certificate — after a correction OR after a revocation.
--    A revoked certificate STAYS revoked. Public verification of the old
--    number keeps saying REVOKED; the replacement is a separate document.
-- ------------------------------------------------------------
create or replace function cert_reissue_v2(
  p_cert uuid, p_new_name text, p_reason text, p_template_version uuid default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_c issued_certificates; v_new jsonb; v_prev text;
begin
  if btrim(coalesce(p_reason,'')) = '' then raise exception 'reason required'; end if;
  select * into v_c from issued_certificates where id = p_cert;
  if v_c.id is null then raise exception 'not found'; end if;
  if not (coalesce(is_admin(), false) and (v_c.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  if v_c.status = 'superseded' then raise exception 'already superseded'; end if;
  v_prev := v_c.status;

  -- A live certificate is retired as superseded. A revoked one is left alone:
  -- revocation is a public statement and reissuing must not retract it.
  if v_c.status = 'issued' then
    update issued_certificates
       set status = 'superseded', reissue_reason = btrim(p_reason), updated_at = now()
     where id = p_cert;
  else
    update issued_certificates
       set reissue_reason = btrim(p_reason), updated_at = now()
     where id = p_cert;
  end if;

  v_new := cert_issue_v2(v_c.session_id, v_c.lead_id,
                         coalesce(nullif(btrim(p_new_name), ''), v_c.recipient_name),
                         p_reason, p_template_version);
  if not coalesce((v_new->>'ok')::boolean, false) then raise exception 'reissue failed'; end if;

  update issued_certificates set superseded_by = (v_new->>'certificate_id')::uuid where id = p_cert;
  update issued_certificates set reissue_of = p_cert, reissue_reason = btrim(p_reason)
   where id = (v_new->>'certificate_id')::uuid;

  insert into audit_events (actor, actor_role, country, action, entity_type, entity_id,
                            prev_state, new_state, reason)
  values (auth.uid(), my_role(), v_c.country::text,
          case when v_prev = 'revoked' then 'certificate.replaced_after_revoke'
               else 'certificate.reissued' end,
          'issued_certificate', p_cert::text,
          v_prev || ' ' || v_c.certificate_number,
          'replaced by ' || (v_new->>'certificate_number'), btrim(p_reason));

  return v_new || jsonb_build_object('replaced', p_cert, 'previous_status', v_prev,
                                     'previous_number', v_c.certificate_number);
end $$;
revoke all on function cert_reissue_v2(uuid, text, text, uuid) from public, anon;
grant execute on function cert_reissue_v2(uuid, text, text, uuid) to authenticated;

-- the original 3-argument entry point keeps working
create or replace function cert_reissue(p_cert uuid, p_new_name text, p_reason text)
returns jsonb language sql security definer set search_path = public, extensions as $$
  select cert_reissue_v2(p_cert, p_new_name, p_reason, null);
$$;
revoke all on function cert_reissue(uuid, text, text) from public, anon;
grant execute on function cert_reissue(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. The templates an admin may pick for a given event, with the event default
--    marked. Country-scoped in the database, not just in the dropdown.
-- ------------------------------------------------------------
create or replace function cert_template_choices(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ev events; v_cfg event_certificate_configs;
begin
  select * into v_ev from events where id = p_event;
  if v_ev.id is null then raise exception 'unknown event'; end if;
  if not (is_cert_admin() and (v_ev.country::text = my_country()::text or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;
  select * into v_cfg from event_certificate_configs where event_id = p_event;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'template_version_id', v.id, 'template_id', t.id, 'name', t.name,
             'version', v.version, 'orientation', t.orientation,
             'is_event_default', v.id = v_cfg.template_version_id)
           order by (v.id = v_cfg.template_version_id) desc, t.name, v.version desc)
    from certificate_templates t
    join certificate_template_versions v on v.template_id = t.id
   where t.country::text = v_ev.country::text and t.status = 'active'), '[]'::jsonb);
end $$;
revoke all on function cert_template_choices(uuid) from public, anon;
grant execute on function cert_template_choices(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. THE ELIGIBILITY LIST MUST STAY ONE ROW PER ATTENDANCE
--    075 joined every certificate with status <> 'superseded'. That was safe
--    only while a revoked row blocked any replacement. Now that a revoked
--    certificate CAN be replaced, an attendance can legitimately own two
--    non-superseded rows (the revoked one and the live one) and the old join
--    would list that participant twice.
--
--    The list shows the LIVE certificate when one exists, otherwise the most
--    recent withdrawn one — so a revoked person still reads "Revoked" until a
--    replacement is issued, and reads the new number the moment it is.
-- ------------------------------------------------------------
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
           c.revoke_reason,
           -- what this certificate replaced, and how many withdrawn ones came before
           (select p.certificate_number from issued_certificates p where p.id = c.reissue_of) as replaces_number,
           (select count(*) from issued_certificates h
             where h.session_id = r.session_id and h.lead_id = r.lead_id
               and h.status = 'revoked') as revoked_count,
           (select d.status from certificate_email_deliveries d where d.certificate_id = c.id
              order by d.queued_at desc limit 1) as email_status,
           (select d.sent_at from certificate_email_deliveries d where d.certificate_id = c.id
              and d.status = 'sent' order by d.sent_at desc limit 1) as email_sent_at,
           (select count(*) from certificate_email_deliveries d where d.certificate_id = c.id) as email_attempts
      from bop_roster r
      join bop_sessions s on s.id = r.session_id
      join m4u_leads l on l.id = r.lead_id
      left join lateral (
        select * from issued_certificates ic
         where ic.session_id = r.session_id and ic.lead_id = r.lead_id
           and ic.status <> 'superseded'
         order by (ic.status = 'issued') desc, ic.issued_at desc
         limit 1) c on true
     where s.event_id = p_event
     order by r.attended = 'attended' desc, r.registered_at desc) x), '[]'::jsonb);
end $$;
revoke all on function cert_eligibility(uuid) from public, anon;
grant execute on function cert_eligibility(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. VERIFY
-- ------------------------------------------------------------
-- nobody may appear twice in an event's participant list
select 'duplicate participants in any event list' as check, count(*) as must_be_zero from (
  select session_id, lead_id from issued_certificates
   where status <> 'superseded' group by session_id, lead_id having count(*) > 1) d;

select 'uniqueness rule' as check, indexname, indexdef
  from pg_indexes where tablename = 'issued_certificates' and indexname like '%per_attendance%';

select 'certificates by status' as check, status, count(*)
  from issued_certificates group by status order by status;

select 'revoked certificates that can now be replaced' as check,
       certificate_number, recipient_name, revoke_reason, revoked_at
  from issued_certificates where status = 'revoked' order by revoked_at desc;
