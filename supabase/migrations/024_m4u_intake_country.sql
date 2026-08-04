-- ============================================================
-- 024_m4u_intake_country.sql — derive country from the pipeline. ADDITIVE.
--
-- WHY: GHL's webhook body does not carry a country/team field, so the Worker
-- had to assume a default (MY). Any Indonesian lead therefore looked up its
-- pipeline under the wrong country, found nothing, and fell into triage.
--
-- The pipeline already knows where it belongs. So: try the caller's country
-- first (fast path, unchanged), and if that misses, match the pipeline
-- regardless of country and adopt ITS country for the lead.
-- Falls back to the phone's dialling code, then the passed-in default.
-- ============================================================

create or replace function m4u_intake(
  p_country country_t,
  p_name text,
  p_phone text,
  p_pipeline_id text default null,
  p_pipeline_name text default null,
  p_contact_id text default null,
  p_opportunity_id text default null,
  p_custom jsonb default '{}'::jsonb,
  p_source text default 'webhook',
  p_raw jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_country country_t := p_country;
  v_norm text; v_prop bigint; v_lead m4u_leads; v_result text; v_id bigint; v_merged jsonb;
begin
  -- 1) pipeline within the assumed country
  select property_id into v_prop from m4u_pipeline_map
   where ghl_pipeline_id = p_pipeline_id and country = v_country;
  if v_prop is null and p_pipeline_name is not null then
    select property_id into v_prop from m4u_pipeline_map
     where lower(ghl_pipeline_name) = lower(p_pipeline_name) and country = v_country;
  end if;

  -- 2) not found: match the pipeline anywhere and take ITS country as the truth
  if v_prop is null then
    select pm.property_id, pm.country into v_prop, v_country
    from m4u_pipeline_map pm
    where pm.ghl_pipeline_id = p_pipeline_id
       or (p_pipeline_name is not null and lower(pm.ghl_pipeline_name) = lower(p_pipeline_name))
    limit 1;
    if v_prop is null then v_country := p_country; end if;
  end if;

  -- 3) still nothing: let the dialling code decide before falling back
  if v_prop is null then
    if p_phone ~ '(\+|^|00)62' then v_country := 'ID';
    elsif p_phone ~ '(\+|^|00)60' then v_country := 'MY';
    end if;
  end if;

  v_norm := m4u_norm_phone(p_phone, v_country);
  if v_norm is null then
    insert into m4u_webhook_log (country, phone_norm, result, raw_json)
    values (v_country, null, 'bad_payload', p_raw);
    return jsonb_build_object('result','bad_payload');
  end if;

  if v_prop is null then
    select id into v_prop from m4u_properties
     where country = v_country and ad_source = '__unassigned__' limit 1;
  end if;

  select * into v_lead from m4u_leads
   where country = v_country and phone_norm = v_norm
   for update;

  if v_lead.id is null then
    insert into m4u_leads (country, ghl_contact_id, ghl_opportunity_id, property_id,
      phone, phone_norm, name, custom_fields, current_label, attempt_count, status, received_at)
    values (v_country, p_contact_id, p_opportunity_id, v_prop, p_phone, v_norm,
      p_name, coalesce(p_custom,'{}'::jsonb), 'New', 0, 'pool', now())
    returning id into v_id;
    v_result := case when v_prop is null then 'unmapped_triage' else 'inserted' end;
    if v_prop is not null then
      insert into m4u_lead_props (lead_id, property_id) values (v_id, v_prop) on conflict do nothing;
    end if;
  else
    v_id := v_lead.id;
    v_merged := coalesce(v_lead.custom_fields,'{}'::jsonb) ||
                coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(p_custom,'{}'::jsonb))
                          where v is not null and v::text <> '""' and v::text <> 'null'), '{}'::jsonb);

    if v_prop is not null and v_prop = v_lead.property_id then
      v_result := 'duplicate_ignored';
      update m4u_leads set custom_fields = v_merged,
        ghl_contact_id = coalesce(ghl_contact_id, p_contact_id)
      where id = v_id;
    elsif v_lead.status = 'locked' then
      v_result := 'multi_locked';
      insert into m4u_lead_props (lead_id, property_id, added_while_locked)
      values (v_id, v_prop, true) on conflict do nothing;
      update m4u_leads set custom_fields = v_merged where id = v_id;
    elsif v_lead.status = 'dead' then
      v_result := 'multi_revived';
      update m4u_leads set status = 'pool', current_label = 'New',
        property_id = coalesce(v_prop, property_id), custom_fields = v_merged,
        cooldown_until = null, updated_at = now()
      where id = v_id;
      insert into m4u_lead_props (lead_id, property_id) values (v_id, v_prop) on conflict do nothing;
    else
      v_result := 'multi_interest';
      update m4u_leads set custom_fields = v_merged, updated_at = now() where id = v_id;
      insert into m4u_lead_props (lead_id, property_id) values (v_id, v_prop) on conflict do nothing;
    end if;
  end if;

  insert into m4u_webhook_log (country, phone_norm, lead_id, result, raw_json)
  values (v_country, v_norm, v_id, v_result, p_raw);

  return jsonb_build_object('result', v_result, 'lead_id', v_id, 'phone_norm', v_norm,
                            'property_id', v_prop, 'country', v_country, 'source', p_source);
end $$;

revoke execute on function m4u_intake(country_t,text,text,text,text,text,text,jsonb,text,jsonb) from anon, authenticated;
