-- ============================================================
-- 070_m4u_registered.sql — kill a lead from the calling pool the
-- moment they REGISTER for a session at kamalag.com/sesi. ADDITIVE.
--
-- WHY: Kamal's rule — "once they register, remove their number so
-- no one calls them." GHL REC 07 (fires on every /sesi registration,
-- web + walk-in) now POSTs to the Worker's /registered route, which
-- calls this RPC.
--
-- WHAT IT DOES: every m4u_leads row matching the phone (MY or ID
-- normalisation, any country) becomes status='dead' with label
-- 'Registered' — the pull queue can never serve it again — and all
-- reservation/assignment/cooldown pointers are cleared. If the lead
-- has a GHL contact id, ghl_sync_pending is set so the existing
-- */5-min reconcile cron tags the GHL contact `M4U: Registered`
-- (visible to the whole team). Admins still see the lead in the dead
-- list labelled Registered, with Revive available if ever needed.
--
-- Note: 'Registered' matches no GHL stage name (stages are e.g.
-- "REN Registered"), so the reconcile applies the tag only — no
-- accidental stage move.
-- ============================================================

create or replace function m4u_mark_registered(p_phone text, p_name text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_norm_my text := m4u_norm_phone(p_phone, 'MY'::country_t);
  v_norm_id text := m4u_norm_phone(p_phone, 'ID'::country_t);
  v_killed int := 0;
  r record;
begin
  if v_norm_my is null and v_norm_id is null then
    insert into m4u_webhook_log (country, phone_norm, result, raw_json)
    values ('MY'::country_t, null, 'registered_badphone',
            jsonb_build_object('phone', p_phone, 'name', p_name));
    return jsonb_build_object('ok', false, 'reason', 'bad_phone');
  end if;

  for r in
    select id, status, current_label, ghl_contact_id
      from m4u_leads
     where phone_norm in (v_norm_my, v_norm_id)
     for update
  loop
    -- already killed by an earlier registration → idempotent skip
    if r.status = 'dead'::lead_status_t and r.current_label = 'Registered' then
      continue;
    end if;

    update m4u_leads set
      status            = 'dead'::lead_status_t,
      current_label     = 'Registered',
      reserved_for      = null,
      reserved_until    = null,
      cooldown_until    = null,
      assigned_to       = null,
      assigned_until    = null,
      ghl_sync_pending  = (r.ghl_contact_id is not null),
      ghl_pending_label = case when r.ghl_contact_id is not null then 'Registered' else ghl_pending_label end,
      updated_at        = now()
    where id = r.id;

    v_killed := v_killed + 1;
  end loop;

  insert into m4u_webhook_log (country, phone_norm, result, raw_json)
  values ('MY'::country_t, coalesce(v_norm_my, v_norm_id),
          case when v_killed > 0 then 'registered_kill' else 'registered_nomatch' end,
          jsonb_build_object('phone', p_phone, 'name', p_name, 'killed', v_killed));

  return jsonb_build_object('ok', true, 'killed', v_killed);
end $$;

revoke execute on function m4u_mark_registered(text, text) from public, anon, authenticated;
-- service-role (the Worker) only.
