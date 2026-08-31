-- 055_diag_academy_seed.sql — Diag Academy V1 seed (spec §8/§12/§43).
-- Versioned seed data, NOT hardcoded UI. Representative content — Kamal expands
-- the question bank and curriculum in Command HQ afterwards.

-- ========== 26 development dimensions ==========
insert into diag_dimensions (key, category, title, sort) values
 ('professional_identity','foundation','{"en":"Professional Identity & Character","ms":"Identiti & Sahsiah Profesional","id":"Identitas & Karakter Profesional"}',1),
 ('ethics_compliance','foundation','{"en":"Ethics, Compliance & Trust","ms":"Etika, Pematuhan & Amanah","id":"Etika, Kepatuhan & Kepercayaan"}',2),
 ('process_fundamentals','foundation','{"en":"Real Estate Process Fundamentals","ms":"Asas Proses Hartanah","id":"Dasar Proses Properti"}',3),
 ('customer_responsibility','foundation','{"en":"Customer Responsibility","ms":"Tanggungjawab Pelanggan","id":"Tanggung Jawab Pelanggan"}',4),
 ('prospecting','business','{"en":"Prospecting","ms":"Mencari Prospek","id":"Mencari Prospek"}',5),
 ('needs_discovery','business','{"en":"Needs Discovery","ms":"Meneroka Keperluan","id":"Menggali Kebutuhan"}',6),
 ('relationship_building','business','{"en":"Relationship Building","ms":"Membina Hubungan","id":"Membangun Hubungan"}',7),
 ('follow_up','business','{"en":"Follow-Up Discipline","ms":"Disiplin Susulan","id":"Disiplin Tindak Lanjut"}',8),
 ('appointment_setting','business','{"en":"Appointment Setting","ms":"Menetapkan Janji Temu","id":"Mengatur Janji Temu"}',9),
 ('presentation','business','{"en":"Presentation / Viewing","ms":"Pembentangan / Viewing","id":"Presentasi / Viewing"}',10),
 ('objection_handling','business','{"en":"Objection Handling","ms":"Menangani Bantahan","id":"Menangani Keberatan"}',11),
 ('negotiation','business','{"en":"Negotiation","ms":"Rundingan","id":"Negosiasi"}',12),
 ('closing_process','business','{"en":"Closing Process","ms":"Proses Penutupan","id":"Proses Closing"}',13),
 ('financing_coordination','process','{"en":"Financing Coordination Boundaries","ms":"Sempadan Penyelarasan Pembiayaan","id":"Batas Koordinasi Pembiayaan"}',14),
 ('documentation','process','{"en":"Documentation & Process Discipline","ms":"Disiplin Dokumentasi & Proses","id":"Disiplin Dokumentasi & Proses"}',15),
 ('crm_pipeline','process','{"en":"CRM / Pipeline Discipline","ms":"Disiplin CRM / Pipeline","id":"Disiplin CRM / Pipeline"}',16),
 ('content_creation','marketing','{"en":"Content Creation","ms":"Penciptaan Kandungan","id":"Pembuatan Konten"}',17),
 ('live_hosting','marketing','{"en":"Live Hosting","ms":"Hos Siaran Langsung","id":"Host Live"}',18),
 ('advertising','marketing','{"en":"Advertising Fundamentals","ms":"Asas Pengiklanan","id":"Dasar Periklanan"}',19),
 ('campaign_measurement','marketing','{"en":"Campaign Measurement","ms":"Pengukuran Kempen","id":"Pengukuran Kampanye"}',20),
 ('growth_funding','marketing','{"en":"Responsible Team Growth Funding","ms":"Pembiayaan Pertumbuhan Pasukan Bertanggungjawab","id":"Pendanaan Pertumbuhan Tim yang Bertanggung Jawab"}',21),
 ('recruitment','leadership','{"en":"Recruitment","ms":"Perekrutan","id":"Rekrutmen"}',22),
 ('coaching','leadership','{"en":"Coaching / Training","ms":"Bimbingan / Latihan","id":"Coaching / Pelatihan"}',23),
 ('leadership','leadership','{"en":"Leadership","ms":"Kepimpinan","id":"Kepemimpinan"}',24),
 ('accountability','leadership','{"en":"Accountability","ms":"Akauntabiliti","id":"Akuntabilitas"}',25),
 ('learning_agility','leadership','{"en":"Learning Agility","ms":"Ketangkasan Belajar","id":"Ketangkasan Belajar"}',26)
