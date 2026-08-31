"""Emit the "Know Yourself" public pre-programme bank (version myself-v1).

    python tools/myself_emit.py

Why a second VERSION and not a second system: talent_score() reads whatever
signal keys the options carry, so a new bank needs no schema change and no
scoring change. It deliberately reuses the SAME signal vocabulary as v1
(role.*, motivation.*, demotivator.*), which means worker/src/talentReport.js
already has trilingual labels for every key here — no new worker code.

Audience difference from v1: these people are NOT agents yet. Nothing may assume
existing listings, clients, a team, or a marketing budget, and nothing asks a
candidate to fund anything.

Deliberately absent, and it should stay that way:
  * age, race, religion, gender, marital or family status, health, disability —
    no protected characteristic is asked or inferred;
  * any "loyalty score". Whether a person will stay cannot be measured by a
    self-report questionnaire. What CAN be captured is what they say they need
    in order to stay, and what would push them out — so that is what E3/E4 ask,
    and it reads as information for the employer, not a verdict on the person.

Idempotent: re-running replaces myself-v1 content in place.
"""
import json
import os

T = lambda en, ms, id_: {"en": en, "ms-MY": ms, "id-ID": id_}

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

SECTIONS = [
    ("A", T("How You Work", "Cara Anda Bekerja", "Cara Anda Bekerja"),
     T("How you naturally work day to day. No answer is better than another.",
       "Cara anda bekerja dari hari ke hari. Tiada jawapan yang lebih baik daripada yang lain.",
       "Cara Anda bekerja sehari-hari. Tidak ada jawaban yang lebih baik dari yang lain.")),
    ("B", T("Drive and Follow-Through", "Dorongan dan Ketekunan", "Dorongan dan Ketekunan"),
     T("How you keep going when nobody is watching.",
       "Bagaimana anda meneruskan usaha apabila tiada siapa memerhati.",
       "Bagaimana Anda tetap berjalan saat tidak ada yang mengawasi.")),
    ("C", T("Ownership and Risk", "Tanggungjawab dan Risiko", "Tanggung Jawab dan Risiko"),
     T("How you handle responsibility, uncertainty and reward.",
       "Cara anda mengendalikan tanggungjawab, ketidakpastian dan ganjaran.",
       "Cara Anda menangani tanggung jawab, ketidakpastian, dan imbalan.")),
    ("D", T("What Moves You", "Apa yang Menggerakkan Anda", "Apa yang Menggerakkan Anda"),
     T("What you are actually chasing, in your own terms.",
       "Apa yang anda kejar sebenarnya, mengikut takrifan anda sendiri.",
       "Apa yang sebenarnya Anda kejar, menurut definisi Anda sendiri.")),
    ("E", T("What Would Wear You Down", "Apa yang Melemahkan Anda", "Apa yang Melemahkan Anda"),
     T("Being honest here helps more than looking strong.",
       "Berterus terang di sini lebih membantu daripada cuba nampak kuat.",
       "Jujur di sini lebih membantu daripada terlihat kuat.")),
    ("F", T("Real Situations", "Situasi Sebenar", "Situasi Nyata"),
     T("Every option is a reasonable thing to do. Choose what you would actually do.",
       "Setiap pilihan adalah tindakan yang munasabah. Pilih apa yang anda benar-benar akan buat.",
       "Setiap pilihan adalah tindakan yang masuk akal. Pilih apa yang benar-benar akan Anda lakukan.")),
    ("G", T("In Your Own Words", "Dengan Perkataan Anda Sendiri", "Dengan Kata-Kata Anda Sendiri"),
     T("Short answers are fine. There are no right answers.",
       "Jawapan ringkas sudah memadai. Tiada jawapan yang betul atau salah.",
       "Jawaban singkat sudah cukup. Tidak ada jawaban benar atau salah.")),
]

