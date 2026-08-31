# -*- coding: utf-8 -*-
"""Generate supabase/migrations/082_curriculum_v2.sql — the approved 30 Days v2
curriculum, trilingual (en / ms-MY / id-ID).

Run:  python tools/curriculum_v2.py

RULES THIS FILE OBEYS
  * v1 is NEVER edited. v2 is a new curriculum_versions row, created as DRAFT.
    Existing submissions keep pointing at the v1 rows they were answered against.
  * NO legal, financing, regulatory or commission content is authored here. The
    eight country-sensitive days (3, 4, 8, 13, 16, 21, 22, 24) get MY and ID
    variant rows whose STRUCTURE is defined and whose body is an explicit
    CONTENT REQUIRED marker with content_status='content_required'. The resolver
    (081) skips a content_required variant, so warriors read the generic row and
    are never shown the other country's content.
  * instructions / stretch_action / coach_guidance are written ONLY where they
    genuinely help. No field is bulk-filled to make it non-null.
  * coach_guidance says WHAT TO VERIFY. It never states an accept/reject bar —
    that is ch_open_decisions.evidence_threshold, still undecided.
  * XP values are carried over from v1 unchanged.
"""
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations', '082_curriculum_v2.sql')

XP = {1: 20, 5: 15, 12: 15, 18: 15, 26: 15, 27: 20, 29: 15, 30: 30}
COUNTRY_DAYS = {3, 4, 8, 13, 16, 21, 22, 24}


def phase(d):
    return 1 if d <= 5 else 2 if d <= 12 else 3 if d <= 21 else 4


def t(en, ms, idn):
    return {'en': en, 'ms-MY': ms, 'id-ID': idn}


# proof_config: min_count stays at 1 on purpose. "How many per day" is
# ch_open_decisions.daily_targets and is not invented here.
def native(source, window=None):
    cfg = {'source': source, 'min_count': 1}
    if window:
        cfg['window_days'] = window
    return cfg