on conflict (key) do nothing;

-- ========== diagnostic questions (objective — defensible answers only, §12) ==========
insert into diag_questions (dimension_key, qtype, question, options, correct, explanation, difficulty) values
('ethics_compliance','single',
 '{"en":"A customer asks whether a claim about a property is correct, and you are not sure. What do you do?","ms":"Pelanggan bertanya sama ada satu dakwaan tentang hartanah itu betul, dan anda tidak pasti. Apa tindakan anda?","id":"Pelanggan bertanya apakah sebuah klaim tentang properti benar, dan Anda tidak yakin. Apa yang Anda lakukan?"}',
 '[{"en":"Answer confidently so the customer stays interested","ms":"Jawab dengan yakin supaya pelanggan kekal berminat","id":"Jawab dengan percaya diri agar pelanggan tetap tertarik"},
   {"en":"Verify with an authorised person before communicating","ms":"Sahkan dengan orang yang diberi kuasa sebelum menyampaikan","id":"Verifikasi dengan pihak berwenang sebelum menyampaikan"},
   {"en":"Promise now and correct later if wrong","ms":"Janji dahulu dan betulkan kemudian jika silap","id":"Janjikan dulu dan koreksi nanti jika salah"},
   {"en":"Change the subject","ms":"Alih topik","id":"Alihkan topik"}]',
 1,'{"en":"Verify first. One honest confirmation builds more trust than ten confident guesses.","ms":"Sahkan dahulu. Satu pengesahan jujur membina lebih banyak amanah daripada sepuluh tekaan yakin.","id":"Verifikasi dulu. Satu konfirmasi jujur membangun lebih banyak kepercayaan daripada sepuluh tebakan."}',1),

('financing_coordination','scenario',
 '{"en":"A buyer asks: \"Is my loan guaranteed to be approved?\" The professional response is:","ms":"Pembeli bertanya: \"Adakah pinjaman saya pasti diluluskan?\" Respons profesional ialah:","id":"Pembeli bertanya: \"Apakah pinjaman saya pasti disetujui?\" Respons profesional adalah:"}',
 '[{"en":"Yes, guaranteed — I will handle it","ms":"Ya, pasti — saya uruskan","id":"Ya, pasti — saya yang urus"},
   {"en":"Explain the general process and coordinate with an authorised specialist; never guarantee approval","ms":"Terangkan proses umum dan selaras dengan pakar yang diberi kuasa; jangan sekali-kali menjamin kelulusan","id":"Jelaskan proses umum dan koordinasikan dengan spesialis resmi; jangan pernah menjamin persetujuan"},
   {"en":"Tell them approval depends on luck","ms":"Beritahu kelulusan bergantung pada nasib","id":"Katakan persetujuan tergantung keberuntungan"},
   {"en":"Avoid the question until booking is signed","ms":"Elak soalan itu sehingga tempahan ditandatangani","id":"Hindari pertanyaan sampai booking ditandatangani"}]',
 1,'{"en":"You coordinate; authorised specialists assess. Approval is never yours to guarantee.","ms":"Anda menyelaras; pakar yang diberi kuasa menilai. Kelulusan bukan hak anda untuk dijamin.","id":"Anda mengoordinasikan; spesialis resmi yang menilai. Persetujuan bukan hak Anda untuk dijamin."}',1),

('follow_up','single',
 '{"en":"What makes a follow-up message effective?","ms":"Apa yang menjadikan mesej susulan berkesan?","id":"Apa yang membuat pesan tindak lanjut efektif?"}',
 '[{"en":"Sending \"any update?\" repeatedly","ms":"Menghantar \"ada berita?\" berulang kali","id":"Mengirim \"ada kabar?\" berulang-ulang"},
   {"en":"It proposes ONE clear, specific next step with a time","ms":"Ia mencadangkan SATU langkah seterusnya yang jelas dan khusus dengan masa","id":"Mengusulkan SATU langkah berikutnya yang jelas dan spesifik dengan waktu"},
   {"en":"Waiting for the customer to reach out first","ms":"Menunggu pelanggan hubungi dahulu","id":"Menunggu pelanggan menghubungi lebih dulu"},
   {"en":"Sending the full brochure again","ms":"Menghantar semula brosur penuh","id":"Mengirim ulang brosur lengkap"}]',
 1,'{"en":"Follow-up converts when it carries a clear next action, not pressure.","ms":"Susulan menukar apabila ia membawa tindakan seterusnya yang jelas, bukan tekanan.","id":"Tindak lanjut mengonversi saat membawa aksi berikutnya yang jelas, bukan tekanan."}',1),

