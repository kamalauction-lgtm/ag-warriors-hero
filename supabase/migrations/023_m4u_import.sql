-- ============================================================
-- 023_m4u_import.sql — admin bulk import. ADDITIVE.
--
-- Spreadsheet rows funnel through the SAME intake path as the GHL webhook
-- (spec invariant #4), so dedupe, multi-interest, revival and custom-field
-- merging behave identically. This is just an authorised doorway to it:
-- m4u_intake is service-role only, so admins get this checked wrapper.
-- ============================================================

create or replace function m4u_import_row(
  p_country country_t,
  p_name text,
  p_phone text,
  p_property_id bigint default null,
  p_custom jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_pipeline text; v_res jsonb;
begin
  if not (is_admin() and (p_country = my_country() or my_role() = 'master_admin')) then
    raise exception 'not authorised';
  end if;

  -- Reuse the project's own pipeline mapping when one exists, so an imported
  -- row lands on exactly the project the admin picked.
  select ghl_pipeline_id into v_pipeline from m4u_pipeline_map
   where property_id = p_property_id and country = p_country limit 1;

  v_res := m4u_intake(
    p_country      => p_country,
    p_name         => p_name,
    p_phone        => p_phone,
    p_pipeline_id  => v_pipeline,
    p_pipeline_name=> null,
    p_contact_id   => null,
    p_opportunity_id => null,
    p_custom       => coalesce(p_custom, '{}'::jsonb),
    p_source       => 'import',
    p_raw          => jsonb_build_object('source','import','by',auth.uid())
  );

  -- If the sheet named a project explicitly, honour it even when no pipeline
  -- mapping exists (otherwise the row would sit in triage).
  if p_property_id is not null and (v_res->>'property_id') is null then
    update m4u_leads set property_id = p_property_id
     where id = (v_res->>'lead_id')::bigint and property_id is null;
    insert into m4u_lead_props (lead_id, property_id)
    values ((v_res->>'lead_id')::bigint, p_property_id)
    on conflict do nothing;
    v_res := v_res || jsonb_build_object('property_id', p_property_id);
  end if;

  return v_res;
end $$;

grant execute on function m4u_import_row(country_t,text,text,bigint,jsonb) to authenticated;
