-- 066_m4u_admin_lead.sql — Kelola actions from the PHP console, 1:1 (audit: caller parity).
--
-- The old admin console could revive a dead lead, release a booked lead's
-- ownership, yank a stuck assignment back to the pool, route a lead to a
-- chosen agent (24h soft-reserve) and re-triage its project. m4u_leads has no
-- client write policy on purpose (every mutation is an engine function), so
-- these five admin verbs live in one gated SECURITY DEFINER RPC with the exact
-- semantics of marketing4u/admin/lead_action.php.

create or replace function m4u_admin_lead(
  p_lead bigint,
  p_action text,                -- undead | reassign | release | force_pool | set_property
  p_agent uuid default null,    -- reassign target
  p_property bigint default null -- set_property target
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_lead m4u_leads;
begin
  if auth.uid() is null or not is_admin() then raise exception 'not authorised'; end if;
  select * into v_lead from m4u_leads where id = p_lead for update;
  if v_lead.id is null then raise exception 'lead not found'; end if;
  if v_lead.country::text <> my_country()::text and my_role() <> 'master_admin' then
    raise exception 'not your country';
  end if;

  if p_action = 'undead' then
    -- revive: fresh life in the pool, attempt counter reset
    if v_lead.status <> 'dead' then raise exception 'lead is not dead'; end if;
    update m4u_leads set status = 'pool', attempt_count = 0, current_label = 'New',
        owner_agent_id = null, assigned_to = null, assigned_until = null,
        reserved_for = null, reserved_until = null, cooldown_until = null,
        updated_at = now()
      where id = p_lead;

  elsif p_action = 'reassign' then
    -- route to a specific agent via a 24h soft-reserve (never steals a locked lead)
    if v_lead.status = 'locked' then raise exception 'lead is locked to an owner'; end if;
    if p_agent is null or not exists (
      select 1 from profiles where id = p_agent and status = 'active'
        and role <> 'master_admin' and country::text = v_lead.country::text
    ) then raise exception 'target agent not found'; end if;
    update m4u_leads set status = 'pool', assigned_to = null, assigned_until = null,
        reserved_for = p_agent, reserved_until = now() + interval '24 hours',
        cooldown_until = null, updated_at = now()
      where id = p_lead;

  elsif p_action = 'release' then
    -- unlock a booked lead back to the open pool (clears ownership)
    update m4u_leads set status = 'pool', owner_agent_id = null, current_label = 'New',
        assigned_to = null, assigned_until = null, reserved_for = null,
        reserved_until = null, cooldown_until = null, updated_at = now()
      where id = p_lead;

  elsif p_action = 'force_pool' then
    -- yank a stuck assignment back to the pool
    if v_lead.status <> 'assigned' then raise exception 'lead is not assigned'; end if;
    update m4u_leads set status = 'pool', assigned_to = null, assigned_until = null,
        updated_at = now()
      where id = p_lead;

  elsif p_action = 'set_property' then
    -- triage: move the lead to a real project
    if p_property is null or not exists (select 1 from m4u_properties where id = p_property) then
      raise exception 'project not found';
    end if;
    update m4u_leads set property_id = p_property, updated_at = now() where id = p_lead;

  else
    raise exception 'unknown action %', p_action;
  end if;

  return jsonb_build_object('ok', true, 'action', p_action, 'lead', p_lead);
end $$;

revoke all on function m4u_admin_lead(bigint, text, uuid, bigint) from public, anon;
grant execute on function m4u_admin_lead(bigint, text, uuid, bigint) to authenticated;