# (section, code, kind, stem, scale, contributes-at-full-agreement, reverse)
ITEMS = [
    # ---------------- A. How You Work
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
        "In the last 30 days, how often did you notice a mistake in a document or a price that others had missed?",
        "Dalam 30 hari lepas, berapa kerap anda perasan kesilapan dalam dokumen atau harga yang terlepas pandang orang lain?",
        "Dalam 30 hari terakhir, seberapa sering Anda menemukan kesalahan dalam dokumen atau harga yang terlewat oleh orang lain?"),
     FREQ, {"style.detail": 1}, False),
    # the group-vs-solo pair: asked as two separate items on purpose, because
    # liking people and being able to work alone are not opposites
    ("A", "A7", "scale5", T(
        "I do my best work together with other people rather than alone.",
        "Saya menghasilkan kerja terbaik bersama orang lain berbanding bersendirian.",
        "Saya bekerja paling baik bersama orang lain daripada sendirian."),
     AGREE, {"style.collaboration": 1, "role.leader": 0.4}, False),
    ("A", "A8", "scale5", T(
        "I am comfortable working for long stretches with nobody else around.",
        "Saya selesa bekerja untuk tempoh yang lama tanpa orang lain di sekeliling.",
        "Saya nyaman bekerja dalam waktu lama tanpa orang lain di sekitar."),
     AGREE, {"style.autonomy": 1}, False),
    ("A", "A9", "scale5", T(
        "When I need a new skill, I prefer to learn by trying it rather than by studying it first.",
        "Apabila saya perlukan kemahiran baharu, saya lebih suka belajar dengan mencuba berbanding mengkaji dahulu.",
        "Saat butuh keterampilan baru, saya lebih suka belajar dengan mencoba daripada mempelajarinya dulu."),
     AGREE, {"style.learning": 1}, False),

    # ---------------- B. Drive and Follow-Through
    ("B", "B1", "frequency", T(
        "In the last 30 days, how often did you finish something you had committed to even after you stopped feeling like it?",
        "Dalam 30 hari lepas, berapa kerap anda menyiapkan sesuatu yang anda telah janjikan walaupun selepas hilang mood?",
        "Dalam 30 hari terakhir, seberapa sering Anda menyelesaikan hal yang sudah Anda janjikan meski sudah kehilangan mood?"),
     FREQ, {"success.consistency": 1}, False),
    ("B", "B2", "scale5", T(
        "After a setback, it takes me a long time to get going again.",
        "Selepas sesuatu kegagalan, saya mengambil masa yang lama untuk bangkit semula.",
        "Setelah kemunduran, saya butuh waktu lama untuk bangkit kembali."),
     AGREE, {"success.resilience": 1}, True),
    ("B", "B3", "scale5", T(
        "When something I am responsible for goes wrong, I look first at what I could have done differently.",
        "Apabila sesuatu di bawah tanggungjawab saya gagal, saya lihat dahulu apa yang saya boleh buat berbeza.",
        "Ketika hal yang menjadi tanggung jawab saya gagal, saya lebih dulu melihat apa yang bisa saya lakukan berbeda."),
     AGREE, {"success.accountability": 1, "ent.ownership": 0.5}, False),
    ("B", "B4", "frequency", T(
        "In the last 30 days, how often did you work towards a target you had written down for yourself?",
        "Dalam 30 hari lepas, berapa kerap anda bekerja ke arah sasaran yang anda tuliskan sendiri?",
        "Dalam 30 hari terakhir, seberapa sering Anda bekerja menuju target yang Anda tulis sendiri?"),
     FREQ, {"success.goal_focus": 1}, False),
    ("B", "B5", "scale5", T(
        "I can keep working productively without someone telling me what to do next.",
        "Saya boleh terus bekerja secara produktif tanpa seseorang memberitahu apa langkah seterusnya.",
        "Saya bisa terus bekerja produktif tanpa ada yang memberi tahu langkah berikutnya."),
     AGREE, {"success.self_management": 1, "style.autonomy": 0.4}, False),
    ("B", "B6", "scale5", T(
        "When someone corrects me, I usually change what I do.",
        "Apabila seseorang membetulkan saya, saya biasanya mengubah cara saya.",
        "Ketika seseorang mengoreksi saya, saya biasanya mengubah cara saya."),
     AGREE, {"success.coachability": 1}, False),
    ("B", "B7", "scale5", T(
        "I usually need a deadline set by someone else before I act.",
        "Saya biasanya perlukan tarikh akhir yang ditetapkan orang lain sebelum saya bertindak.",
        "Saya biasanya butuh tenggat dari orang lain sebelum saya bertindak."),
     AGREE, {"success.self_management": 1}, True),

    # ---------------- C. Ownership and Risk
    ("C", "C1", "frequency", T(
        "In the last 30 days, how often did you act on an opportunity without being told to?",
        "Dalam 30 hari lepas, berapa kerap anda bertindak atas sesuatu peluang tanpa disuruh?",
        "Dalam 30 hari terakhir, seberapa sering Anda bertindak atas sebuah peluang tanpa disuruh?"),
     FREQ, {"ent.initiative": 1, "ent.opportunity": 0.6}, False),
    ("C", "C2", "frequency", T(
        "In the last 30 days, how often did you find a way forward using what you already had, instead of waiting for something better?",
        "Dalam 30 hari lepas, berapa kerap anda mencari jalan menggunakan apa yang sedia ada, tanpa menunggu sesuatu yang lebih baik?",
        "Dalam 30 hari terakhir, seberapa sering Anda mencari jalan dengan apa yang sudah ada, tanpa menunggu yang lebih baik?"),
     FREQ, {"ent.resourcefulness": 1}, False),
    ("C", "C3", "scale5", T(
        "I am willing to put my own time into something that may not work, if the possible gain is worth it.",
        "Saya sanggup melaburkan masa saya sendiri pada sesuatu yang mungkin gagal, jika potensi pulangannya berbaloi.",
        "Saya bersedia menginvestasikan waktu saya sendiri untuk sesuatu yang mungkin gagal, jika potensi hasilnya sepadan."),
     AGREE, {"ent.calculated_risk": 1}, False),
    ("C", "C4", "scale5", T(
        "When something does not work after a few tries, I usually move on to something else.",
        "Apabila sesuatu tidak berjaya selepas beberapa percubaan, saya biasanya beralih kepada perkara lain.",
        "Ketika sesuatu tidak berhasil setelah beberapa kali coba, saya biasanya beralih ke hal lain."),
     AGREE, {"ent.persistence": 1}, True),
    ("C", "C5", "scale5", T(
        "I could stay calm if my income changed a lot from one month to the next.",
        "Saya boleh kekal tenang jika pendapatan saya berubah banyak dari sebulan ke sebulan.",
        "Saya bisa tetap tenang jika penghasilan saya berubah banyak dari bulan ke bulan."),
     AGREE, {"ent.income_variability": 1}, False),
    ("C", "C6", "scale5", T(
        "I would rather be paid for results than for the hours I put in.",
        "Saya lebih rela dibayar mengikut hasil berbanding mengikut jam yang saya luangkan.",
        "Saya lebih suka dibayar berdasarkan hasil daripada berdasarkan jam kerja."),
     AGREE, {"ent.results_orientation": 1, "role.closer": 0.4}, False),

    # ---------------- D. What Moves You (scale part)
    ("D", "D3", "scale5", T(
        "Money is one of the main reasons I am considering this work.",
        "Wang adalah salah satu sebab utama saya mempertimbangkan kerja ini.",
        "Uang adalah salah satu alasan utama saya mempertimbangkan pekerjaan ini."),
     AGREE, {"motivation.financial_growth": 1}, False),
    ("D", "D4", "scale5", T(
        "I want to become someone other people come to in order to learn.",
        "Saya mahu menjadi seseorang yang orang lain datang untuk belajar.",
        "Saya ingin menjadi orang yang didatangi orang lain untuk belajar."),
     AGREE, {"motivation.leadership_influence": 1, "role.coach_trainer": 1.2}, False),
    ("D", "D5", "scale5", T(
        "Providing for the people I am responsible for is what pushes me most.",
        "Menyediakan keperluan untuk orang yang saya tanggung adalah pendorong utama saya.",
        "Menghidupi orang-orang yang menjadi tanggung jawab saya adalah pendorong utama saya."),
     AGREE, {"motivation.family_security": 1}, False),
    ("D", "D6", "scale5", T(
        "I want work that keeps teaching me something new.",
        "Saya mahukan kerja yang terus mengajar saya sesuatu yang baharu.",
        "Saya ingin pekerjaan yang terus mengajarkan sesuatu yang baru."),
     AGREE, {"motivation.learning_mastery": 1}, False),
]