DAYS = [
 dict(d=1, title=t('Hero Commitment', 'Ikrar Hero', 'Komitmen Hero'),
   objective=t('Decide why you are doing this, and what you will give it.',
               'Tetapkan mengapa anda melakukannya, dan apa yang anda akan beri.',
               'Tetapkan mengapa Anda melakukannya, dan apa yang Anda berikan.'),
   content=t('This challenge builds character, discipline and capability. It does not promise a closing — it builds the behaviour, pipeline and accountability that can create one. Closing is helping: you are not pushing anyone, you are helping someone decide well.',
             'Cabaran ini membina sahsiah, disiplin dan keupayaan. Ia tidak menjanjikan closing — ia membina tingkah laku, pipeline dan akauntabiliti yang boleh mencipta satu. Closing itu membantu: anda tidak memaksa sesiapa, anda membantu seseorang membuat keputusan yang baik.',
             'Tantangan ini membangun karakter, disiplin dan kapabilitas. Ini tidak menjanjikan closing — ini membangun perilaku, pipeline dan akuntabilitas yang bisa menciptakannya. Closing adalah membantu: Anda tidak menekan siapa pun, Anda membantu seseorang mengambil keputusan yang tepat.'),
   action=t('Write your 30-day goal, your personal reason, and the hours you can genuinely give each day.',
            'Tulis matlamat 30 hari, sebab peribadi anda, dan jumlah jam yang benar-benar boleh anda beri setiap hari.',
            'Tulis target 30 hari, alasan pribadi Anda, dan jam yang benar-benar bisa Anda berikan setiap hari.'),
   evidence=t('Your commitment, goal and daily available time, in your own words.',
              'Ikrar, matlamat dan masa harian anda, dengan kata-kata anda sendiri.',
              'Komitmen, target dan waktu harian Anda, dengan kata-kata Anda sendiri.'),
   reflect=t('What will make you stop, and what will you do when it happens?',
             'Apa yang akan buat anda berhenti, dan apa yang anda akan buat bila ia berlaku?',
             'Apa yang akan membuat Anda berhenti, dan apa yang akan Anda lakukan saat itu terjadi?'),
   coach=t('Verify the goal is specific and the daily time is realistic, not aspirational. A vague reason predicts a vague month.',
           'Sahkan matlamat itu spesifik dan masa harian realistik, bukan angan-angan. Sebab yang kabur meramalkan bulan yang kabur.',
           'Pastikan target spesifik dan waktu harian realistis, bukan angan-angan. Alasan yang kabur memprediksi bulan yang kabur.')),

 dict(d=2, title=t('Professional Identity & Character', 'Identiti Profesional & Sahsiah', 'Identitas Profesional & Karakter'),
   objective=t('Know who you are to a customer before you talk to one.',
               'Kenal siapa anda pada pelanggan sebelum anda bercakap dengan seorang pun.',
               'Kenali siapa Anda di mata pelanggan sebelum berbicara dengan siapa pun.'),
   content=t('Trust is the currency of AG. Your profile, how you present yourself and how you keep your word are part of the product. Strengths are worth naming; so is the one behaviour you know needs work.',
             'Kepercayaan ialah mata wang AG. Profil anda, cara anda membawa diri dan cara anda menepati janji adalah sebahagian daripada produk. Kekuatan patut dinamakan; begitu juga satu tingkah laku yang anda tahu perlu diperbaiki.',
             'Kepercayaan adalah mata uang AG. Profil Anda, cara Anda membawa diri dan cara Anda menepati janji adalah bagian dari produk. Kekuatan layak disebutkan; begitu juga satu perilaku yang Anda tahu perlu diperbaiki.'),
   action=t('Complete your Hero profile, then name one behaviour you will improve this month.',
            'Lengkapkan profil Hero anda, kemudian namakan satu tingkah laku yang anda akan perbaiki bulan ini.',
            'Lengkapi profil Hero Anda, lalu sebutkan satu perilaku yang akan Anda perbaiki bulan ini.'),
   evidence=t('Your completed profile plus the behaviour you chose and why.',
              'Profil lengkap anda serta tingkah laku yang anda pilih dan sebabnya.',
              'Profil lengkap Anda serta perilaku yang Anda pilih dan alasannya.'),
   reflect=t('What would a customer say about you after one conversation?',
             'Apa yang pelanggan akan kata tentang anda selepas satu perbualan?',
             'Apa yang akan dikatakan pelanggan tentang Anda setelah satu percakapan?'),
   instructions=t('If you have completed Talent Compass or a Diag assessment, reference it. Hero will not change your result — this is your own reading of it.',
                  'Jika anda telah melengkapkan Talent Compass atau penilaian Diag, rujuk padanya. Hero tidak akan mengubah keputusan anda — ini bacaan anda sendiri terhadapnya.',
                  'Jika Anda sudah menyelesaikan Talent Compass atau asesmen Diag, rujuk hasilnya. Hero tidak akan mengubah hasil Anda — ini pembacaan Anda sendiri.')),

 dict(d=3, country=True, title=t('Hero & Work Setup', 'Hero & Persediaan Kerja', 'Hero & Persiapan Kerja'),
   objective=t('Set up the system you will actually work in for 30 days.',
               'Sediakan sistem yang anda benar-benar akan guna selama 30 hari.',
               'Siapkan sistem yang benar-benar akan Anda gunakan selama 30 hari.'),
   content=t('Everything you do this month should leave a record in Hero: a lead, an activity, a next action, an appointment. That record is what proves your work, drives your daily mission and lets your Coach help you early instead of late.',
             'Semua yang anda buat bulan ini patut meninggalkan rekod dalam Hero: lead, aktiviti, tindakan seterusnya, temujanji. Rekod itulah yang membuktikan kerja anda, memacu misi harian dan membolehkan Coach membantu awal, bukan lewat.',
             'Semua yang Anda lakukan bulan ini harus meninggalkan catatan di Hero: lead, aktivitas, tindakan berikutnya, janji temu. Catatan itulah yang membuktikan kerja Anda, menggerakkan misi harian dan memungkinkan Coach membantu lebih awal.'),
   action=t('Complete your working setup and log one real interaction end to end so you know the flow.',
            'Lengkapkan persediaan kerja anda dan rekod satu interaksi sebenar dari awal ke akhir supaya anda tahu alirannya.',
            'Selesaikan persiapan kerja Anda dan catat satu interaksi nyata dari awal sampai akhir agar Anda paham alurnya.'),
   evidence=t('Your setup checklist plus the one interaction you logged.',
              'Senarai semak persediaan anda serta satu interaksi yang anda rekod.',
              'Daftar periksa persiapan Anda serta satu interaksi yang Anda catat.'),
   reflect=t('What part of your working system will break first when you get busy?',
             'Bahagian mana dalam sistem kerja anda yang akan gagal dahulu bila anda sibuk?',
             'Bagian mana dari sistem kerja Anda yang akan jebol lebih dulu saat Anda sibuk?'),
   instructions=t('Never share passwords, OTPs or account secrets with anyone — Hero will never ask for them and neither will your Coach.',
                  'Jangan sesekali kongsi kata laluan, OTP atau rahsia akaun dengan sesiapa — Hero tidak akan meminta dan Coach anda juga tidak.',
                  'Jangan pernah membagikan kata sandi, OTP atau rahasia akun kepada siapa pun — Hero tidak akan meminta dan Coach Anda juga tidak.'),
   coach=t('Verify the interaction was logged in Hero, not described in prose. Check no credential was shared in the response.',
           'Sahkan interaksi itu direkod dalam Hero, bukan diceritakan sahaja. Pastikan tiada maklumat akaun dikongsi dalam jawapan.',
           'Pastikan interaksi tercatat di Hero, bukan sekadar diceritakan. Pastikan tidak ada kredensial dibagikan dalam jawaban.')),

 dict(d=4, country=True, title=t('Market, Customer & Product Focus', 'Fokus Pasaran, Pelanggan & Produk', 'Fokus Pasar, Pelanggan & Produk'),
   objective=t('Choose one focus instead of chasing everything.',
               'Pilih satu fokus dan bukan mengejar semua benda.',
               'Pilih satu fokus alih-alih mengejar semuanya.'),
   content=t('A new warrior who tries to sell everything to everyone learns nothing repeatable. One approved focus — one customer profile, one project or segment — is what lets you get better every conversation instead of starting from zero each time.',
             'Warrior baharu yang cuba jual segalanya kepada semua orang tidak belajar apa-apa yang boleh diulang. Satu fokus yang diluluskan — satu profil pelanggan, satu projek atau segmen — itulah yang membuat anda bertambah baik setiap perbualan.',
             'Warrior baru yang mencoba menjual segalanya ke semua orang tidak belajar apa pun yang bisa diulang. Satu fokus yang disetujui — satu profil pelanggan, satu proyek atau segmen — itulah yang membuat Anda membaik setiap percakapan.'),
   action=t('Choose your focus, write the customer profile that fits it, and complete the approved product learning for it.',
            'Pilih fokus anda, tulis profil pelanggan yang sepadan, dan lengkapkan pembelajaran produk yang diluluskan untuknya.',
            'Pilih fokus Anda, tulis profil pelanggan yang cocok, dan selesaikan pembelajaran produk yang disetujui untuknya.'),
   evidence=t('Your chosen focus, your customer profile, and the learning you completed.',
              'Fokus pilihan anda, profil pelanggan anda, dan pembelajaran yang anda selesaikan.',
              'Fokus pilihan Anda, profil pelanggan Anda, dan pembelajaran yang Anda selesaikan.'),
   reflect=t('Who is this genuinely NOT for? Saying that clearly makes you more trusted, not less.',
             'Untuk siapa ini benar-benar TIDAK sesuai? Menyatakannya dengan jelas menjadikan anda lebih dipercayai, bukan kurang.',
             'Untuk siapa ini benar-benar TIDAK cocok? Menyatakannya dengan jelas membuat Anda lebih dipercaya, bukan kurang.')),

 dict(d=5, title=t('Build Your First Lead Pipeline', 'Bina Pipeline Lead Pertama', 'Bangun Pipeline Lead Pertama'),
   objective=t('Turn names into real records with a next action.',
               'Tukar nama menjadi rekod sebenar dengan tindakan seterusnya.',
               'Ubah nama menjadi catatan nyata dengan tindakan berikutnya.'),
   content=t('A useful lead is a real person you can ethically contact, who could plausibly want what you have. A name in your head is not a lead. A lead with no next action is a lead you have already started losing.',
             'Lead yang berguna ialah orang sebenar yang boleh anda hubungi secara beretika, yang munasabah mahukan apa yang anda ada. Nama dalam kepala bukan lead. Lead tanpa tindakan seterusnya ialah lead yang sudah mula anda hilang.',
             'Lead yang berguna adalah orang nyata yang bisa Anda hubungi secara etis, yang masuk akal menginginkan apa yang Anda punya. Nama di kepala bukan lead. Lead tanpa tindakan berikutnya adalah lead yang sudah mulai Anda kehilangan.'),
   action=t('Create real leads in Hero and give every active one a next action and a date.',
            'Cipta lead sebenar dalam Hero dan beri setiap yang aktif satu tindakan seterusnya dan tarikh.',
            'Buat lead nyata di Hero dan beri setiap yang aktif satu tindakan berikutnya dan tanggal.'),
   evidence=t('Your actual lead records in Hero — no screenshots needed.',
              'Rekod lead sebenar anda dalam Hero — tiada tangkapan skrin diperlukan.',
              'Catatan lead nyata Anda di Hero — tidak perlu tangkapan layar.'),
   reflect=t('Which lead are you avoiding, and what are you actually afraid of?',
             'Lead mana yang anda elak, dan apa sebenarnya yang anda takutkan?',
             'Lead mana yang Anda hindari, dan apa sebenarnya yang Anda takutkan?'),
   coach=t('Open the warrior\'s lead list. Verify the records are real people with contactable details, and check how many carry a next action date.',
           'Buka senarai lead warrior. Sahkan rekod itu orang sebenar dengan maklumat yang boleh dihubungi, dan semak berapa banyak yang ada tarikh tindakan.',
           'Buka daftar lead warrior. Pastikan catatannya orang nyata dengan detail yang bisa dihubungi, dan periksa berapa yang punya tanggal tindakan.'),
   proof=native('leads')),

 dict(d=6, title=t('Cold, Warm, Hot', 'Sejuk, Suam, Panas', 'Dingin, Hangat, Panas'),
   objective=t('Know which conversations deserve your next hour.',
               'Tahu perbualan mana yang layak untuk sejam anda yang seterusnya.',
               'Tahu percakapan mana yang layak mendapat jam Anda berikutnya.'),
   content=t('Not every lead deserves the same effort today. Classifying honestly — who is actually warm, who is genuinely cold — is how you stop spending your best energy on the wrong person.',
             'Bukan setiap lead layak usaha yang sama hari ini. Mengklasifikasi dengan jujur — siapa yang benar-benar suam, siapa yang memang sejuk — itulah cara anda berhenti membazir tenaga terbaik pada orang yang salah.',
             'Tidak semua lead layak usaha yang sama hari ini. Mengklasifikasi dengan jujur — siapa yang benar-benar hangat, siapa yang memang dingin — itulah cara Anda berhenti membuang energi terbaik pada orang yang salah.'),
   action=t('Classify every active lead in Hero and set the next action that matches its temperature.',
            'Klasifikasikan setiap lead aktif dalam Hero dan tetapkan tindakan seterusnya yang sepadan dengan suhunya.',
            'Klasifikasikan setiap lead aktif di Hero dan tetapkan tindakan berikutnya yang sesuai suhunya.'),
   evidence=t('Your updated classification in Hero.',
              'Klasifikasi anda yang dikemas kini dalam Hero.',
              'Klasifikasi Anda yang diperbarui di Hero.'),
   reflect=t('Which lead did you classify warmer than it really is, and why?',
             'Lead mana yang anda klasifikasi lebih suam daripada realiti, dan mengapa?',
             'Lead mana yang Anda klasifikasi lebih hangat dari kenyataannya, dan mengapa?')),

 dict(d=7, title=t('Prospecting Rhythm', 'Rentak Prospek', 'Ritme Prospek'),
   objective=t('Make outreach a rhythm, not a mood.',
               'Jadikan menghubungi orang satu rentak, bukan mood.',
               'Jadikan menjangkau orang sebuah ritme, bukan suasana hati.'),
   content=t('Consistency beats intensity. A warrior who speaks to a few new people every working day will out-build a warrior who does a burst once a week and then goes quiet.',
             'Konsisten mengalahkan intensiti. Warrior yang bercakap dengan beberapa orang baharu setiap hari bekerja akan membina lebih daripada warrior yang buat sekali gus seminggu kemudian senyap.',
             'Konsistensi mengalahkan intensitas. Warrior yang berbicara dengan beberapa orang baru setiap hari kerja akan membangun lebih dari warrior yang meledak sekali seminggu lalu diam.'),
   action=t('Do real outreach today and log every conversation in Hero as it happens.',
            'Lakukan hubungan sebenar hari ini dan rekod setiap perbualan dalam Hero sebaik ia berlaku.',
            'Lakukan penjangkauan nyata hari ini dan catat setiap percakapan di Hero saat terjadi.'),
   evidence=t('Your logged activities for today.',
              'Aktiviti anda yang direkod untuk hari ini.',
              'Aktivitas Anda yang tercatat untuk hari ini.'),
   reflect=t('What time of day did you actually do it, and can you protect that slot tomorrow?',
             'Pukul berapa anda benar-benar melakukannya, dan bolehkah anda lindungi waktu itu esok?',
             'Jam berapa Anda benar-benar melakukannya, dan bisakah Anda melindungi slot itu besok?'),
   proof=native('activities', 1)),

 dict(d=8, country=True, title=t('First Message & Hook', 'Mesej Pertama & Pemikat', 'Pesan Pertama & Pemikat'),
   objective=t('Open in a way a real person would answer.',
               'Buka perbualan dengan cara yang orang sebenar akan balas.',
               'Buka percakapan dengan cara yang akan dibalas orang sungguhan.'),
   content=t('The opener decides whether there is a conversation at all. It should sound like a person, be relevant to them, and make the next step small. High outreach with no replies is almost always an opener problem, not an effort problem.',
             'Ayat pembuka menentukan sama ada wujud perbualan langsung. Ia patut berbunyi seperti manusia, relevan kepada mereka, dan menjadikan langkah seterusnya kecil. Banyak menghubungi tanpa balasan hampir selalu masalah ayat pembuka, bukan masalah usaha.',
             'Kalimat pembuka menentukan ada atau tidaknya percakapan. Ia harus terdengar manusiawi, relevan bagi mereka, dan membuat langkah berikutnya kecil. Banyak menjangkau tanpa balasan hampir selalu masalah pembuka, bukan masalah usaha.'),
   action=t('Use an approved opener suited to the person and the channel, and log what you sent and what came back.',
            'Guna ayat pembuka yang diluluskan sesuai dengan orang dan salurannya, dan rekod apa yang anda hantar dan apa yang kembali.',
            'Gunakan pembuka yang disetujui sesuai orang dan salurannya, lalu catat apa yang Anda kirim dan apa balasannya.'),
   evidence=t('Your activity records, plus the opener you used.',
              'Rekod aktiviti anda, serta ayat pembuka yang anda guna.',
              'Catatan aktivitas Anda, serta pembuka yang Anda gunakan.'),
   reflect=t('Which opener got a reply, and what was different about it?',
             'Ayat pembuka mana yang dapat balasan, dan apa yang berbeza mengenainya?',
             'Pembuka mana yang mendapat balasan, dan apa bedanya?')),

 dict(d=9, title=t('Needs Discovery', 'Menggali Keperluan', 'Menggali Kebutuhan'),
   objective=t('Find out what they actually need before you recommend anything.',
               'Ketahui apa yang mereka benar-benar perlukan sebelum anda mengesyorkan apa-apa.',
               'Cari tahu apa yang benar-benar mereka butuhkan sebelum Anda merekomendasikan apa pun.'),
   content=t('Most pipeline stalls because nobody asked. Need, timing and constraint are the three things that decide whether this is real. Ask them properly, record the answers, and you will never guess again.',
             'Kebanyakan pipeline tersekat kerana tiada siapa bertanya. Keperluan, masa dan kekangan ialah tiga perkara yang menentukan sama ada ini benar. Tanya dengan betul, rekod jawapannya, dan anda tidak perlu meneka lagi.',
             'Kebanyakan pipeline macet karena tidak ada yang bertanya. Kebutuhan, waktu dan kendala adalah tiga hal yang menentukan apakah ini nyata. Tanyakan dengan benar, catat jawabannya, dan Anda tidak akan menebak lagi.'),
   action=t('Run a real discovery conversation and record the need, the timing and the constraint in the lead.',
            'Jalankan perbualan penggalian sebenar dan rekod keperluan, masa dan kekangan dalam lead itu.',
            'Lakukan percakapan penggalian nyata dan catat kebutuhan, waktu dan kendala di lead tersebut.'),
   evidence=t('The lead record showing what you learned.',
              'Rekod lead yang menunjukkan apa yang anda pelajari.',
              'Catatan lead yang menunjukkan apa yang Anda pelajari.'),
   reflect=t('What did you assume that turned out to be wrong?',
             'Apa yang anda andaikan tetapi rupanya salah?',
             'Apa yang Anda asumsikan tetapi ternyata salah?'),
   instructions=t('Collect only what the customer is willing to share and what you genuinely need. Do not record anything sensitive you were not given freely.',
                  'Kumpul hanya apa yang pelanggan sudi kongsi dan apa yang anda benar-benar perlukan. Jangan rekod apa-apa yang sensitif yang tidak diberi secara rela.',
                  'Kumpulkan hanya yang pelanggan bersedia bagikan dan yang benar-benar Anda butuhkan. Jangan catat hal sensitif yang tidak diberikan secara sukarela.'),
   coach=t('Verify the need, timing and constraint are recorded on the lead itself — not summarised only in the submission text.',
           'Sahkan keperluan, masa dan kekangan direkod pada lead itu sendiri — bukan diringkaskan dalam teks penghantaran sahaja.',
           'Pastikan kebutuhan, waktu dan kendala tercatat di lead itu sendiri — bukan hanya diringkas di teks pengiriman.')),

 dict(d=10, title=t('Building Trust', 'Membina Kepercayaan', 'Membangun Kepercayaan'),
   objective=t('Be useful before you are needed.',
               'Jadi berguna sebelum anda diperlukan.',
               'Jadilah berguna sebelum Anda dibutuhkan.'),
   content=t('Trust is built by doing what you said you would do, on the day you said it. A follow-up that adds something useful is worth ten that just check in.',
             'Kepercayaan dibina dengan melakukan apa yang anda kata anda akan buat, pada hari anda kata. Satu susulan yang menambah sesuatu yang berguna bernilai sepuluh yang sekadar bertanya khabar.',
             'Kepercayaan dibangun dengan melakukan apa yang Anda katakan, pada hari yang Anda katakan. Satu follow-up yang menambah sesuatu yang berguna setara sepuluh yang sekadar menyapa.'),
   action=t('Deliver one genuinely useful follow-up to someone who is waiting on you.',
            'Sampaikan satu susulan yang benar-benar berguna kepada seseorang yang menunggu anda.',
            'Berikan satu follow-up yang benar-benar berguna kepada seseorang yang menunggu Anda.'),
   evidence=t('The logged follow-up, plus a short note on what made it useful.',
              'Susulan yang direkod, serta nota ringkas apa yang menjadikannya berguna.',
              'Follow-up yang tercatat, serta catatan singkat apa yang membuatnya berguna.'),
   reflect=t('Did you promise anything you have not yet delivered?',
             'Adakah anda janji apa-apa yang belum anda tunaikan?',
             'Apakah Anda menjanjikan sesuatu yang belum Anda tunaikan?'),
   proof=native('activities', 2)),

 dict(d=11, title=t('Follow-Up Discipline', 'Disiplin Susulan', 'Disiplin Follow-Up'),
   objective=t('Clear what is due, today.',
               'Selesaikan apa yang perlu, hari ini.',
               'Selesaikan yang jatuh tempo, hari ini.'),
   content=t('An overdue follow-up is a promise you broke quietly. Clearing your due list usually moves the pipeline more than finding new leads does — the work is already half done.',
             'Susulan yang tertunggak ialah janji yang anda mungkiri secara senyap. Membersihkan senarai yang perlu selalunya menggerakkan pipeline lebih daripada mencari lead baharu — kerjanya sudah separuh siap.',
             'Follow-up yang terlambat adalah janji yang Anda ingkari diam-diam. Menyelesaikan daftar yang jatuh tempo biasanya menggerakkan pipeline lebih dari mencari lead baru — pekerjaannya sudah setengah jalan.'),
   action=t('Clear every follow-up that is due, and set the next action on each one before you close it.',
            'Selesaikan setiap susulan yang perlu, dan tetapkan tindakan seterusnya pada setiap satu sebelum anda tutup.',
            'Selesaikan setiap follow-up yang jatuh tempo, dan tetapkan tindakan berikutnya sebelum Anda tutup.'),
   evidence=t('Your cleared follow-ups in Hero.',
              'Susulan anda yang telah diselesaikan dalam Hero.',
              'Follow-up Anda yang selesai di Hero.'),
   reflect=t('How many were overdue, and what caused the backlog?',
             'Berapa banyak yang tertunggak, dan apa punca timbunan itu?',
             'Berapa yang terlambat, dan apa penyebab tumpukannya?'),
   coach=t('Check the overdue count before and after. Verify each cleared lead now carries a new next action date.',
           'Semak jumlah tertunggak sebelum dan selepas. Sahkan setiap lead yang diselesaikan kini ada tarikh tindakan baharu.',
           'Periksa jumlah terlambat sebelum dan sesudah. Pastikan setiap lead yang selesai kini punya tanggal tindakan baru.'),
   proof=native('activities', 1)),

 dict(d=12, title=t('Appointment Setting', 'Menetapkan Temujanji', 'Mengatur Janji Temu'),
   objective=t('Turn a good conversation into a real next step.',
               'Tukar perbualan yang baik kepada langkah seterusnya yang nyata.',
               'Ubah percakapan yang baik menjadi langkah berikutnya yang nyata.'),
   content=t('Qualified conversations with no appointment are the single most common place a new warrior stalls. The ask should be specific, easy and dated — a vague “let me know” is not a next step.',
             'Perbualan layak tanpa temujanji ialah tempat paling kerap warrior baharu tersekat. Permintaan itu patut spesifik, mudah dan bertarikh — “beritahu saya nanti” bukan langkah seterusnya.',
             'Percakapan qualified tanpa janji temu adalah titik paling umum warrior baru macet. Permintaannya harus spesifik, mudah dan bertanggal — “kabari saya nanti” bukan langkah berikutnya.'),
   action=t('Move a genuinely engaged opportunity to a clear, dated next step and create the appointment in Hero.',
            'Gerakkan peluang yang benar-benar melayan kepada langkah seterusnya yang jelas dan bertarikh, dan cipta temujanji dalam Hero.',
            'Pindahkan peluang yang benar-benar terlibat ke langkah berikutnya yang jelas dan bertanggal, lalu buat janji temu di Hero.'),
   evidence=t('The appointment record in Hero.',
              'Rekod temujanji dalam Hero.',
              'Catatan janji temu di Hero.'),
   reflect=t('What made them say yes — or what made them hesitate?',
             'Apa yang buat mereka setuju — atau apa yang buat mereka teragak-agak?',
             'Apa yang membuat mereka setuju — atau apa yang membuat mereka ragu?'),
   instructions=t('If you genuinely have no live opportunity ready, tell your Coach and run the approved practice instead. Never invent a customer.',
                  'Jika anda benar-benar tiada peluang hidup yang bersedia, beritahu Coach anda dan jalankan latihan yang diluluskan. Jangan sesekali reka pelanggan.',
                  'Jika Anda benar-benar tidak punya peluang hidup yang siap, beri tahu Coach Anda dan jalankan latihan yang disetujui. Jangan pernah mengarang pelanggan.'),
   coach=t('Verify the appointment is a real record with a date. If practice was used instead, confirm you agreed to it beforehand.',
           'Sahkan temujanji itu rekod sebenar dengan tarikh. Jika latihan diguna, sahkan anda bersetuju terlebih dahulu.',
           'Pastikan janji temu adalah catatan nyata dengan tanggal. Jika latihan yang dipakai, konfirmasi Anda menyetujuinya lebih dulu.'),
   proof=native('appointments')),

 dict(d=13, country=True, title=t('Project & Product Mastery', 'Menguasai Projek & Produk', 'Menguasai Proyek & Produk'),
   objective=t('Go deeper on the focus you already chose.',
               'Pergi lebih dalam pada fokus yang anda sudah pilih.',
               'Perdalam fokus yang sudah Anda pilih.'),
   content=t('This is depth, not first exposure. By now you have had real conversations — you know which questions you could not answer well. This day is for closing those gaps on your chosen focus.',
             'Ini kedalaman, bukan pendedahan pertama. Sekarang anda sudah ada perbualan sebenar — anda tahu soalan mana yang anda tidak dapat jawab dengan baik. Hari ini untuk menutup jurang itu pada fokus pilihan anda.',
             'Ini kedalaman, bukan perkenalan awal. Sekarang Anda sudah punya percakapan nyata — Anda tahu pertanyaan mana yang belum bisa Anda jawab baik. Hari ini untuk menutup celah itu pada fokus pilihan Anda.'),
   action=t('Complete the approved mastery task for your focus and write the three questions you can now answer that you could not last week.',
            'Lengkapkan tugasan penguasaan yang diluluskan untuk fokus anda dan tulis tiga soalan yang kini anda boleh jawab tetapi tidak boleh minggu lepas.',
            'Selesaikan tugas penguasaan yang disetujui untuk fokus Anda dan tulis tiga pertanyaan yang kini bisa Anda jawab tetapi tidak minggu lalu.'),
   evidence=t('Your completed knowledge check or approved summary.',
              'Semakan pengetahuan anda yang lengkap atau ringkasan yang diluluskan.',
              'Pemeriksaan pengetahuan Anda yang selesai atau ringkasan yang disetujui.'),
   reflect=t('What question do you still hope nobody asks you?',
             'Soalan apa yang anda masih harap tiada siapa tanya?',
             'Pertanyaan apa yang masih Anda harap tidak ada yang menanyakan?')),

 dict(d=14, title=t('Value Proposition', 'Cadangan Nilai', 'Proposisi Nilai'),
   objective=t('Connect what they need to what you actually have.',
               'Hubungkan apa yang mereka perlukan dengan apa yang anda benar-benar ada.',
               'Hubungkan apa yang mereka butuhkan dengan apa yang benar-benar Anda punya.'),
   content=t('A value proposition is not a feature list. It is one sentence that names their situation, what changes for them, and why you are a credible person to help. If it could be said to anyone, it is not one.',
             'Cadangan nilai bukan senarai ciri. Ia satu ayat yang menamakan keadaan mereka, apa yang berubah untuk mereka, dan mengapa anda orang yang boleh dipercayai untuk membantu. Jika ia boleh dikatakan kepada sesiapa, ia bukan cadangan nilai.',
             'Proposisi nilai bukan daftar fitur. Ia satu kalimat yang menyebut situasi mereka, apa yang berubah bagi mereka, dan mengapa Anda kredibel untuk membantu. Jika bisa dikatakan ke siapa saja, itu bukan proposisi nilai.'),
   action=t('Write the value statement for one specific real opportunity in your pipeline.',
            'Tulis pernyataan nilai untuk satu peluang sebenar yang spesifik dalam pipeline anda.',
            'Tulis pernyataan nilai untuk satu peluang nyata spesifik dalam pipeline Anda.'),
   evidence=t('Your value statement, naming the actual person and their situation.',
              'Pernyataan nilai anda, menamakan orang sebenar dan keadaan mereka.',
              'Pernyataan nilai Anda, menyebut orang nyata dan situasinya.'),
   reflect=t('Would that sentence still be true if they asked you to prove it?',
             'Adakah ayat itu masih benar jika mereka minta anda buktikan?',
             'Apakah kalimat itu tetap benar jika mereka meminta Anda membuktikannya?'),
   coach=t('Verify the statement names a real opportunity and makes no claim the warrior cannot support.',
           'Sahkan pernyataan itu menamakan peluang sebenar dan tidak membuat dakwaan yang warrior tidak boleh sokong.',
           'Pastikan pernyataan menyebut peluang nyata dan tidak membuat klaim yang tak bisa didukung warrior.')),

 dict(d=15, title=t('Presentation Structure', 'Struktur Persembahan', 'Struktur Presentasi'),
   objective=t('Have a shape to follow when you are nervous.',
               'Ada bentuk untuk diikuti bila anda gementar.',
               'Punya kerangka untuk diikuti saat Anda gugup.'),
   content=t('Opening, discovery, recommendation, next action. That order matters: recommending before discovering is the fastest way to lose someone who was ready to listen.',
             'Pembukaan, penggalian, syor, tindakan seterusnya. Susunan itu penting: mengesyorkan sebelum menggali ialah cara terpantas kehilangan orang yang sudah sedia mendengar.',
             'Pembukaan, penggalian, rekomendasi, tindakan berikutnya. Urutannya penting: merekomendasikan sebelum menggali adalah cara tercepat kehilangan orang yang sudah siap mendengar.'),
   action=t('Write your outline for the next real presentation you will give, following the four steps.',
            'Tulis rangka anda untuk persembahan sebenar seterusnya, mengikut empat langkah itu.',
            'Tulis kerangka Anda untuk presentasi nyata berikutnya, mengikuti empat langkah itu.'),
   evidence=t('Your outline, or your Coach\'s observation of your practice run.',
              'Rangka anda, atau pemerhatian Coach terhadap latihan anda.',
              'Kerangka Anda, atau observasi Coach atas latihan Anda.'),
   reflect=t('Which of the four steps do you naturally skip?',
             'Antara empat langkah itu, yang mana anda selalu langkau?',
             'Dari empat langkah itu, mana yang biasanya Anda lewati?')),

 dict(d=16, country=True, title=t('The Customer Process Here', 'Proses Pelanggan Di Sini', 'Proses Pelanggan Di Sini'),
   objective=t('Know the process your customer will actually go through.',
               'Ketahui proses yang pelanggan anda benar-benar akan lalui.',
               'Ketahui proses yang benar-benar akan dilalui pelanggan Anda.'),
   content=t('A customer decides with more confidence when the person in front of them can explain what happens next, in order, without guessing. This day is country-specific by nature — the professional and customer process is not the same in Malaysia and Indonesia.',
             'Pelanggan membuat keputusan dengan lebih yakin bila orang di hadapan mereka boleh terangkan apa yang berlaku seterusnya, mengikut turutan, tanpa meneka. Hari ini bersifat khusus negara — proses profesional dan pelanggan tidak sama di Malaysia dan Indonesia.',
             'Pelanggan memutuskan dengan lebih yakin ketika orang di depannya bisa menjelaskan apa yang terjadi berikutnya, berurutan, tanpa menebak. Hari ini bersifat spesifik negara — proses profesional dan pelanggan tidak sama di Malaysia dan Indonesia.'),
   action=t('Learn the approved process for your country and be able to walk a customer through it in order.',
            'Pelajari proses yang diluluskan untuk negara anda dan mampu bawa pelanggan melaluinya mengikut turutan.',
            'Pelajari proses yang disetujui untuk negara Anda dan mampu memandu pelanggan melewatinya secara berurutan.'),
   evidence=t('Your walkthrough of the process in your own words.',
              'Penerangan anda tentang proses itu dengan kata-kata sendiri.',
              'Penjelasan Anda tentang proses itu dengan kata-kata sendiri.'),
   reflect=t('Which step would you struggle to explain to a nervous first-time buyer?',
             'Langkah mana yang anda akan sukar terangkan kepada pembeli kali pertama yang gementar?',
             'Langkah mana yang sulit Anda jelaskan ke pembeli pertama kali yang gugup?')),

 dict(d=17, title=t('Viewing & Presentation Preparation', 'Persediaan Viewing & Persembahan', 'Persiapan Viewing & Presentasi'),
   objective=t('Walk in prepared, not hopeful.',
               'Masuk dengan bersedia, bukan sekadar berharap.',
               'Masuk dengan siap, bukan sekadar berharap.'),
   content=t('Preparation is what separates a professional from an enthusiast. Know who is coming, what they said they need, what you will show, what they will likely ask, and what the next step will be.',
             'Persediaan itulah yang membezakan profesional daripada peminat. Tahu siapa yang datang, apa yang mereka kata mereka perlukan, apa yang anda akan tunjuk, apa yang mereka mungkin tanya, dan apa langkah seterusnya.',
             'Persiapan itulah yang membedakan profesional dari penggemar. Tahu siapa yang datang, apa yang mereka butuhkan, apa yang akan Anda tunjukkan, apa yang mungkin ditanyakan, dan apa langkah berikutnya.'),
   action=t('Prepare your next real viewing or presentation and record the plan on the appointment.',
            'Sediakan viewing atau persembahan sebenar anda yang seterusnya dan rekod pelannya pada temujanji.',
            'Siapkan viewing atau presentasi nyata Anda berikutnya dan catat rencananya di janji temu.'),
   evidence=t('Your preparation notes on the appointment record.',
              'Nota persediaan anda pada rekod temujanji.',
              'Catatan persiapan Anda di catatan janji temu.'),
   reflect=t('What is the one question you hope they do not ask, and what is your honest answer?',
             'Apa satu soalan yang anda harap mereka tidak tanya, dan apa jawapan jujur anda?',
             'Apa satu pertanyaan yang Anda harap tidak ditanyakan, dan apa jawaban jujur Anda?'),
   proof=native('appointments')),

 dict(d=18, title=t('Conduct the Viewing', 'Jalankan Viewing', 'Jalankan Viewing'),
   objective=t('Do it, and capture what actually happened.',
               'Lakukan, dan tangkap apa yang benar-benar berlaku.',
               'Lakukan, dan tangkap apa yang benar-benar terjadi.'),
   content=t('The viewing itself is the easy part to remember and the easy part to forget to record. What they reacted to, what they ignored, and what they asked twice — that is the information that decides your next move.',
             'Viewing itu sendiri mudah diingat dan mudah terlupa untuk direkod. Apa yang mereka beri reaksi, apa yang mereka abaikan, dan apa yang mereka tanya dua kali — itulah maklumat yang menentukan langkah anda seterusnya.',
             'Viewing itu sendiri mudah diingat dan mudah terlupa dicatat. Apa yang mereka respons, apa yang mereka abaikan, dan apa yang mereka tanya dua kali — itulah informasi yang menentukan langkah Anda berikutnya.'),
   action=t('Conduct the viewing or presentation and complete the record with the outcome.',
            'Jalankan viewing atau persembahan dan lengkapkan rekod dengan hasilnya.',
            'Jalankan viewing atau presentasi dan lengkapi catatan dengan hasilnya.'),
   evidence=t('The completed appointment record in Hero.',
              'Rekod temujanji yang lengkap dalam Hero.',
              'Catatan janji temu yang lengkap di Hero.'),
   reflect=t('What surprised you?', 'Apa yang mengejutkan anda?', 'Apa yang mengejutkan Anda?'),
   proof=native('appointments')),

 dict(d=19, title=t('Post-Viewing Follow-Up', 'Susulan Selepas Viewing', 'Follow-Up Setelah Viewing'),
   objective=t('Never let a viewing end without a next step.',
               'Jangan biarkan viewing tamat tanpa langkah seterusnya.',
               'Jangan biarkan viewing berakhir tanpa langkah berikutnya.'),
   content=t('A completed viewing with no follow-up is the most expensive gap in the pipeline — the effort is spent and the momentum is thrown away. Follow up while they still remember how it felt.',
             'Viewing yang selesai tanpa susulan ialah jurang paling mahal dalam pipeline — usaha sudah dibelanjakan dan momentum dibuang. Buat susulan semasa mereka masih ingat perasaannya.',
             'Viewing yang selesai tanpa follow-up adalah celah termahal dalam pipeline — usahanya sudah habis dan momentumnya dibuang. Follow up selagi mereka masih ingat rasanya.'),
   action=t('Follow up on every completed viewing and record their questions, objections, next action and updated stage.',
            'Buat susulan bagi setiap viewing yang selesai dan rekod soalan, bantahan, tindakan seterusnya dan peringkat yang dikemas kini.',
            'Follow up setiap viewing yang selesai dan catat pertanyaan, keberatan, tindakan berikutnya dan tahap yang diperbarui.'),
   evidence=t('The follow-up activity and the updated lead.',
              'Aktiviti susulan dan lead yang dikemas kini.',
              'Aktivitas follow-up dan lead yang diperbarui.'),
   reflect=t('What did they say that you were not expecting?',
             'Apa yang mereka kata yang anda tidak jangka?',
             'Apa yang mereka katakan yang tidak Anda duga?'),
   coach=t('Check whether any completed viewing still has no follow-up logged after it. That gap is the point of this day.',
           'Semak sama ada ada viewing selesai yang masih tiada susulan direkod selepasnya. Jurang itulah maksud hari ini.',
           'Periksa apakah ada viewing selesai yang masih belum ada follow-up setelahnya. Celah itulah inti hari ini.'),
   proof=native('activities', 3)),

 dict(d=20, title=t('Objection Handling', 'Mengendali Bantahan', 'Menangani Keberatan'),
   objective=t('Diagnose the objection before you answer it.',
               'Kenal pasti bantahan sebelum anda menjawabnya.',
               'Diagnosis keberatan sebelum Anda menjawabnya.'),
   content=t('“Too expensive” is rarely about price. Most objections are really about timing, trust, fit or someone else who has to agree. Answering the wrong one politely still loses the sale.',
             '“Terlalu mahal” jarang tentang harga. Kebanyakan bantahan sebenarnya tentang masa, kepercayaan, kesesuaian atau orang lain yang perlu bersetuju. Menjawab yang salah dengan sopan tetap kehilangan jualan.',
             '“Terlalu mahal” jarang soal harga. Kebanyakan keberatan sebenarnya soal waktu, kepercayaan, kecocokan atau orang lain yang harus setuju. Menjawab yang salah dengan sopan tetap kehilangan penjualan.'),
   action=t('Take a real objection you have received, name its type, and write your response plan.',
            'Ambil satu bantahan sebenar yang anda terima, namakan jenisnya, dan tulis pelan jawapan anda.',
            'Ambil satu keberatan nyata yang Anda terima, sebutkan jenisnya, dan tulis rencana jawaban Anda.'),
   evidence=t('The objection, its type, and your plan.',
              'Bantahan itu, jenisnya, dan pelan anda.',
              'Keberatan itu, jenisnya, dan rencana Anda.'),
   reflect=t('Which objection makes you defensive, and why?',
             'Bantahan mana yang buat anda defensif, dan mengapa?',
             'Keberatan mana yang membuat Anda defensif, dan mengapa?')),

 dict(d=21, country=True, title=t('Negotiation & Decision Support', 'Rundingan & Sokongan Keputusan', 'Negosiasi & Dukungan Keputusan'),
   objective=t('Help someone decide well, without pressure.',
               'Bantu seseorang membuat keputusan yang baik, tanpa tekanan.',
               'Bantu seseorang memutuskan dengan baik, tanpa tekanan.'),
   content=t('Responsible support means being clear about what is fixed, what is possible and what is not yours to promise. Never commit on behalf of anyone who has not agreed, and never state a term you have not been authorised to state.',
             'Sokongan yang bertanggungjawab bermaksud jelas tentang apa yang tetap, apa yang mungkin dan apa yang bukan hak anda untuk janjikan. Jangan sesekali berjanji bagi pihak sesiapa yang belum bersetuju, dan jangan nyatakan terma yang anda tidak diberi kuasa untuk nyatakan.',
             'Dukungan yang bertanggung jawab berarti jelas tentang apa yang tetap, apa yang mungkin dan apa yang bukan hak Anda untuk janjikan. Jangan pernah berkomitmen atas nama siapa pun yang belum setuju, dan jangan menyatakan syarat yang tidak Anda punya wewenang untuk sebutkan.'),
   action=t('Support one real negotiation and record what was agreed, what is still open, and the next action with a date.',
            'Sokong satu rundingan sebenar dan rekod apa yang dipersetujui, apa yang masih terbuka, dan tindakan seterusnya dengan tarikh.',
            'Dukung satu negosiasi nyata dan catat apa yang disepakati, apa yang masih terbuka, dan tindakan berikutnya dengan tanggal.'),
   evidence=t('The negotiation activity and the updated lead.',
              'Aktiviti rundingan dan lead yang dikemas kini.',
              'Aktivitas negosiasi dan lead yang diperbarui.'),
   reflect=t('Did you feel pressure to promise something? What did you do with it?',
             'Adakah anda rasa tertekan untuk janjikan sesuatu? Apa yang anda buat dengannya?',
             'Apakah Anda merasa tertekan untuk menjanjikan sesuatu? Apa yang Anda lakukan?')),

 dict(d=22, country=True, title=t('Closing Readiness', 'Kesediaan Closing', 'Kesiapan Closing'),
   objective=t('Know exactly what is missing on your strongest opportunity.',
               'Tahu dengan tepat apa yang kurang pada peluang terkuat anda.',
               'Tahu persis apa yang kurang pada peluang terkuat Anda.'),
   content=t('Most closings do not fail — they stall, because nobody wrote down which item is missing, who owns it and by when. An audit turns a vague hope into a list you can work.',
             'Kebanyakan closing tidak gagal — ia tergantung, kerana tiada siapa tulis item mana yang kurang, siapa pemiliknya dan bila. Audit menukar harapan kabur kepada senarai yang boleh anda kerjakan.',
             'Kebanyakan closing tidak gagal — ia macet, karena tidak ada yang menuliskan item mana yang kurang, siapa pemiliknya dan kapan. Audit mengubah harapan kabur menjadi daftar yang bisa Anda kerjakan.'),
   action=t('Audit your strongest genuine opportunity: what is ready, what is missing, who owns each missing item, by when.',
            'Audit peluang tulen terkuat anda: apa yang sedia, apa yang kurang, siapa pemilik setiap item yang kurang, sampai bila.',
            'Audit peluang tulen terkuat Anda: apa yang siap, apa yang kurang, siapa pemilik tiap item yang kurang, sampai kapan.'),
   evidence=t('Your readiness audit with owners and dates.',
              'Audit kesediaan anda dengan pemilik dan tarikh.',
              'Audit kesiapan Anda dengan pemilik dan tanggal.'),
   reflect=t('What has been missing the longest, and why has nobody chased it?',
             'Apa yang paling lama tiada, dan mengapa tiada siapa mengejarnya?',
             'Apa yang paling lama hilang, dan mengapa tidak ada yang mengejarnya?'),
   coach=t('Verify every missing item has a named owner and a date. An audit without owners is a wish list.',
           'Sahkan setiap item yang kurang ada pemilik bernama dan tarikh. Audit tanpa pemilik ialah senarai hajat.',
           'Pastikan setiap item yang kurang punya pemilik bernama dan tanggal. Audit tanpa pemilik adalah daftar harapan.')),

 dict(d=23, title=t('Closing Is Helping', 'Closing Itu Membantu', 'Closing Adalah Membantu'),
   objective=t('Check that this is genuinely right for them.',
               'Semak bahawa ini benar-benar sesuai untuk mereka.',
               'Periksa bahwa ini benar-benar tepat untuk mereka.'),
   content=t('If it is not right for them, saying so is the closing. Trust is the currency of AG, and it is spent permanently the first time someone feels pushed into something that did not suit them.',
             'Jika ia tidak sesuai untuk mereka, mengatakannya itulah closing. Kepercayaan ialah mata wang AG, dan ia habis selamanya pada kali pertama seseorang rasa dipaksa ke dalam sesuatu yang tidak sesuai.',
             'Jika tidak tepat untuk mereka, mengatakannya itulah closing. Kepercayaan adalah mata uang AG, dan habis selamanya saat pertama kali seseorang merasa didorong ke sesuatu yang tidak cocok.'),
   action=t('Review your strongest opportunity purely from the customer\'s side and write the honest value statement.',
            'Semak peluang terkuat anda semata-mata dari sudut pelanggan dan tulis pernyataan nilai yang jujur.',
            'Tinjau peluang terkuat Anda murni dari sisi pelanggan dan tulis pernyataan nilai yang jujur.'),
   evidence=t('Your customer-value statement and reflection.',
              'Pernyataan nilai pelanggan dan refleksi anda.',
              'Pernyataan nilai pelanggan dan refleksi Anda.'),
   reflect=t('If they were your family, would you still recommend this?',
             'Jika mereka keluarga anda, adakah anda masih akan mengesyorkannya?',
             'Jika mereka keluarga Anda, apakah Anda tetap merekomendasikannya?')),

 dict(d=24, country=True, title=t('Documentation & Approved Process', 'Dokumentasi & Proses Diluluskan', 'Dokumentasi & Proses Disetujui'),
   objective=t('Get the paperwork right, in the right order.',
               'Betulkan dokumen, mengikut turutan yang betul.',
               'Selesaikan dokumen dengan benar, dalam urutan yang tepat.'),
   content=t('Documentation is where goodwill turns into a completed transaction — or where it quietly dies. Follow the approved process for your country exactly; never improvise a document or a step.',
             'Dokumentasi ialah tempat niat baik bertukar menjadi transaksi yang selesai — atau tempat ia mati senyap. Ikut proses yang diluluskan untuk negara anda dengan tepat; jangan sesekali reka dokumen atau langkah.',
             'Dokumentasi adalah tempat itikad baik berubah menjadi transaksi selesai — atau tempat ia mati diam-diam. Ikuti proses yang disetujui untuk negara Anda dengan tepat; jangan pernah mengarang dokumen atau langkah.'),
   action=t('Work through the approved documentation checklist for your country on a real or approved practice case.',
            'Kerjakan senarai semak dokumentasi yang diluluskan untuk negara anda pada kes sebenar atau latihan yang diluluskan.',
            'Kerjakan daftar periksa dokumentasi yang disetujui untuk negara Anda pada kasus nyata atau latihan yang disetujui.'),
   evidence=t('Your completed checklist and the current status in Hero.',
              'Senarai semak lengkap anda dan status semasa dalam Hero.',
              'Daftar periksa lengkap Anda dan status terkini di Hero.'),
   reflect=t('Which document do you least understand the purpose of?',
             'Dokumen mana yang anda paling kurang faham tujuannya?',
             'Dokumen mana yang paling tidak Anda pahami tujuannya?')),

 dict(d=25, title=t('Pipeline Rescue', 'Penyelamatan Pipeline', 'Penyelamatan Pipeline'),
   objective=t('Deal with everything that went quiet.',
               'Uruskan semua yang telah menjadi sepi.',
               'Tangani semua yang menjadi sepi.'),
   content=t('Every pipeline accumulates silence. Hero will show you exactly where: overdue follow-ups, leads with no next action, stagnant leads, viewings with no follow-up, qualified people with no appointment. You decide what each one deserves.',
             'Setiap pipeline mengumpul kesenyapan. Hero akan tunjuk anda tepat di mana: susulan tertunggak, lead tanpa tindakan seterusnya, lead yang beku, viewing tanpa susulan, orang layak tanpa temujanji. Anda tentukan apa yang setiap satu layak dapat.',
             'Setiap pipeline mengumpulkan keheningan. Hero akan menunjukkan persis di mana: follow-up terlambat, lead tanpa tindakan berikutnya, lead yang mandek, viewing tanpa follow-up, orang qualified tanpa janji temu. Anda putuskan apa yang layak untuk masing-masing.'),
   action=t('Work through every flagged lead and decide: follow up, nurture, requalify, or disqualify responsibly.',
            'Kerjakan setiap lead yang ditanda dan putuskan: susul, pelihara, layak semula, atau lepaskan secara bertanggungjawab.',
            'Kerjakan setiap lead yang ditandai dan putuskan: follow up, pelihara, kualifikasi ulang, atau lepaskan secara bertanggung jawab.'),
   evidence=t('Your decisions recorded on each lead.',
              'Keputusan anda direkod pada setiap lead.',
              'Keputusan Anda tercatat di setiap lead.'),
   reflect=t('Which lead did you hold on to for your sake rather than theirs?',
             'Lead mana yang anda pegang untuk kepentingan anda dan bukan mereka?',
             'Lead mana yang Anda pertahankan demi Anda, bukan demi mereka?'),
   instructions=t('Hero may suggest what looks stuck. The decision about a real customer is always yours.',
                  'Hero mungkin cadangkan apa yang kelihatan tersekat. Keputusan tentang pelanggan sebenar sentiasa milik anda.',
                  'Hero mungkin menyarankan apa yang tampak macet. Keputusan tentang pelanggan nyata selalu milik Anda.'),
   proof=native('activities', 1)),

 dict(d=26, title=t('Personal Closing Plan', 'Pelan Closing Peribadi', 'Rencana Closing Pribadi'),
   objective=t('Turn your best opportunities into a dated plan.',
               'Tukar peluang terbaik anda kepada pelan bertarikh.',
               'Ubah peluang terbaik Anda menjadi rencana bertanggal.'),
   content=t('A plan is not a list of hopes. Each line names the opportunity, the action, who owns it, what it depends on, and when it is due. Anything without a date is not in the plan.',
             'Pelan bukan senarai harapan. Setiap baris menamakan peluang, tindakan, siapa pemiliknya, apa yang ia bergantung padanya, dan bila tarikh akhirnya. Apa-apa tanpa tarikh bukan sebahagian pelan.',
             'Rencana bukan daftar harapan. Setiap baris menyebut peluang, tindakan, siapa pemiliknya, apa ketergantungannya, dan kapan tenggatnya. Apa pun tanpa tanggal bukan bagian rencana.'),
   action=t('Write your closing plan for your strongest real opportunities and share it with your Coach.',
            'Tulis pelan closing anda untuk peluang sebenar terkuat dan kongsi dengan Coach anda.',
            'Tulis rencana closing Anda untuk peluang nyata terkuat dan bagikan ke Coach Anda.'),
   evidence=t('Your plan: opportunity, action, owner, dependency, due date.',
              'Pelan anda: peluang, tindakan, pemilik, kebergantungan, tarikh akhir.',
              'Rencana Anda: peluang, tindakan, pemilik, ketergantungan, tenggat.'),
   reflect=t('Which line are you least confident about, and what would make it solid?',
             'Baris mana yang anda paling kurang yakin, dan apa yang akan menjadikannya kukuh?',
             'Baris mana yang paling tidak Anda yakini, dan apa yang membuatnya kokoh?'),
   coach=t('Verify every line has an owner and a date, and that the opportunities named exist in the pipeline.',
           'Sahkan setiap baris ada pemilik dan tarikh, dan peluang yang dinamakan wujud dalam pipeline.',
           'Pastikan setiap baris punya pemilik dan tanggal, dan peluang yang disebut ada di pipeline.')),

 dict(d=27, title=t('Structured Coach Review', 'Semakan Coach Berstruktur', 'Tinjauan Coach Terstruktur'),
   objective=t('Sit down with your Coach and look at the real picture.',
               'Duduk dengan Coach anda dan lihat gambaran sebenar.',
               'Duduk bersama Coach Anda dan lihat gambaran nyatanya.'),
   content=t('Hero generates the summary before you meet: your activity, your consistency, your funnel, your current bottleneck. That means the conversation can be about what to do, not about what happened.',
             'Hero menjana ringkasan sebelum anda berjumpa: aktiviti anda, konsistensi anda, funnel anda, halangan semasa anda. Maknanya perbualan boleh tentang apa yang perlu dibuat, bukan tentang apa yang telah berlaku.',
             'Hero membuat ringkasan sebelum Anda bertemu: aktivitas Anda, konsistensi Anda, funnel Anda, hambatan Anda saat ini. Artinya percakapan bisa fokus pada apa yang harus dilakukan, bukan apa yang sudah terjadi.'),
   action=t('Attend your structured review and record the agreed next actions with dates.',
            'Hadiri semakan berstruktur anda dan rekod tindakan seterusnya yang dipersetujui dengan tarikh.',
            'Hadiri tinjauan terstruktur Anda dan catat tindakan berikutnya yang disepakati dengan tanggal.'),
   evidence=t('The coaching report and your acknowledgement of it.',
              'Laporan coaching dan pengakuan anda terhadapnya.',
              'Laporan coaching dan pengakuan Anda atasnya.'),
   reflect=t('What did your Coach see that you had not?',
             'Apa yang Coach anda nampak yang anda tidak nampak?',
             'Apa yang Coach Anda lihat yang tidak Anda lihat?')),

 dict(d=28, title=t('Contribution & Responsible Recruitment', 'Sumbangan & Rekrut Bertanggungjawab', 'Kontribusi & Rekrutmen Bertanggung Jawab'),
   objective=t('Give back — but only after your own customers are handled.',
               'Beri kembali — tetapi hanya selepas pelanggan anda sendiri diuruskan.',
               'Beri kembali — tetapi hanya setelah pelanggan Anda sendiri tertangani.'),
   content=t('If your pipeline is strong, teaching someone else is how the group compounds. If your pipeline is still thin, recovering it IS your contribution this month — nobody is served by recruiting on top of unfinished customer work.',
             'Jika pipeline anda kukuh, mengajar orang lain ialah cara kumpulan berkembang. Jika pipeline anda masih nipis, memulihkannya ITULAH sumbangan anda bulan ini — tiada siapa mendapat manfaat daripada merekrut di atas kerja pelanggan yang belum selesai.',
             'Jika pipeline Anda kuat, mengajari orang lain adalah cara grup bertumbuh. Jika pipeline Anda masih tipis, memulihkannya ITULAH kontribusi Anda bulan ini — tidak ada yang diuntungkan dari merekrut di atas pekerjaan pelanggan yang belum selesai.'),
   action=t('If your pipeline is healthy: teach, refer or responsibly introduce someone. If it is not: run pipeline recovery instead, and say so.',
            'Jika pipeline anda sihat: ajar, rujuk atau perkenalkan seseorang secara bertanggungjawab. Jika tidak: jalankan pemulihan pipeline, dan nyatakannya.',
            'Jika pipeline Anda sehat: ajari, rujuk atau perkenalkan seseorang secara bertanggung jawab. Jika tidak: jalankan pemulihan pipeline, dan katakan itu.'),
   evidence=t('Whichever track you took, and why you chose it.',
              'Trek mana pun yang anda ambil, dan mengapa anda memilihnya.',
              'Jalur mana pun yang Anda ambil, dan mengapa Anda memilihnya.'),
   reflect=t('Was that choice honest about where your pipeline actually is?',
             'Adakah pilihan itu jujur tentang di mana pipeline anda sebenarnya berada?',
             'Apakah pilihan itu jujur tentang posisi pipeline Anda sebenarnya?'),
   coach=t('Check the warrior chose the track their pipeline actually justifies. Recruitment should not be replacing unfinished customer work.',
           'Semak warrior memilih trek yang pipeline mereka benar-benar wajarkan. Rekrut tidak patut menggantikan kerja pelanggan yang belum selesai.',
           'Periksa warrior memilih jalur yang memang dibenarkan pipeline-nya. Rekrutmen tidak boleh menggantikan pekerjaan pelanggan yang belum selesai.')),

 dict(d=29, title=t('My Hero Playbook', 'Playbook Hero Saya', 'Playbook Hero Saya'),
   objective=t('Write down what worked, so next month is not luck.',
               'Tulis apa yang berkesan, supaya bulan depan bukan nasib.',
               'Tulis apa yang berhasil, agar bulan depan bukan keberuntungan.'),
   content=t('Thirty days of your own data tells you when you actually work, how you actually prospect, which message actually gets replies. That is your playbook — not a template someone gave you.',
             'Tiga puluh hari data anda sendiri memberitahu bila anda benar-benar bekerja, bagaimana anda benar-benar mencari prospek, mesej mana yang benar-benar dapat balasan. Itulah playbook anda — bukan templat yang orang beri.',
             'Tiga puluh hari data Anda sendiri memberi tahu kapan Anda benar-benar bekerja, bagaimana Anda benar-benar mencari prospek, pesan mana yang benar-benar dibalas. Itulah playbook Anda — bukan template pemberian orang.'),
   action=t('Review the patterns Hero observed in your own 30 days, correct them where they are wrong, and approve your playbook.',
            'Semak corak yang Hero perhatikan dalam 30 hari anda sendiri, betulkan di mana ia salah, dan luluskan playbook anda.',
            'Tinjau pola yang Hero amati dalam 30 hari Anda sendiri, perbaiki yang salah, dan setujui playbook Anda.'),
   evidence=t('Your approved playbook: rhythm, prospecting, follow-up, approach, messages, review habit.',
              'Playbook anda yang diluluskan: rentak, prospek, susulan, pendekatan, mesej, tabiat semakan.',
              'Playbook Anda yang disetujui: ritme, prospek, follow-up, pendekatan, pesan, kebiasaan tinjauan.'),
   reflect=t('What will you keep doing, and what will you stop?',
             'Apa yang anda akan teruskan, dan apa yang anda akan berhentikan?',
             'Apa yang akan Anda lanjutkan, dan apa yang akan Anda hentikan?')),

 dict(d=30, title=t('Final Review & Next Journey', 'Semakan Akhir & Perjalanan Seterusnya', 'Tinjauan Akhir & Perjalanan Berikutnya'),
   objective=t('Look at everything you actually built.',
               'Lihat semua yang anda benar-benar bina.',
               'Lihat semua yang benar-benar Anda bangun.'),
   content=t('Reaching Day 30 is not graduation. Programme completion, activity achievement, capability development, pipeline progress and a verified closing are five separate things — and you can finish this programme strong without a closing yet. Your Coach reviews all of it, and graduation stays a human decision.',
             'Sampai Hari 30 bukan graduasi. Penyempurnaan program, pencapaian aktiviti, pembangunan keupayaan, kemajuan pipeline dan closing yang disahkan ialah lima perkara berasingan — dan anda boleh tamatkan program ini dengan kuat tanpa closing lagi. Coach anda menyemak semuanya, dan graduasi kekal keputusan manusia.',
             'Mencapai Hari 30 bukan kelulusan. Penyelesaian program, pencapaian aktivitas, pengembangan kapabilitas, kemajuan pipeline dan closing terverifikasi adalah lima hal terpisah — dan Anda bisa menyelesaikan program ini dengan kuat tanpa closing. Coach Anda meninjau semuanya, dan kelulusan tetap keputusan manusia.'),
   action=t('Complete your final review with your Coach and agree your next-stage development.',
            'Lengkapkan semakan akhir dengan Coach anda dan persetujui pembangunan peringkat seterusnya.',
            'Selesaikan tinjauan akhir dengan Coach Anda dan sepakati pengembangan tahap berikutnya.'),
   evidence=t('Your final review record and the agreed next stage.',
              'Rekod semakan akhir anda dan peringkat seterusnya yang dipersetujui.',
              'Catatan tinjauan akhir Anda dan tahap berikutnya yang disepakati.'),
   reflect=t('Who are you as a professional now that you were not 30 days ago?',
             'Siapa anda sebagai profesional sekarang yang anda bukan 30 hari lalu?',
             'Siapa Anda sebagai profesional sekarang yang bukan Anda 30 hari lalu?'),
   coach=t('Review completion, activity, capability, pipeline and any verified closing separately. Day 30 raises the review; it never graduates anyone.',
           'Semak penyempurnaan, aktiviti, keupayaan, pipeline dan sebarang closing yang disahkan secara berasingan. Hari 30 membangkitkan semakan; ia tidak pernah menggraduasikan sesiapa.',
           'Tinjau penyelesaian, aktivitas, kapabilitas, pipeline dan closing terverifikasi secara terpisah. Hari 30 memunculkan tinjauan; ia tidak pernah meluluskan siapa pun.')),
]

