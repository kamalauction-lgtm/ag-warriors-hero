-- 015_m4u_data_reference.sql — generated from the Bluehost export.
-- Properties, custom fields, pipeline map, quotes, BOP sessions.
-- Preserves legacy ids so leads/rosters keep pointing at the right rows.
begin;

-- production label fix: the live DB labels this outcome 'Working FT'
update m4u_dispositions set label = 'Working FT' where key = 'Working Full-Time';

alter table m4u_properties add column if not exists legacy_id int;
create unique index if not exists m4u_prop_legacy on m4u_properties(legacy_id);
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (8, 'ID'::country_t, 'GPI', 'bandung project', 'property', 'GPI', '2026-06-13 10:41:07 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (9, 'ID'::country_t, 'GTP', 'GTP', 'property', 'GTP Bandung', '2026-06-13 11:27:24 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (11, 'ID'::country_t, 'Rekrutmen', 'IQI INDO RECRUITMENT', 'recruitment', 'Rekrutmen tim untuk Anda', '2026-06-16 15:19:04 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (24, 'MY'::country_t, 'Recruitment REN', null, 'recruitment', 'Recruit Mereka sebagai REN dibawah Anda', '2026-06-17 10:38:24 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (26, 'MY'::country_t, 'ERINAZ - KELANTAN', null, 'recruitment', 'Project EXSIM in KELANTAN', '2026-06-22 14:51:09 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (27, 'ID'::country_t, 'Unassigned (triage)', '__unassigned__', 'property', 'Leads whose GHL pipeline matched no project. Admin: map the pipeline or set the project.', '2026-07-02 14:27:02 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (28, 'ID'::country_t, 'BINLOV', 'FB', 'property', 'BINLOV', '2026-07-02 19:54:38 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (29, 'MY'::country_t, 'fadil test', null, 'property', 'fadil', '2026-07-07 16:18:49 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (31, 'MY'::country_t, 'VIVIDZ', null, 'property', 'VIVIDZ LEADS FROM FACEBOOK ADS', '2026-07-15 15:04:56 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;
insert into m4u_properties (legacy_id, country, name, ad_source, type, description, created_at) values (33, 'MY'::country_t, 'REC AG LEADERSHIP', null, 'recruitment', 'REC AG LEADERSHIP PROGRAME', '2026-07-31 12:02:33 Asia/Kuala_Lumpur'::timestamptz) on conflict (legacy_id) do nothing;

insert into m4u_field_settings (country, field_key, label, visible_to_agent, aliases, sort_order) values ('MY'::country_t, 'budget_cicilan', 'Budget/bln', true, 'budget,cicilan,budget_bulanan,installment', 40) on conflict do nothing;
insert into m4u_field_settings (country, field_key, label, visible_to_agent, aliases, sort_order) values ('MY'::country_t, 'domisili', 'Domisili', true, 'lokasi,domicile,kota,alamat', 50) on conflict do nothing;
insert into m4u_field_settings (country, field_key, label, visible_to_agent, aliases, sort_order) values ('MY'::country_t, 'rencana_bayar', 'Pembayaran', true, 'rencana_pembayaran,payment,bayar', 30) on conflict do nothing;
insert into m4u_field_settings (country, field_key, label, visible_to_agent, aliases, sort_order) values ('MY'::country_t, 'trigger_beli', 'Pemicu beli', true, 'pemicu_beli,trigger,alasan_beli', 20) on conflict do nothing;
insert into m4u_field_settings (country, field_key, label, visible_to_agent, aliases, sort_order) values ('MY'::country_t, 'usia', 'Usia', false, 'umur,age', 10) on conflict do nothing;
insert into m4u_field_settings (country, field_key, label, visible_to_agent, aliases, sort_order) values ('MY'::country_t, 'waktu_survey', 'Bisa survey', true, 'jadwal_survey,survey,kapan_survey,site_visit', 60) on conflict do nothing;

insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('sS2wy0xQRfupVe7pfmYg', 'BANDUNG SALES PIPELINE', 'MY'::country_t, (select id from m4u_properties where legacy_id=8)) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('GGR0EMoFGByvAZGluefZ', 'GTP BANDUNG SALES PIPELINE', 'MY'::country_t, (select id from m4u_properties where legacy_id=9)) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('dsBevIUDFRbo9KSvrHKg', 'IQI INDO RECRUITMENT', 'MY'::country_t, (select id from m4u_properties where legacy_id=11)) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('9uhpFUVK38QspqYgaMyy', 'CT Kamal VIP Leads', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('3fvHcHlwDXvgOh792l9c', 'EDOTCO', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('1MSHxCbfXFUidERxd7nR', 'FB LEADS AG TEAM', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('LGNrOG6hxWbckvSp9nNW', 'Kebun Teh Flow', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('b19vcR4sQSeviTpFZLe4', 'LEAD FROM IQI', 'MY'::country_t, (select id from m4u_properties where legacy_id=24)) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('acVsAiIsrY9kI6DhS4EX', 'New Ren', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('3gyfMQyNtHHmmu8BPN6k', 'tary recruitment indo', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('sCU0gZYlFuSEgjPo081d', 'THE ALDENZ', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('U8zBycjG0ZHZglv0yKQe', 'VIVIDZ', 'MY'::country_t, (select id from m4u_properties where legacy_id=31)) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('9m6g9waxYv9j4gCHuZvF', 'BINLOV SALES PIPELINE', 'MY'::country_t, (select id from m4u_properties where legacy_id=28)) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('4pPDuNBIf1ZrryAVBPfu', 'ERINAZ KELANTAN', 'MY'::country_t, (select id from m4u_properties where legacy_id=26)) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('RwlHNXneIPmO9BLpLpJz', 'AG Leadership Recruitment', 'MY'::country_t, null) on conflict (ghl_pipeline_id) do nothing;
insert into m4u_pipeline_map (ghl_pipeline_id, ghl_pipeline_name, country, property_id) values ('w1U7G0P6G1atQjwliKyO', 'REC KAMAL AG 2026', 'MY'::country_t, (select id from m4u_properties where legacy_id=33)) on conflict (ghl_pipeline_id) do nothing;

insert into quotes (country, body, author, active) values ('ID'::country_t, 'Setiap panggilan adalah satu langkah lebih dekat ke janji temu berikutnya.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Penolakan hari ini adalah persiapan untuk closing esok.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Konsistensi mengalahkan bakat. Angkat telepon, satu lead pada satu waktu.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Senyum Anda terdengar di telepon. Mulailah dengan energi positif!', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Rezeki ada pada tindakan. Lead berikutnya menunggu Anda.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('MY'::country_t, 'Setiap panggilan mendekatkan anda kepada appointment seterusnya.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('MY'::country_t, 'Penolakan hari ini adalah persediaan untuk closing esok.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('MY'::country_t, 'Konsistensi mengalahkan bakat. Angkat telefon, satu lead pada satu masa.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('MY'::country_t, 'Senyuman anda kedengaran di telefon. Mulakan dengan tenaga positif!', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('MY'::country_t, 'Rezeki pada yang bertindak. Lead seterusnya menanti anda.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Calling bukan mencari yang tertarik, tetapi menemukan yang membutuhkan.', '— IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Setiap \\"halo\\" adalah peluang menuju closing.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Penolakan hari ini adalah latihan untuk kesuksesan besok.', 'IQI AG', true) on conflict do nothing;
insert into quotes (country, body, author, active) values ('ID'::country_t, 'Calling bukan soal bakat, tetapi soal disiplin.', 'IQI AG', true) on conflict do nothing;

alter table bop_sessions add column if not exists legacy_id int;
create unique index if not exists bop_sess_legacy on bop_sessions(legacy_id);
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (1, 'MY'::country_t, 'online', 'BOP -Kerjaya Hartanah Bersama PMgr Ts Kamal AG', '2026-06-24 18:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://calendar.app.google/nEBDYuyJQX5hGy1E7', null, null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (2, 'ID'::country_t, 'physical', 'Fisik BOP di Holis', '2026-06-27 15:00:00 Asia/Kuala_Lumpur'::timestamptz, null, 'Jl. Holis Regency, Babakan, Kec. Babakan Ciparay, Kota Bandung, Jawa Barat 40222 Map of Wallace Burger and Chicken - Holis Regency', 'https://share.google/QHTdmbsx1ry0BBDKf', null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (3, 'ID'::country_t, 'online', 'Online BOP Holis', '2026-06-28 19:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://meet.google.com/ajp-fkam-fno', 'Google meet', null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (4, 'ID'::country_t, 'physical', 'FISIK BOP DI OFFICE HOLIS IQI', '2026-07-02 13:00:00 Asia/Kuala_Lumpur'::timestamptz, null, 'Jl. Holis Regency, Babakan, Kec. Babakan Ciparay, Kota Bandung, Jawa Barat 40222 Map of Wallace Burger and Chicken - Holis Regency', 'https://maps.app.goo.gl/EeZ8xTdXJEkfsnyx9', null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (5, 'ID'::country_t, 'online', 'ONLINE BOP IQI BANDUNG', '2026-07-03 13:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://meet.google.com/kmp-oamm-bam', null, null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (6, 'ID'::country_t, 'physical', 'FISIK BOP HOLIS IQI BANDUNG', '2026-07-04 13:00:00 Asia/Kuala_Lumpur'::timestamptz, null, 'Jl. Holis Regency, Babakan, Kec. Babakan Ciparay, Kota Bandung, Jawa Barat 40222 Map of Wallace Burger and Chicken - Holis Regency', 'https://maps.app.goo.gl/qYqqXyVYAnggRCQk7', null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (7, 'ID'::country_t, 'online', 'ONLINE BOP IQI BANDUNG', '2026-07-06 13:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://meet.google.com/otp-pmwe-qhy', null, null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (8, 'ID'::country_t, 'physical', 'FISIK BOP HOLIS IQI BANDUNG', '2026-07-06 14:00:00 Asia/Kuala_Lumpur'::timestamptz, null, 'Jl. Holis Regency, Babakan, Kec. Babakan Ciparay, Kota Bandung, Jawa Barat 40222 Map of Wallace Burger and Chicken - Holis Regency', 'https://maps.app.goo.gl/RhwZr3FDe3V526uE9', null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (9, 'ID'::country_t, 'online', 'ONLINE BOP IQI BANDUNG', '2026-07-07 13:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://meet.google.com/xrv-xeke-ada', null, null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (10, 'ID'::country_t, 'online', 'ONLINE BOP IQI BANDUNG', '2026-07-08 16:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://meet.google.com/xrv-xeke-ada', null, null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (11, 'ID'::country_t, 'physical', 'FISIK BOP DI OFFICE HOLIS IQI', '2026-07-09 15:00:00 Asia/Kuala_Lumpur'::timestamptz, null, 'Jl. Holis Regency, Babakan, Kec. Babakan Ciparay, Kota Bandung, Jawa Barat 40222 Map of Wallace Burger and Chicken - Holis Regency', 'https://maps.app.goo.gl/2ujGZxNUyJNTAsSU6', null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (12, 'ID'::country_t, 'online', 'ONLINE BOP IQI BANDUNG', '2026-07-09 16:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://meet.google.com/xrv-xeke-ada', null, null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (13, 'ID'::country_t, 'online', 'ONLINE BOP IQI BANDUNG', '2026-07-14 16:00:00 Asia/Kuala_Lumpur'::timestamptz, 'https://meet.google.com/xrv-xeke-ada', null, null, null, true) on conflict (legacy_id) do nothing;
insert into bop_sessions (legacy_id, country, type, title, starts_at, link, location, map_url, notes, active) values (14, 'MY'::country_t, 'physical', 'Career Conversation (F2F)', '2026-08-08 10:00:00 Asia/Kuala_Lumpur'::timestamptz, null, '26th Floor, Millerz Square, Old Klang Road, Kuala Lumpur', 'https://www.google.com/maps/search/3.090558,+101.673861?entry=tts&g_ep=EgoyMDI2MDcyNy4wIPu8ASoASAFQAw%3D%3D&skid=d869fff6-174b-4335-af0d-e1373697f759', null, true) on conflict (legacy_id) do nothing;

commit;

select 'properties' t, count(*) from m4u_properties union all
select 'fields', count(*) from m4u_field_settings union all
select 'pipelines', count(*) from m4u_pipeline_map union all
select 'quotes', count(*) from quotes union all
select 'bop_sessions', count(*) from bop_sessions;
