-- ============================================
-- FIX + SEED — run once in SQL Editor
-- 1) helper functions become SECURITY DEFINER (stops the RLS recursion)
-- 2) seed: career ladders · income config · caller fields · quotes
-- ============================================

create or replace function my_country() returns country_t
language sql stable security definer set search_path = public as
$$ select country from profiles where id = auth.uid() $$;

create or replace function my_role() returns app_role_t
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role from profiles where id = auth.uid())
   in ('country_admin','master_admin'), false) $$;

-- ---------- career ladders (from production career_ladder.json) ----------
delete from career_ladder;
insert into career_ladder (country,code,ord,name,color,personal_sales,group_sales,group_note,downline_req,requires_approval,focus) values
('MY','REN',0,'REN','#C0C0C0',null,null,null,null,false,'Start here. Build your first sales and learn the journey.'),
('MY','L',1,'Leader (L)','#CD7F32',3000000,15000000,null,'2 REN',false,'Your first leadership rung — hit personal sales and start a small team.'),
('MY','TL',2,'Team Leader (TL)','#4FA3D1',5000000,25000000,null,'3 REN',false,'Grow your group sales and expand your direct team.'),
('MY','HOT',3,'Head of Team (HOT)','#C8A064',10000000,50000000,null,'6 REN',false,'Peak personal producer — strong personal sales plus a sizeable group.'),
('MY','TM',4,'Team Manager (TM)','#8C5BB0',null,120000000,null,'3 HOT',true,'Builder rank — grow leaders, not just personal sales.'),
('MY','VP',5,'Vice President (VP)','#C8102E',null,250000000,'KL','5 TM',true,'Top of the ladder — lead a network of managers.'),
('ID','REN',0,'REN','#C0C0C0',null,null,null,null,false,'Start here. Build your first sales and learn the journey.'),
('ID','L',1,'Leader (L)','#CD7F32',8000000000,30000000000,null,'2 REN',false,'Your first leadership rung — hit personal sales and start a small team.'),
('ID','TL',2,'Team Leader (TL)','#4FA3D1',15000000000,60000000000,null,'3 REN',false,'Grow your group sales and expand your direct team.'),
('ID','HOT',3,'Head of Team (HOT)','#C8A064',30000000000,150000000000,null,'6 REN',false,'Peak personal producer — strong personal sales plus a sizeable group.'),
('ID','TM',4,'Team Manager (TM)','#8C5BB0',null,400000000000,null,'3 HOT',true,'Builder rank — grow leaders, not just personal sales.'),
('ID','VP',5,'Vice President (VP)','#C8102E',null,850000000000,null,'5 TM',true,'Top of the ladder — lead a network of managers.');

-- ---------- income engine config (verified figures) ----------
insert into income_cfg (country, subsale, my_primary, id_primary) values
('MY',
 '{"baseRate":0.40,"agencyDefault":3,"agencyMax":3,"ovMinRate":0.80,"ovCap":0.25,"rgrHighMin":0.88,
   "rgrStd":[0.05,0.03,0.02,0.02],"rgrHigh":[0.03,0.02,0.01,0.01],"combinedCap":0.97,
   "ladder":[{"name":"TROOPER","target":0,"addon":0.20},{"name":"VALIANT","target":10000,"addon":0.25},
    {"name":"CONSTABLE","target":20000,"addon":0.30},{"name":"CORPORAL","target":40000,"addon":0.35},
    {"name":"SERGEANT","target":100000,"addon":0.40},{"name":"LIEUTENANT","target":200000,"addon":0.45},
    {"name":"COMMANDER","target":250000,"addon":0.48},{"name":"GENERAL","target":275000,"addon":0.50}],
   "properties":[{"id":"p1","name":"Subsale — custom","price":500000,"agency":3}]}',
 '[{"id":"m1","name":"Erinaz Suites","price":350000,"ren":2,"vp":0.73,"hot":0.4,"hotOn":true,"tlOn":true,"lOn":true,
    "rgrOn":true,"rgrPct":1,"rgrFrom":"30/05/2026","rgrTo":"31/12/2026",
    "tnc":"Applicable for new Recruits join in From 30.05.2026-31.12.2026 (let`s Recruit Now!!)","appear":["income"]},
   {"id":"m2","name":"VIVIDZ","price":750000,"ren":4.5,"vp":0.73,"hot":0.4,"hotOn":true,"tlOn":true,"lOn":true,"rgrOn":true,"rgrPct":1,"appear":["income"]},
   {"id":"m3","name":"Dnuri","price":270000,"ren":2,"vp":0.73,"hot":0.4,"hotOn":false,"tlOn":false,"lOn":true,"rgrOn":false,"rgrPct":0,"appear":["income"]},
   {"id":"m4","name":"EXSIM JB - A/B/D","price":1100000,"ren":4,"vp":0.73,"hot":0.4,"hotOn":true,"tlOn":true,"lOn":true,"rgrOn":true,"rgrPct":1,"appear":["income"]}]',
 null),
