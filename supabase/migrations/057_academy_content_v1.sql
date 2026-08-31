-- 057_academy_content_v1.sql — content fill: the structure was verified, now
-- the substance. (a) +15 diagnostic questions across 12 more dimensions,
-- (b) real trilingual bodies for every draft Academy lesson (published),
-- (c) real bodies for the draft Onboarding lessons — with the locked country
-- rule applied: Legal/Compliance and the professional-pathway lesson become
-- COUNTRY VARIANTS (MY row + ID row), because Malaysian NCC/REN process is not
-- Indonesian process. Everything remains admin-editable.

-- ========== (a) diagnostic questions ==========
insert into diag_questions (dimension_key, qtype, question, options, correct, explanation, difficulty) values
('needs_discovery','single',
 '{"en":"Meeting a new buyer, your strongest opening question is:","ms":"Bertemu pembeli baharu, soalan pembuka paling kuat ialah:","id":"Bertemu pembeli baru, pertanyaan pembuka terkuat adalah:"}',
 '[{"en":"\"This project is selling fast — how many units do you want?\"","ms":"\"Projek ini laris — berapa unit tuan mahu?\"","id":"\"Proyek ini laris — mau berapa unit?\""},
   {"en":"\"May I ask what you are looking for — for your own stay or investment, and roughly what budget?\"","ms":"\"Boleh saya tahu apa yang dicari — untuk duduk sendiri atau pelaburan, dan sekitar bajet berapa?\"","id":"\"Boleh saya tahu apa yang dicari — untuk ditempati sendiri atau investasi, dan kisaran bujetnya?\""},
   {"en":"\"Let me present all 12 projects first\"","ms":"\"Biar saya bentangkan semua 12 projek dahulu\"","id":"\"Saya presentasikan dulu semua 12 proyek\""},
   {"en":"\"What is your income?\"","ms":"\"Berapa pendapatan tuan?\"","id":"\"Berapa penghasilan Anda?\""}]',
 1,'{"en":"Discover purpose and budget before pitching — the pitch becomes ten times sharper.","ms":"Fahami tujuan dan bajet sebelum membentang — pembentangan jadi sepuluh kali lebih tajam.","id":"Pahami tujuan dan bujet sebelum presentasi — presentasi jadi sepuluh kali lebih tajam."}',1),

('appointment_setting','scenario',
 '{"en":"You have 20 minutes before a buyer appointment. Best use of the time?","ms":"Anda ada 20 minit sebelum janji temu pembeli. Penggunaan masa terbaik?","id":"Anda punya 20 menit sebelum janji temu pembeli. Penggunaan waktu terbaik?"}',
 '[{"en":"Scroll social media to relax","ms":"Skrol media sosial untuk relaks","id":"Scroll media sosial untuk rileks"},
   {"en":"Confirm the appointment, re-read their needs and prepare the 3 things they cared about most","ms":"Sahkan janji temu, baca semula keperluan mereka dan sediakan 3 perkara yang paling mereka pentingkan","id":"Konfirmasi janji temu, baca ulang kebutuhan mereka dan siapkan 3 hal yang paling mereka pedulikan"},
   {"en":"Prepare a discount offer in advance","ms":"Sediakan tawaran diskaun awal-awal","id":"Siapkan penawaran diskon lebih dulu"},
   {"en":"Arrive late so you seem busy and in demand","ms":"Sampai lewat supaya nampak sibuk dan laris","id":"Datang terlambat agar terlihat sibuk dan laris"}]',
 1,'{"en":"Confirmation halves no-shows; preparation built on THEIR needs wins the meeting.","ms":"Pengesahan mengurangkan separuh ketidakhadiran; persediaan berasaskan keperluan MEREKA memenangi pertemuan.","id":"Konfirmasi memangkas separuh ketidakhadiran; persiapan berdasarkan kebutuhan MEREKA memenangkan pertemuan."}',1),

('objection_handling','single',
 '{"en":"The professional FIRST response to any objection is:","ms":"Respons PERTAMA yang profesional terhadap sebarang bantahan ialah:","id":"Respons PERTAMA yang profesional terhadap keberatan apa pun adalah:"}',
 '[{"en":"Counter it immediately with facts","ms":"Balas segera dengan fakta","id":"Langsung balas dengan fakta"},
   {"en":"Acknowledge it, then ask a question to understand what is really behind it","ms":"Akui dahulu, kemudian tanya soalan untuk memahami apa yang sebenar di sebaliknya","id":"Akui dulu, lalu ajukan pertanyaan untuk memahami apa yang sebenarnya di baliknya"},
   {"en":"Lower the price expectation","ms":"Turunkan jangkaan harga","id":"Turunkan ekspektasi harga"},
   {"en":"Move on to another property","ms":"Terus ke hartanah lain","id":"Langsung ke properti lain"}]',
 1,'{"en":"An objection answered before it is understood usually grows stronger.","ms":"Bantahan yang dijawab sebelum difahami biasanya jadi lebih kuat.","id":"Keberatan yang dijawab sebelum dipahami biasanya makin kuat."}',2),

('negotiation','scenario',
 '{"en":"Buyer and owner are far apart on price. Your professional move:","ms":"Pembeli dan pemilik jauh berbeza harga. Tindakan profesional anda:","id":"Pembeli dan pemilik berbeda jauh soal harga. Langkah profesional Anda:"}',
 '[{"en":"Pressure whichever side is softer","ms":"Tekan pihak yang lebih lembut","id":"Tekan pihak yang lebih lunak"},
   {"en":"Understand what each side truly needs (price, timing, terms) and build a structured middle path","ms":"Fahami apa yang setiap pihak benar-benar perlukan (harga, masa, terma) dan bina jalan tengah berstruktur","id":"Pahami apa yang benar-benar dibutuhkan tiap pihak (harga, waktu, syarat) dan bangun jalan tengah terstruktur"},
   {"en":"Tell both sides the other refuses to move","ms":"Beritahu kedua-dua pihak yang satu lagi enggan berganjak","id":"Katakan ke kedua pihak bahwa pihak lain menolak bergeser"},
   {"en":"Give up — the gap is too big","ms":"Putus asa — jurang terlalu besar","id":"Menyerah — selisihnya terlalu besar"}]',
 1,'{"en":"Deals close on interests, not positions — timing and terms often bridge what price cannot.","ms":"Urusan tertutup atas kepentingan, bukan kedudukan — masa dan terma sering merapatkan apa yang harga tak mampu.","id":"Transaksi tercapai lewat kepentingan, bukan posisi — waktu dan syarat sering menjembatani yang tidak bisa dijembatani harga."}',2),

