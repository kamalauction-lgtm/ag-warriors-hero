-- 016_m4u_data_leads_prep.sql — staging columns + legacy id preservation
begin;
alter table m4u_leads add column if not exists legacy_id int;
alter table m4u_leads add column if not exists legacy_owner int;
alter table m4u_leads add column if not exists legacy_reserved int;
create unique index if not exists m4u_leads_legacy on m4u_leads(legacy_id);
commit;
