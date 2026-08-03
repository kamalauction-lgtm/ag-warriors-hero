-- ============================================================
-- 012_role_delegation.sql — Delegate reviewing to Elite Coaches. ADDITIVE.
--
-- WHY: notify_reviewers() falls back to Commanders when a participant has no
-- coach assigned. With no way to appoint coaches, EVERY submission from EVERY
-- warrior lands on Kamal alone. This adds the missing governance controls.
--
-- Role grants are audited (§29) and never automatic — a human super_admin acts.
-- ============================================================

-- Grant / revoke a challenge role
create or replace function fn_set_challenge_role(p_user uuid, p_role text, p_grant boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if not has_role('super_admin') then raise exception 'not authorised'; end if;
  if p_role not in ('super_admin','master_mentor','elite_coach','participant') then
    raise exception 'unknown role %', p_role;
  end if;
  -- lockout protection: you may not strip your own super_admin
  if not p_grant and p_role = 'super_admin' and p_user = auth.uid() then
    raise exception 'cannot remove your own super_admin role';
  end if;
  select name into v_name from profiles where id = p_user;
  if v_name is null then raise exception 'no such profile'; end if;

  if p_grant then
    insert into user_roles (user_id, role, granted_by)
    values (p_user, p_role, auth.uid()) on conflict do nothing;
    perform audit_log('role_granted','user_role', p_user::text, null, p_role, v_name);
    perform fn_notify(p_user, 'role', '🎖 New role: ' || replace(p_role,'_',' '),
      'Leadership granted you the ' || replace(p_role,'_',' ') || ' role.', '#/coach');
  else
    delete from user_roles where user_id = p_user and role = p_role;
    perform audit_log('role_revoked','user_role', p_user::text, p_role, null, v_name);
  end if;
end $$;

-- Assign / unassign a participant to an Elite Coach
create or replace function fn_assign_coach(p_participant uuid, p_coach uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_coach text; v_part text;
begin
  if not (has_role('super_admin') or has_role('master_mentor')) then
    raise exception 'not authorised';
  end if;
  if p_participant = p_coach then raise exception 'a warrior cannot coach themselves'; end if;
  select name into v_coach from profiles where id = p_coach;
  select name into v_part  from profiles where id = p_participant;
  if v_coach is null or v_part is null then raise exception 'no such profile'; end if;
  -- the coach must actually hold a reviewing role, else reviews would still fail
  if not exists (select 1 from user_roles where user_id = p_coach
                 and role in ('elite_coach','master_mentor','super_admin')) then
    raise exception 'assign the Elite Coach role to % first', v_coach;
  end if;

  insert into coach_assignments (coach_id, participant_id, assigned_by, active)
  values (p_coach, p_participant, auth.uid(), p_active)
  on conflict (coach_id, participant_id) do update set active = excluded.active,
    assigned_by = excluded.assigned_by;

  perform audit_log(case when p_active then 'coach_assigned' else 'coach_unassigned' end,
    'coach_assignment', p_coach::text || ':' || p_participant::text, null,
    case when p_active then 'active' else 'inactive' end, v_coach || ' → ' || v_part);

  if p_active then
    perform fn_notify(p_coach, 'coaching', '👥 New warrior assigned',
      'You are now the Coach for ' || v_part || '. Their reviews come to you.', '#/coach');
    perform fn_notify(p_participant, 'coaching', '🧭 Your Coach',
      v_coach || ' is now your Coach for the 30 Days Closing Challenge.', '#/challenge');
  end if;
end $$;

grant execute on function fn_set_challenge_role(uuid,text,boolean) to authenticated;
grant execute on function fn_assign_coach(uuid,uuid,boolean) to authenticated;