('documentation','single',
 '{"en":"Booking documents should be:","ms":"Dokumen tempahan sepatutnya:","id":"Dokumen booking seharusnya:"}',
 '[{"en":"Prepared after the buyer signs — no point earlier","ms":"Disediakan selepas pembeli tandatangan — tak guna awal-awal","id":"Disiapkan setelah pembeli tanda tangan — percuma lebih awal"},
   {"en":"Prepared and checked BEFORE the appointment, complete and accurate","ms":"Disediakan dan disemak SEBELUM janji temu, lengkap dan tepat","id":"Disiapkan dan diperiksa SEBELUM janji temu, lengkap dan akurat"},
   {"en":"Left to the office to handle","ms":"Diserahkan kepada pejabat","id":"Diserahkan ke kantor"},
   {"en":"Filled in roughly and corrected later","ms":"Diisi kasar dan dibetulkan kemudian","id":"Diisi kasar lalu dikoreksi belakangan"}]',
 1,'{"en":"A ready buyer plus missing documents equals a lost booking. Preparation is respect.","ms":"Pembeli yang bersedia tambah dokumen tak lengkap sama dengan tempahan terlepas. Persediaan itu hormat.","id":"Pembeli siap plus dokumen kurang sama dengan booking hilang. Persiapan adalah bentuk hormat."}',1),

('customer_responsibility','scenario',
 '{"en":"A customer reports a handover problem AFTER completion. You:","ms":"Pelanggan lapor masalah serahan SELEPAS urusan selesai. Anda:","id":"Pelanggan melaporkan masalah serah terima SETELAH transaksi selesai. Anda:"}',
 '[{"en":"Explain it is no longer your responsibility","ms":"Terangkan ia bukan lagi tanggungjawab anda","id":"Jelaskan itu bukan lagi tanggung jawab Anda"},
   {"en":"Respond, help them reach the right party, and follow up until it is in proper hands","ms":"Respons, bantu mereka hubungi pihak yang betul, dan susul sehingga ia di tangan yang sepatutnya","id":"Merespons, bantu mereka menghubungi pihak yang tepat, dan tindak lanjut sampai ditangani pihak yang semestinya"},
   {"en":"Block their number — the deal is done","ms":"Sekat nombor mereka — urusan dah selesai","id":"Blokir nomornya — transaksi sudah selesai"},
   {"en":"Offer a discount on their next purchase","ms":"Tawar diskaun untuk pembelian seterusnya","id":"Tawarkan diskon untuk pembelian berikutnya"}]',
 1,'{"en":"After-sale care is where referrals are born — and where reputations die.","ms":"Jagaan selepas jualan ialah tempat referral lahir — dan tempat reputasi mati.","id":"Perhatian purnajual adalah tempat lahirnya referral — dan tempat matinya reputasi."}',1),

('content_creation','single',
 '{"en":"The content most likely to bring you leads:","ms":"Kandungan yang paling mungkin membawa lead:","id":"Konten yang paling mungkin mendatangkan lead:"}',
 '[{"en":"Daily motivational quotes","ms":"Kata-kata semangat setiap hari","id":"Kutipan motivasi harian"},
   {"en":"Short, useful answers to questions real buyers actually ask","ms":"Jawapan pendek dan berguna kepada soalan yang benar-benar ditanya pembeli","id":"Jawaban singkat dan bermanfaat atas pertanyaan yang benar-benar diajukan pembeli"},
   {"en":"Photos of your awards","ms":"Gambar anugerah anda","id":"Foto penghargaan Anda"},
   {"en":"Reposting other agents’ listings","ms":"Repost listing ejen lain","id":"Repost listing agen lain"}]',
 1,'{"en":"Useful beats impressive. Answer one real question per post.","ms":"Berguna mengalahkan hebat. Jawab satu soalan sebenar setiap post.","id":"Bermanfaat mengalahkan keren. Jawab satu pertanyaan nyata per posting."}',1),

('advertising','single',
 '{"en":"Starting paid ads responsibly means:","ms":"Memulakan iklan berbayar secara bertanggungjawab bermaksud:","id":"Memulai iklan berbayar secara bertanggung jawab berarti:"}',
 '[{"en":"Big first budget for maximum reach","ms":"Bajet pertama yang besar untuk capaian maksimum","id":"Bujet pertama besar demi jangkauan maksimum"},
   {"en":"A small test budget you can afford to lose, with cost-per-lead measured from day one","ms":"Bajet ujian kecil yang anda mampu hilang, dengan kos-setiap-lead diukur dari hari pertama","id":"Bujet uji kecil yang sanggup Anda relakan, dengan biaya-per-lead diukur sejak hari pertama"},
   {"en":"Copying a top producer’s ad exactly","ms":"Meniru bulat-bulat iklan top producer","id":"Meniru persis iklan top producer"},
   {"en":"Borrowing money to fund the campaign","ms":"Meminjam wang untuk membiayai kempen","id":"Meminjam uang untuk mendanai kampanye"}]',
 1,'{"en":"Results are never guaranteed — small tests and honest numbers protect you.","ms":"Hasil tidak pernah terjamin — ujian kecil dan nombor jujur melindungi anda.","id":"Hasil tidak pernah dijamin — uji kecil dan angka jujur melindungi Anda."}',1),

('growth_funding','scenario',
 '{"en":"A leader invites you to co-fund a team lead campaign. Before any money moves, you:","ms":"Seorang leader ajak anda membiayai bersama kempen lead pasukan. Sebelum wang bergerak, anda:","id":"Seorang leader mengajak Anda mendanai bersama kampanye lead tim. Sebelum uang berpindah, Anda:"}',
 '[{"en":"Transfer first — trust the team","ms":"Transfer dahulu — percayakan pasukan","id":"Transfer dulu — percayai tim"},
   {"en":"Agree in writing on budget, lead ownership, reporting and lead distribution — and never use essential or borrowed money","ms":"Setuju secara bertulis tentang bajet, pemilikan lead, pelaporan dan pengagihan lead — dan jangan sekali guna wang keperluan asas atau pinjaman","id":"Sepakati tertulis bujet, kepemilikan lead, pelaporan dan distribusi lead — dan jangan pernah pakai uang kebutuhan pokok atau pinjaman"},
   {"en":"Ask for a guaranteed return first","ms":"Minta jaminan pulangan dahulu","id":"Minta jaminan imbal hasil dulu"},
   {"en":"Fund it quietly and see what happens","ms":"Biayai senyap-senyap dan tunggu apa jadi","id":"Danai diam-diam lalu lihat hasilnya"}]',
 1,'{"en":"Ad results cannot be guaranteed. Written agreement BEFORE funding is what responsible growth looks like.","ms":"Hasil iklan tak boleh dijamin. Persetujuan bertulis SEBELUM pembiayaan itulah rupa pertumbuhan bertanggungjawab.","id":"Hasil iklan tidak bisa dijamin. Kesepakatan tertulis SEBELUM pendanaan adalah wujud pertumbuhan yang bertanggung jawab."}',2),