# ---------------- D forced choice: (code, stem, [(value, label, contributes)])
CHOICE = [
    ("D1", T("At the end of a year, which of these would make you feel it was worth it?",
             "Di penghujung tahun, yang mana antara ini membuatkan anda rasa ia berbaloi?",
             "Di akhir tahun, mana dari ini yang membuat Anda merasa itu sepadan?"), [
        (1, T("I earned noticeably more than the year before",
              "Saya memperoleh pendapatan yang jauh lebih tinggi daripada tahun sebelumnya",
              "Saya menghasilkan jauh lebih banyak daripada tahun sebelumnya"),
         {"motivation.financial_growth": 2}),
        (2, T("I controlled my own time and schedule",
              "Saya mengawal masa dan jadual saya sendiri",
              "Saya mengendalikan waktu dan jadwal saya sendiri"),
         {"motivation.freedom": 2}),
        (3, T("I genuinely helped people who needed it",
              "Saya benar-benar membantu orang yang memerlukannya",
              "Saya benar-benar membantu orang yang membutuhkannya"),
         {"motivation.helping_others": 2, "role.relationship_builder": 1}),
        (4, T("I became clearly better at something difficult",
              "Saya menjadi jauh lebih mahir dalam sesuatu yang sukar",
              "Saya menjadi jauh lebih mahir dalam sesuatu yang sulit"),
         {"motivation.learning_mastery": 2}),
    ]),
    ("D2", T("If you moved into new work, what would you most want it to give you that you do not have now?",
             "Jika anda berpindah ke kerja baharu, apakah yang paling anda mahu ia berikan yang anda tiada sekarang?",
             "Jika Anda pindah ke pekerjaan baru, apa yang paling Anda inginkan darinya yang belum Anda miliki sekarang?"), [
        (1, T("Income that is not capped by a salary scale",
              "Pendapatan yang tidak dihadkan oleh skala gaji",
              "Penghasilan yang tidak dibatasi skala gaji"),
         {"motivation.financial_growth": 2, "motivation.achievement": 0.5}),
        (2, T("Freedom over how and when I work",
              "Kebebasan tentang bagaimana dan bila saya bekerja",
              "Kebebasan atas bagaimana dan kapan saya bekerja"),
         {"motivation.freedom": 2}),
        (3, T("A team I actually belong to",
              "Pasukan yang saya benar-benar rasa sebahagian daripadanya",
              "Tim yang benar-benar menjadi tempat saya"),
         {"motivation.community": 2, "style.collaboration": 0.5}),
        (4, T("A path where I can keep moving up",
              "Laluan di mana saya boleh terus meningkat",
              "Jalur di mana saya bisa terus naik"),
         {"motivation.achievement": 2, "role.leader": 0.5}),
    ]),
    # E3/E4 are the honest version of "will they be loyal": what someone says
    # would push them out, and what would keep them in. Reported as needs, never
    # as a loyalty score.
    ("E3", T("Which of these would most make you want to leave a company?",
             "Yang mana antara ini paling membuatkan anda mahu meninggalkan sesebuah syarikat?",
             "Mana dari ini yang paling membuat Anda ingin meninggalkan sebuah perusahaan?"), [
        (1, T("Being left without support or training",
              "Dibiarkan tanpa sokongan atau latihan",
              "Dibiarkan tanpa dukungan atau pelatihan"),
         {"demotivator.no_support": 2}),
        (2, T("Effort that is never recognised",
              "Usaha yang tidak pernah diiktiraf",
              "Usaha yang tidak pernah diakui"),
         {"demotivator.no_recognition": 2}),
        (3, T("Not knowing what is expected of me",
              "Tidak tahu apa yang diharapkan daripada saya",
              "Tidak tahu apa yang diharapkan dari saya"),
         {"demotivator.unclear_instructions": 2}),
        (4, T("Ongoing conflict between people",
              "Konflik berterusan antara orang",
              "Konflik yang terus-menerus antar orang"),
         {"demotivator.conflict": 2}),
    ]),
    ("E4", T("Which of these would most make you want to stay somewhere for years?",
             "Yang mana antara ini paling membuatkan anda mahu kekal di sesuatu tempat bertahun-tahun?",
             "Mana dari ini yang paling membuat Anda ingin bertahan di suatu tempat bertahun-tahun?"), [
        (1, T("People I trust around me",
              "Orang yang saya percayai di sekeliling saya",
              "Orang-orang yang saya percayai di sekitar saya"),
         {"motivation.community": 2}),
        (2, T("Someone who keeps developing me",
              "Seseorang yang terus membangunkan saya",
              "Seseorang yang terus mengembangkan saya"),
         {"motivation.learning_mastery": 2, "demotivator.no_support": 0.5}),
        (3, T("Earnings that keep growing",
              "Pendapatan yang terus meningkat",
              "Penghasilan yang terus bertumbuh"),
         {"motivation.financial_growth": 2}),
        (4, T("A clear route to leading my own team",
              "Laluan yang jelas untuk memimpin pasukan saya sendiri",
              "Jalur yang jelas untuk memimpin tim saya sendiri"),
         {"motivation.leadership_influence": 2, "role.leader": 1}),
    ]),
]

