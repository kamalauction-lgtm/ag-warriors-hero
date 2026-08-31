-- ============================================================
-- 092_m4u_grant_approval.sql — repair the M4U project request/approval loop.
-- ADDITIVE. No grant row's approved flag is changed by this migration.
--
-- THREE DEFECTS FOUND IN PRODUCTION (2026-08-24, proven on disposable accounts
-- by tools/diag_m4u_grants.py and tools/diag_m4u_selfapprove.py):
--
--  1. SILENT NO-OP ON APPROVAL.  m4u_grants had exactly one UPDATE policy:
--       u_m4u_grants ... using (agent_id = auth.uid())
--     There was no admin UPDATE policy at all. When an admin pressed "Approve",
--     RLS filtered the row out, PostgREST returned 200 with zero rows changed,
--     and the UI reported "Access approved" while the database was untouched.
--     The agent kept seeing "menunggu kelulusan" because they were still pending.
--     Measured: admin PATCH approved=true -> HTTP 200, rows_changed=0.
--
--  2. ADMIN INSERT REJECTED.  i_m4u_grants (051) is `approved = false` only, so
--     granting a project to an agent who had NOT requested it failed outright
--     with 42501. The 117 approved grants in production all came from the
--     service-key import, never from the console.
--
--  3. SELF-APPROVAL.  The same agent UPDATE policy constrains only agent_id,
--     not which column is written. The comment above it said "approved stays
--     admin-only"; nothing enforced that. An agent could PATCH their own row to
--     approved=true through the REST API and start receiving that project's
--     leads. Measured: agent PATCH approved=true -> HTTP 200, rows=1, persisted.
--     No evidence anyone did this; all 5 pending requests are still pending.
--
-- THE FIX follows the house rule stated at the top of 020: writes to the m4u
-- tables go through SECURITY DEFINER functions, not through table policies.
-- Client write privileges on m4u_grants are revoked entirely, so a column can
-- no longer be written just because the row belongs to you.
--
-- ROLLBACK: re-grant insert/update on m4u_grants to authenticated and re-run
-- 020 + 051. The added columns are additive and harmless if unused.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DECISION PROVENANCE — who decided, when, and why
--    approved_at and requested_at already exist (schema.sql).
-- ------------------------------------------------------------
alter table m4u_grants add column if not exists approved_by uuid references profiles(id);
alter table m4u_grants add column if not exists declined_at timestamptz;
alter table m4u_grants add column if not exists declined_by uuid references profiles(id);
alter table m4u_grants add column if not exists decline_reason text;

comment on column m4u_grants.approved is
  'Admin decision. Writable ONLY through fn_m4u_set_project_access. Agents hold '
  'no write privilege on this table — see migration 092.';

-- ------------------------------------------------------------
-- 2. CLOSE THE WRITE HOLE
--    RLS cannot restrict WHICH column an UPDATE touches, so a row-ownership
--    policy can never keep `approved` out of an agent's reach. Remove the
--    privilege instead; the functions below run as owner.
-- ------------------------------------------------------------
revoke insert, update, delete on m4u_grants from authenticated, anon;
drop policy if exists u_m4u_grants on m4u_grants;
drop policy if exists i_m4u_grants on m4u_grants;

-- reading is unchanged: your own grants, or an admin's full view
drop policy if exists r_m4u_grants on m4u_grants;
create policy r_m4u_grants on m4u_grants for select
  using (agent_id = auth.uid() or is_admin());