('recruitment','scenario',
 '{"en":"A friend asks about joining real estate. The professional conversation:","ms":"Rakan bertanya tentang menyertai hartanah. Perbualan yang profesional:","id":"Teman bertanya soal bergabung ke properti. Percakapan yang profesional:"}',
 '[{"en":"Promise fast income to get them in","ms":"Janjikan pendapatan cepat supaya mereka masuk","id":"Janjikan penghasilan cepat agar dia masuk"},
   {"en":"Describe the work honestly — including the hard parts — and let them decide with real information","ms":"Terangkan kerja ini dengan jujur — termasuk bahagian sukar — dan biar mereka putuskan dengan maklumat sebenar","id":"Jelaskan pekerjaan ini dengan jujur — termasuk bagian sulitnya — dan biarkan dia memutuskan dengan informasi nyata"},
   {"en":"Say it is easy money nowadays","ms":"Kata duit senang zaman sekarang","id":"Bilang ini uang mudah zaman sekarang"},
   {"en":"Avoid the topic — competition","ms":"Elak topik — nanti jadi saingan","id":"Hindari topik — nanti jadi saingan"}]',
 1,'{"en":"Recruits who join on honesty stay; recruits who join on hype quit and blame you.","ms":"Rekrut yang masuk atas kejujuran akan kekal; yang masuk atas janji manis akan berhenti dan salahkan anda.","id":"Rekrut yang masuk karena kejujuran akan bertahan; yang masuk karena janji manis akan berhenti dan menyalahkan Anda."}',1),

('coaching','single',
 '{"en":"You just taught a junior a skill. The step that locks the learning in:","ms":"Anda baru ajar junior satu kemahiran. Langkah yang mengunci pembelajaran:","id":"Anda baru mengajarkan satu keterampilan ke junior. Langkah yang mengunci pembelajaran:"}',
 '[{"en":"Move on — they watched you do it","ms":"Teruskan — mereka dah tengok anda buat","id":"Lanjut — dia sudah melihat Anda melakukannya"},
   {"en":"Ask them to do it while you watch, then ask what was unclear","ms":"Minta mereka buat sambil anda perhati, kemudian tanya apa yang kurang jelas","id":"Minta dia melakukannya sementara Anda amati, lalu tanyakan apa yang belum jelas"},
   {"en":"Give them a long document to read","ms":"Beri dokumen panjang untuk dibaca","id":"Beri dokumen panjang untuk dibaca"},
   {"en":"Test them in front of the team","ms":"Uji mereka di hadapan pasukan","id":"Uji dia di depan tim"}]',
 1,'{"en":"Show, then let them do, then close the gaps. Watching alone builds nothing.","ms":"Tunjuk, biar mereka buat, kemudian tutup jurang. Menonton semata tak membina apa-apa.","id":"Tunjukkan, biarkan dia lakukan, lalu tutup celahnya. Menonton saja tidak membangun apa pun."}',1),

('accountability','single',
 '{"en":"You missed your weekly target. The professional response:","ms":"Anda terlepas sasaran mingguan. Respons profesional:","id":"Anda meleset dari target mingguan. Respons profesional:"}',
 '[{"en":"Blame the market","ms":"Salahkan pasaran","id":"Salahkan pasar"},
   {"en":"Own it, review your real numbers, adjust ONE thing, and commit the new plan to your leader","ms":"Akui, semak nombor sebenar anda, ubah SATU perkara, dan komitkan pelan baharu kepada leader anda","id":"Akui, tinjau angka nyata Anda, ubah SATU hal, dan komitmenkan rencana baru ke leader Anda"},
   {"en":"Set a double target next week to compensate","ms":"Letak sasaran berganda minggu depan sebagai ganti","id":"Pasang target dobel minggu depan sebagai kompensasi"},
   {"en":"Stop reporting until numbers improve","ms":"Berhenti lapor sehingga nombor pulih","id":"Berhenti melapor sampai angka membaik"}]',
 1,'{"en":"Accountability is reviewing honestly and adjusting — not punishing yourself or hiding.","ms":"Akauntabiliti ialah menyemak dengan jujur dan menyesuaikan — bukan menghukum diri atau bersembunyi.","id":"Akuntabilitas adalah meninjau dengan jujur dan menyesuaikan — bukan menghukum diri atau bersembunyi."}',2);

insert into diag_questions (dimension_key, qtype, question, options, correct) values
('objection_handling','confidence',
 '{"en":"How confident are you handling objections today?","ms":"Sejauh mana keyakinan anda menangani bantahan hari ini?","id":"Seberapa yakin Anda menangani keberatan saat ini?"}',
 '[{"en":"Very low","ms":"Sangat rendah","id":"Sangat rendah"},{"en":"Low","ms":"Rendah","id":"Rendah"},{"en":"Moderate","ms":"Sederhana","id":"Sedang"},{"en":"High","ms":"Tinggi","id":"Tinggi"},{"en":"Very high","ms":"Sangat tinggi","id":"Sangat tinggi"}]', null),
('presentation','confidence',
 '{"en":"How confident are you presenting a project or viewing?","ms":"Sejauh mana keyakinan anda membentang projek atau viewing?","id":"Seberapa yakin Anda mempresentasikan proyek atau viewing?"}',
 '[{"en":"Very low","ms":"Sangat rendah","id":"Sangat rendah"},{"en":"Low","ms":"Rendah","id":"Rendah"},{"en":"Moderate","ms":"Sederhana","id":"Sedang"},{"en":"High","ms":"Tinggi","id":"Tinggi"},{"en":"Very high","ms":"Sangat tinggi","id":"Sangat tinggi"}]', null),
('content_creation','confidence',
 '{"en":"How confident are you creating content that attracts buyers?","ms":"Sejauh mana keyakinan anda mencipta kandungan yang menarik pembeli?","id":"Seberapa yakin Anda membuat konten yang menarik pembeli?"}',
 '[{"en":"Very low","ms":"Sangat rendah","id":"Sangat rendah"},{"en":"Low","ms":"Rendah","id":"Rendah"},{"en":"Moderate","ms":"Sederhana","id":"Sedang"},{"en":"High","ms":"Tinggi","id":"Tinggi"},{"en":"Very high","ms":"Sangat tinggi","id":"Sangat tinggi"}]', null);