('follow_up','scenario',
 '{"en":"A buyer goes quiet after a good viewing. Best next move?","ms":"Pembeli senyap selepas viewing yang baik. Langkah terbaik?","id":"Pembeli diam setelah viewing yang baik. Langkah terbaik?"}',
 '[{"en":"Assume they are not interested and stop contact","ms":"Anggap mereka tidak berminat dan berhenti hubungi","id":"Anggap tidak tertarik dan hentikan kontak"},
   {"en":"Message asking what they thought, and offer a specific next step (e.g. second viewing this weekend)","ms":"Mesej bertanya pendapat mereka, dan tawarkan langkah khusus (cth. viewing kedua hujung minggu ini)","id":"Kirim pesan menanyakan pendapat mereka, dan tawarkan langkah spesifik (mis. viewing kedua akhir pekan ini)"},
   {"en":"Call five times in one day","ms":"Telefon lima kali sehari","id":"Telepon lima kali sehari"},
   {"en":"Send a discount immediately","ms":"Terus tawarkan diskaun","id":"Langsung tawarkan diskon"}]',
 1,'{"en":"Silence usually means uncertainty, not rejection. Invite feedback and propose one concrete step.","ms":"Senyap biasanya bermaksud tidak pasti, bukan menolak. Minta maklum balas dan cadangkan satu langkah konkrit.","id":"Diam biasanya berarti ragu, bukan menolak. Minta umpan balik dan usulkan satu langkah konkret."}',2),

('prospecting','scenario',
 '{"en":"A lead replies only: \"Send price.\" What is the strongest professional response?","ms":"Lead hanya membalas: \"Hantar harga.\" Apa respons profesional paling kuat?","id":"Lead hanya membalas: \"Kirim harga.\" Apa respons profesional terkuat?"}',
 '[{"en":"Send the full price list and wait","ms":"Hantar senarai harga penuh dan tunggu","id":"Kirim daftar harga lengkap dan tunggu"},
   {"en":"Share the range, then ask ONE question to understand their need (budget, area, purpose)","ms":"Kongsi julat harga, kemudian tanya SATU soalan untuk memahami keperluan (bajet, kawasan, tujuan)","id":"Bagikan kisaran harga, lalu ajukan SATU pertanyaan untuk memahami kebutuhan (bujet, area, tujuan)"},
   {"en":"Refuse until they call you","ms":"Enggan sehingga mereka menelefon","id":"Menolak sampai mereka menelepon"},
   {"en":"Ignore — price shoppers waste time","ms":"Abaikan — pemburu harga membuang masa","id":"Abaikan — pemburu harga buang waktu"}]',
 1,'{"en":"Answer, then advance: give value and open a conversation with one easy question.","ms":"Jawab, kemudian mara: beri nilai dan buka perbualan dengan satu soalan mudah.","id":"Jawab, lalu maju: beri nilai dan buka percakapan dengan satu pertanyaan mudah."}',2),

('closing_process','scenario',
 '{"en":"A buyer says: \"This property is too expensive.\" First professional move?","ms":"Pembeli berkata: \"Hartanah ini terlalu mahal.\" Langkah profesional pertama?","id":"Pembeli berkata: \"Properti ini terlalu mahal.\" Langkah profesional pertama?"}',
 '[{"en":"Immediately show a cheaper property","ms":"Terus tunjukkan hartanah lebih murah","id":"Langsung tunjukkan properti lebih murah"},
   {"en":"Understand what \"expensive\" means to them — compared to what, and what their budget really is","ms":"Fahami maksud \"mahal\" bagi mereka — berbanding apa, dan apa bajet sebenar mereka","id":"Pahami arti \"mahal\" bagi mereka — dibanding apa, dan berapa bujet sebenarnya"},
   {"en":"Argue that the price is fair","ms":"Berhujah harga itu berpatutan","id":"Berdebat bahwa harganya wajar"},
   {"en":"Offer to reduce your commission","ms":"Tawar untuk kurangkan komisen anda","id":"Tawarkan memotong komisi Anda"}]',
 1,'{"en":"An objection is information. Understand it before answering it.","ms":"Bantahan ialah maklumat. Fahami dahulu sebelum menjawabnya.","id":"Keberatan adalah informasi. Pahami dulu sebelum menjawabnya."}',2),

