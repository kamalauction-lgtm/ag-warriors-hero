-- 078_cert_event_overrides.sql — event-level wording overrides on the certificate (spec #29).
-- Kamal (22 Aug 2026): "I want to edit 'AG Leadership Programme / Day 1 · Physical · date · venue' too."
-- event_certificate_configs.overrides_json may now carry:
--   event_title   → replaces the event title printed on the certificate
--   details_line  → replaces the auto line (session · date · venue)
-- Blank = automatic. Snapshot captures whichever was in force at issue time.

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

  v_vtok := encode(extensions.gen_random_bytes(24), 'hex');
  v_atok := encode(extensions.gen_random_bytes(24), 'hex');
  v_no := cert_next_number(v_ev.country, v_cfg.number_prefix);

  v_snapshot := jsonb_build_object(
    'certificate_number', v_no,
    'recipient_name', v_name,
    'event_title', v_ev.title,
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
