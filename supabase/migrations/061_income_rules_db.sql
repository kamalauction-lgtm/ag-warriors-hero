-- 061_income_rules_db.sql — Income Rules move to the database (audit fix #2).
--
-- Until now the admin Income Rules editor wrote ONLY to the admin's own
-- localStorage: the "live in every calculator" toast was false — agents kept
-- seeing code defaults. One row per country, whole config as jsonb (same
-- shape the app already uses), client merges it over code defaults so new
-- fields added in code never break an old row.
-- country is country_t enum — ::text on both sides (040/041 lesson).

create table if not exists income_rules (
  country country_t primary key,
  cfg jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table income_rules enable row level security;

-- every signed-in agent reads the rules (calculators need them)
drop policy if exists r_income_rules on income_rules;
create policy r_income_rules on income_rules for select using (auth.role() = 'authenticated');

-- only admins write, scoped to their own country (master admin: both)
drop policy if exists w_income_rules on income_rules;
create policy w_income_rules on income_rules for all using (
  is_admin() and (country::text = my_country()::text or my_role() = 'master_admin')
) with check (
  is_admin() and (country::text = my_country()::text or my_role() = 'master_admin')
);