# What each country variant must supply. NO legal or process content is written
# here — this is the brief for whoever is assigned to author it.
COUNTRY_BRIEF = {
 3:  'Local working setup: the tools, registrations and channels a new agent must have in place in this country before prospecting.',
 4:  'The approved market, project and product focus options available in this country, and how a new agent chooses one.',
 8:  'Approved openers and messaging norms for this country: language register, channel etiquette, and any platform or advertising rules that apply.',
 13: 'The approved deep-mastery material for this country\'s current focus projects or segments.',
 16: 'The professional and customer process in this country, in order, end to end: who does what, at which step, and what the customer experiences.',
 21: 'What may and may not be negotiated or promised in this country, and who must authorise each.',
 22: 'The closing-readiness checklist for this country: every item, its owner and its normal timing.',
 24: 'The approved documentation sequence for this country, with the purpose of each document.',
}


def q(v):
    """SQL string literal.

    With standard_conforming_strings ON (the Postgres default) a backslash inside
    '...' is LITERAL — only the single quote needs doubling. Escaping backslashes
    here corrupts JSON escapes: json.dumps produces \\" and doubling turns it into
    \\\\" , which Postgres then rejects as invalid JSON.
    """
    if v is None:
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


def j(d):
    if d is None:
        return 'null'
    import json
    return q(json.dumps(d, ensure_ascii=False)) + '::jsonb'


