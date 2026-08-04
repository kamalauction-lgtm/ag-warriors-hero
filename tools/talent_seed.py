"""Generate the Hero Talent Compass question bank as SQL.

English is the master (docs/talent-question-bank-v1-en.md). BM and ID are
translations of it. Re-run after editing wording:

    python tools/talent_seed.py > supabase/migrations/027_talent_seed.sql

Translation notes:
  * ms-MY uses "anda / boleh / hartanah"; id-ID uses "Anda / bisa / properti".
    They are close but not interchangeable — kept deliberately distinct.
  * Scale labels differ per language and are seeded per option, not hardcoded.
"""

T = lambda en, ms, id_: {"en": en, "ms-MY": ms, "id-ID": id_}

# ---------------------------------------------------------------- scales
AGREE = [
    (1, T("Strongly disagree", "Sangat tidak setuju", "Sangat tidak setuju")),
    (2, T("Disagree", "Tidak setuju", "Tidak setuju")),
    (3, T("Neutral", "Berkecuali", "Netral")),
    (4, T("Agree", "Setuju", "Setuju")),
    (5, T("Strongly agree", "Sangat setuju", "Sangat setuju")),
]
FREQ = [
    (1, T("Never", "Tidak pernah", "Tidak pernah")),
    (2, T("Rarely", "Jarang", "Jarang")),
    (3, T("Sometimes", "Kadang-kadang", "Kadang-kadang")),
    (4, T("Often", "Kerap", "Sering")),
    (5, T("Almost always", "Hampir selalu", "Hampir selalu")),
]

# ---------------------------------------------------------------- sections
SECTIONS = [
    ("A", T("Working Style", "Gaya Kerja", "Gaya Kerja"),
     T("How you naturally work. There is no better or worse answer.",
       "Cara anda bekerja secara semula jadi. Tiada jawapan yang lebih baik atau buruk.",
       "Cara Anda bekerja secara alami. Tidak ada jawaban yang lebih baik atau buruk.")),
    ("B", T("Entrepreneurial Readiness", "Kesediaan Keusahawanan", "Kesiapan Kewirausahaan"),
     T("How you approach opportunity, ownership and getting things done.",
       "Cara anda menghadapi peluang, tanggungjawab dan menyiapkan kerja.",
       "Cara Anda menghadapi peluang, tanggung jawab, dan menyelesaikan pekerjaan.")),
    ("C", T("Motivation Map", "Peta Motivasi", "Peta Motivasi"),
     T("What drives you, and what drains you.",
       "Apa yang mendorong anda, dan apa yang melemahkan semangat anda.",
       "Apa yang mendorong Anda, dan apa yang menurunkan semangat Anda.")),
    ("D", T("Success Drive", "Dorongan Kejayaan", "Dorongan Kesuksesan"),
     T("Your commitment, consistency and resilience — in a sustainable way.",
       "Komitmen, konsistensi dan daya tahan anda — secara mampan.",
       "Komitmen, konsistensi, dan ketahanan Anda — secara berkelanjutan.")),
    ("E", T("Real-Estate Scenarios", "Senario Hartanah", "Skenario Properti"),
     T("Real situations. Every option is a credible way to contribute — choose what you would naturally do.",
       "Situasi sebenar. Setiap pilihan adalah cara menyumbang yang munasabah — pilih apa yang anda akan buat secara semula jadi.",
       "Situasi nyata. Setiap pilihan adalah cara berkontribusi yang masuk akal — pilih apa yang secara alami Anda lakukan.")),
    ("F", T("Your Reflection", "Refleksi Anda", "Refleksi Anda"),
     T("Answer in your own words. There are no right answers.",
       "Jawab dengan perkataan anda sendiri. Tiada jawapan yang betul atau salah.",
       "Jawab dengan kata-kata Anda sendiri. Tidak ada jawaban benar atau salah.")),
]