-- ------------------------------------------------------------
-- 3. AGENT: request a project (country-scoped, idempotent)
-- ------------------------------------------------------------
create or replace function fn_m4u_request_project(p_property bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_country text; v_prop record; v_existing record;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select country::text into v_country from profiles where id = v_me;

  select id, name, country::text as country into v_prop from m4u_properties where id = p_property;
  if not found then raise exception 'unknown project'; end if;
  if v_prop.country is distinct from v_country then
    raise exception 'that project belongs to another country';
  end if;

  select approved, active into v_existing from m4u_grants
   where agent_id = v_me and property_id = p_property;
  if found then
    return jsonb_build_object('ok', true, 'already', true,
                              'approved', v_existing.approved, 'project', v_prop.name);
  end if;

  insert into m4u_grants (agent_id, property_id, approved, active, requested_at)
  values (v_me, p_property, false, true, now());

  perform audit_log('m4u_project_requested', 'm4u_grant',
                    v_me::text || ':' || p_property::text, null, 'pending',
                    'agent self-request from the Caller app');
  return jsonb_build_object('ok', true, 'already', false, 'approved', false, 'project', v_prop.name);
end $$;
grant execute on function fn_m4u_request_project(bigint) to authenticated;

-- ------------------------------------------------------------
-- 4. AGENT: turn an APPROVED project on or off. Only `active`, never `approved`.
-- ------------------------------------------------------------
create or replace function fn_m4u_toggle_project(p_property bigint, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_approved boolean;
begin
  if v_me is null then raise exception 'auth required'; end if;
  select approved into v_approved from m4u_grants
   where agent_id = v_me and property_id = p_property;
  if v_approved is null then raise exception 'you have no grant on that project'; end if;
  if not v_approved then raise exception 'that project is still waiting for admin approval'; end if;

  update m4u_grants set active = p_active
   where agent_id = v_me and property_id = p_property;
  return jsonb_build_object('ok', true, 'active', p_active);
end $$;
grant execute on function fn_m4u_toggle_project(bigint,boolean) to authenticated;

-- ------------------------------------------------------------
-- 5. ADMIN: the queue that was never shown
--    country_admin sees their own country; master_admin sees both.
-- ------------------------------------------------------------
create or replace function fn_m4u_pending_requests()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_country text;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select role::text, country::text into v_role, v_country from profiles where id = auth.uid();

  return coalesce((
    select jsonb_agg(x order by x->>'requested_at' nulls last)
    from (
      select jsonb_build_object(
               'agent_id', p.id, 'agent_name', p.name, 'agent_email', p.email,
               'agent_country', p.country, 'agent_status', p.status,
               'property_id', pr.id, 'project', pr.name, 'project_type', pr.type,
               'requested_at', g.requested_at,
               'waiting_hours', case when g.requested_at is null then null
                                else floor(extract(epoch from (now() - g.requested_at)) / 3600)::int end) as x
      from m4u_grants g
      join profiles p on p.id = g.agent_id
      join m4u_properties pr on pr.id = g.property_id
      where not g.approved and g.declined_at is null
        and (v_role = 'master_admin' or pr.country::text = v_country)
    ) q), '[]'::jsonb);
end $$;
grant execute on function fn_m4u_pending_requests() to authenticated;

-- ------------------------------------------------------------
-- 6. ADMIN: the decision itself. Approve, remove, or decline.
--    This is the ONLY path that may write m4u_grants.approved.
-- ------------------------------------------------------------
create or replace function fn_m4u_set_project_access(
  p_agent uuid, p_property bigint, p_approved boolean, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_country text; v_prop record; v_agent record; v_prev boolean; v_lang text;
  v_msg text;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select role::text, country::text into v_role, v_country from profiles where id = auth.uid();

  -- FOUND is reset by every SELECT INTO, so each one is checked immediately
  select id, name, country::text as country, type into v_prop from m4u_properties where id = p_property;
  if not found then raise exception 'unknown project'; end if;
  select id, name, country::text as country into v_agent from profiles where id = p_agent;
  if not found then raise exception 'unknown agent'; end if;

  -- a country admin decides only for their own country, on both sides
  if v_role <> 'master_admin' then
    if v_prop.country is distinct from v_country or v_agent.country is distinct from v_country then
      raise exception 'that agent or project is outside your country';
    end if;
  end if;
  -- an agent never gets another country's project, whoever is deciding
  if v_agent.country is distinct from v_prop.country then
    raise exception 'agent is % but the project is %', v_agent.country, v_prop.country;
  end if;

  select approved into v_prev from m4u_grants where agent_id = p_agent and property_id = p_property;

  insert into m4u_grants (agent_id, property_id, approved, active, approved_at, approved_by)
  values (p_agent, p_property, p_approved, true,
          case when p_approved then now() end, case when p_approved then auth.uid() end)
  on conflict (agent_id, property_id) do update
    set approved = excluded.approved,
        approved_at = case when p_approved then now() else m4u_grants.approved_at end,
        approved_by = case when p_approved then auth.uid() else m4u_grants.approved_by end,
        declined_at = null, declined_by = null, decline_reason = null;

  perform audit_log(case when p_approved then 'm4u_access_approved' else 'm4u_access_removed' end,
                    'm4u_grant', p_agent::text || ':' || p_property::text,
                    coalesce(v_prev::text, 'none'), p_approved::text, p_reason);

  -- tell the agent, in their own language, through the existing Messages thread
  select coalesce(language, case when v_agent.country = 'ID' then 'id' else 'ms' end)
    into v_lang from profiles where id = p_agent;
  v_msg := case
    when p_approved and v_lang = 'id' then 'Proyek "' || v_prop.name || '" sudah disetujui. Lead bisa mulai masuk.'
    when p_approved and v_lang = 'en' then 'Your access to "' || v_prop.name || '" has been approved. Leads can now reach you.'
    when p_approved then 'Projek "' || v_prop.name || '" telah diluluskan. Lead boleh mula masuk.'
    when v_lang = 'id' then 'Akses ke proyek "' || v_prop.name || '" dihentikan.'
    when v_lang = 'en' then 'Your access to "' || v_prop.name || '" has been removed.'
    else 'Akses ke projek "' || v_prop.name || '" telah ditarik.' end;
  if p_reason is not null and length(trim(p_reason)) > 0 then
    v_msg := v_msg || ' — ' || p_reason;
  end if;
  insert into m4u_notes (lead_id, parent_id, author_id, author_role, target_agent_id,
                         bucket_label, body, requires_response)
  values (null, null, auth.uid(), 'admin', p_agent, 'project_access', v_msg, false);

  return jsonb_build_object('ok', true, 'approved', p_approved,
                            'agent', v_agent.name, 'project', v_prop.name);
end $$;
grant execute on function fn_m4u_set_project_access(uuid,bigint,boolean,text) to authenticated;

-- decline a REQUEST: the row is marked, not deleted, so the request is not
-- silently lost and the agent is told why.
create or replace function fn_m4u_decline_request(p_agent uuid, p_property bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text; v_country text; v_prop record; v_lang text; v_body text;
begin
  if not is_admin() then raise exception 'not authorised'; end if;
  select role::text, country::text into v_role, v_country from profiles where id = auth.uid();
  select id, name, country::text as country into v_prop from m4u_properties where id = p_property;
  if not found then raise exception 'unknown project'; end if;
  if v_role <> 'master_admin' and v_prop.country is distinct from v_country then
    raise exception 'that project is outside your country';
  end if;
  if not exists (select 1 from m4u_grants where agent_id = p_agent
                   and property_id = p_property and not approved) then
    raise exception 'there is no pending request to decline';
  end if;

  update m4u_grants
     set declined_at = now(), declined_by = auth.uid(), decline_reason = p_reason
   where agent_id = p_agent and property_id = p_property;

  perform audit_log('m4u_access_declined', 'm4u_grant',
                    p_agent::text || ':' || p_property::text, 'pending', 'declined', p_reason);

  select coalesce(language, 'ms') into v_lang from profiles where id = p_agent;
  v_body := case
    when v_lang = 'id' then 'Permintaan proyek "' || v_prop.name || '" belum disetujui.'
    when v_lang = 'en' then 'Your request for "' || v_prop.name || '" was not approved.'
    else 'Permohonan projek "' || v_prop.name || '" belum diluluskan.' end;
  if p_reason is not null and length(trim(p_reason)) > 0 then v_body := v_body || ' — ' || p_reason; end if;
  insert into m4u_notes (lead_id, parent_id, author_id, author_role, target_agent_id,
                         bucket_label, body, requires_response)
  values (null, null, auth.uid(), 'admin', p_agent, 'project_access', v_body, false);

  return jsonb_build_object('ok', true, 'declined', true, 'project', v_prop.name);
end $$;
grant execute on function fn_m4u_decline_request(uuid,bigint,text) to authenticated;

-- an agent may ask again after a decline; that clears the decline marks
create or replace function fn_m4u_reopen_request(p_property bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'auth required'; end if;
  update m4u_grants set declined_at = null, declined_by = null, decline_reason = null,
                        requested_at = now()
   where agent_id = v_me and property_id = p_property and not approved;
  if not found then raise exception 'nothing to reopen'; end if;
  perform audit_log('m4u_project_requested', 'm4u_grant',
                    v_me::text || ':' || p_property::text, 'declined', 'pending', 'agent asked again');
  return jsonb_build_object('ok', true);
end $$;
grant execute on function fn_m4u_reopen_request(bigint) to authenticated;

-- ------------------------------------------------------------
-- 7. VERIFY
-- ------------------------------------------------------------
select 'write privileges on m4u_grants' as check, grantee, privilege_type
  from information_schema.role_table_grants
 where table_name = 'm4u_grants' and grantee in ('authenticated','anon')
 order by grantee, privilege_type;

select 'policies remaining' as check, policyname, cmd from pg_policies
 where tablename = 'm4u_grants';

select 'pending requests (unchanged by this migration)' as check,
       p.name as agent, pr.name as project, g.requested_at
  from m4u_grants g join profiles p on p.id = g.agent_id
  join m4u_properties pr on pr.id = g.property_id
 where not g.approved order by g.requested_at nulls last;