('ID',
 '{"baseRate":0.40,"agencyDefault":3,"agencyMax":6,"ovMinRate":0.80,"ovCap":0.25,"rgrHighMin":0.88,
   "rgrStd":[0.05,0.03,0.02,0.02],"rgrHigh":[0.03,0.02,0.01,0.01],"combinedCap":0.97,
   "ladder":[{"name":"TROOPER","target":0,"addon":0.20},{"name":"VALIANT","target":10000,"addon":0.25},
    {"name":"CONSTABLE","target":20000,"addon":0.30},{"name":"CORPORAL","target":40000,"addon":0.35},
    {"name":"SERGEANT","target":100000,"addon":0.40},{"name":"LIEUTENANT","target":200000,"addon":0.45},
    {"name":"COMMANDER","target":250000,"addon":0.48},{"name":"GENERAL","target":275000,"addon":0.50}],
   "properties":[{"id":"p1","name":"Subsale — custom","price":1500000000,"agency":3}]}',
 null,
 '{"slices":{"AGENT":50,"L":1.5,"TL":2,"HOT":3,"TM":2.5,"VP":4,"GVP":4.5,"PIC":3,"PPIC":3,"MGM":2,"TRIP":8,"IQI_LOCAL":14,"IQI_HQ":3},
   "projects":[{"id":"pp1","name":"Indo Project (sample)","price":500000000,"devPct":6,"appear":["income","catalog"]},
    {"id":"pp2","name":"Vividz Grand","price":2400000000,"devPct":5,"agentPct":60,"appear":["income","catalog","elite"]},
    {"id":"pp3","name":"Podomoro Park","price":1800000000,"devPct":4,"appear":["catalog"]}]}')
on conflict (country) do update set subsale=excluded.subsale, my_primary=excluded.my_primary, id_primary=excluded.id_primary;

-- ---------- caller custom fields (both countries) ----------
insert into m4u_field_settings (country,field_key,label,visible_to_agent,aliases,sort_order) values
('MY','usia','Usia',false,'umur,age',10),('MY','trigger_beli','Pemicu beli',true,'pemicu_beli,trigger,alasan_beli',20),
('MY','rencana_bayar','Pembayaran',true,'rencana_pembayaran,payment,bayar',30),('MY','budget_cicilan','Budget/bln',true,'budget,cicilan,installment',40),
('MY','domisili','Domisili',true,'lokasi,kota,alamat',50),('MY','waktu_survey','Bisa survey',true,'jadwal_survey,site_visit',60),
('ID','usia','Usia',false,'umur,age',10),('ID','trigger_beli','Pemicu beli',true,'pemicu_beli,trigger,alasan_beli',20),
('ID','rencana_bayar','Pembayaran',true,'rencana_pembayaran,payment,bayar',30),('ID','budget_cicilan','Budget/bln',true,'budget,cicilan,installment',40),
('ID','domisili','Domisili',true,'lokasi,kota,alamat',50),('ID','waktu_survey','Bisa survey',true,'jadwal_survey,site_visit',60)
on conflict do nothing;

-- ---------- quotes ----------
insert into quotes (country,body,author) values
('MY','Trust is the currency of AG.','Kamal AG'),
('MY','Speed to lead wins the deal — 5 minutes or it cools.','Hukum 5 Minit'),
('MY','Every call is a seed. Plant enough and the harvest takes care of itself.','AG Way'),
('ID','Satu telepon lagi. Satu peluang lagi.','AG Indonesia'),
('ID','Kepercayaan adalah mata uang AG.','Kamal AG');
