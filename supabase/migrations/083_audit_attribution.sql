-- ============================================================
-- 083_audit_attribution.sql — truthful attribution for system-assisted actions.
--
-- PROBLEM. audit_events has ONE actor column. When an action is authorised by a
-- human but executed through a service credential (a migration, a cron job, an
-- operator running a script), recording the human in `actor` implies they
-- personally authenticated and performed it. That is not what happened.
--
-- FIX (additive, non-destructive). Separate three concepts that were conflated:
--     actor                  — the principal recorded on the event (unchanged)
--     actor_type             — 'user' | 'service' | 'system'
--     authorized_by_user_id  — the human who explicitly authorised it
--     execution_method       — 'ui' | 'rpc' | 'service_assisted' | 'migration' | 'automated'
--
-- No existing row is deleted and no existing value is overwritten with a
-- falsehood. Historical rows are backfilled to their true values: everything
-- written by audit_log() under an authenticated session is 'user' + 'rpc',
-- because that is what it was.
-- ============================================================

alter table audit_events add column if not exists actor_type text
  not null default 'user' check (actor_type in ('user','service','system'));
alter table audit_events add column if not exists authorized_by_user_id uuid references profiles(id);
alter table audit_events add column if not exists execution_method text
  not null default 'rpc' check (execution_method in ('ui','rpc','service_assisted','migration','automated'));

comment on column audit_events.actor_type is
  'What kind of principal `actor` refers to. user = an authenticated person acted. service = a service credential executed it. system = a scheduled job with no human in the loop.';
comment on column audit_events.authorized_by_user_id is
  'The human who explicitly authorised the action, when that is a different fact from who executed it. Never inferred — only set when an authorisation was actually given.';
comment on column audit_events.execution_method is
  'How the action reached the database. service_assisted = a human authorised it and an operator/service executed it on their behalf.';

-- ------------------------------------------------------------
-- Backfill: every pre-existing row came from audit_log() inside a
-- security-definer RPC called by an authenticated session. 'user' + 'rpc' is
-- the truth for those, and it is already the column default.
-- The cron sweep is the one automated writer.
-- ------------------------------------------------------------
update audit_events set actor_type = 'system', execution_method = 'automated'
 where action = 'challenge_sweep' and actor is null;

-- ------------------------------------------------------------
-- audit_log() now records HOW it was called, without changing any call site.
-- auth.uid() is null exactly when a service credential is executing.
-- ------------------------------------------------------------
create or replace function audit_log(
  p_action text, p_entity text, p_id text,
  p_prev text, p_new text, p_reason text default null
) returns void language sql security definer set search_path = public as $$
  insert into audit_events (actor, actor_role, action, entity_type, entity_id,
                            prev_state, new_state, reason, actor_type, execution_method)
  values (
    auth.uid(),
    coalesce((select string_agg(role, ',') from user_roles where user_id = auth.uid()),
             (select role::text from profiles where id = auth.uid())),
    p_action, p_entity, p_id, p_prev, p_new, p_reason,
    case when auth.uid() is null then 'service' else 'user' end,
    case when auth.uid() is null then 'service_assisted' else 'rpc' end
  );
$$;

-- explicit variant for operator-executed, human-authorised actions
create or replace function audit_log_assisted(
  p_action text, p_entity text, p_id text, p_prev text, p_new text,
  p_reason text, p_authorized_by uuid, p_method text default 'service_assisted'
) returns void language sql security definer set search_path = public as $$
  insert into audit_events (actor, actor_role, action, entity_type, entity_id,
                            prev_state, new_state, reason,
                            actor_type, authorized_by_user_id, execution_method)
  values (auth.uid(), 'service', p_action, p_entity, p_id, p_prev, p_new, p_reason,
          case when auth.uid() is null then 'service' else 'user' end,
          p_authorized_by, p_method);
$$;
revoke execute on function audit_log_assisted(text,text,text,text,text,text,uuid,text)
  from public, anon, authenticated;

-- ------------------------------------------------------------
-- CORRECT THE ONE HISTORICAL EVENT THIS APPLIES TO.
--
-- On 2026-08-23 Kamal explicitly authorised approving tary's readiness ("luluskan
-- readyness"). It was executed with the service key because fn_review_readiness
-- requires an authenticated reviewer identity and no session existed. The rows
-- recorded actor = Kamal, which reads as "Kamal signed in and clicked Approve".
--
-- We keep actor = Kamal (he is the responsible principal and that is not a lie)
-- and ADD the missing facts. Nothing is deleted or overwritten with a falsehood.
-- A separate correction event records that this metadata was added after the fact.
-- ------------------------------------------------------------
do $fix$
declare v_n int;
begin
  update audit_events set
    actor_type = 'service',
    authorized_by_user_id = actor,
    execution_method = 'service_assisted',
    reason = coalesce(reason,'') ||
      ' [Attribution: explicitly authorised by Kamal AG in the operating session; executed via service credential because fn_review_readiness requires an authenticated reviewer identity.]'
  where action in ('readiness_review','activation')
    and entity_id in ('e0034921-a8a5-4ba4-b853-b1ab0550cbfe',   -- tary's readiness
                      'e2d3b2c2-3ec9-4064-9338-b57abf2bd415')   -- tary's enrolment
    and at::date = date '2026-08-23'
    and actor_type <> 'service';
  get diagnostics v_n = row_count;

  insert into audit_events (actor, actor_role, country, action, entity_type, entity_id,
                            prev_state, new_state, reason, actor_type,
                            authorized_by_user_id, execution_method, meta)
  values (null, 'service', 'ID', 'audit_attribution_corrected', 'audit_event',
          'readiness_review+activation:tary', 'actor=user (implied)', 'actor_type=service',
          'Migration 083. The two events were written with actor = Kamal AG, which implied he '
          'personally authenticated and executed the database action. He authorised it; a service '
          'credential executed it. The original events are preserved; the missing attribution '
          'columns were populated. No historical value was destroyed.',
          'system', 'af264084-79dc-4378-9a3d-1e4e79d941ce', 'migration',
          jsonb_build_object('rows_corrected', v_n));
  raise notice 'attribution corrected on % row(s)', v_n;
end $fix$;

-- ------------------------------------------------------------
-- VERIFY
-- ------------------------------------------------------------
select 'attribution breakdown' as check, actor_type, execution_method, count(*) as n
  from audit_events group by actor_type, execution_method order by n desc;
select at, action, actor_type, execution_method, authorized_by_user_id
  from audit_events
 where action in ('readiness_review','activation','audit_attribution_corrected')
 order by at desc limit 5;