# ------------------------------------------------------- A–D and F items
# (code, kind, stem, scale, contributes-per-point, reverse)
ITEMS = [
    # ---- A. Working Style
    ("A", "A1", "frequency", T(
        "In the last 30 days, how often did you start a conversation with someone you did not know well?",
        "Dalam 30 hari lepas, berapa kerap anda memulakan perbualan dengan seseorang yang anda tidak kenali rapat?",
        "Dalam 30 hari terakhir, seberapa sering Anda memulai percakapan dengan orang yang belum Anda kenal dekat?"),
     FREQ, {"style.social_energy": 1, "role.prospector": 0.5}, False),
    ("A", "A2", "frequency", T(
        "In the last 30 days, how often did you post, speak or present where other people could see you?",
        "Dalam 30 hari lepas, berapa kerap anda menyiarkan, bercakap atau membentangkan di tempat orang lain boleh melihat anda?",
        "Dalam 30 hari terakhir, seberapa sering Anda memposting, berbicara, atau presentasi di hadapan orang lain?"),
     FREQ, {"style.visibility": 1, "role.content_creator": 0.4, "role.live_host": 0.4}, False),
    ("A", "A3", "scale5", T(
        "I prefer to plan the steps before I begin, rather than start and adjust as I go.",
        "Saya lebih suka merancang langkah sebelum mula, berbanding mula dahulu dan menyesuaikan kemudian.",
        "Saya lebih suka merencanakan langkah sebelum mulai, daripada mulai dulu lalu menyesuaikan."),
     AGREE, {"style.planning": 1}, False),
    ("A", "A4", "scale5", T(
        "When plans change at short notice, I find it hard to change direction.",
        "Apabila rancangan berubah secara tiba-tiba, saya sukar menukar arah.",
        "Ketika rencana berubah mendadak, saya sulit mengubah arah."),
     AGREE, {"style.adaptability": 1}, True),
    ("A", "A5", "scale5", T(
        "I usually decide quickly, even when I do not have every detail.",
        "Saya biasanya membuat keputusan dengan cepat, walaupun tanpa semua maklumat.",
        "Saya biasanya memutuskan dengan cepat, meskipun belum punya semua detail."),
     AGREE, {"style.decision_speed": 1}, False),
    ("A", "A6", "frequency", T(
        "In the last 30 days, how often did you notice an error in a document or listing that others had missed?",
        "Dalam 30 hari lepas, berapa kerap anda perasan kesilapan dalam dokumen atau senarai yang terlepas pandang orang lain?",
        "Dalam 30 hari terakhir, seberapa sering Anda menemukan kesalahan dalam dokumen atau listing yang terlewat oleh orang lain?"),
     FREQ, {"style.detail": 1}, False),
    ("A", "A7", "scale5", T(
        "I do my best work together with other people rather than alone.",
        "Saya menghasilkan kerja terbaik bersama orang lain berbanding bersendirian.",
        "Saya bekerja paling baik bersama orang lain daripada sendirian."),
     AGREE, {"style.collaboration": 1, "role.leader": 0.5}, False),
    ("A", "A8", "scale5", T(
        "When I need a new skill, I prefer to learn by trying it rather than by studying it first.",
        "Apabila saya perlukan kemahiran baharu, saya lebih suka belajar dengan mencuba berbanding mengkaji dahulu.",
        "Saat butuh keterampilan baru, saya lebih suka belajar dengan mencoba daripada mempelajarinya dulu."),
     AGREE, {"style.learning": 1}, False),

    # ---- B. Entrepreneurial Readiness
    ("B", "B1", "frequency", T(
        "In the last 30 days, how often did you act on an opportunity without being told to?",
        "Dalam 30 hari lepas, berapa kerap anda bertindak atas sesuatu peluang tanpa disuruh?",
        "Dalam 30 hari terakhir, seberapa sering Anda bertindak atas sebuah peluang tanpa disuruh?"),
     FREQ, {"ent.initiative": 1, "ent.opportunity": 0.6}, False),
    ("B", "B2", "scale5", T(
        "When something I am responsible for goes wrong, I look first at what I could have done differently.",
        "Apabila sesuatu di bawah tanggungjawab saya gagal, saya lihat dahulu apa yang saya boleh buat berbeza.",
        "Ketika hal yang menjadi tanggung jawab saya gagal, saya lebih dulu melihat apa yang bisa saya lakukan berbeda."),
     AGREE, {"ent.ownership": 1, "success.accountability": 0.6}, False),
    ("B", "B3", "frequency", T(
        "In the last 30 days, how often did you find a way forward using what you already had, instead of waiting for better resources?",
        "Dalam 30 hari lepas, berapa kerap anda mencari jalan menggunakan apa yang sedia ada, tanpa menunggu sumber yang lebih baik?",
        "Dalam 30 hari terakhir, seberapa sering Anda mencari jalan dengan apa yang sudah ada, tanpa menunggu sumber daya yang lebih baik?"),
     FREQ, {"ent.resourcefulness": 1}, False),
    ("B", "B4", "scale5", T(
        "I am willing to spend my own money or time on something that may not work, if the possible gain is worth it.",
        "Saya sanggup melaburkan wang atau masa sendiri pada sesuatu yang mungkin gagal, jika potensi pulangannya berbaloi.",
        "Saya bersedia mengeluarkan uang atau waktu sendiri untuk sesuatu yang mungkin gagal, jika potensi hasilnya sepadan."),
     AGREE, {"ent.calculated_risk": 1, "role.team_growth_funder": 0.6}, False),
    ("B", "B5", "scale5", T(
        "When something does not work after a few tries, I usually move on to something else.",
        "Apabila sesuatu tidak berjaya selepas beberapa percubaan, saya biasanya beralih kepada perkara lain.",
        "Ketika sesuatu tidak berhasil setelah beberapa kali coba, saya biasanya beralih ke hal lain."),
     AGREE, {"ent.persistence": 1}, True),
    ("B", "B6", "frequency", T(
        "In the last 30 days, how often did you finish an important task without anyone reminding you?",
        "Dalam 30 hari lepas, berapa kerap anda menyiapkan tugas penting tanpa perlu diingatkan?",
        "Dalam 30 hari terakhir, seberapa sering Anda menyelesaikan tugas penting tanpa diingatkan?"),
     FREQ, {"ent.execution": 1, "success.consistency": 0.6}, False),
    ("B", "B7", "scale5", T(
        "I change my approach quickly when I can see it is not producing results.",
        "Saya menukar pendekatan dengan cepat apabila nampak ia tidak memberikan hasil.",
        "Saya mengubah pendekatan dengan cepat ketika terlihat tidak membuahkan hasil."),
     AGREE, {"ent.adaptability": 1, "ent.learning_agility": 0.6}, False),
    ("B", "B8", "scale5", T(
        "Before recommending anything, I try to understand what the customer actually needs.",
        "Sebelum mengesyorkan apa-apa, saya cuba memahami apa yang pelanggan benar-benar perlukan.",
        "Sebelum merekomendasikan apa pun, saya berusaha memahami apa yang benar-benar dibutuhkan pelanggan."),
     AGREE, {"ent.customer_value": 1, "role.relationship_builder": 0.5}, False),

    # ---- D. Success Drive  (C handled separately: forced-choice + multi-select)
    ("D", "D1", "scale5", T(
        "I have a specific income or achievement target for the next 12 months.",
        "Saya mempunyai sasaran pendapatan atau pencapaian yang khusus untuk 12 bulan akan datang.",
        "Saya memiliki target penghasilan atau pencapaian yang spesifik untuk 12 bulan ke depan."),
     AGREE, {"success.goal_clarity": 1}, False),
    ("D", "D2", "scale5", T(
        "I am willing to work hard now for a reward that may take a year to arrive.",
        "Saya sanggup berusaha keras sekarang untuk ganjaran yang mungkin mengambil masa setahun.",
        "Saya bersedia bekerja keras sekarang untuk hasil yang mungkin baru datang setahun kemudian."),
     AGREE, {"success.delayed_reward": 1, "success.ambition": 0.6}, False),
    ("D", "D3", "frequency", T(
        "In the last 30 days, how often did you keep to a work routine even when you did not feel like it?",
        "Dalam 30 hari lepas, berapa kerap anda mengekalkan rutin kerja walaupun tidak bersemangat?",
        "Dalam 30 hari terakhir, seberapa sering Anda tetap menjalankan rutinitas kerja meski sedang tidak mood?"),
     FREQ, {"success.consistency": 1}, False),
    ("D", "D4", "scale5", T(
        "After a setback, I usually recover within a day or two.",
        "Selepas kekecewaan, saya biasanya pulih dalam sehari dua.",
        "Setelah mengalami kemunduran, saya biasanya pulih dalam satu dua hari."),
     AGREE, {"success.resilience": 1}, False),
    ("D", "D5", "scale5", T(
        "I believe I can become genuinely good at this work.",
        "Saya percaya saya boleh menjadi benar-benar mahir dalam kerja ini.",
        "Saya percaya saya bisa menjadi benar-benar mahir dalam pekerjaan ini."),
     AGREE, {"success.self_belief": 1}, False),
    ("D", "D6", "scale5", T(
        "I know which things I am prepared to give up for the next 12 months — and which I am not.",
        "Saya tahu perkara mana yang saya sanggup korbankan untuk 12 bulan akan datang — dan mana yang tidak.",
        "Saya tahu hal apa yang siap saya korbankan untuk 12 bulan ke depan — dan mana yang tidak."),
     AGREE, {"success.realistic_commitment": 1}, False),
    ("D", "D7", "scale5", T(
        "To succeed, I would sacrifice my health, my sleep or my family time.",
        "Untuk berjaya, saya sanggup mengorbankan kesihatan, tidur atau masa bersama keluarga.",
        "Untuk sukses, saya bersedia mengorbankan kesehatan, tidur, atau waktu bersama keluarga."),
     AGREE, {"success.realistic_commitment": 1}, True),   # reverse: protects wellbeing (§7D)
    ("D", "D8", "scale5", T(
        "When I miss a target, it is usually because of circumstances outside my control.",
        "Apabila saya tidak mencapai sasaran, biasanya kerana keadaan di luar kawalan saya.",
        "Ketika saya tidak mencapai target, biasanya karena keadaan di luar kendali saya."),
     AGREE, {"success.accountability": 1}, True),
]

