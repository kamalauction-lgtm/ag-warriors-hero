-- ============================================================
-- 009_invitations.sql — Invitation flow (§6 INVITED, §21 invitation acceptance). ADDITIVE.
-- Leadership invites by code → warrior signs up → fn_accept_invitation builds the
-- profile server-side and marks the invite accepted. WhatsApp is the delivery channel.
-- ============================================================

create table invitations (
  code text primary key,
  name text not null,
  phone text not null,
  country country_t not null default 'MY',
  cohort_id uuid references cohorts(id),
  invited_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  accepted_by uuid references profiles(id),
  accepted_at timestamptz,
  created_at timestamptz default now()
);
alter table invitations enable row level security;

-- only challenge leadership sees/manages invitations (acceptance goes through RPCs)
create policy r_invites on invitations for select using (
  invited_by = auth.uid() or has_role('super_admin') or has_role('master_mentor'));
create policy u_invites_revoke on invitations for update
  using (invited_by = auth.uid() or has_role('super_admin'))
  with check (status in ('pending','revoked'));

-- Leadership creates an invitation → returns the code
create or replace function fn_create_invitation(
  p_name text, p_phone text, p_country country_t, p_cohort uuid
) returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not (has_role('super_admin') or has_role('master_mentor') or has_role('elite_coach')) then
    raise exception 'not authorised';
  end if;
  if exists (select 1 from profiles where phone = p_phone) then
    raise exception 'phone already registered';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into invitations (code, name, phone, country, cohort_id, invited_by)
  values (v_code, p_name, p_phone, p_country, p_cohort, auth.uid());
  perform audit_log('invitation_created','invitation', v_code, null, 'pending', p_name);
  return v_code;
end $$;

-- Public preview so the join page can greet by name BEFORE signup (anon-callable; code = secret)
create or replace function fn_invite_preview(p_code text)
returns table (name text, country country_t, cohort_name text)
language sql security definer set search_path = public as $$
  select i.name, i.country, c.name
  from invitations i left join cohorts c on c.id = i.cohort_id
  where i.code = upper(p_code) and i.status = 'pending'
$$;

-- Called AFTER auth signup (authenticated) — builds the profile from the invitation
create or replace function fn_accept_invitation(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v invitations;
begin
  select * into v from invitations where code = upper(p_code) and status = 'pending';
  if v.code is null then raise exception 'invitation not found or already used'; end if;
  insert into profiles (id, name, phone, email, country, status, onboarded)
  values (auth.uid(), v.name, v.phone,
          (select email from auth.users where id = auth.uid()),
          v.country, 'active', false)
  on conflict (id) do nothing;
  insert into user_roles (user_id, role) values (auth.uid(), 'participant')
  on conflict do nothing;
  update invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where code = v.code;
  perform audit_log('invitation_accepted','invitation', v.code, 'pending', 'accepted', v.name);
  perform fn_notify(v.invited_by, 'invitation', '🎉 Invitation accepted',
    v.name || ' has joined IQI AG Hero — onboarding started.', '#/coach');
end $$;

grant execute on function fn_create_invitation(text,text,country_t,uuid) to authenticated;
grant execute on function fn_invite_preview(text) to anon, authenticated;
grant execute on function fn_accept_invitation(text) to authenticated;