-- ========== (b) academy draft lessons: real content, published ==========
update academy_lessons set status = 'published', duration_min = 4, min_seconds = 90, body =
 '{"en":"A follow-up SYSTEM beats follow-up memory. The 7-day rhythm: Day 0 — thank them and confirm the agreed next step in writing. Day 1 — send the one piece of info they asked for. Day 3 — value touch (article, similar unit, financing insight), no pressure. Day 7 — direct and honest: \"Shall we look again this weekend, or would you rather I check back next month?\"\n\nEvery touch either adds value or asks ONE clear question. Log every touch in the system the moment it happens — your future self is your most important teammate.",
   "ms":"SISTEM susulan mengalahkan ingatan susulan. Rentak 7 hari: Hari 0 — ucap terima kasih dan sahkan langkah dipersetujui secara bertulis. Hari 1 — hantar satu maklumat yang mereka minta. Hari 3 — sentuhan nilai (artikel, unit serupa, info pembiayaan), tanpa tekanan. Hari 7 — terus dan jujur: \"Kita lihat semula hujung minggu ini, atau tuan mahu saya semak semula bulan depan?\"\n\nSetiap sentuhan sama ada menambah nilai atau bertanya SATU soalan jelas. Rekod setiap sentuhan dalam sistem sebaik ia berlaku — diri anda pada masa depan ialah rakan sepasukan paling penting.",
   "id":"SISTEM tindak lanjut mengalahkan ingatan. Ritme 7 hari: Hari 0 — berterima kasih dan konfirmasi langkah yang disepakati secara tertulis. Hari 1 — kirim satu info yang mereka minta. Hari 3 — sentuhan nilai (artikel, unit serupa, wawasan pembiayaan), tanpa tekanan. Hari 7 — langsung dan jujur: \"Kita lihat lagi akhir pekan ini, atau Anda ingin saya hubungi lagi bulan depan?\"\n\nSetiap sentuhan entah menambah nilai atau mengajukan SATU pertanyaan jelas. Catat setiap sentuhan di sistem saat itu juga — diri Anda di masa depan adalah rekan setim terpenting."}'
where status = 'draft' and title ->> 'en' = 'Your 7-Day Follow-Up System';

update academy_lessons set status = 'published', duration_min = 4, min_seconds = 90, body =
 '{"en":"Ten NEW conversations a week keeps a pipeline alive — that is two per working day. A conversation counts when the other person replies. Sources: past customers, viewers who went quiet, referrals, community groups, people who engaged your content.\n\nOpen with relevance, not a pitch: mention the thing that connects you, ask one genuine question, and note what opened the conversation — patterns will appear within two weeks.",
   "ms":"Sepuluh perbualan BAHARU seminggu memastikan pipeline hidup — itu dua sehari bekerja. Perbualan dikira apabila pihak sana membalas. Sumber: pelanggan lama, pelawat viewing yang senyap, referral, kumpulan komuniti, orang yang berinteraksi dengan kandungan anda.\n\nBuka dengan kaitan, bukan jualan: sebut perkara yang menghubungkan anda, tanya satu soalan ikhlas, dan catat apa yang membuka perbualan itu — corak akan muncul dalam dua minggu.",
   "id":"Sepuluh percakapan BARU seminggu menjaga pipeline tetap hidup — itu dua per hari kerja. Percakapan dihitung saat lawan bicara membalas. Sumber: pelanggan lama, pengunjung viewing yang menghilang, referral, grup komunitas, orang yang berinteraksi dengan konten Anda.\n\nBuka dengan relevansi, bukan jualan: sebut hal yang menghubungkan kalian, ajukan satu pertanyaan tulus, dan catat apa yang membuka percakapan itu — polanya akan terlihat dalam dua minggu."}'
where status = 'draft' and title ->> 'en' = 'Ten Conversations A Week';

update academy_lessons set status = 'published', duration_min = 4, min_seconds = 90, body =
 '{"en":"People decide with feelings and justify with facts — your questions surface both. Four openers that work: \"What made you start looking?\" (motivation). \"What does your family need most from the next home?\" (real criteria). \"What worried you about places you have seen?\" (objections, early). \"If you found the right one, when would you want to move?\" (timeline).\n\nThen the hard part: stay quiet and listen. Note their exact words — you will reuse them at presentation and closing.",
   "ms":"Orang membuat keputusan dengan perasaan dan mewajarkannya dengan fakta — soalan anda menyerlahkan kedua-duanya. Empat pembuka yang berkesan: \"Apa yang membuatkan tuan mula mencari?\" (motivasi). \"Apa yang paling keluarga perlukan daripada rumah seterusnya?\" (kriteria sebenar). \"Apa yang merisaukan tentang tempat yang pernah dilihat?\" (bantahan, awal). \"Kalau jumpa yang betul, bila mahu berpindah?\" (garis masa).\n\nKemudian bahagian sukar: diam dan dengar. Catat perkataan tepat mereka — anda akan menggunakannya semula semasa pembentangan dan penutupan.",
   "id":"Orang memutuskan dengan perasaan dan membenarkannya dengan fakta — pertanyaan Anda memunculkan keduanya. Empat pembuka yang berhasil: \"Apa yang membuat Anda mulai mencari?\" (motivasi). \"Apa yang paling dibutuhkan keluarga dari rumah berikutnya?\" (kriteria nyata). \"Apa yang mengkhawatirkan dari tempat-tempat yang pernah dilihat?\" (keberatan, sejak awal). \"Kalau menemukan yang tepat, kapan ingin pindah?\" (garis waktu).\n\nLalu bagian tersulit: diam dan dengarkan. Catat kata-kata persis mereka — Anda akan memakainya lagi saat presentasi dan closing."}'
where status = 'draft' and title ->> 'en' = 'Questions That Open People Up';

update academy_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"Trust is built in small, repeated moments: replying when you said you would, admitting what you do not know, remembering the thing they mentioned last time, arriving prepared. None of these need talent — they need consistency.\n\nOne practical habit: after every conversation, write ONE personal detail they shared (child starting school, transfer next year). Open your next contact with it. People stay where they feel remembered.",
   "ms":"Kepercayaan dibina dalam detik kecil yang berulang: membalas bila anda kata akan membalas, mengaku apa yang anda tak tahu, mengingati perkara yang mereka sebut kali lepas, tiba dengan persediaan. Semua ini tak perlukan bakat — ia perlukan konsistensi.\n\nSatu tabiat praktikal: selepas setiap perbualan, tulis SATU perincian peribadi yang dikongsi (anak mula sekolah, pindah tahun depan). Buka hubungan seterusnya dengannya. Orang kekal di tempat mereka rasa diingati.",
   "id":"Kepercayaan dibangun dalam momen kecil yang berulang: membalas saat Anda bilang akan membalas, mengakui yang tidak Anda ketahui, mengingat hal yang mereka sebut sebelumnya, datang dengan persiapan. Semua ini tidak butuh bakat — butuh konsistensi.\n\nSatu kebiasaan praktis: setelah setiap percakapan, tulis SATU detail pribadi yang mereka bagikan (anak mulai sekolah, pindah tugas tahun depan). Buka kontak berikutnya dengan itu. Orang bertahan di tempat mereka merasa diingat."}'
