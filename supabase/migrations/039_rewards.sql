-- 039_rewards.sql — make the rewards catalogue real and protected.
--
-- Two problems, one migration:
--
-- 1. SECURITY. `rewards` was created but never given row-level security. An anon
--    SELECT currently returns 200, and nothing states who may write. Every other
--    business table in this project is locked down; this one was missed.
--
-- 2. SUBSTANCE. Both screens that show rewards — /grow for agents and Command HQ
--    for admins — render a hardcoded array, so the table has always been empty
--    and no one could add a real campaign. The policies below are what let the
--    admin console actually manage it.
--
-- Country scoping matches the M4U tables: a country admin manages their own,
-- master admin manages both. Indonesia therefore gets its own campaigns rather
-- than inheriting Malaysia's.

alter table rewards enable row level security;

-- Everyone signed in can see the catalogue for their own country; it is a
-- motivational board, not confidential data. Still not public — an unauthenticated
-- reader has no business enumerating live campaigns.
drop policy if exists r_rewards on rewards;
create policy r_rewards on rewards for select
  using (auth.uid() is not null
         and (country = my_country() or my_role() = 'master_admin'));

drop policy if exists w_rewards on rewards;
create policy w_rewards on rewards for all
  using (is_admin() and (country = my_country() or my_role() = 'master_admin'))
  with check (is_admin() and (country = my_country() or my_role() = 'master_admin'));