# ------------------------------------------------------------- C section
CHOICE = [
    ("C1", T("Which of these would make you most proud after a successful year?",
             "Antara berikut, yang mana paling membanggakan anda selepas setahun yang berjaya?",
             "Mana yang paling membuat Anda bangga setelah satu tahun yang sukses?"), [
        (1, T("My family is financially secure", "Keluarga saya selamat dari segi kewangan", "Keluarga saya aman secara finansial"), {"motivation.family_security": 3}),
        (2, T("I earned significantly more than before", "Saya memperoleh pendapatan jauh lebih tinggi daripada sebelumnya", "Saya berpenghasilan jauh lebih besar dari sebelumnya"), {"motivation.financial_growth": 3}),
        (3, T("I control my own time and decisions", "Saya mengawal masa dan keputusan saya sendiri", "Saya mengendalikan waktu dan keputusan saya sendiri"), {"motivation.freedom": 3}),
        (4, T("My work was recognised by people I respect", "Kerja saya diiktiraf oleh orang yang saya hormati", "Pekerjaan saya diakui oleh orang yang saya hormati"), {"motivation.recognition": 3}),
    ]),
    ("C2", T("Which would you find most satisfying?",
             "Yang mana paling memuaskan bagi anda?",
             "Mana yang paling memuaskan bagi Anda?"), [
        (1, T("Hitting a target I set for myself", "Mencapai sasaran yang saya tetapkan sendiri", "Mencapai target yang saya tetapkan sendiri"), {"motivation.achievement": 3}),
        (2, T("Helping someone solve a real problem", "Membantu seseorang menyelesaikan masalah sebenar", "Membantu seseorang menyelesaikan masalah nyata"), {"motivation.helping_others": 3}),
        (3, T("Being trusted to guide others", "Dipercayai untuk membimbing orang lain", "Dipercaya untuk membimbing orang lain"), {"motivation.leadership_influence": 3, "role.leader": 1}),
        (4, T("Becoming genuinely skilled at something difficult", "Menjadi benar-benar mahir dalam sesuatu yang sukar", "Menjadi benar-benar ahli dalam sesuatu yang sulit"), {"motivation.learning_mastery": 3}),
    ]),
    ("C3", T("Which working situation appeals to you most?",
             "Situasi kerja yang mana paling menarik bagi anda?",
             "Situasi kerja mana yang paling menarik bagi Anda?"), [
        (1, T("Being part of a team that feels like family", "Menjadi sebahagian pasukan yang terasa seperti keluarga", "Menjadi bagian dari tim yang terasa seperti keluarga"), {"motivation.community": 3}),
        (2, T("Building something that is recognisably mine", "Membina sesuatu yang jelas milik saya", "Membangun sesuatu yang jelas milik saya"), {"motivation.creativity": 3}),
        (3, T("Competing and seeing where I stand", "Bersaing dan melihat di mana kedudukan saya", "Berkompetisi dan melihat posisi saya"), {"motivation.challenge": 3}),
        (4, T("Building something that outlasts me", "Membina sesuatu yang kekal selepas saya", "Membangun sesuatu yang bertahan melampaui saya"), {"motivation.legacy": 3}),
    ]),
    ("C4", T("If the income were the same, which would you choose?",
             "Jika pendapatannya sama, yang mana anda pilih?",
             "Jika penghasilannya sama, mana yang Anda pilih?"), [
        (1, T("Secure and predictable work", "Kerja yang selamat dan boleh dijangka", "Pekerjaan yang aman dan bisa diprediksi"), {"motivation.family_security": 2}),
        (2, T("Higher risk with higher potential", "Risiko lebih tinggi dengan potensi lebih tinggi", "Risiko lebih tinggi dengan potensi lebih besar"), {"motivation.financial_growth": 2, "ent.calculated_risk": 1}),
        (3, T("Complete flexibility over my schedule", "Fleksibiliti penuh ke atas jadual saya", "Fleksibilitas penuh atas jadwal saya"), {"motivation.freedom": 2}),
        (4, T("Visible responsibility for a team's results", "Tanggungjawab jelas ke atas hasil sesuatu pasukan", "Tanggung jawab nyata atas hasil sebuah tim"), {"motivation.leadership_influence": 2, "role.leader": 1.5}),
    ]),
]

