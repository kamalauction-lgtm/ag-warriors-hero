-- 069_pending_lockdown.sql — a pending account sees NOTHING but its own row.
--
-- 068 opened public self-registration. A pending (unapproved) user still holds
-- a valid JWT, and the old profiles read policy was country-wide — a stranger
-- could register and immediately list every same-country agent's name+phone
-- via the REST API. Now the country-wide read requires the CALLER to be an
-- approved (active) account; a pending user reads only their own profile.

-- definer helper, same pattern as my_country()/my_role() (avoids RLS recursion)
create or replace function my_status()
returns text language sql stable security definer set search_path = public as
$$ select status from profiles where id = auth.uid() $$;
revoke all on function my_status() from public, anon;
grant execute on function my_status() to authenticated;

drop policy if exists p_profiles_read on profiles;
create policy p_profiles_read on profiles for select using (
  id = auth.uid()
  or (my_status() = 'active'
      and (country = my_country() or my_role() = 'master_admin'))
);