DEMOTIVATORS_1 = [
    ("rejection", T("Repeated rejection", "Penolakan berulang kali", "Penolakan berulang")),
    ("unclear_instructions", T("Unclear instructions", "Arahan yang tidak jelas", "Instruksi yang tidak jelas")),
    ("no_recognition", T("Not being recognised", "Tidak diiktiraf", "Tidak diakui")),
    ("working_alone", T("Working alone for long periods", "Bekerja bersendirian untuk tempoh yang lama", "Bekerja sendirian dalam waktu lama")),
    ("no_progress", T("Not seeing visible progress", "Tidak nampak kemajuan", "Tidak melihat kemajuan yang nyata")),
    ("uncertainty", T("Uncertainty about the future", "Ketidakpastian tentang masa depan", "Ketidakpastian tentang masa depan")),
]
DEMOTIVATORS_2 = [
    ("slow_money", T("Slow financial results", "Hasil kewangan yang lambat", "Hasil finansial yang lambat")),
    ("public_pressure", T("Pressure in front of other people", "Tekanan di hadapan orang lain", "Tekanan di depan orang lain")),
    ("criticism", T("Being criticised", "Dikritik", "Dikritik")),
    ("repetitive", T("Repetitive work", "Kerja berulang-ulang", "Pekerjaan yang berulang")),
    ("no_support", T("Lack of support", "Kekurangan sokongan", "Kurangnya dukungan")),
    ("unprepared", T("Feeling unprepared", "Rasa tidak bersedia", "Merasa tidak siap")),
]