C_SCALE = [
    ("C5", T("Money is one of the main reasons I am doing this work.",
             "Wang adalah salah satu sebab utama saya melakukan kerja ini.",
             "Uang adalah salah satu alasan utama saya melakukan pekerjaan ini."),
     {"motivation.financial_growth": 1}),
    ("C6", T("I want people to come to me when they need to learn how to do this work.",
             "Saya mahu orang datang kepada saya apabila mereka perlu belajar cara melakukan kerja ini.",
             "Saya ingin orang datang kepada saya ketika mereka perlu belajar cara melakukan pekerjaan ini."),
     {"motivation.leadership_influence": 1, "role.coach_trainer": 1.5, "role.leader": 0.8}),
]

DEMOTIVATORS_1 = [
    ("rejection", T("Repeated rejection", "Penolakan berulang kali", "Penolakan berulang")),
    ("unclear_instructions", T("Unclear instructions", "Arahan yang tidak jelas", "Instruksi yang tidak jelas")),
    ("no_recognition", T("Not being recognised", "Tidak diiktiraf", "Tidak diakui")),
    ("working_alone", T("Working alone for long periods", "Bekerja bersendirian untuk tempoh yang lama", "Bekerja sendirian dalam waktu lama")),
    ("no_progress", T("Not seeing visible progress", "Tidak nampak kemajuan", "Tidak melihat kemajuan yang nyata")),
    ("conflict", T("Conflict with others", "Konflik dengan orang lain", "Konflik dengan orang lain")),
    ("uncertainty", T("Uncertainty about the future", "Ketidakpastian tentang masa depan", "Ketidakpastian tentang masa depan")),
]
DEMOTIVATORS_2 = [
    ("repetitive", T("Repetitive work", "Kerja berulang-ulang", "Pekerjaan yang berulang")),
    ("public_pressure", T("Pressure in front of other people", "Tekanan di hadapan orang lain", "Tekanan di depan orang lain")),
    ("criticism", T("Being criticised", "Dikritik", "Dikritik")),
    ("slow_money", T("Slow financial results", "Hasil kewangan yang lambat", "Hasil finansial yang lambat")),
    ("no_support", T("Lack of support", "Kekurangan sokongan", "Kurangnya dukungan")),
    ("unprepared", T("Feeling unprepared", "Rasa tidak bersedia", "Merasa tidak siap")),
]

# ------------------------------------------------------------ F reflection
REFLECT = [
    ("F1", T("What does success mean to you personally?",
             "Apakah maksud kejayaan bagi anda secara peribadi?",
             "Apa arti kesuksesan bagi Anda secara pribadi?")),
    ("F2", T("What are you willing to do consistently for the next 12 months to achieve it?",
             "Apakah yang anda sanggup lakukan secara konsisten dalam 12 bulan akan datang untuk mencapainya?",
             "Apa yang bersedia Anda lakukan secara konsisten selama 12 bulan ke depan untuk mencapainya?")),
    ("F3", T("What usually causes you to stop, delay, or lose confidence?",
             "Apakah yang biasanya menyebabkan anda berhenti, bertangguh atau hilang keyakinan?",
             "Apa yang biasanya membuat Anda berhenti, menunda, atau kehilangan kepercayaan diri?")),
]