('relationship_building','scenario',
 '{"en":"A satisfied customer just completed their purchase. What is the professional next step?","ms":"Pelanggan yang berpuas hati baru selesai pembelian. Apa langkah profesional seterusnya?","id":"Pelanggan yang puas baru menyelesaikan pembelian. Apa langkah profesional berikutnya?"}',
 '[{"en":"Close the file — the deal is done","ms":"Tutup fail — urusan selesai","id":"Tutup berkas — transaksi selesai"},
   {"en":"Thank them, stay reachable through handover, and ask if anyone around them is also looking","ms":"Ucap terima kasih, kekal mudah dihubungi sepanjang serahan, dan tanya jika ada kenalan yang turut mencari","id":"Berterima kasih, tetap mudah dihubungi selama serah terima, dan tanyakan apakah ada kenalan yang juga mencari"},
   {"en":"Ask for a 5-star review before handover issues appear","ms":"Minta ulasan 5 bintang sebelum isu serahan muncul","id":"Minta ulasan bintang 5 sebelum masalah serah terima muncul"},
   {"en":"Add them to every future promotion blast","ms":"Masukkan mereka dalam semua hebahan promosi","id":"Masukkan ke semua blast promosi"}]',
 1,'{"en":"After-sale care is the start of the next referral, not the end of this one.","ms":"Jagaan selepas jualan ialah permulaan referral seterusnya, bukan penamat urusan ini.","id":"Perhatian purnajual adalah awal referral berikutnya, bukan akhir transaksi ini."}',2),

('crm_pipeline','single',
 '{"en":"When should a call or customer conversation be recorded in the system?","ms":"Bilakah panggilan atau perbualan pelanggan patut direkodkan dalam sistem?","id":"Kapan panggilan atau percakapan pelanggan harus dicatat dalam sistem?"}',
 '[{"en":"Only successful ones","ms":"Hanya yang berjaya","id":"Hanya yang berhasil"},
   {"en":"Immediately after every conversation, with the honest outcome","ms":"Sejurus selepas setiap perbualan, dengan hasil yang jujur","id":"Segera setelah setiap percakapan, dengan hasil yang jujur"},
   {"en":"At the end of the month","ms":"Pada hujung bulan","id":"Di akhir bulan"},
   {"en":"Only when the leader asks","ms":"Hanya bila leader minta","id":"Hanya saat leader meminta"}]',
 1,'{"en":"A pipeline you can trust is built one honest record at a time.","ms":"Pipeline yang boleh dipercayai dibina satu rekod jujur pada satu masa.","id":"Pipeline yang bisa dipercaya dibangun satu catatan jujur setiap kali."}',1);

-- confidence questions (§7 — separate from knowledge, never merged)
insert into diag_questions (dimension_key, qtype, question, options, correct) values
('follow_up','confidence',
 '{"en":"How confident are you in your follow-up today?","ms":"Sejauh mana keyakinan anda pada susulan anda hari ini?","id":"Seberapa yakin Anda dengan tindak lanjut Anda saat ini?"}',
 '[{"en":"Very low","ms":"Sangat rendah","id":"Sangat rendah"},{"en":"Low","ms":"Rendah","id":"Rendah"},{"en":"Moderate","ms":"Sederhana","id":"Sedang"},{"en":"High","ms":"Tinggi","id":"Tinggi"},{"en":"Very high","ms":"Sangat tinggi","id":"Sangat tinggi"}]', null),