# ---------------- F scenarios. Individual contributor only: no team to manage,
# no budget to spend, no listings assumed. Every option is a defensible choice.
SCEN = [
    ("F1", T("You are two months in and have not closed anything yet. What do you actually do next?",
             "Anda sudah dua bulan dan belum menutup sebarang jualan. Apa yang anda buat seterusnya?",
             "Anda sudah dua bulan dan belum menutup satu pun penjualan. Apa yang Anda lakukan selanjutnya?"), [
        (1, T("Go back to basics and increase the number of people I speak to each day",
              "Kembali kepada asas dan tambah bilangan orang yang saya hubungi setiap hari",
              "Kembali ke dasar dan menambah jumlah orang yang saya hubungi setiap hari"),
         {"role.prospector": 2, "success.consistency": 1}),
        (2, T("Ask someone experienced to watch me work and tell me what I am doing wrong",
              "Minta seseorang yang berpengalaman melihat saya bekerja dan beritahu kesilapan saya",
              "Meminta orang berpengalaman mengamati cara saya bekerja dan memberi tahu kesalahan saya"),
         {"success.coachability": 2, "role.coach_trainer": 0.5}),
        (3, T("Study the area and the pricing until I can answer any question about it",
              "Kaji kawasan dan harga sehingga saya boleh jawab apa-apa soalan mengenainya",
              "Mempelajari area dan harga sampai saya bisa menjawab pertanyaan apa pun tentangnya"),
         {"style.detail": 2, "role.presenter": 0.8}),
        (4, T("Build an online presence so people start coming to me",
              "Bina kehadiran dalam talian supaya orang mula datang kepada saya",
              "Membangun kehadiran online agar orang mulai datang kepada saya"),
         {"role.content_creator": 2, "style.visibility": 1}),
    ]),
    ("F2", T("Someone you have shown several properties to suddenly stops replying. What do you do?",
             "Seseorang yang anda telah tunjukkan beberapa hartanah tiba-tiba berhenti membalas. Apa tindakan anda?",
             "Seseorang yang sudah Anda tunjukkan beberapa properti tiba-tiba berhenti membalas. Apa yang Anda lakukan?"), [
        (1, T("Keep in touch lightly and regularly, without pushing",
              "Kekal berhubung secara ringan dan tetap, tanpa mendesak",
              "Tetap berhubungan secara ringan dan teratur, tanpa mendesak"),
         {"role.relationship_builder": 2, "ent.persistence": 1}),
        (2, T("Call once and ask directly what is holding them back",
              "Telefon sekali dan tanya terus apa yang menghalang mereka",
              "Menelepon sekali dan bertanya langsung apa yang menahan mereka"),
         {"role.closer": 2, "style.decision_speed": 1}),
        (3, T("Send them something useful and let them come back on their own",
              "Hantar sesuatu yang berguna dan biar mereka kembali sendiri",
              "Mengirimkan sesuatu yang berguna dan membiarkan mereka kembali sendiri"),
         {"role.content_creator": 1.5, "style.autonomy": 0.5}),
        (4, T("Move my energy to new people and keep this one warm in the background",
              "Alihkan tenaga saya kepada orang baharu dan kekalkan yang ini secara sampingan",
              "Mengalihkan energi ke orang baru dan menjaga yang ini tetap hangat di belakang"),
         {"role.prospector": 2, "success.goal_focus": 0.8}),
    ]),
    ("F3", T("You have three free hours on a weekday and nobody has told you what to do. How do you spend them?",
             "Anda ada tiga jam lapang pada hari bekerja dan tiada siapa beritahu apa nak buat. Bagaimana anda gunakannya?",
             "Anda punya tiga jam kosong di hari kerja dan tidak ada yang menyuruh apa pun. Bagaimana Anda memakainya?"), [
        (1, T("Contact people I have not spoken to in a while",
              "Hubungi orang yang saya sudah lama tidak bercakap dengannya",
              "Menghubungi orang-orang yang sudah lama tidak saya ajak bicara"),
         {"role.prospector": 1.5, "role.relationship_builder": 1}),
        (2, T("Make something to post — photos, a video, a write-up",
              "Buat sesuatu untuk disiarkan — gambar, video atau tulisan",
              "Membuat sesuatu untuk diposting — foto, video, atau tulisan"),
         {"role.content_creator": 2, "style.visibility": 1}),
        (3, T("Learn the product and paperwork properly",
              "Pelajari produk dan dokumentasi dengan betul",
              "Mempelajari produk dan dokumen dengan benar"),
         {"style.detail": 1.5, "role.financing_coordinator": 1}),
        (4, T("Tidy my own records so I know exactly where everything stands",
              "Kemas rekod saya sendiri supaya saya tahu kedudukan setiap perkara",
              "Merapikan catatan saya sendiri agar saya tahu persis posisi setiap hal"),
         {"success.self_management": 2, "style.planning": 1}),
    ]),
    ("F4", T("A buyer you are helping looks likely to be rejected for their loan. What is your instinct?",
             "Seorang pembeli yang anda bantu nampak berkemungkinan ditolak pinjamannya. Apa gerak hati anda?",
             "Seorang pembeli yang Anda bantu tampaknya akan ditolak pinjamannya. Apa naluri Anda?"), [
        (1, T("Work through the numbers and find out exactly what the problem is",
              "Teliti angka dan cari tahu apa sebenarnya masalahnya",
              "Menelusuri angkanya dan mencari tahu persis apa masalahnya"),
         {"role.financing_coordinator": 2, "style.detail": 1}),
        (2, T("Tell them honestly early, even though it may end the deal",
              "Beritahu mereka dengan jujur lebih awal, walaupun ia mungkin menamatkan urusan",
              "Memberi tahu mereka dengan jujur lebih awal, meski itu bisa membatalkan transaksi"),
         {"success.accountability": 2, "role.relationship_builder": 1}),
        (3, T("Look for a different property that fits what they can actually get",
              "Cari hartanah lain yang sesuai dengan apa yang mereka mampu dapat",
              "Mencari properti lain yang sesuai dengan yang benar-benar bisa mereka dapatkan"),
         {"ent.resourcefulness": 2, "role.closer": 0.8}),
        (4, T("Ask someone more experienced before I say anything",
              "Tanya seseorang yang lebih berpengalaman sebelum saya berkata apa-apa",
              "Bertanya kepada orang yang lebih berpengalaman sebelum saya bicara"),
         {"success.coachability": 2}),
    ]),
    ("F5", T("You are asked to present to twenty people you have never met, next week. How do you feel about it?",
             "Anda diminta membentangkan kepada dua puluh orang yang anda tidak pernah temui, minggu depan. Bagaimana perasaan anda?",
             "Anda diminta presentasi di depan dua puluh orang yang belum pernah Anda temui, minggu depan. Bagaimana perasaan Anda?"), [
        (1, T("Good — I am at my best in front of a room",
              "Bagus — saya paling bagus di hadapan orang ramai",
              "Bagus — saya paling maksimal di depan banyak orang"),
         {"role.presenter": 2, "style.visibility": 1}),
        (2, T("Fine, as long as I can prepare properly first",
              "Boleh, asalkan saya boleh bersedia dengan betul dahulu",
              "Tidak masalah, asalkan saya bisa mempersiapkan diri dengan baik dulu"),
         {"style.planning": 2, "role.presenter": 0.8}),
        (3, T("I would rather talk to them one at a time",
              "Saya lebih suka bercakap dengan mereka seorang demi seorang",
              "Saya lebih suka berbicara dengan mereka satu per satu"),
         {"role.relationship_builder": 2, "style.autonomy": 0.5}),
        (4, T("I would do it, but it would cost me a lot of energy",
              "Saya akan lakukannya, tetapi ia memerlukan tenaga yang banyak",
              "Saya akan melakukannya, tetapi itu menguras banyak energi saya"),
         {"success.resilience": 1.5, "demotivator.public_pressure": 1}),
    ]),
    ("F6", T("Someone newer than you asks you to teach them what you have learned. What happens?",
             "Seseorang yang lebih baharu daripada anda minta anda mengajar apa yang anda telah pelajari. Apa yang berlaku?",
             "Seseorang yang lebih baru dari Anda meminta diajari apa yang sudah Anda pelajari. Apa yang terjadi?"), [
        (1, T("I sit with them and walk through it properly",
              "Saya duduk bersama mereka dan terangkan dengan betul",
              "Saya duduk bersama mereka dan menjelaskannya dengan benar"),
         {"role.coach_trainer": 2, "motivation.helping_others": 1}),
        (2, T("I bring them along and let them watch me work",
              "Saya bawa mereka bersama dan biar mereka lihat saya bekerja",
              "Saya mengajak mereka dan membiarkan mereka melihat saya bekerja"),
         {"role.leader": 1.5, "role.coach_trainer": 1}),
        (3, T("I share what I have and get back to my own targets",
              "Saya kongsi apa yang ada dan kembali kepada sasaran saya sendiri",
              "Saya membagikan yang saya punya lalu kembali ke target saya sendiri"),
         {"success.goal_focus": 1.5, "style.autonomy": 1}),
        (4, T("I would want more people like them around me",
              "Saya mahu lebih ramai orang seperti mereka di sekeliling saya",
              "Saya ingin lebih banyak orang seperti mereka di sekitar saya"),
         {"role.recruiter": 2, "motivation.leadership_influence": 1}),
    ]),
]