where status = 'draft' and title ->> 'en' = 'Trust Grows In Small Moments';

update academy_lessons set status = 'published', duration_min = 4, min_seconds = 90, body =
 '{"en":"A viewing is not a tour of rooms — it is the story of THEIR life in this home, told with their own words from needs discovery. Before: confirm, arrive early, plan the route to end at the strongest point. During: let them walk in first, connect features to their needs (\"you mentioned your mother stays over — this room is on the ground floor\"). After: ask the honest question — \"How does this one feel compared to what you imagined?\" — and agree the next step before leaving.",
   "ms":"Viewing bukan lawatan bilik — ia cerita kehidupan MEREKA di rumah ini, diceritakan dengan perkataan mereka sendiri daripada penerokaan keperluan. Sebelum: sahkan, tiba awal, rancang laluan supaya berakhir di titik paling kuat. Semasa: biar mereka masuk dahulu, kaitkan ciri dengan keperluan mereka (\"tuan sebut ibu selalu bermalam — bilik ini di tingkat bawah\"). Selepas: tanya soalan jujur — \"Macam mana rasanya berbanding yang dibayangkan?\" — dan setujui langkah seterusnya sebelum berpisah.",
   "id":"Viewing bukan tur ruangan — melainkan cerita kehidupan MEREKA di rumah ini, dituturkan dengan kata-kata mereka sendiri dari penggalian kebutuhan. Sebelum: konfirmasi, datang lebih awal, rencanakan rute agar berakhir di titik terkuat. Selama: biarkan mereka masuk lebih dulu, hubungkan fitur dengan kebutuhan mereka (\"Anda bilang ibu sering menginap — kamar ini di lantai dasar\"). Sesudah: ajukan pertanyaan jujur — \"Bagaimana rasanya dibanding yang dibayangkan?\" — dan sepakati langkah berikutnya sebelum berpisah."}'
where status = 'draft' and title ->> 'en' = 'A Viewing Is A Story';

update academy_lessons set status = 'published', duration_min = 4, min_seconds = 90, body =
 '{"en":"\"Too expensive\", \"need to think\", \"comparing others\" — objections are information about an uncertainty you have not resolved yet. The AAA pattern: ACKNOWLEDGE (\"That is fair — it is a big decision\"), ASK (\"May I ask, expensive compared to what — monthly payment, or total price?\"), ANSWER only what they actually mean.\n\nMost objections are one of four: price, trust, timing, or fit. Each has a different answer — which is why asking comes before answering.",
   "ms":"\"Mahal sangat\", \"nak fikir dulu\", \"tengah banding lain\" — bantahan ialah maklumat tentang ketidakpastian yang belum anda selesaikan. Corak AAA: AKUI (\"Wajar — ini keputusan besar\"), ASK/TANYA (\"Boleh saya tahu, mahal berbanding apa — bayaran bulanan, atau harga penuh?\"), ANSWER/JAWAB hanya apa yang mereka benar-benar maksudkan.\n\nKebanyakan bantahan ialah satu daripada empat: harga, kepercayaan, masa, atau kesesuaian. Setiap satu jawapannya berbeza — sebab itu bertanya datang sebelum menjawab.",
   "id":"\"Kemahalan\", \"mau pikir dulu\", \"lagi membandingkan\" — keberatan adalah informasi tentang keraguan yang belum Anda selesaikan. Pola AAA: AKUI (\"Wajar — ini keputusan besar\"), ASK/TANYA (\"Boleh saya tahu, mahal dibanding apa — cicilan bulanan, atau harga total?\"), ANSWER/JAWAB hanya yang benar-benar mereka maksud.\n\nSebagian besar keberatan adalah satu dari empat: harga, kepercayaan, waktu, atau kecocokan. Masing-masing jawabannya berbeda — karena itu bertanya mendahului menjawab."}',
 quiz = '{"question":{"en":"A buyer says \"I need to think about it.\" Your first move?","ms":"Pembeli kata \"Saya nak fikir dulu.\" Langkah pertama anda?","id":"Pembeli bilang \"Saya mau pikir-pikir dulu.\" Langkah pertama Anda?"},
   "options":[
    {"en":"Offer a discount to decide now","ms":"Tawar diskaun untuk putuskan sekarang","id":"Tawarkan diskon agar putuskan sekarang"},
    {"en":"Acknowledge, then ask what part they want to think over","ms":"Akui, kemudian tanya bahagian mana yang mahu difikirkan","id":"Akui, lalu tanyakan bagian mana yang ingin dipikirkan"},
    {"en":"Say the unit will be gone tomorrow","ms":"Kata unit akan habis esok","id":"Bilang unitnya habis besok"},
    {"en":"Wait silently for them to call","ms":"Tunggu senyap sehingga mereka telefon","id":"Menunggu diam sampai mereka menelepon"}],
   "correct":1,
   "explanation":{"en":"\"Think about it\" hides a specific uncertainty. Find it, and you can actually help.","ms":"\"Nak fikir\" menyembunyikan satu ketidakpastian khusus. Temuinya, barulah anda benar-benar boleh membantu.","id":"\"Mau pikir-pikir\" menyembunyikan satu keraguan spesifik. Temukan itu, barulah Anda benar-benar bisa membantu."},
   "retry":true}'
where status = 'draft' and title ->> 'en' = 'Objections Are Information';

update academy_lessons set status = 'published', duration_min = 3, min_seconds = 60, ack_required = true, body =
 '{"en":"You COORDINATE financing; authorised specialists ASSESS it. What you may do: explain the general steps, help gather permitted documents, connect the buyer with an authorised banker or specialist, follow up on progress. What you must NEVER do: guarantee approval, quote final rates as certain, advise on structuring finances, or handle matters reserved for licensed professionals.\n\nThe sentence that saves careers: \"I will connect you with the specialist who can confirm this properly.\"",
   "ms":"Anda MENYELARAS pembiayaan; pakar yang diberi kuasa MENILAINYA. Yang boleh anda buat: terangkan langkah umum, bantu kumpul dokumen yang dibenarkan, hubungkan pembeli dengan pegawai bank atau pakar yang sah, susul perkembangan. Yang TIDAK boleh sama sekali: menjamin kelulusan, memberi kadar muktamad sebagai pasti, menasihat penstrukturan kewangan, atau mengendalikan urusan yang dikhaskan untuk profesional berlesen.\n\nAyat yang menyelamatkan kerjaya: \"Saya akan hubungkan tuan dengan pakar yang boleh sahkan perkara ini dengan betul.\"",
   "id":"Anda MENGOORDINASIKAN pembiayaan; spesialis resmi yang MENILAINYA. Yang boleh Anda lakukan: menjelaskan langkah umum, membantu mengumpulkan dokumen yang diizinkan, menghubungkan pembeli dengan petugas bank atau spesialis resmi, menindaklanjuti perkembangan. Yang TIDAK boleh sama sekali: menjamin persetujuan, menyebut suku bunga final sebagai pasti, menasihati penataan keuangan, atau menangani urusan yang khusus bagi profesional berlisensi.\n\nKalimat yang menyelamatkan karier: \"Saya akan hubungkan Anda dengan spesialis yang bisa memastikan ini dengan benar.\""}'