def main():
    L = []
    a = L.append
    a('-- ============================================================')
    a('-- 082_curriculum_v2.sql — GENERATED by tools/curriculum_v2.py. Do not hand-edit.')
    a('--')
    a('-- Creates 30 Days curriculum v2 as a DRAFT version. v1 is untouched, so every')
    a('-- existing submission keeps pointing at the row it was answered against.')
    a('--')
    a('-- Days 3, 4, 8, 13, 16, 21, 22 and 24 additionally get MY and ID variant rows')
    a('-- marked content_status = \'content_required\'. Those rows carry the AUTHORING')
    a('-- BRIEF only — no legal, financing, regulatory or commission content is')
    a('-- invented. fn_curriculum_day() skips a content_required variant, so warriors')
    a('-- read the generic row and are NEVER shown the other country\'s content.')
    a('--')
    a('-- Publish with:  select fn_admin_publish_version(\'<version id>\', \'note\');')
    a('-- Point a cohort at it with: select fn_admin_update_cohort(...)')
    a('-- ============================================================')
    a('')
    a('do $mig$')
    a('declare v_prog uuid; v_ver uuid;')
    a('begin')
    a("  select id into v_prog from challenge_programs where code = '30DC';")
    a("  if v_prog is null then raise exception 'programme 30DC not found'; end if;")
    a("  if exists (select 1 from curriculum_versions where program_id = v_prog and version = 2) then")
    a("    raise notice 'curriculum v2 already exists — nothing to do'; return;")
    a('  end if;')
    a("  insert into curriculum_versions (program_id, version, status)")
    a("  values (v_prog, 2, 'draft') returning id into v_ver;")
    a('')

    for d in DAYS:
        n = d['d']
        a(f'  -- ---------- Day {n} ----------')
        a('  insert into curriculum_days (version_id, day_no, phase, title, objective, content,')
        a('    instructions, required_action, stretch_action, evidence_requirement,')
        a('    reflection_question, coach_guidance, xp_amount, needs_review,')
        a('    country_override, proof_type, proof_config, content_status, content_note)')
        a(f'  values (v_ver, {n}, {phase(n)}, {j(d["title"])}, {j(d["objective"])}, {j(d["content"])},')
        a(f'    {j(d.get("instructions"))}, {j(d["action"])}, {j(d.get("stretch"))}, {j(d["evidence"])},')
        a(f'    {j(d["reflect"])}, {j(d.get("coach"))}, {XP.get(n, 10)}, true,')
        pt = "'native_record'" if d.get('proof') else 'null'
        pc = j(d['proof']) if d.get('proof') else 'null'
        a(f"    null, {pt}, {pc}, 'ok', null);")

        if n in COUNTRY_DAYS:
            brief = COUNTRY_BRIEF[n]
            for cc in ('MY', 'ID'):
                marker = t(f'CONTENT REQUIRED — {cc}. {brief}',
                           f'KANDUNGAN DIPERLUKAN — {cc}. {brief}',
                           f'KONTEN DIPERLUKAN — {cc}. {brief}')
                a(f'  insert into curriculum_days (version_id, day_no, phase, title, objective,')
                a('    content, required_action, evidence_requirement, reflection_question,')
                a('    xp_amount, needs_review, country_override, content_status, content_note)')
                a(f'  values (v_ver, {n}, {phase(n)}, {j(d["title"])}, {j(d["objective"])},')
                a(f'    {j(marker)}, {j(d["action"])}, {j(d["evidence"])}, {j(d["reflect"])},')
                a(f"    {XP.get(n, 10)}, true, '{cc}', 'content_required', {q(brief)});")
        a('')

    a("  perform audit_log('curriculum_version_created','curriculum_version', v_ver::text, null,")
    a("    'draft v2', '30 Days v2 — generated by tools/curriculum_v2.py');")
    a("  raise notice 'curriculum v2 created: %', v_ver;")
    a('end $mig$;')
    a('')
    a('-- ---------- VERIFY ----------')
    a("select 'v2 generic days (must be 30)' as check, count(*) as n")
    a("  from curriculum_days cd join curriculum_versions cv on cv.id = cd.version_id")
    a(" where cv.version = 2 and cd.country_override is null;")
    a("select 'v2 country rows awaiting authorised content (must be 16)' as check, count(*) as n")
    a("  from curriculum_days cd join curriculum_versions cv on cv.id = cd.version_id")
    a(" where cv.version = 2 and cd.content_status = 'content_required';")
    a("select day_no, country, content_note from fn_content_gaps() order by day_no, country;")

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
    print(f'wrote {OUT}')
    print(f'  {len(DAYS)} generic days, {len(COUNTRY_DAYS) * 2} country rows marked content_required')


if __name__ == '__main__':
    main()