REFLECT = [
    ("G1", T("Why are you looking at real estate now, at this point in your life?",
             "Mengapa anda melihat bidang hartanah sekarang, pada waktu ini dalam hidup anda?",
             "Mengapa Anda melirik properti sekarang, di titik ini dalam hidup Anda?")),
    ("G2", T("What are you willing to do consistently for the next 12 months to make it work?",
             "Apakah yang anda sanggup lakukan secara konsisten dalam 12 bulan akan datang untuk menjayakannya?",
             "Apa yang bersedia Anda lakukan secara konsisten dalam 12 bulan ke depan agar berhasil?")),
    ("G3", T("What usually causes you to stop, delay, or lose confidence?",
             "Apakah yang biasanya menyebabkan anda berhenti, bertangguh atau hilang keyakinan?",
             "Apa yang biasanya membuat Anda berhenti, menunda, atau kehilangan kepercayaan diri?")),
]

# ============================================================ emitter
VER = "myself-v1"
out = []
w = out.append

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

def j(d):
    return q(json.dumps(d, ensure_ascii=False)) + "::jsonb"

w(f"-- 033_myself_seed.sql — GENERATED by tools/myself_emit.py. Do not hand-edit.")
w(f"-- Public pre-programme bank '{VER}': 41 items in en / ms-MY / id-ID.")
w("-- Same engine, same signal vocabulary as v1 — talent_score() and the worker")
w("-- report need no changes. Re-running replaces this version's content in place.")
w("begin;")
w("")
w(f"insert into talent_versions (code, name) values ({q(VER)}, 'Know Yourself (public, pre-programme)')")
w("  on conflict (code) do nothing;")
w("")
w("delete from talent_options where question_id in (")
w("  select q.id from talent_questions q join talent_sections s on s.id = q.section_id")
w(f"  where s.version_id = (select id from talent_versions where code={q(VER)}));")
w("delete from talent_questions where section_id in (")
w(f"  select id from talent_sections where version_id = (select id from talent_versions where code={q(VER)}));")
w(f"delete from talent_sections where version_id = (select id from talent_versions where code={q(VER)});")
w("")

