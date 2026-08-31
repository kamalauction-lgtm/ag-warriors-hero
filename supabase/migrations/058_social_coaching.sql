-- 058_social_coaching.sql — GROW → Social Coaching (old M2, evolved).
--
-- Daily content coach, not a caption dump: one mission per day (7-day
-- rotation), copy-ready captions in 7 categories with {project} auto-fill,
-- honest handoff (no fake in-app publisher), and a SELF-DECLARED "posted
-- today" streak. Kamal's decisions (2026-08-10):
--   * seed captions by Claude, refined by admin in Command HQ
--   * small reward even though unverified -> +5 XP as points_ledger status
--     'provisional' (the ledger's own honest label; challenge XP stays clean)
--   * 7 categories incl. Education / Market Update / Testimonial / Recruitment
--   * real IG/Meta API posting = a future separate project; handoff stays.

create table if not exists social_captions (
  id bigint generated always as identity primary key,
  category text not null check (category in
    ('property','branding','activity','education','market','testimonial','recruitment')),
  country_scope text not null default 'ALL' check (country_scope in ('MY','ID','ALL')),
  text jsonb not null,                      -- {"en","ms","id"} — may contain {project}
  tip jsonb,                                -- coaching note, same shape
  sort int not null default 100,
  status text not null default 'published' check (status in ('draft','published','archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists social_missions (
  dow int not null check (dow between 0 and 6),        -- JS getDay(): 0 = Sunday
  country_scope text not null default 'ALL' check (country_scope in ('MY','ID','ALL')),
  category text not null check (category in
    ('property','branding','activity','education','market','testimonial','recruitment')),
  title jsonb not null,
  brief jsonb,
  active boolean not null default true,
  primary key (dow, country_scope)
);

create table if not exists social_declares (
  agent_id uuid not null references profiles(id) on delete cascade,
  on_date date not null,
  category text,
  caption_id bigint references social_captions(id),
  created_at timestamptz default now(),
  primary key (agent_id, on_date)
);

-- ---------- RLS ----------
alter table social_captions enable row level security;
alter table social_missions enable row level security;
alter table social_declares enable row level security;

drop policy if exists r_social_captions on social_captions;
create policy r_social_captions on social_captions for select
  using (is_admin() or (status = 'published'
         and country_scope in ('ALL', (select country::text from profiles where id = auth.uid()))));
drop policy if exists w_social_captions on social_captions;
create policy w_social_captions on social_captions for all
  using (is_admin()) with check (is_admin());

drop policy if exists r_social_missions on social_missions;
create policy r_social_missions on social_missions for select
  using (is_admin() or (active
         and country_scope in ('ALL', (select country::text from profiles where id = auth.uid()))));
drop policy if exists w_social_missions on social_missions;
create policy w_social_missions on social_missions for all
  using (is_admin()) with check (is_admin());

-- own declares readable; leaders/coaches see team consistency via admin RPC later
drop policy if exists r_social_declares on social_declares;
create policy r_social_declares on social_declares for select
  using (agent_id = auth.uid() or is_admin());
-- writes via RPC only

-- ---------- audit on caption changes ----------
create or replace function social_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform audit_log(tg_op || ':social_captions', 'social', new.id::text,
    case when tg_op = 'UPDATE' then old.status else null end, new.status,
    left(coalesce(new.text ->> 'en', ''), 80));
  return new;
end $$;
drop trigger if exists social_captions_audit on social_captions;
create trigger social_captions_audit after insert or update on social_captions
  for each row execute function social_audit();

-- ---------- declare + streak ----------
create or replace function social_declare(p_category text default null, p_caption bigint default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_today date; v_streak int := 0; v_d date; v_pts int;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  if exists (select 1 from social_declares where agent_id = v_me and on_date = v_today) then
    raise exception 'already declared today';
  end if;
  insert into social_declares (agent_id, on_date, category, caption_id)
  values (v_me, v_today, p_category, p_caption);

  -- small reward, honestly labelled: provisional, capped at one per day by the PK
  insert into points_ledger (user_id, source, amount, status, reason)
  values (v_me, 'social_declared', 5, 'provisional', coalesce(p_category, 'post'));

  -- consecutive-day streak ending today
  v_d := v_today;
  while exists (select 1 from social_declares where agent_id = v_me and on_date = v_d) loop
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  end loop;
  select coalesce(sum(amount), 0) into v_pts from points_ledger
   where user_id = v_me and source = 'social_declared' and status <> 'reversed';
  return jsonb_build_object('streak', v_streak, 'social_xp', v_pts);
end $$;

create or replace function social_mine()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_today date; v_streak int := 0; v_d date;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  v_today := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_d := case when exists (select 1 from social_declares where agent_id = v_me and on_date = v_today)
              then v_today else v_today - 1 end;
  while exists (select 1 from social_declares where agent_id = v_me and on_date = v_d) loop
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  end loop;
  return jsonb_build_object(
    'declared_today', exists (select 1 from social_declares where agent_id = v_me and on_date = v_today),
    'streak', v_streak,
    'social_xp', (select coalesce(sum(amount), 0) from points_ledger
                   where user_id = v_me and source = 'social_declared' and status <> 'reversed'),
    'last7', (select count(*) from social_declares
               where agent_id = v_me and on_date > v_today - 7));
end $$;

-- team consistency for admin/leader/coach/captain (same scope pattern as academy)
create or replace function social_team()
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare v_me uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if v_me is null then raise exception 'not authorised'; end if;
  return coalesce((select jsonb_agg(row_out order by (row_out ->> 'last7')::int desc) from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'country', p.country::text,
      'last7', (select count(*) from social_declares d
                 where d.agent_id = p.id and d.on_date > v_today - 7),
      'declared_today', exists (select 1 from social_declares d
                                 where d.agent_id = p.id and d.on_date = v_today)
    ) as row_out
    from profiles p
    where p.status = 'active'
      and (
        (is_admin() and (p.country::text = my_country()::text or my_role() = 'master_admin'))
        or p.leader_id = v_me
        or exists (select 1 from coach_assignments ca
                    where ca.coach_id = v_me and ca.participant_id = p.id and ca.active)
        or exists (select 1 from pod_members pm join pods pd on pd.id = pm.pod_id
                    where pd.captain_id = v_me and pm.agent_id = p.id)
      )
  ) rows), '[]'::jsonb);
end $$;

revoke all on function social_declare(text, bigint) from public, anon;
revoke all on function social_mine() from public, anon;
revoke all on function social_team() from public, anon;
grant execute on function social_declare(text, bigint) to authenticated;
grant execute on function social_mine() to authenticated;
grant execute on function social_team() to authenticated;

-- ---------- seed: 7-day mission rotation ----------
insert into social_missions (dow, category, title, brief) values
(1,'property','{"en":"Property Monday","ms":"Isnin Hartanah","id":"Senin Properti"}',
 '{"en":"Show ONE project you actually hold — one photo, one honest reason it fits a real buyer.","ms":"Tunjukkan SATU projek yang anda pegang — satu gambar, satu sebab jujur ia sesuai untuk pembeli sebenar.","id":"Tunjukkan SATU proyek yang Anda pegang — satu foto, satu alasan jujur mengapa cocok untuk pembeli nyata."}'),
(2,'education','{"en":"Teach Tuesday","ms":"Selasa Ilmu","id":"Selasa Edukasi"}',
 '{"en":"Answer one question a buyer asked you this week. Simple words, no jargon.","ms":"Jawab satu soalan yang pembeli tanya minggu ini. Bahasa mudah, tanpa jargon.","id":"Jawab satu pertanyaan yang diajukan pembeli minggu ini. Bahasa sederhana, tanpa jargon."}'),
(3,'testimonial','{"en":"Win Wednesday","ms":"Rabu Kejayaan","id":"Rabu Kemenangan"}',
 '{"en":"Share a customer moment (with permission) — the problem, the help, the outcome.","ms":"Kongsi detik pelanggan (dengan izin) — masalahnya, bantuannya, hasilnya.","id":"Bagikan momen pelanggan (dengan izin) — masalahnya, bantuannya, hasilnya."}'),
(4,'market','{"en":"Market Thursday","ms":"Khamis Pasaran","id":"Kamis Pasar"}',
 '{"en":"One local market observation — what you see on the ground, not a prediction.","ms":"Satu pemerhatian pasaran tempatan — apa yang anda nampak di lapangan, bukan ramalan.","id":"Satu pengamatan pasar lokal — yang Anda lihat di lapangan, bukan prediksi."}'),
(5,'recruitment','{"en":"Team Friday","ms":"Jumaat Pasukan","id":"Jumat Tim"}',
 '{"en":"Show the real work honestly — a day in your life. Right people will ask.","ms":"Tunjukkan kerja sebenar dengan jujur — sehari dalam hidup anda. Orang yang betul akan bertanya.","id":"Tunjukkan kerja nyata dengan jujur — sehari dalam hidup Anda. Orang yang tepat akan bertanya."}'),
(6,'activity','{"en":"Action Saturday","ms":"Sabtu Aktiviti","id":"Sabtu Aktivitas"}',
 '{"en":"Post your activity — viewing, site visit, meeting. Presence builds trust.","ms":"Siarkan aktiviti anda — viewing, lawatan tapak, pertemuan. Kehadiran membina kepercayaan.","id":"Posting aktivitas Anda — viewing, kunjungan lokasi, pertemuan. Kehadiran membangun kepercayaan."}'),
(0,'branding','{"en":"Story Sunday","ms":"Ahad Cerita","id":"Minggu Cerita"}',
 '{"en":"Personal branding — why you do this work. People buy from people.","ms":"Jenama peribadi — kenapa anda buat kerja ini. Orang membeli daripada orang.","id":"Personal branding — mengapa Anda melakukan pekerjaan ini. Orang membeli dari orang."}')
on conflict (dow, country_scope) do nothing;

-- ---------- seed captions: 2 per category, trilingual, {project} auto-fill ----------
insert into social_captions (category, text, tip, sort) values
('property',
 '{"en":"Just viewed {project} with a client today. What stood out: the layout actually works for a growing family. If you are exploring this area, message me — happy to share honest pros AND cons. 🏡","ms":"Baru selesai viewing {project} bersama klien hari ini. Yang menonjol: susun atur yang benar-benar sesuai untuk keluarga membesar. Kalau anda sedang meninjau kawasan ini, mesej saya — saya kongsi kelebihan DAN kekurangan dengan jujur. 🏡","id":"Baru selesai viewing {project} bersama klien hari ini. Yang menonjol: tata letaknya benar-benar cocok untuk keluarga berkembang. Kalau Anda sedang menjajaki area ini, DM saya — dengan senang hati saya bagikan plus DAN minusnya secara jujur. 🏡"}',
 '{"en":"Honesty sells: mentioning a con builds more trust than ten pros.","ms":"Kejujuran menjual: menyebut satu kekurangan membina lebih banyak kepercayaan daripada sepuluh kelebihan.","id":"Kejujuran menjual: menyebut satu kekurangan membangun lebih banyak kepercayaan daripada sepuluh kelebihan."}', 1),
('property',
 '{"en":"3 things I check before recommending any unit at {project}: 1) actual monthly commitment vs income, 2) developer track record, 3) what the area looks like at night. Want the checklist? Message me. ✅","ms":"3 perkara saya semak sebelum mencadangkan mana-mana unit di {project}: 1) komitmen bulanan sebenar berbanding pendapatan, 2) rekod pemaju, 3) keadaan kawasan pada waktu malam. Mahu senarai semak ini? Mesej saya. ✅","id":"3 hal yang saya cek sebelum merekomendasikan unit di {project}: 1) komitmen bulanan nyata vs penghasilan, 2) rekam jejak developer, 3) kondisi area di malam hari. Mau checklist-nya? DM saya. ✅"}',
 '{"en":"Checklists position you as the professional, not the salesperson.","ms":"Senarai semak meletakkan anda sebagai profesional, bukan jurujual.","id":"Checklist memposisikan Anda sebagai profesional, bukan penjual."}', 2),
('branding',
 '{"en":"Why real estate? Because 4 years ago someone guided my family through our first home purchase with zero pressure — and I never forgot how that felt. That is the agent I decided to become.","ms":"Kenapa hartanah? Kerana 4 tahun lalu seseorang membimbing keluarga saya membeli rumah pertama tanpa sebarang tekanan — dan saya tak pernah lupa perasaan itu. Itulah ejen yang saya pilih untuk jadi.","id":"Mengapa properti? Karena 4 tahun lalu seseorang memandu keluarga saya membeli rumah pertama tanpa tekanan sedikit pun — dan saya tidak pernah lupa rasanya. Itulah agen yang saya putuskan untuk menjadi."}',
 '{"en":"Adapt the story to YOURS — real beats polished every time.","ms":"Ubah suai cerita ini kepada cerita ANDA — yang tulen sentiasa mengalahkan yang digilap.","id":"Sesuaikan dengan cerita ANDA — yang asli selalu mengalahkan yang dipoles."}', 1),
('branding',
 '{"en":"I am not the agent for everyone. If you want someone to promise the highest price and fastest sale, that is not me. If you want honest numbers and a clear process — let us talk.","ms":"Saya bukan ejen untuk semua orang. Kalau anda mahu seseorang yang menjanjikan harga tertinggi dan jualan terpantas, itu bukan saya. Kalau anda mahu angka jujur dan proses jelas — mari berbual.","id":"Saya bukan agen untuk semua orang. Kalau Anda mau seseorang yang menjanjikan harga tertinggi dan penjualan tercepat, itu bukan saya. Kalau Anda mau angka jujur dan proses jelas — mari bicara."}',
 '{"en":"Polarising positioning filters time-wasters and attracts serious clients.","ms":"Kedudukan yang tegas menapis pembuang masa dan menarik klien serius.","id":"Positioning tegas menyaring pembuang waktu dan menarik klien serius."}', 2),
('activity',
 '{"en":"Site visit day. 📍 Walking the actual ground before I recommend anything — photos never tell the full story. This is the part of the job nobody posts about, but it is where good advice comes from.","ms":"Hari lawatan tapak. 📍 Berjalan di tapak sebenar sebelum saya cadangkan apa-apa — gambar tak pernah cerita segalanya. Inilah bahagian kerja yang jarang disiarkan, tapi dari sinilah nasihat yang baik datang.","id":"Hari kunjungan lokasi. 📍 Menyusuri lokasi sebenarnya sebelum merekomendasikan apa pun — foto tidak pernah bercerita lengkap. Ini bagian pekerjaan yang jarang diposting, tapi dari sinilah saran yang baik berasal."}',
 '{"en":"Behind-the-scenes builds more trust than polished promo shots.","ms":"Di sebalik tabir membina lebih banyak kepercayaan daripada gambar promosi bergilap.","id":"Behind-the-scenes membangun lebih banyak kepercayaan daripada foto promosi mengkilap."}', 1),
('activity',
 '{"en":"Ended today with 12 calls, 2 viewings booked, 1 very honest conversation about budget. Not every day closes a deal — every day builds the pipeline. 💪","ms":"Hari ini berakhir dengan 12 panggilan, 2 viewing ditempah, 1 perbualan sangat jujur tentang bajet. Bukan setiap hari menutup jualan — setiap hari membina pipeline. 💪","id":"Hari ini ditutup dengan 12 panggilan, 2 viewing terjadwal, 1 percakapan sangat jujur soal bujet. Tidak setiap hari closing — setiap hari membangun pipeline. 💪"}',
 '{"en":"Use YOUR real numbers from Hero — consistency content compounds.","ms":"Guna nombor SEBENAR anda dari Hero — kandungan konsistensi berganda kesannya.","id":"Pakai angka NYATA Anda dari Hero — konten konsistensi berlipat efeknya."}', 2),
('education',
 '{"en":"\"How much deposit do I actually need?\" — the question I get most. The honest answer: it depends on more than the sticker price. Booking fee, downpayment, legal fees, stamp duty. Message me and I will break it down for YOUR situation, no obligation.","ms":"\"Sebenarnya berapa deposit saya perlu?\" — soalan paling kerap saya terima. Jawapan jujur: ia bergantung pada lebih daripada harga jual. Yuran tempahan, wang muka, yuran guaman, duti setem. Mesej saya dan saya perincikan untuk situasi ANDA, tanpa obligasi.","id":"\"Sebenarnya berapa DP yang saya butuhkan?\" — pertanyaan yang paling sering saya terima. Jawaban jujurnya: tergantung lebih dari sekadar harga jual. Booking fee, uang muka, biaya notaris, pajak. DM saya dan saya rincikan untuk situasi ANDA, tanpa kewajiban."}',
 '{"en":"Answer real questions from real conversations — that is SEO for trust.","ms":"Jawab soalan sebenar daripada perbualan sebenar — itulah SEO untuk kepercayaan.","id":"Jawab pertanyaan nyata dari percakapan nyata — itulah SEO untuk kepercayaan."}', 1),
('education',
 '{"en":"Renting vs buying — the honest version: renting is NOT throwing money away if it buys you flexibility you need right now. Buying wins when you are ready to stay 5+ years. Which stage are you at?","ms":"Sewa vs beli — versi jujur: menyewa BUKAN membazir wang jika ia membeli fleksibiliti yang anda perlukan sekarang. Membeli menang bila anda bersedia menetap 5+ tahun. Anda di peringkat mana?","id":"Sewa vs beli — versi jujurnya: menyewa BUKAN buang uang jika itu membeli fleksibilitas yang Anda butuhkan sekarang. Membeli menang saat Anda siap menetap 5+ tahun. Anda di tahap mana?"}',
 '{"en":"Balanced takes get shared; one-sided pitches get scrolled past.","ms":"Pandangan seimbang dikongsi; jualan berat sebelah dilangkau.","id":"Pandangan berimbang dibagikan; jualan sepihak dilewati."}', 2),
('market',
 '{"en":"Ground observation this week: viewings in my area are up, but buyers are taking longer to decide. Translation: interest is real, confidence needs help. If you are waiting for \"the perfect time\" — let us talk about what the data actually says for your case.","ms":"Pemerhatian lapangan minggu ini: viewing di kawasan saya meningkat, tetapi pembeli mengambil masa lebih lama untuk memutuskan. Maksudnya: minat itu benar, keyakinan perlukan bantuan. Kalau anda menunggu \"masa sesuai\" — mari bincang apa kata data untuk kes anda.","id":"Pengamatan lapangan minggu ini: viewing di area saya naik, tapi pembeli butuh waktu lebih lama untuk memutuskan. Artinya: minat itu nyata, kepercayaan diri butuh bantuan. Kalau Anda menunggu \"waktu yang tepat\" — mari bahas apa kata data untuk kasus Anda."}',
 '{"en":"Observations from YOUR ground beat national headlines — never predict, only observe.","ms":"Pemerhatian dari lapangan ANDA mengalahkan tajuk nasional — jangan meramal, hanya memerhati.","id":"Pengamatan dari lapangan ANDA mengalahkan berita nasional — jangan memprediksi, cukup mengamati."}', 1),
('market',
 '{"en":"What RM500k gets you in 3 different areas near me right now — a thread. (Spoiler: the differences will surprise you.) Which area should I break down next?","ms":"Apa yang RM500k boleh dapat di 3 kawasan berbeza berhampiran saya sekarang — satu bebenang. (Spoiler: perbezaannya akan mengejutkan anda.) Kawasan mana saya patut perincikan seterusnya?","id":"Apa yang didapat dengan dana yang sama di 3 area berbeda dekat saya saat ini — sebuah thread. (Spoiler: perbedaannya akan mengejutkan Anda.) Area mana yang harus saya bedah berikutnya?"}',
 '{"en":"Comparison content is the most-saved format in property social.","ms":"Kandungan perbandingan ialah format paling banyak disimpan dalam sosial hartanah.","id":"Konten perbandingan adalah format paling banyak disimpan di media sosial properti."}', 2),
('testimonial',
 '{"en":"6 months ago they said \"we will never afford anything decent.\" Yesterday I handed them their keys. 🔑 Not magic — a realistic budget, patience through 9 viewings, and one honest conversation about compromise. (Shared with permission.)","ms":"6 bulan lalu mereka kata \"kami takkan mampu apa-apa yang elok.\" Semalam saya serahkan kunci rumah mereka. 🔑 Bukan magik — bajet realistik, kesabaran melalui 9 viewing, dan satu perbualan jujur tentang kompromi. (Dikongsi dengan izin.)","id":"6 bulan lalu mereka bilang \"kami tidak akan pernah mampu yang layak.\" Kemarin saya serahkan kunci rumah mereka. 🔑 Bukan sulap — bujet realistis, kesabaran melewati 9 viewing, dan satu percakapan jujur soal kompromi. (Dibagikan dengan izin.)"}',
 '{"en":"ALWAYS get permission first. The story arc: doubt → process → keys.","ms":"SENTIASA minta izin dahulu. Lengkung cerita: ragu → proses → kunci.","id":"SELALU minta izin dulu. Alur cerita: ragu → proses → kunci."}', 1),
('testimonial',
 '{"en":"Best message I received this month: \"Thank you for telling us NOT to buy that unit.\" Sometimes the job is protecting people from a bad deal. That is the standard. (Shared with permission.)","ms":"Mesej terbaik saya terima bulan ini: \"Terima kasih sebab beritahu kami JANGAN beli unit itu.\" Kadangkala tugas kita melindungi orang daripada urusan yang buruk. Itulah standardnya. (Dikongsi dengan izin.)","id":"Pesan terbaik yang saya terima bulan ini: \"Terima kasih sudah bilang JANGAN beli unit itu.\" Kadang tugas kita melindungi orang dari transaksi buruk. Itulah standarnya. (Dibagikan dengan izin.)"}',
 '{"en":"Anti-sale stories are the strongest trust content that exists.","ms":"Cerita menolak jualan ialah kandungan kepercayaan paling kuat yang wujud.","id":"Cerita menolak penjualan adalah konten kepercayaan terkuat yang ada."}', 2),
('recruitment',
 '{"en":"Honest post about this job: some weeks I earn nothing. Some months change everything. What stays constant — I choose my hours, my ceiling, and who I become. If you have been thinking about real estate, ask me the hard questions. I will answer honestly.","ms":"Post jujur tentang kerja ini: ada minggu saya tak dapat apa-apa. Ada bulan yang mengubah segalanya. Yang kekal — saya pilih waktu saya, siling saya, dan siapa saya mahu jadi. Kalau anda pernah terfikir tentang hartanah, tanya saya soalan-soalan sukar. Saya jawab dengan jujur.","id":"Posting jujur tentang pekerjaan ini: ada minggu saya tidak dapat apa-apa. Ada bulan yang mengubah segalanya. Yang tetap — saya memilih jam saya, plafon saya, dan menjadi siapa saya. Kalau Anda pernah memikirkan properti, tanyakan pertanyaan sulitnya. Saya jawab jujur."}',
 '{"en":"Honesty filters for the right recruits — aligned with the AG Leadership funnel.","ms":"Kejujuran menapis rekrut yang betul — selari dengan funnel AG Leadership.","id":"Kejujuran menyaring rekrut yang tepat — selaras dengan funnel AG Leadership."}', 1),
('recruitment',
 '{"en":"A day in my real estate life: 7am planning, 9am calls, 12pm viewing, 3pm follow-ups, 8pm learning. Nobody hands you a salary — you build an asset called YOU. Curious what the first 90 days look like? Message me.","ms":"Sehari dalam hidup hartanah saya: 7 pagi merancang, 9 pagi panggilan, 12 tengah hari viewing, 3 petang susulan, 8 malam belajar. Tiada siapa hulur gaji — anda membina aset bernama DIRI ANDA. Nak tahu rupa 90 hari pertama? Mesej saya.","id":"Sehari dalam hidup properti saya: jam 7 perencanaan, jam 9 panggilan, jam 12 viewing, jam 3 tindak lanjut, jam 8 malam belajar. Tidak ada yang memberi gaji — Anda membangun aset bernama DIRI ANDA. Penasaran seperti apa 90 hari pertama? DM saya."}',
 '{"en":"Routine content shows reality — recruits who still ask are the serious ones.","ms":"Kandungan rutin menunjukkan realiti — rekrut yang masih bertanya ialah yang serius.","id":"Konten rutinitas menunjukkan realitas — rekrut yang tetap bertanya adalah yang serius."}', 2);