('closing_process','confidence',
 '{"en":"How confident are you in guiding a buyer through closing?","ms":"Sejauh mana keyakinan anda membimbing pembeli melalui penutupan?","id":"Seberapa yakin Anda memandu pembeli melewati closing?"}',
 '[{"en":"Very low","ms":"Sangat rendah","id":"Sangat rendah"},{"en":"Low","ms":"Rendah","id":"Rendah"},{"en":"Moderate","ms":"Sederhana","id":"Sedang"},{"en":"High","ms":"Tinggi","id":"Tinggi"},{"en":"Very high","ms":"Sangat tinggi","id":"Sangat tinggi"}]', null),
('prospecting','confidence',
 '{"en":"How confident are you in starting new conversations?","ms":"Sejauh mana keyakinan anda memulakan perbualan baharu?","id":"Seberapa yakin Anda memulai percakapan baru?"}',
 '[{"en":"Very low","ms":"Sangat rendah","id":"Sangat rendah"},{"en":"Low","ms":"Rendah","id":"Rendah"},{"en":"Moderate","ms":"Sederhana","id":"Sedang"},{"en":"High","ms":"Tinggi","id":"Tinggi"},{"en":"Very high","ms":"Sangat tinggi","id":"Sangat tinggi"}]', null),
('relationship_building','confidence',
 '{"en":"How confident are you in building long-term customer relationships?","ms":"Sejauh mana keyakinan anda membina hubungan pelanggan jangka panjang?","id":"Seberapa yakin Anda membangun hubungan pelanggan jangka panjang?"}',
 '[{"en":"Very low","ms":"Sangat rendah","id":"Sangat rendah"},{"en":"Low","ms":"Rendah","id":"Rendah"},{"en":"Moderate","ms":"Sederhana","id":"Sedang"},{"en":"High","ms":"Tinggi","id":"Tinggi"},{"en":"Very high","ms":"Sangat tinggi","id":"Sangat tinggi"}]', null);

-- ========== academy tracks + modules + representative lessons ==========
do $$
declare t1 bigint; t2 bigint; t3 bigint; t4 bigint; t5 bigint;
        m_conduct bigint; m_fin bigint; m_prospect bigint; m_needs bigint; m_rel bigint;
        m_fu1 bigint; m_fu2 bigint; m_present bigint; m_obj bigint; m_close bigint;
        m_content bigint; m_ads bigint; m_recruit bigint; m_coach bigint;