for i, (code, title, intro) in enumerate(SECTIONS):
    w(f"insert into talent_sections (version_id, code, title, intro, sort_order) values "
      f"((select id from talent_versions where code={q(VER)}), {q(code)}, {j(title)}, {j(intro)}, {i});")
w("")

SEC = ("(select s.id from talent_sections s join talent_versions v on v.id=s.version_id "
       f"where v.code={q(VER)} and s.code=%s)")
QID = ("(select q.id from talent_questions q join talent_sections s on s.id=q.section_id "
       f"join talent_versions v on v.id=s.version_id where v.code={q(VER)} and q.code=%s)")

def add_question(sec, code, kind, stem, dim, reverse, order, helper=None,
                 randomise=False, required=True, max_len=None):
    w(f"insert into talent_questions (section_id, code, kind, stem, helper, dimension, "
      f"reverse_scored, randomise_options, required, max_length, sort_order) values ("
      f"{SEC % q(sec)}, {q(code)}, {q(kind)}, {j(stem)}, "
      f"{j(helper) if helper else 'null'}, {q(dim) if dim else 'null'}, "
      f"{'true' if reverse else 'false'}, {'true' if randomise else 'false'}, "
      f"{'true' if required else 'false'}, {max_len or 'null'}, {order});")

def add_option(qcode, value, label, contributes, order):
    w(f"insert into talent_options (question_id, value, label, contributes, sort_order) values ("
      f"{QID % q(qcode)}, {value}, {j(label)}, {j(contributes)}, {order});")

