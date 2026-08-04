"""Section E — the 12 real-estate scenarios supplied by Kamal, translated.

Individual-contributor framing throughout: no option casts the participant as a
team leader, manager or supervisor. Every option is a credible way to contribute.
"""
from talent_seed import T

R = "role."

SCEN = [
 ("E1", T("You receive a new lead from an online advertisement. The person replies only: “Send price.” What would you naturally do next?",
          "Anda menerima lead baharu daripada iklan dalam talian. Orang itu hanya membalas: “Hantar harga.” Apakah yang anda akan buat seterusnya?",
          "Anda menerima lead baru dari iklan online. Orang tersebut hanya membalas: “Kirim harga.” Apa yang secara alami Anda lakukan berikutnya?"), [
  (1, T("Ask two or three simple questions to understand their needs before recommending anything.",
        "Tanya dua tiga soalan mudah untuk memahami keperluan mereka sebelum mengesyorkan apa-apa.",
        "Ajukan dua tiga pertanyaan sederhana untuk memahami kebutuhan mereka sebelum merekomendasikan apa pun."), {R + "relationship_builder": 3}),
  (2, T("Send a clear project summary, price range and key value points.",
        "Hantar ringkasan projek, julat harga dan nilai utama dengan jelas.",
        "Kirim ringkasan proyek, kisaran harga, dan poin nilai utama dengan jelas."), {R + "presenter": 3}),
  (3, T("Call or message quickly and guide the person toward an appointment.",
        "Telefon atau mesej dengan cepat dan bawa mereka ke arah temu janji.",
        "Telepon atau kirim pesan dengan cepat dan arahkan mereka ke janji temu."), {R + "prospector": 3}),
  (4, T("Create a short video or visual that answers the questions buyers usually ask.",
        "Cipta video pendek atau visual yang menjawab soalan biasa pembeli.",
        "Buat video pendek atau visual yang menjawab pertanyaan yang biasa ditanyakan pembeli."), {R + "content_creator": 3})]),

 ("E2", T("A buyer likes the project but says, “The price is too high.” What would you naturally do first?",
          "Pembeli suka projek itu tetapi berkata, “Harganya terlalu tinggi.” Apakah yang anda akan buat dahulu?",
          "Pembeli menyukai proyeknya tetapi berkata, “Harganya terlalu tinggi.” Apa yang pertama Anda lakukan?"), [
  (1, T("Ask what they are comparing it with and understand their real concern.",
        "Tanya mereka membandingkan dengan apa dan fahami kebimbangan sebenar.",
        "Tanyakan mereka membandingkan dengan apa dan pahami kekhawatiran sebenarnya."), {R + "relationship_builder": 3}),
  (2, T("Explain the value, location, benefits and differences clearly.",
        "Terangkan nilai, lokasi, manfaat dan perbezaannya dengan jelas.",
        "Jelaskan nilai, lokasi, manfaat, dan perbedaannya dengan jelas."), {R + "presenter": 3}),
  (3, T("Explore whether another unit, package or option could help them decide.",
        "Terokai sama ada unit, pakej atau pilihan lain boleh membantu mereka membuat keputusan.",
        "Jajaki apakah unit, paket, atau opsi lain bisa membantu mereka memutuskan."), {R + "closer": 3}),
  (4, T("Check whether the concern is about financing ability and coordinate with an authorised financing specialist.",
        "Semak sama ada kebimbangan itu berkaitan kemampuan pembiayaan dan berhubung dengan pakar pembiayaan yang diiktiraf.",
        "Periksa apakah kekhawatirannya soal kemampuan pembiayaan dan koordinasikan dengan spesialis pembiayaan resmi."), {R + "financing_coordinator": 3})]),

 ("E3", T("You begin the day with no new leads and no appointments. What would you naturally prefer to do?",
          "Anda memulakan hari tanpa lead baharu dan tanpa temu janji. Apakah yang anda lebih suka lakukan?",
          "Anda memulai hari tanpa lead baru dan tanpa janji temu. Apa yang lebih suka Anda lakukan?"), [
  (1, T("Contact people in your existing network and start new conversations.",
        "Hubungi orang dalam rangkaian sedia ada dan mulakan perbualan baharu.",
        "Hubungi orang dalam jaringan Anda dan mulai percakapan baru."), {R + "prospector": 3}),
  (2, T("Follow up with older leads who previously showed interest.",
        "Susuli lead lama yang pernah menunjukkan minat.",
        "Tindak lanjuti lead lama yang sebelumnya menunjukkan minat."), {R + "relationship_builder": 3}),
  (3, T("Produce useful content designed to attract future enquiries.",
        "Hasilkan kandungan berguna untuk menarik pertanyaan pada masa hadapan.",
        "Buat konten bermanfaat untuk menarik pertanyaan di masa depan."), {R + "content_creator": 3}),
  (4, T("Review a small advertising campaign and test a new audience or message.",
        "Semak kempen iklan kecil dan uji audiens atau mesej baharu.",
        "Tinjau kampanye iklan kecil dan uji audiens atau pesan baru."), {R + "advertiser": 3})]),

 ("E4", T("You are given the chance to promote a new property project online. Which would you most enjoy doing personally?",
          "Anda diberi peluang mempromosikan projek hartanah baharu dalam talian. Yang mana paling anda nikmati lakukan sendiri?",
          "Anda diberi kesempatan mempromosikan proyek properti baru secara online. Mana yang paling Anda nikmati lakukan sendiri?"), [
  (1, T("Write a useful post or create a short educational video.",
        "Tulis pos yang berguna atau cipta video pendidikan pendek.",
        "Tulis postingan bermanfaat atau buat video edukasi pendek."), {R + "content_creator": 3}),
  (2, T("Run a live session and answer questions from viewers.",
        "Adakan sesi langsung dan jawab soalan penonton.",
        "Adakan sesi live dan jawab pertanyaan penonton."), {R + "live_host": 3}),
  (3, T("Prepare a structured explanation of the project and the buying process.",
        "Sediakan penerangan tersusun tentang projek dan proses pembelian.",
        "Siapkan penjelasan terstruktur tentang proyek dan proses pembelian."), {R + "presenter": 3}),
  (4, T("Design and test an advertising message for a specific audience.",
        "Reka dan uji mesej iklan untuk audiens tertentu.",
        "Rancang dan uji pesan iklan untuk audiens tertentu."), {R + "advertiser": 3})]),

 ("E5", T("A buyer has shown strong interest but has postponed the next step several times. What would you naturally do?",
          "Pembeli menunjukkan minat kuat tetapi menangguhkan langkah seterusnya beberapa kali. Apakah yang anda akan buat?",
          "Pembeli menunjukkan minat kuat tetapi menunda langkah berikutnya beberapa kali. Apa yang Anda lakukan?"), [
  (1, T("Have a personal conversation to understand what is holding them back.",
        "Berbual secara peribadi untuk memahami apa yang menghalang mereka.",
        "Lakukan percakapan pribadi untuk memahami apa yang menahan mereka."), {R + "relationship_builder": 3}),
  (2, T("Summarise their needs, the available solution and the next step clearly.",
        "Ringkaskan keperluan mereka, penyelesaian yang ada dan langkah seterusnya dengan jelas.",
        "Rangkum kebutuhan mereka, solusi yang tersedia, dan langkah berikutnya dengan jelas."), {R + "presenter": 3}),
  (3, T("Respectfully ask for a specific decision or an agreed action date.",
        "Dengan hormat, minta keputusan khusus atau tarikh tindakan yang dipersetujui.",
        "Dengan sopan, minta keputusan spesifik atau tanggal tindakan yang disepakati."), {R + "closer": 3}),
  (4, T("Check whether documentation or financing uncertainty is causing the delay.",
        "Semak sama ada ketidakpastian dokumen atau pembiayaan menyebabkan kelewatan.",
        "Periksa apakah ketidakpastian dokumen atau pembiayaan menyebabkan penundaan."), {R + "financing_coordinator": 3})]),

 ("E6", T("You have some spare personal money that is not needed for household essentials, and you are considering putting part of it into an approved team advertising campaign. What would you naturally do?",
          "Anda mempunyai lebihan wang peribadi yang tidak diperlukan untuk keperluan asas rumah tangga, dan sedang mempertimbangkan menyalurkan sebahagiannya ke kempen iklan pasukan yang diluluskan. Apakah yang anda akan buat?",
          "Anda memiliki sisa uang pribadi yang tidak dibutuhkan untuk kebutuhan pokok rumah tangga, dan sedang mempertimbangkan menaruh sebagian ke kampanye iklan tim yang disetujui. Apa yang Anda lakukan?"), [
  (1, T("Request the campaign plan, budget limit, reporting method and lead-distribution agreement before deciding.",
        "Minta pelan kempen, had bajet, kaedah pelaporan dan persetujuan pengagihan lead sebelum memutuskan.",
        "Minta rencana kampanye, batas anggaran, metode pelaporan, dan kesepakatan distribusi lead sebelum memutuskan."), {R + "team_growth_funder": 3}),
  (2, T("Start with a small controlled amount and review the lead quality before increasing it.",
        "Mula dengan jumlah kecil yang terkawal dan nilai kualiti lead sebelum menambah.",
        "Mulai dengan jumlah kecil yang terkendali dan tinjau kualitas lead sebelum menambah."), {R + "team_growth_funder": 3, "ent.calculated_risk": 1}),
  (3, T("Prefer to manage and optimise the campaign rather than fund it.",
        "Lebih suka mengurus dan mengoptimumkan kempen berbanding membiayainya.",
        "Lebih suka mengelola dan mengoptimalkan kampanye daripada mendanainya."), {R + "advertiser": 3}),
  (4, T("Prefer to work the leads produced instead of managing or funding the advertising.",
        "Lebih suka mengusahakan lead yang terhasil berbanding mengurus atau membiayai iklan.",
        "Lebih suka menggarap lead yang dihasilkan daripada mengelola atau mendanai iklan."), {R + "prospector": 3})]),

 ("E7", T("A potential buyer likes the property but is worried their loan may not be approved. What would you naturally do?",
          "Bakal pembeli suka hartanah itu tetapi bimbang pinjaman mereka mungkin tidak diluluskan. Apakah yang anda akan buat?",
          "Calon pembeli menyukai propertinya tetapi khawatir pinjamannya tidak disetujui. Apa yang Anda lakukan?"), [
  (1, T("Listen carefully and understand their main financial concern.",
        "Dengar dengan teliti dan fahami kebimbangan kewangan utama mereka.",
        "Dengarkan dengan saksama dan pahami kekhawatiran finansial utama mereka."), {R + "relationship_builder": 3}),
  (2, T("Explain the general buying process without making promises.",
        "Terangkan proses pembelian secara umum tanpa membuat janji.",
        "Jelaskan proses pembelian secara umum tanpa membuat janji."), {R + "presenter": 3}),
  (3, T("Gather the appropriate basic information and connect them with an authorised financing specialist.",
        "Kumpulkan maklumat asas yang sesuai dan hubungkan mereka dengan pakar pembiayaan yang diiktiraf.",
        "Kumpulkan informasi dasar yang sesuai dan hubungkan mereka dengan spesialis pembiayaan resmi."), {R + "financing_coordinator": 3}),
  (4, T("Keep the buyer engaged while coordinating the next responsible step.",
        "Kekalkan hubungan dengan pembeli sambil menyelaras langkah seterusnya yang bertanggungjawab.",
        "Jaga keterlibatan pembeli sambil mengoordinasikan langkah berikutnya yang bertanggung jawab."), {R + "closer": 3})]),

 ("E8", T("A customer is satisfied after completing a property transaction. What would you naturally do next?",
          "Pelanggan berpuas hati selepas melengkapkan transaksi hartanah. Apakah yang anda akan buat seterusnya?",
          "Pelanggan puas setelah menyelesaikan transaksi properti. Apa yang Anda lakukan berikutnya?"), [
  (1, T("Maintain the relationship and check on their experience.",
        "Kekalkan hubungan dan tanya khabar tentang pengalaman mereka.",
        "Jaga hubungan dan tanyakan bagaimana pengalaman mereka."), {R + "relationship_builder": 3}),
  (2, T("Respectfully ask whether they know anyone else who may need similar help.",
        "Dengan hormat, tanya sama ada mereka kenal orang lain yang mungkin perlukan bantuan serupa.",
        "Dengan sopan, tanyakan apakah mereka kenal orang lain yang mungkin butuh bantuan serupa."), {R + "prospector": 3}),
  (3, T("Invite them to share their experience as an approved testimonial or story.",
        "Jemput mereka berkongsi pengalaman sebagai testimoni atau cerita yang diluluskan.",
        "Ajak mereka membagikan pengalaman sebagai testimoni atau cerita yang disetujui."), {R + "content_creator": 3}),
  (4, T("Ask whether they know someone who might suit a career in real estate.",
        "Tanya sama ada mereka kenal seseorang yang mungkin sesuai untuk kerjaya hartanah.",
        "Tanyakan apakah mereka kenal seseorang yang mungkin cocok berkarier di properti."), {R + "recruiter": 3})]),

 ("E9", T("A friend says they are interested in joining real estate but are unsure whether it suits them. What would you naturally do?",
          "Seorang kawan berkata dia berminat menyertai bidang hartanah tetapi tidak pasti sama ada ia sesuai untuknya. Apakah yang anda akan buat?",
          "Seorang teman mengatakan tertarik masuk ke properti tetapi ragu apakah cocok untuknya. Apa yang Anda lakukan?"), [
  (1, T("Ask about their goals, strengths and reasons for considering it.",
        "Tanya tentang matlamat, kekuatan dan sebab mereka mempertimbangkannya.",
        "Tanyakan tujuan, kekuatan, dan alasan mereka mempertimbangkannya."), {R + "recruiter": 3}),
  (2, T("Explain honestly what the work involves, including its challenges.",
        "Terangkan dengan jujur apa yang terlibat dalam kerja ini, termasuk cabarannya.",
        "Jelaskan dengan jujur apa saja pekerjaannya, termasuk tantangannya."), {R + "presenter": 3}),
  (3, T("Invite them to observe an activity or attend an introductory session.",
        "Jemput mereka menyaksikan aktiviti atau menghadiri sesi pengenalan.",
        "Ajak mereka mengamati kegiatan atau menghadiri sesi pengenalan."), {R + "recruiter": 2, R + "prospector": 1}),
  (4, T("Offer to teach them one basic skill so they can test their interest.",
        "Tawar untuk mengajar satu kemahiran asas supaya mereka boleh menguji minat.",
        "Tawarkan mengajari satu keterampilan dasar agar mereka bisa menguji minatnya."), {R + "coach_trainer": 3})]),

 ("E10", T("You have learned about a project with many details, packages and buyer conditions. How would you naturally prepare to explain it?",
           "Anda telah mempelajari projek dengan banyak butiran, pakej dan syarat pembeli. Bagaimana anda akan bersedia untuk menerangkannya?",
           "Anda telah mempelajari proyek dengan banyak detail, paket, dan syarat pembeli. Bagaimana Anda menyiapkan penjelasannya?"), [
  (1, T("Turn the information into a simple visual, post or short video.",
        "Ubah maklumat itu kepada visual mudah, pos atau video pendek.",
        "Ubah informasinya menjadi visual sederhana, postingan, atau video pendek."), {R + "content_creator": 3}),
  (2, T("Practise explaining it aloud as though speaking in a live session.",
        "Berlatih menerangkannya dengan kuat seolah-olah bercakap dalam sesi langsung.",
        "Latih menjelaskannya dengan suara keras seolah sedang sesi live."), {R + "live_host": 3}),
  (3, T("Arrange the information into a clear step-by-step presentation.",
        "Susun maklumat itu menjadi pembentangan langkah demi langkah yang jelas.",
        "Susun informasinya menjadi presentasi langkah demi langkah yang jelas."), {R + "presenter": 3}),
  (4, T("Focus on the questions needed to match the right information to each buyer.",
        "Fokus pada soalan yang perlu untuk memadankan maklumat yang betul dengan setiap pembeli.",
        "Fokus pada pertanyaan yang diperlukan untuk mencocokkan informasi yang tepat bagi tiap pembeli."), {R + "relationship_builder": 3})]),

 ("E11", T("A lead says the first project you recommended does not suit them. What would you naturally do?",
           "Lead berkata projek pertama yang anda syorkan tidak sesuai untuk mereka. Apakah yang anda akan buat?",
           "Sebuah lead mengatakan proyek pertama yang Anda rekomendasikan tidak cocok. Apa yang Anda lakukan?"), [
  (1, T("Ask more questions and understand what did not match.",
        "Tanya lebih lanjut dan fahami apa yang tidak sepadan.",
        "Ajukan lebih banyak pertanyaan dan pahami apa yang tidak cocok."), {R + "relationship_builder": 3}),
  (2, T("Search for a more suitable option based on the new information.",
        "Cari pilihan yang lebih sesuai berdasarkan maklumat baharu itu.",
        "Cari opsi yang lebih sesuai berdasarkan informasi baru itu."), {R + "presenter": 3}),
  (3, T("Continue the conversation and secure agreement on the next action.",
        "Teruskan perbualan dan dapatkan persetujuan untuk tindakan seterusnya.",
        "Lanjutkan percakapan dan dapatkan kesepakatan untuk tindakan berikutnya."), {R + "closer": 3}),
  (4, T("Place the lead into a structured future follow-up plan.",
        "Letakkan lead itu dalam pelan susulan berstruktur untuk masa hadapan.",
        "Masukkan lead itu ke dalam rencana tindak lanjut terstruktur."), {R + "prospector": 2, R + "relationship_builder": 1})]),

 ("E12", T("You have only 20 minutes to prepare before meeting a potential buyer. What would you focus on first?",
           "Anda hanya ada 20 minit untuk bersedia sebelum bertemu bakal pembeli. Apakah tumpuan pertama anda?",
           "Anda hanya punya 20 menit untuk bersiap sebelum bertemu calon pembeli. Apa fokus pertama Anda?"), [
  (1, T("Review the buyer's needs and your previous conversation.",
        "Semak keperluan pembeli dan perbualan anda sebelum ini.",
        "Tinjau kebutuhan pembeli dan percakapan Anda sebelumnya."), {R + "relationship_builder": 3}),
  (2, T("Select the most relevant project facts and supporting materials.",
        "Pilih fakta projek dan bahan sokongan yang paling relevan.",
        "Pilih fakta proyek dan materi pendukung yang paling relevan."), {R + "presenter": 3}),
  (3, T("Prepare your questions and a clear desired next step.",
        "Sediakan soalan anda dan langkah seterusnya yang jelas.",
        "Siapkan pertanyaan Anda dan langkah berikutnya yang jelas."), {R + "closer": 3}),
  (4, T("Confirm any financing-process information that may need an authorised specialist.",
        "Sahkan maklumat proses pembiayaan yang mungkin memerlukan pakar yang diiktiraf.",
        "Konfirmasi informasi proses pembiayaan yang mungkin perlu spesialis resmi."), {R + "financing_coordinator": 3})]),
]

# Mandatory on-screen note for E6 (spec §8) — must not imply guaranteed returns.
E6_NOTE = T(
    "Note: funding a campaign does not guarantee sales or financial returns. Never use essential "
    "household funds or borrowed money. Agree the budget, campaign ownership, reporting and lead "
    "distribution before funding anything.",
    "Nota: membiayai kempen tidak menjamin jualan atau pulangan kewangan. Jangan sekali-kali gunakan "
    "wang keperluan asas rumah tangga atau wang pinjaman. Persetujui bajet, pemilikan kempen, "
    "pelaporan dan pengagihan lead sebelum membiayai apa-apa.",
    "Catatan: mendanai kampanye tidak menjamin penjualan atau hasil finansial. Jangan pernah "
    "menggunakan dana kebutuhan pokok rumah tangga atau uang pinjaman. Sepakati anggaran, "
    "kepemilikan kampanye, pelaporan, dan distribusi lead sebelum mendanai apa pun.")
