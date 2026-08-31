-- 043_booths.sql — booth duty becomes real.
--
-- The Booths section rendered three invented events with dead "Create booth"
-- and "Roster" buttons. The `booths` table has existed all along (title,
-- location, date range, shifts jsonb) but carried no RLS and had no way to be
-- written, and there was nowhere for a warrior to be signed up.
--
-- country columns here are the `country_t` enum — every text comparison goes
-- through ::text on BOTH sides (the 040/041 lesson).

alter table booths enable row level security;

drop policy if exists r_booths on booths;
create policy r_booths on booths for select using (auth.uid() is not null);

drop policy if exists w_booths on booths;
create policy w_booths on booths for all
  using (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'))
  with check (is_admin() and (country::text = my_country()::text or my_role() = 'master_admin'));

-- ---------- who is on duty ----------
create table if not exists booth_signups (
  booth_id uuid not null references booths(id) on delete cascade,
  agent_id uuid not null references profiles(id) on delete cascade,
  on_date date not null,
  shift text not null default 'AM' check (shift in ('AM','PM','FULL')),
  signed_by uuid references profiles(id),       -- null = self signup, else the admin
  created_at timestamptz default now(),
  primary key (booth_id, agent_id, on_date, shift)
);

alter table booth_signups enable row level security;

drop policy if exists r_booth_signups on booth_signups;
create policy r_booth_signups on booth_signups for select using (auth.uid() is not null);

-- A warrior manages their own signup; an admin manages anyone's, country-scoped
-- through the booth row.
drop policy if exists w_booth_signups_self on booth_signups;
create policy w_booth_signups_self on booth_signups for all
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

drop policy if exists w_booth_signups_admin on booth_signups;
create policy w_booth_signups_admin on booth_signups for all
  using (is_admin() and exists (select 1 from booths b where b.id = booth_id
           and (b.country::text = my_country()::text or my_role() = 'master_admin')))
  with check (is_admin() and exists (select 1 from booths b where b.id = booth_id
           and (b.country::text = my_country()::text or my_role() = 'master_admin')));
