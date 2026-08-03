-- ============================================================
-- 019_m4u_intake.sql — Webhook/Excel intake (spec §7). ADDITIVE.
-- ONE intake path for both the GHL webhook and Excel import (invariant #4).
-- Dedupe is row-locked on phone_norm (invariant #1).
-- Results mirror the PHP engine exactly:
--   inserted | multi_interest | multi_revived | multi_locked |
--   duplicate_ignored | unmapped_triage
-- ============================================================

-- normalize_phone (spec §7): keep +, 00->+, bare 60/62->+, leading 0->+CC, else +CC+digits
create or replace function m4u_norm_phone(p_raw text, p_country country_t)
returns text language plpgsql immutable as $$
declare d text; cc text;
begin
  if p_raw is null or btrim(p_raw) = '' then return null; end if;
  cc := case when p_country = 'ID' then '62' else '60' end;
  d := regexp_replace(p_raw, '[^0-9+]', '', 'g');
  if d like '+%'  then return '+' || regexp_replace(substr(d,2), '[^0-9]', '', 'g'); end if;
  if d like '00%' then return '+' || substr(d,3); end if;
  if d like '60%' or d like '62%' then return '+' || d; end if;
  if d like '0%'  then return '+' || cc || substr(d,2); end if;
  return '+' || cc || d;
end $$;

-- The single intake path.
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
  v_norm text; v_prop bigint; v_lead m4u_leads; v_result text; v_id bigint; v_merged jsonb;
begin
  v_norm := m4u_norm_phone(p_phone, p_country);
  if v_norm is null then
    insert into m4u_webhook_log (country, phone_norm, result, raw_json)
    values (p_country, null, 'bad_payload', p_raw);
    return jsonb_build_object('result','bad_payload');
  end if;

  -- pipeline -> property (by id, then by name); else triage (spec §7)
  select property_id into v_prop from m4u_pipeline_map
   where ghl_pipeline_id = p_pipeline_id and country = p_country;
  if v_prop is null and p_pipeline_name is not null then
    select property_id into v_prop from m4u_pipeline_map
     where lower(ghl_pipeline_name) = lower(p_pipeline_name) and country = p_country;
  end if;
  if v_prop is null then
    select id into v_prop from m4u_properties
     where country = p_country and ad_source = '__unassigned__' limit 1;
  end if;

  -- row-locked dedupe on (country, phone_norm)
  select * into v_lead from m4u_leads
   where country = p_country and phone_norm = v_norm
   for update;

  if v_lead.id is null then
    insert into m4u_leads (country, ghl_contact_id, ghl_opportunity_id, property_id,
      phone, phone_norm, name, custom_fields, current_label, attempt_count, status, received_at)
    values (p_country, p_contact_id, p_opportunity_id, v_prop, p_phone, v_norm,
      p_name, coalesce(p_custom,'{}'::jsonb), 'New', 0, 'pool', now())
    returning id into v_id;
    v_result := case when v_prop is null then 'unmapped_triage' else 'inserted' end;
    if v_prop is not null then
      insert into m4u_lead_props (lead_id, property_id) values (v_id, v_prop) on conflict do nothing;
    end if;
  else
    v_id := v_lead.id;
    -- merge custom fields: new non-empty wins, never drop existing (spec §7)
    v_merged := coalesce(v_lead.custom_fields,'{}'::jsonb) ||
                coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(p_custom,'{}'::jsonb))
                          where v is not null and v::text <> '""' and v::text <> 'null'), '{}'::jsonb);

    if v_prop is not null and v_prop = v_lead.property_id then
      v_result := 'duplicate_ignored';
      update m4u_leads set custom_fields = v_merged,
        ghl_contact_id = coalesce(ghl_contact_id, p_contact_id)
      where id = v_id;                       -- NOTE: no updated_at touch — keeps queue position
    elsif v_lead.status = 'locked' then
      v_result := 'multi_locked';            -- keep the owner; just record the interest
      insert into m4u_lead_props (lead_id, property_id, added_while_locked)
      values (v_id, v_prop, true) on conflict do nothing;
      update m4u_leads set custom_fields = v_merged where id = v_id;
    elsif v_lead.status = 'dead' then
      v_result := 'multi_revived';           -- revive to pool, KEEP attempt_count
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
  values (p_country, v_norm, v_id, v_result, p_raw);

  return jsonb_build_object('result', v_result, 'lead_id', v_id, 'phone_norm', v_norm,
                            'property_id', v_prop, 'source', p_source);
end $$;

revoke execute on function m4u_intake(country_t,text,text,text,text,text,text,jsonb,text,jsonb) from anon, authenticated;
-- service_role only: the Worker authenticates the caller before invoking this.