begin
  if exists (select 1 from academy_tracks) then return; end if;

  insert into academy_tracks (title, sort) values ('{"en":"Professional Foundation","ms":"Asas Profesional","id":"Fondasi Profesional"}',1) returning id into t1;
  insert into academy_tracks (title, sort) values ('{"en":"Sales Foundation","ms":"Asas Jualan","id":"Fondasi Penjualan"}',2) returning id into t2;
  insert into academy_tracks (title, sort) values ('{"en":"Present & Convert","ms":"Bentang & Tukar","id":"Presentasi & Konversi"}',3) returning id into t3;
  insert into academy_tracks (title, sort) values ('{"en":"Marketing & Lead Generation","ms":"Pemasaran & Penjanaan Lead","id":"Pemasaran & Perolehan Lead"}',4) returning id into t4;
  insert into academy_tracks (title, sort) values ('{"en":"Grow People","ms":"Membangun Insan","id":"Menumbuhkan Orang"}',5) returning id into t5;

  insert into academy_modules (track_id, title, dimension_key, sort) values (t1,'{"en":"Professional Conduct & Trust","ms":"Etika Profesional & Amanah","id":"Etika Profesional & Kepercayaan"}','ethics_compliance',1) returning id into m_conduct;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t1,'{"en":"Financing Coordination Boundaries","ms":"Sempadan Penyelarasan Pembiayaan","id":"Batas Koordinasi Pembiayaan"}','financing_coordination',2) returning id into m_fin;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t2,'{"en":"Prospecting Foundations","ms":"Asas Mencari Prospek","id":"Dasar Mencari Prospek"}','prospecting',1) returning id into m_prospect;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t2,'{"en":"Needs Discovery","ms":"Meneroka Keperluan","id":"Menggali Kebutuhan"}','needs_discovery',2) returning id into m_needs;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t2,'{"en":"Relationship Building","ms":"Membina Hubungan","id":"Membangun Hubungan"}','relationship_building',3) returning id into m_rel;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t2,'{"en":"Follow-Up Foundations","ms":"Asas Susulan","id":"Dasar Tindak Lanjut"}','follow_up',4) returning id into m_fu1;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t2,'{"en":"Structured Follow-Up","ms":"Susulan Berstruktur","id":"Tindak Lanjut Terstruktur"}','follow_up',5) returning id into m_fu2;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t3,'{"en":"Presentation & Viewing","ms":"Pembentangan & Viewing","id":"Presentasi & Viewing"}','presentation',1) returning id into m_present;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t3,'{"en":"Objection Handling","ms":"Menangani Bantahan","id":"Menangani Keberatan"}','objection_handling',2) returning id into m_obj;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t3,'{"en":"Closing Process","ms":"Proses Penutupan","id":"Proses Closing"}','closing_process',3) returning id into m_close;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t4,'{"en":"Real Estate Content Foundations","ms":"Asas Kandungan Hartanah","id":"Dasar Konten Properti"}','content_creation',1) returning id into m_content;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t4,'{"en":"Responsible Advertising Start","ms":"Permulaan Pengiklanan Bertanggungjawab","id":"Awal Periklanan yang Bertanggung Jawab"}','advertising',2) returning id into m_ads;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t5,'{"en":"Responsible Recruitment","ms":"Perekrutan Bertanggungjawab","id":"Rekrutmen yang Bertanggung Jawab"}','recruitment',1) returning id into m_recruit;
  insert into academy_modules (track_id, title, dimension_key, sort) values (t5,'{"en":"Coaching Foundations","ms":"Asas Bimbingan","id":"Dasar Coaching"}','coaching',2) returning id into m_coach;

  -- representative PUBLISHED lessons so the vertical slice works end-to-end
  insert into academy_lessons (module_id, type, title, body, duration_min, min_seconds, ack_required, sort, status) values
  (m_fu1,'article',
   '{"en":"Turning Follow-Up Into A Clear Next Action","ms":"Menjadikan Susulan Satu Tindakan Jelas","id":"Mengubah Tindak Lanjut Menjadi Aksi yang Jelas"}',
   '{"en":"Weak follow-up asks \"any update?\". Strong follow-up proposes ONE specific next step with a time: \"Shall I book the second viewing this Saturday 3pm, or Sunday morning?\" Every follow-up you send should leave the customer with an easy yes.\n\nRule of thumb: never end a conversation without the next step agreed — even a small one.",
     "ms":"Susulan lemah bertanya \"ada berita?\". Susulan kuat mencadangkan SATU langkah khusus dengan masa: \"Boleh saya tempah viewing kedua Sabtu ini 3 petang, atau Ahad pagi?\" Setiap susulan patut meninggalkan pelanggan dengan \"ya\" yang mudah.\n\nPetua: jangan akhiri perbualan tanpa langkah seterusnya dipersetujui — walau kecil.",
     "id":"Tindak lanjut lemah bertanya \"ada kabar?\". Tindak lanjut kuat mengusulkan SATU langkah spesifik dengan waktu: \"Boleh saya jadwalkan viewing kedua Sabtu ini jam 3 sore, atau Minggu pagi?\" Setiap tindak lanjut harus meninggalkan \"ya\" yang mudah bagi pelanggan.\n\nAturan praktis: jangan akhiri percakapan tanpa langkah berikutnya disepakati — sekecil apa pun."}',
   4, 90, false, 1, 'published'),
  (m_close,'article',
   '{"en":"The Closing Process Is A Service","ms":"Proses Penutupan Ialah Khidmat","id":"Proses Closing Adalah Pelayanan"}',
   '{"en":"Closing is not pressure — it is helping a ready buyer take a clear decision. Your job: remove uncertainty step by step (price clarity, financing path, documents, timeline) until the decision feels safe.\n\nWhen a buyer hesitates, find WHICH uncertainty is left — do not push harder on all of them.",
     "ms":"Menutup jualan bukan tekanan — ia membantu pembeli yang bersedia membuat keputusan jelas. Tugas anda: buang ketidakpastian langkah demi langkah (kejelasan harga, laluan pembiayaan, dokumen, garis masa) sehingga keputusan terasa selamat.\n\nBila pembeli teragak-agak, cari ketidakpastian YANG MANA yang tinggal — jangan tolak lebih kuat pada semuanya.",
     "id":"Closing bukan tekanan — melainkan membantu pembeli yang siap mengambil keputusan yang jelas. Tugas Anda: singkirkan keraguan selangkah demi selangkah (kejelasan harga, jalur pembiayaan, dokumen, garis waktu) sampai keputusan terasa aman.\n\nSaat pembeli ragu, temukan keraguan YANG MANA yang tersisa — jangan mendorong lebih keras pada semuanya."}',
   4, 90, false, 1, 'published'),
  (m_conduct,'article',
   '{"en":"Trust Before Transaction","ms":"Amanah Sebelum Transaksi","id":"Kepercayaan Sebelum Transaksi"}',
   '{"en":"Never promise what you have not verified. Never guarantee financing approval. Never describe an unlisted claim as fact. When unsure — verify with an authorised person first. This is not slower selling; it is how careers survive.",
     "ms":"Jangan janjikan apa yang belum disahkan. Jangan jamin kelulusan pembiayaan. Jangan nyatakan dakwaan yang belum pasti sebagai fakta. Bila ragu — sahkan dengan orang yang diberi kuasa dahulu. Ini bukan jualan lebih perlahan; inilah cara kerjaya bertahan.",
     "id":"Jangan janjikan yang belum diverifikasi. Jangan jamin persetujuan pembiayaan. Jangan nyatakan klaim yang belum pasti sebagai fakta. Saat ragu — verifikasi dulu dengan pihak berwenang. Ini bukan menjual lebih lambat; inilah cara karier bertahan."}',
   3, 60, true, 1, 'published'),
  (m_ads,'article',
   '{"en":"Start Small, Measure Everything","ms":"Mula Kecil, Ukur Segalanya","id":"Mulai Kecil, Ukur Semuanya"}',
   '{"en":"Advertising results are NEVER guaranteed. Start with a small test budget you can afford to lose completely. Never use essential household funds. Never use borrowed money for campaigns. Before any shared/funded campaign: agree in writing on budget, lead ownership, reporting and lead distribution.\n\nMeasure cost per lead and cost per appointment — feelings lie, numbers teach.",
     "ms":"Hasil iklan TIDAK pernah terjamin. Mula dengan bajet ujian kecil yang anda mampu hilang sepenuhnya. Jangan sekali-kali guna wang keperluan asas rumah tangga. Jangan guna wang pinjaman untuk kempen. Sebelum kempen dikongsi/dibiayai: setuju secara bertulis tentang bajet, pemilikan lead, pelaporan dan pengagihan lead.\n\nUkur kos setiap lead dan kos setiap janji temu — perasaan menipu, nombor mengajar.",
     "id":"Hasil iklan TIDAK pernah dijamin. Mulai dengan bujet uji kecil yang sanggup Anda relakan sepenuhnya. Jangan pernah pakai dana kebutuhan pokok rumah tangga. Jangan pakai uang pinjaman untuk kampanye. Sebelum kampanye bersama/didanai: sepakati tertulis bujet, kepemilikan lead, pelaporan, dan distribusi lead.\n\nUkur biaya per lead dan biaya per janji temu — perasaan menipu, angka mengajar."}',
   4, 90, true, 1, 'published');

  -- the follow-up lesson carries a knowledge check
  update academy_lessons set quiz =
    '{"question":{"en":"A buyer keeps postponing. Your follow-up should…","ms":"Pembeli asyik menangguh. Susulan anda patut…","id":"Pembeli terus menunda. Tindak lanjut Anda sebaiknya…"},
      "options":[
       {"en":"Ask \"any update?\" again","ms":"Tanya \"ada berita?\" lagi","id":"Tanya \"ada kabar?\" lagi"},
       {"en":"Propose one specific, easy next step with a time","ms":"Cadangkan satu langkah mudah dan khusus dengan masa","id":"Usulkan satu langkah mudah dan spesifik dengan waktu"},
       {"en":"Warn them the unit will be gone","ms":"Beri amaran unit akan habis","id":"Peringatkan unit akan habis"},
       {"en":"Stop contacting them","ms":"Berhenti menghubungi","id":"Berhenti menghubungi"}],
      "correct":1,
      "explanation":{"en":"Specific and easy beats urgent and vague.","ms":"Khusus dan mudah mengalahkan mendesak dan kabur.","id":"Spesifik dan mudah mengalahkan mendesak dan samar."},
      "retry":true}'
  where module_id = m_fu1 and sort = 1;

  -- draft placeholders for the rest of the curriculum
  insert into academy_lessons (module_id, type, title, sort, status) values
  (m_fu2,'article','{"en":"Your 7-Day Follow-Up System","ms":"Sistem Susulan 7 Hari Anda","id":"Sistem Tindak Lanjut 7 Hari Anda"}',1,'draft'),
  (m_prospect,'article','{"en":"Ten Conversations A Week","ms":"Sepuluh Perbualan Seminggu","id":"Sepuluh Percakapan Seminggu"}',1,'draft'),
  (m_needs,'article','{"en":"Questions That Open People Up","ms":"Soalan Yang Membuka Hati","id":"Pertanyaan yang Membuka Orang"}',1,'draft'),
  (m_rel,'article','{"en":"Trust Grows In Small Moments","ms":"Amanah Tumbuh Dalam Detik Kecil","id":"Kepercayaan Tumbuh di Momen Kecil"}',1,'draft'),
  (m_present,'article','{"en":"A Viewing Is A Story","ms":"Viewing Ialah Cerita","id":"Viewing Adalah Cerita"}',1,'draft'),
  (m_obj,'article','{"en":"Objections Are Information","ms":"Bantahan Ialah Maklumat","id":"Keberatan Adalah Informasi"}',1,'draft'),
  (m_fin,'article','{"en":"Coordinate, Never Guarantee","ms":"Selaras, Jangan Jamin","id":"Koordinasikan, Jangan Jamin"}',1,'draft'),
  (m_content,'article','{"en":"Content That Answers Real Questions","ms":"Kandungan Yang Menjawab Soalan Sebenar","id":"Konten yang Menjawab Pertanyaan Nyata"}',1,'draft'),
  (m_recruit,'article','{"en":"Honest Conversations About This Work","ms":"Perbualan Jujur Tentang Kerja Ini","id":"Percakapan Jujur tentang Pekerjaan Ini"}',1,'draft'),
  (m_coach,'article','{"en":"Teach One Skill You Use","ms":"Ajar Satu Kemahiran Yang Anda Guna","id":"Ajarkan Satu Keterampilan yang Anda Pakai"}',1,'draft');

  -- ---------- prescription rules: dimension band → modules (§25) ----------
  insert into academy_dimension_rules (dimension_key, band, module_id) values
  ('follow_up','foundation',m_fu1),('follow_up','developing',m_fu1),('follow_up','developing',m_fu2),('follow_up','working',m_fu2),
  ('closing_process','foundation',m_close),('closing_process','developing',m_close),('closing_process','working',m_close),
  ('prospecting','foundation',m_prospect),('prospecting','developing',m_prospect),
  ('relationship_building','foundation',m_rel),('relationship_building','developing',m_rel),
  ('ethics_compliance','foundation',m_conduct),('ethics_compliance','developing',m_conduct),('ethics_compliance','working',m_conduct),
  ('financing_coordination','foundation',m_fin),('financing_coordination','developing',m_fin),('financing_coordination','working',m_fin),
  ('crm_pipeline','foundation',m_fu2),('crm_pipeline','developing',m_fu2);

  -- ---------- role accelerators: talent pathway → modules ----------
  insert into academy_role_rules (role_key, module_id, rank) values
  ('relationship_builder',m_needs,1),('relationship_builder',m_rel,2),
  ('closer',m_obj,1),('closer',m_close,2),
  ('prospector',m_prospect,1),('prospector',m_fu1,2),
  ('presenter',m_present,1),
  ('content_creator',m_content,1),
  ('live_host',m_content,1),('live_host',m_present,2),
  ('advertiser',m_ads,1),
  ('team_growth_funder',m_ads,1),
  ('financing_coordinator',m_fin,1),
  ('recruiter',m_recruit,1),
  ('coach_trainer',m_coach,1),
  ('leader',m_coach,1),('leader',m_recruit,2);
end $$;
