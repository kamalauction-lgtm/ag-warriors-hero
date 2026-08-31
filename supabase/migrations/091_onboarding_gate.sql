-- ============================================================
-- 091_onboarding_gate.sql — repair the Global App Onboarding gate. ADDITIVE.
--
-- THE BUG: profileToUser() in the client never mapped profiles.onboarded, so
-- user.onboarded was always undefined and App.tsx's `user.onboarded === false`
-- gate never fired. The database column was correct all along.
--
-- WHAT THE PRODUCTION AUDIT FOUND (2026-08-23, read-only):
--   53 profiles · 51 onboarded=true · 2 onboarded=false · 0 NULL
--   The 2 false are BOTH status='pending' and have zero production activity.
--   A pending profile cannot sign in at all (069 pending lockdown).
--   Every one of the 25 users with real activity is already onboarded=true.
--
-- THEREFORE NO BACKFILL IS NEEDED. Grandfathering already happened, deliberately,
-- at migration time: tools/m4u_agents.py:104 imported the 49 Bluehost agents with
-- onboarded=true on 2026-08-03 because they were existing working agents, not new
-- recruits. This migration RECORDS that decision rather than re-performing it.
-- Not one profile row is modified here.
--
-- ROLLBACK: set ch_feature_flags.enabled=false for global_onboarding_gate, or
-- drop fn_app_flags. No data to revert.
-- ============================================================

-- ------------------------------------------------------------
-- 1. THE THREE ONBOARDING LAYERS ARE SEPARATE — record it in the schema
-- ------------------------------------------------------------
comment on column profiles.onboarded is
  'GLOBAL APP ONBOARDING only. Whether this person completed the Hero app''s own '
  'first-run setup. It is NOT Grow onboarding (onb_progress) and NOT 30 Days '
  'readiness (readiness_submissions / enrolments.status). Never reuse it for either.';

-- ------------------------------------------------------------
-- 2. FEATURE FLAG — staged rollout, reversible in one row
-- ------------------------------------------------------------
insert into ch_feature_flags (flag, enabled, note) values
 ('global_onboarding_gate', false,
  'Global App Onboarding gate. OFF until the repaired client mapping is proven on a '
  'controlled account. Turning it ON gates any profile with onboarded=false; as of '
  '2026-08-23 that is nobody who can sign in.')
on conflict (flag) do nothing;

create or replace function fn_app_flags()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(flag, enabled), '{}'::jsonb)
  from ch_feature_flags where auth.uid() is not null;
$$;
grant execute on function fn_app_flags() to authenticated;

create or replace function fn_admin_set_flag(p_flag text, p_enabled boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_prev boolean;
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  select enabled into v_prev from ch_feature_flags where flag = p_flag;
  if v_prev is null then raise exception 'unknown flag %', p_flag; end if;
  update ch_feature_flags set enabled = p_enabled,
         note = coalesce(p_note, note) where flag = p_flag;
  perform audit_log('feature_flag','ch_feature_flag', p_flag,
                    v_prev::text, p_enabled::text, p_note);
end $$;
grant execute on function fn_admin_set_flag(text,boolean,text) to authenticated;

-- ------------------------------------------------------------
-- 3. COMPLETING GLOBAL ONBOARDING — server-side, audited
--    The client previously wrote profiles.onboarded directly.
-- ------------------------------------------------------------
create or replace function fn_complete_onboarding()
returns void language plpgsql security definer set search_path = public as $$
declare v_was boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select onboarded into v_was from profiles where id = auth.uid();
  if v_was is null then raise exception 'no profile'; end if;
  if v_was then return; end if;                       -- idempotent
  update profiles set onboarded = true where id = auth.uid();
  perform audit_log('global_onboarding_completed','profile', auth.uid()::text,
                    'false', 'true', 'completed by the participant');
end $$;
grant execute on function fn_complete_onboarding() to authenticated;

-- what the gate needs to decide, in one authorised call
create or replace function fn_onboarding_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'global_onboarded', p.onboarded,
    'gate_enabled', coalesce((select enabled from ch_feature_flags
                              where flag = 'global_onboarding_gate'), false),
    'status', p.status,
    -- the other two layers, reported so nothing conflates them.
    -- NOTE: onb_progress keys on agent_id, not user_id.
    'grow_onboarding_started', exists (select 1 from onb_progress o where o.agent_id = p.id),
    'grow_lessons_completed', (select count(*) from onb_progress o
                               where o.agent_id = p.id and o.status = 'completed'),
    'challenge_stage', coalesce((select e.status from enrolments e
                                 where e.participant_id = p.id
                                 order by e.created_at desc limit 1), 'none'))
  from profiles p where p.id = auth.uid();
$$;
grant execute on function fn_onboarding_state() to authenticated;

-- ------------------------------------------------------------
-- 4. RECORD THE GRANDFATHERING DECISION (no row is changed)
-- ------------------------------------------------------------
do $gf$
declare v_true int; v_false int; v_active_false int; v_by uuid;
begin
  select count(*) filter (where onboarded),
         count(*) filter (where not onboarded),
         count(*) filter (where not onboarded and status = 'active')
    into v_true, v_false, v_active_false from profiles;
  select id into v_by from profiles where lower(email) = 'kamal.auction@gmail.com' limit 1;

  insert into audit_events (actor, actor_role, action, entity_type, entity_id,
                            prev_state, new_state, reason, actor_type,
                            authorized_by_user_id, execution_method, meta)
  values (null, 'service', 'onboarding_grandfathering_recorded', 'profiles', 'all',
          'gate never enforced (client mapping missing)', 'gate repairable, no backfill required',
          'Production audit 2026-08-23: ' || v_true || ' profiles already onboarded=true, ' ||
          v_false || ' false, of which ' || v_active_false || ' are active. The 49 Bluehost agents ' ||
          'were deliberately imported with onboarded=true on 2026-08-03 (tools/m4u_agents.py) ' ||
          'because they were existing working agents. That WAS the grandfathering. No profile ' ||
          'row is modified by this migration.',
          'system', v_by, 'migration',
          jsonb_build_object('onboarded_true', v_true, 'onboarded_false', v_false,
                             'active_and_not_onboarded', v_active_false,
                             'effective_date', '2026-08-23'));
  raise notice 'grandfathering recorded: % true, % false (% active)', v_true, v_false, v_active_false;
end $gf$;

-- ------------------------------------------------------------
-- 5. VERIFY
-- ------------------------------------------------------------
select 'onboarding split' as check,
       count(*) filter (where onboarded) as onboarded_true,
       count(*) filter (where not onboarded) as onboarded_false,
       count(*) filter (where not onboarded and status = 'active') as would_be_gated_and_can_sign_in
  from profiles;
select 'gate flag' as check, flag, enabled from ch_feature_flags where flag = 'global_onboarding_gate';
select 'the two not onboarded' as check, name, status, email from profiles where not onboarded;