where status = 'draft' and title ->> 'en' = 'Coordinate, Never Guarantee';

update academy_lessons set status = 'published', duration_min = 4, min_seconds = 90, body =
 '{"en":"Every post should answer ONE question a real buyer asks. Collect questions from your actual conversations — \"what documents do I need?\", \"how much deposit?\", \"is this area flooding?\" — and answer one per post, simply and honestly.\n\nFormat matters less than usefulness. A 40-second talking video, three slides, or a plain text post all work IF the answer is genuinely helpful. End softly: \"If you are at this stage, message me — happy to explain for your situation.\" Never promise returns, never oversell.",
   "ms":"Setiap post patut menjawab SATU soalan yang pembeli sebenar tanya. Kumpul soalan daripada perbualan sebenar anda — \"dokumen apa saya perlu?\", \"deposit berapa?\", \"kawasan ini banjir tak?\" — dan jawab satu setiap post, secara mudah dan jujur.\n\nFormat kurang penting berbanding kebergunaan. Video bercakap 40 saat, tiga slaid, atau post teks biasa semuanya berkesan JIKA jawapannya benar-benar membantu. Akhiri lembut: \"Kalau tuan di peringkat ini, mesej saya — saya jelaskan ikut situasi tuan.\" Jangan janji pulangan, jangan lebih-lebih menjual.",
   "id":"Setiap posting harus menjawab SATU pertanyaan yang benar-benar diajukan pembeli. Kumpulkan pertanyaan dari percakapan nyata Anda — \"dokumen apa yang saya perlukan?\", \"DP berapa?\", \"daerah ini banjir tidak?\" — dan jawab satu per posting, sederhana dan jujur.\n\nFormat kalah penting dari kebermanfaatan. Video bicara 40 detik, tiga slide, atau posting teks biasa semuanya berhasil JIKA jawabannya benar-benar membantu. Akhiri dengan lembut: \"Kalau Anda di tahap ini, DM saya — dengan senang hati saya jelaskan untuk situasi Anda.\" Jangan janjikan imbal hasil, jangan menjual berlebihan."}'
where status = 'draft' and title ->> 'en' = 'Content That Answers Real Questions';

update academy_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"Recruit with the truth. Describe the real work: prospecting daily, rejection often, income that follows effort with delay, and the support system around them. Share YOUR real numbers and hours if you are comfortable — honesty attracts the right people and filters the wrong ones.\n\nThe honest close: \"This work rewards consistency, not luck. If that sounds like you, come see how our team works before you decide.\" A recruit who joins with open eyes becomes a teammate; one who joins on hype becomes a regret.",
   "ms":"Merekrut dengan kebenaran. Terangkan kerja sebenar: mencari prospek setiap hari, penolakan yang kerap, pendapatan yang mengikut usaha dengan penangguhan, dan sistem sokongan di sekeliling mereka. Kongsi nombor dan jam SEBENAR anda jika selesa — kejujuran menarik orang yang betul dan menapis yang salah.\n\nPenutup jujur: \"Kerja ini mengganjari konsistensi, bukan nasib. Kalau itu bunyi macam awak, mari lihat cara pasukan kami bekerja sebelum buat keputusan.\" Rekrut yang masuk dengan mata terbuka jadi rakan sepasukan; yang masuk atas janji manis jadi penyesalan.",
   "id":"Merekrut dengan kebenaran. Jelaskan pekerjaan sebenarnya: mencari prospek tiap hari, penolakan yang sering, penghasilan yang mengikuti usaha dengan jeda, dan sistem dukungan di sekeliling mereka. Bagikan angka dan jam kerja NYATA Anda bila nyaman — kejujuran menarik orang yang tepat dan menyaring yang keliru.\n\nPenutup jujur: \"Pekerjaan ini mengganjar konsistensi, bukan keberuntungan. Kalau itu terdengar seperti Anda, mari lihat cara tim kami bekerja sebelum memutuskan.\" Rekrut yang masuk dengan mata terbuka menjadi rekan setim; yang masuk karena janji manis menjadi penyesalan."}'
where status = 'draft' and title ->> 'en' = 'Honest Conversations About This Work';

update academy_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"The fastest way to learn leadership is to teach one skill you already use. Pick something small and real: your WhatsApp opener, your viewing checklist, your follow-up rhythm. Teach ONE person: show it, let them do it while you watch, then ask \"what was unclear?\" — their answer teaches YOU how to coach.\n\nDo this once a week. In three months you will have a teaching habit, a stronger team around you, and evidence of readiness for the leadership pathway — earned, not claimed.",
   "ms":"Cara terpantas belajar kepimpinan ialah mengajar satu kemahiran yang anda sudah guna. Pilih sesuatu yang kecil dan nyata: pembuka WhatsApp anda, senarai semak viewing, rentak susulan anda. Ajar SATU orang: tunjuk, biar mereka buat sambil anda perhati, kemudian tanya \"apa yang kurang jelas?\" — jawapan mereka mengajar ANDA cara membimbing.\n\nBuat sekali seminggu. Dalam tiga bulan anda akan ada tabiat mengajar, pasukan lebih kuat di sekeliling, dan bukti kesediaan untuk laluan kepimpinan — diperoleh, bukan didakwa.",
   "id":"Cara tercepat belajar kepemimpinan adalah mengajarkan satu keterampilan yang sudah Anda pakai. Pilih yang kecil dan nyata: pembuka WhatsApp Anda, checklist viewing, ritme tindak lanjut Anda. Ajari SATU orang: tunjukkan, biarkan dia melakukannya sementara Anda amati, lalu tanyakan \"apa yang belum jelas?\" — jawabannya mengajari ANDA cara melatih.\n\nLakukan seminggu sekali. Dalam tiga bulan Anda punya kebiasaan mengajar, tim yang lebih kuat di sekitar, dan bukti kesiapan untuk jalur kepemimpinan — diraih, bukan diklaim."}'
where status = 'draft' and title ->> 'en' = 'Teach One Skill You Use';