order_by_sec = {}
for sec, code, kind, stem, scale, contrib, reverse in ITEMS:
    n = order_by_sec.get(sec, 0)
    add_question(sec, code, kind, stem, next(iter(contrib)), reverse, n)
    for idx, (val, lbl) in enumerate(scale):
        # 3 is neutral; a reverse item simply flips the sign. One rule, no cases.
        factor = (val - 3) / 2.0
        if reverse:
            factor = -factor
        add_option(code, val, lbl, {k: round(v * factor, 3) + 0.0 for k, v in contrib.items()}, idx)
    order_by_sec[sec] = n + 1
w("")

for code, stem, opts in CHOICE:
    sec = code[0]
    n = order_by_sec.get(sec, 0)
    dim = "motivation" if sec == "D" else "demotivator"
    add_question(sec, code, "choice", stem, dim, False, n, randomise=True)
    for idx, (val, lbl, contrib) in enumerate(opts):
        add_option(code, val, lbl, contrib, idx)
    order_by_sec[sec] = n + 1
w("")

for code, bank in (("E1", DEMOTIVATORS_1), ("E2", DEMOTIVATORS_2)):
    stem = T("Which of these drains your motivation most? Choose up to three.",
             "Antara berikut, yang mana paling melemahkan motivasi anda? Pilih sehingga tiga.",
             "Mana yang paling menurunkan motivasi Anda? Pilih maksimal tiga.")
    n = order_by_sec.get("E", 0)
    add_question("E", code, "choice", stem, "demotivator", False, n, required=False)
    for idx, (key, lbl) in enumerate(bank):
        add_option(code, idx + 1, lbl, {f"demotivator.{key}": 1}, idx)
    order_by_sec["E"] = n + 1
w("")

for n, (code, stem, opts) in enumerate(SCEN):
    add_question("F", code, "scenario", stem, "role", False, n, randomise=True)
    for idx, (val, lbl, contrib) in enumerate(opts):
        add_option(code, val, lbl, contrib, idx)
w("")

for n, (code, stem) in enumerate(REFLECT):
    add_question("G", code, "text", stem, "reflection", False, n, required=False, max_len=1500)
w("")

# Permanent open event. No max_participants and no expiry: this is a standing
# public link, not a cohort sitting.
w("insert into talent_events (code, name, version_id, country_scope, languages, status, "
  "retention_days, timezone) values ('MYSELF', 'Know Yourself (public)', "
  f"(select id from talent_versions where code={q(VER)}), 'MIXED', "
  "array['en','ms-MY','id-ID'], 'active', 365, 'Asia/Kuala_Lumpur')")
w("  on conflict (code) do nothing;")
w("")
w("commit;")
w("")
w("select 'myself sections' as check, count(*)::text from talent_sections s")
w(f"  join talent_versions v on v.id=s.version_id where v.code={q(VER)}")
w("union all select 'myself questions', count(*)::text from talent_questions q")
w("  join talent_sections s on s.id=q.section_id join talent_versions v on v.id=s.version_id")
w(f"  where v.code={q(VER)}")
w("union all select 'myself options', count(*)::text from talent_options o")
w("  join talent_questions q on q.id=o.question_id join talent_sections s on s.id=q.section_id")
f_ver = q(VER)
w(f"  join talent_versions v on v.id=s.version_id where v.code={f_ver}")
w("union all select 'myself event', count(*)::text from talent_events where code='MYSELF';")

# Explicit UTF-8: redirecting stdout on Windows uses the console codepage and
# silently corrupts non-ASCII, which previously broke a migration mid-string.
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "..", "supabase", "migrations", "033_myself_seed.sql")
with open(DEST, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(out) + "\n")
print(f"wrote {os.path.abspath(DEST)}  ({len(out)} statements)")