-- ========== (c) onboarding draft lessons: content + country variants ==========
-- shared (BOTH) lessons
update onb_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"Real estate is a service profession: you guide people through the largest purchase of their lives. Your product is not a house — it is clarity, honesty and process. Agents who internalise this outlast every market cycle, because trust compounds while listings expire.",
   "ms":"Hartanah ialah profesion khidmat: anda membimbing orang melalui pembelian terbesar dalam hidup mereka. Produk anda bukan rumah — ia kejelasan, kejujuran dan proses. Ejen yang menghayati ini bertahan melangkaui setiap kitaran pasaran, kerana kepercayaan berganda sementara listing luput.",
   "id":"Properti adalah profesi pelayanan: Anda memandu orang melewati pembelian terbesar dalam hidup mereka. Produk Anda bukan rumah — melainkan kejelasan, kejujuran, dan proses. Agen yang menghayati ini bertahan melampaui setiap siklus pasar, karena kepercayaan berlipat sementara listing kedaluwarsa."}'
where status = 'draft' and title ->> 'en' = 'What Is Real Estate?';

update onb_lessons set status = 'published', duration_min = 3, min_seconds = 60, ack_required = true, body =
 '{"en":"Professional conduct in one paragraph: tell the truth even when it costs a sale; verify before you promise; respect the customer''s time and money as if they were your family''s; never speak badly of colleagues or competitors to win; record honestly. Every shortcut you refuse is a brick in a career that lasts.",
   "ms":"Etika profesional dalam satu perenggan: bercakap benar walaupun ia mengorbankan satu jualan; sahkan sebelum berjanji; hormati masa dan wang pelanggan seolah-olah milik keluarga sendiri; jangan burukkan rakan atau pesaing untuk menang; rekod dengan jujur. Setiap jalan pintas yang anda tolak ialah bata dalam kerjaya yang kekal.",
   "id":"Etika profesional dalam satu paragraf: katakan kebenaran meski mengorbankan satu penjualan; verifikasi sebelum berjanji; hormati waktu dan uang pelanggan seolah milik keluarga sendiri; jangan menjelekkan rekan atau pesaing demi menang; catat dengan jujur. Setiap jalan pintas yang Anda tolak adalah batu bata karier yang bertahan."}'
where status = 'draft' and title ->> 'en' = 'Professional Conduct';

update onb_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"IQI AG Hero is your operating system: My Day plans your hours, the Caller feeds you leads one at a time, Sales tracks your pipeline, Grow develops you, and the AI Coach reviews your day every evening. The rule that makes it work: record everything, honestly, the moment it happens. The system can only help the agent it can see.",
   "ms":"IQI AG Hero ialah sistem operasi anda: My Day merancang jam anda, Caller menyalurkan lead satu demi satu, Sales menjejak pipeline, Grow membangunkan anda, dan AI Coach menyemak hari anda setiap petang. Peraturan yang menjadikannya berkesan: rekod segalanya, dengan jujur, sebaik ia berlaku. Sistem hanya mampu membantu ejen yang dapat dilihatnya.",
   "id":"IQI AG Hero adalah sistem operasi Anda: My Day merencanakan jam Anda, Caller menyalurkan lead satu per satu, Sales melacak pipeline, Grow mengembangkan Anda, dan AI Coach meninjau hari Anda setiap sore. Aturan yang membuatnya berhasil: catat semuanya, dengan jujur, saat itu juga. Sistem hanya bisa membantu agen yang bisa dilihatnya."}'
where status = 'draft' and title ->> 'en' = 'IQI AG Hero — Your System';

update onb_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"You are never alone here. Your Pod is your small unit; your Captain is its serving leader — appointed to serve the pod, not to outrank you. Bring problems early: a stuck deal, a difficult customer, a heavy week. The strength of AG is that a raised hand never lands nowhere.",
   "ms":"Anda tidak pernah bersendirian di sini. Pod ialah unit kecil anda; Kapten ialah pemimpinnya yang berkhidmat — dilantik untuk berkhidmat kepada pod, bukan untuk mengatasi anda. Bawa masalah seawalnya: urusan tersekat, pelanggan sukar, minggu yang berat. Kekuatan AG ialah tangan yang diangkat tidak pernah jatuh ke tempat kosong.",
   "id":"Anda tidak pernah sendirian di sini. Pod adalah unit kecil Anda; Kapten adalah pemimpinnya yang melayani — diangkat untuk melayani pod, bukan untuk mengungguli Anda. Bawalah masalah sedini mungkin: transaksi macet, pelanggan sulit, minggu yang berat. Kekuatan AG adalah tangan yang terangkat tidak pernah jatuh ke tempat kosong."}'
where status = 'draft' and title ->> 'en' = 'Pod and Captain';

update onb_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"AG communicates on WhatsApp — clearly, briefly, and on time. Three habits: reply within the hour during work hours (even \"noted, will check\" counts); write so the reader needs no second message (what, when, what you need); when a customer is waiting on you, update them BEFORE they ask. Silence reads as neglect — to customers and teammates alike.",
   "ms":"AG berkomunikasi melalui WhatsApp — jelas, ringkas, dan menepati masa. Tiga tabiat: balas dalam sejam pada waktu kerja (walau \"noted, saya semak\" pun dikira); tulis supaya pembaca tak perlukan mesej kedua (apa, bila, apa yang anda perlukan); bila pelanggan menunggu anda, kemas kini SEBELUM mereka bertanya. Diam dibaca sebagai abai — oleh pelanggan mahupun rakan sepasukan.",
   "id":"AG berkomunikasi lewat WhatsApp — jelas, ringkas, dan tepat waktu. Tiga kebiasaan: balas dalam satu jam pada jam kerja (bahkan \"noted, saya cek\" pun berarti); tulis agar pembaca tidak butuh pesan kedua (apa, kapan, apa yang Anda butuhkan); saat pelanggan menunggu Anda, kabari SEBELUM mereka bertanya. Diam terbaca sebagai abai — bagi pelanggan maupun rekan setim."}'
where status = 'draft' and title ->> 'en' = 'Communication';

update onb_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"Most deals are lost between conversations, not during them. Follow-up discipline means: every conversation ends with an agreed next step; every next step has a time; every touch is logged the moment it happens. You will learn the full system in the Academy — for now, adopt the rule: nothing leaves your hands without a next step attached.",
   "ms":"Kebanyakan urusan hilang ANTARA perbualan, bukan semasa perbualan. Disiplin susulan bermaksud: setiap perbualan berakhir dengan langkah seterusnya yang dipersetujui; setiap langkah ada masanya; setiap sentuhan direkod sebaik berlaku. Anda akan pelajari sistem penuh di Academy — buat masa ini, pegang peraturan: tiada apa meninggalkan tangan anda tanpa langkah seterusnya.",
   "id":"Sebagian besar transaksi hilang DI ANTARA percakapan, bukan saat percakapan. Disiplin tindak lanjut berarti: setiap percakapan berakhir dengan langkah berikut yang disepakati; setiap langkah ada waktunya; setiap sentuhan dicatat saat itu juga. Anda akan mempelajari sistem lengkapnya di Academy — untuk sekarang, pegang aturan: tidak ada yang meninggalkan tangan Anda tanpa langkah berikutnya."}'
where status = 'draft' and title ->> 'en' = 'Follow-up Discipline';

update onb_lessons set status = 'published', duration_min = 3, min_seconds = 60, body =
 '{"en":"Your first mission after onboarding: the 30 Days Closing Challenge — thirty days of structured daily action with your Coach watching your back, designed to produce your first (or next) closing through consistency, not luck. Enrolment and readiness are handled inside the Challenge module in Grow. Finish your onboarding, take the Academy diagnostic, then report for duty.",
   "ms":"Misi pertama anda selepas onboarding: 30 Days Closing Challenge — tiga puluh hari tindakan harian berstruktur dengan Coach menjaga belakang anda, direka untuk menghasilkan penutupan pertama (atau seterusnya) melalui konsistensi, bukan nasib. Pendaftaran dan kesediaan diuruskan dalam modul Challenge di Grow. Habiskan onboarding, ambil diagnostik Academy, kemudian lapor diri.",
   "id":"Misi pertama Anda setelah onboarding: 30 Days Closing Challenge — tiga puluh hari aksi harian terstruktur dengan Coach menjaga punggung Anda, dirancang menghasilkan closing pertama (atau berikutnya) lewat konsistensi, bukan keberuntungan. Pendaftaran dan kesiapan diurus di modul Challenge di Grow. Selesaikan onboarding, ambil diagnostik Academy, lalu laporkan diri."}'
where status = 'draft' and title ->> 'en' = '30 Days Closing — Introduction';

-- COUNTRY VARIANTS: legal/compliance + professional pathway (locked rule §4)
-- the existing draft rows become the MALAYSIA variants…
update onb_lessons set country_scope = 'MY', status = 'published', duration_min = 4, min_seconds = 90, ack_required = true, body =
 '{"en":"In Malaysia, estate agency practice is regulated — real estate negotiators operate under a registered firm and the industry regulator''s rules. What this means for you day-to-day: represent only what is authorised, use accurate marketing, handle client money only through proper firm channels, and never present yourself with credentials you do not hold. Requirements change — always confirm current rules with your leader and official sources before relying on them.",
   "ms":"Di Malaysia, amalan agensi hartanah dikawal selia — perunding hartanah beroperasi di bawah firma berdaftar dan peraturan pengawal selia industri. Maksudnya untuk anda seharian: wakili hanya apa yang diberi kuasa, guna pemasaran yang tepat, urus wang pelanggan hanya melalui saluran firma yang betul, dan jangan sesekali menampilkan diri dengan kelayakan yang anda tidak miliki. Keperluan berubah — sentiasa sahkan peraturan semasa dengan leader anda dan sumber rasmi sebelum bergantung padanya.",
   "id":""}'
where status = 'draft' and title ->> 'en' = 'Legal & Compliance Introduction';

update onb_lessons set country_scope = 'MY', status = 'published', duration_min = 4, min_seconds = 90, body =
 '{"en":"The Malaysian pathway: new negotiators complete the required certification course before registering as a REN under a registered firm — your leader will guide you through the current steps and timing. Until your registration is complete, work within what is permitted for your status, and let the team carry what you cannot yet. The pathway is an investment: a registered, certified negotiator is trusted by banks, developers and customers alike.",
   "ms":"Laluan Malaysia: perunding baharu melengkapkan kursus pensijilan yang diwajibkan sebelum berdaftar sebagai REN di bawah firma berdaftar — leader anda akan membimbing langkah dan masa semasa. Sehingga pendaftaran selesai, bekerja dalam lingkungan yang dibenarkan untuk status anda, dan biarkan pasukan menanggung apa yang anda belum boleh. Laluan ini satu pelaburan: perunding berdaftar dan bersijil dipercayai bank, pemaju dan pelanggan.",
   "id":""}'
where status = 'draft' and title ->> 'en' = 'NCC / REN Pathway';

-- …and Indonesia gets its own sibling rows
insert into onb_lessons (section_id, type, country_scope, title, body, duration_min, min_seconds, ack_required, sort, status)
select l.section_id, 'article', 'ID',
 '{"en":"Legal & Compliance Introduction (Indonesia)","ms":"","id":"Pengantar Hukum & Kepatuhan (Indonesia)"}',
 '{"en":"In Indonesia, property brokerage has its own regulations and professional bodies — practice, licensing and process differ from other markets. Day-to-day: market accurately, never misrepresent ownership or permits, route client funds only through proper company channels, and never present credentials you do not hold. Rules evolve — always confirm current requirements with your leader and official sources.",
   "ms":"",
   "id":"Di Indonesia, perantara properti memiliki regulasi dan asosiasi profesinya sendiri — praktik, perizinan, dan proses berbeda dari pasar lain. Sehari-hari: pasarkan dengan akurat, jangan pernah salah menyatakan kepemilikan atau perizinan, salurkan dana klien hanya melalui jalur perusahaan yang benar, dan jangan menampilkan kredensial yang tidak Anda miliki. Aturan berubah — selalu pastikan ketentuan terbaru dengan leader Anda dan sumber resmi."}',
 4, 90, true, l.sort, 'published'
from onb_lessons l
where l.country_scope = 'MY' and l.title ->> 'en' = 'Legal & Compliance Introduction'
  and not exists (select 1 from onb_lessons x
                   where x.country_scope = 'ID' and x.title ->> 'en' like 'Legal & Compliance%');

insert into onb_lessons (section_id, type, country_scope, title, body, duration_min, min_seconds, sort, status)
select l.section_id, 'article', 'ID',
 '{"en":"Professional Pathway (Indonesia)","ms":"","id":"Jalur Profesi Agen (Indonesia)"}',
 '{"en":"The Indonesian pathway: you grow inside IQI''s structure — training, certification where applicable, and mentorship through your leader and pod. Focus your first months on mastering process and trust; your leader will guide which formal steps apply to your situation and when. Credibility here is built the same way everywhere: honest process, repeated.",
   "ms":"",
   "id":"Jalur Indonesia: Anda bertumbuh di dalam struktur IQI — pelatihan, sertifikasi bila berlaku, dan pendampingan melalui leader serta pod Anda. Fokuskan bulan-bulan pertama untuk menguasai proses dan kepercayaan; leader Anda akan memandu langkah formal mana yang berlaku untuk situasi Anda dan kapan. Kredibilitas di sini dibangun dengan cara yang sama di mana pun: proses yang jujur, diulang-ulang."}',
 4, 90, l.sort, 'published'
from onb_lessons l
where l.country_scope = 'MY' and l.title ->> 'en' = 'NCC / REN Pathway'
  and not exists (select 1 from onb_lessons x
                   where x.country_scope = 'ID' and x.title ->> 'en' like 'Professional Pathway%');
