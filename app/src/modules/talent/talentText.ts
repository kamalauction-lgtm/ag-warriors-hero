/* Participant-facing text for Hero Talent Compass, in the three required
   languages. The disclaimer is the approved wording from spec §14 and must not
   be paraphrased — by AI or by anyone editing this file casually. */

export type TLang = 'en' | 'ms-MY' | 'id-ID'

interface Text {
  welcome: string; welcomeBody: string; eventCode: string; start: string; timeNote: string
  aboutYou: string; fullName: string; preferredName: string; contact: string; country: string
  experience: string; leadership: string; expBands: string[]; leadBands: string[]
  consentTitle: string; disclaimer: string
  ack1: string; ack2: string; ack3: string; ack4: string; allAcksNeeded: string
  sharingTitle: string; sharePrivate: string; shareSummary: string; shareFull: string
  begin: string; back: string; next: string; optional: string; yourAnswer: string
  about: string; minutesLeft: string; reviewAnswers: string; reviewTitle: string
  answered: string; stillMissing: string; submit: string; scoring: string; keepEditing: string
  thanks: string; reportComing: string
}

export const TL: Record<TLang, Text> = {
  en: {
    welcome: 'Discover how you naturally work',
    welcomeBody: 'A short, private self-discovery tool. There are no right or wrong answers, and no pass or fail.',
    eventCode: 'Event code',
    start: 'Start',
    timeNote: 'About 25 minutes. Your progress saves automatically, so you can close this and come back.',
    aboutYou: 'About you',
    fullName: 'Full name', preferredName: 'Preferred name', contact: 'Mobile or email',
    country: 'Country', experience: 'Real-estate experience', leadership: 'Leadership responsibility',
    expBands: ['Not yet started', 'Under 1 year', '1–3 years', '3+ years'],
    leadBands: ['None', 'Informal mentor', 'Leads a small team', 'Leads leaders'],
    consentTitle: 'Before you begin',
    disclaimer:
      'Hero Talent Compass is an AI-assisted self-discovery and role-exploration tool. It is based on your responses, self-reported confidence and situational choices. It is not a clinical, medical or diagnostic psychological assessment, and is not a validated psychometric instrument. Results are for personal development and coaching. They do not guarantee performance, employment suitability, licensing, income, sales results, advertising returns or leadership appointment. Role suggestions are areas to explore, not permanent labels — capabilities change with experience, training and practice. AI assists with interpretation only; decisions about employment, leadership, coaching, financing or professional authority are made by authorised people.',
    ack1: 'I understand this is a developmental tool, not a test I can pass or fail.',
    ack2: 'I understand this is not a clinical or diagnostic psychological assessment.',
    ack3: 'I understand the results come from my own answers and may change over time.',
    ack4: 'I accept how my responses will be stored and used, including that the written parts are processed by an AI service to prepare my report.',
    allAcksNeeded: 'Please tick all four to continue.',
    sharingTitle: 'Who may see your results?',
    sharePrivate: 'Private to me — the facilitator sees only that I finished, plus anonymous group totals.',
    shareSummary: 'Share the summary — the facilitator may read my summary.',
    shareFull: 'Share the full report — the facilitator may read my complete report.',
    begin: 'Begin the assessment',
    back: 'Back', next: 'Next', optional: 'This one is optional.',
    yourAnswer: 'Your answer…',
    about: 'about', minutesLeft: 'min left',
    reviewAnswers: 'Review my answers',
    reviewTitle: 'Ready to submit?',
    answered: 'answered', stillMissing: 'still to answer',
    submit: 'Submit and see my profile', scoring: 'Preparing your profile…',
    keepEditing: 'Go back and change something',
    thanks: 'Thank you — that is complete',
    reportComing: 'Your profile is being prepared. Your facilitator will guide you through it.',
  },

  'ms-MY': {
    welcome: 'Kenali cara semula jadi anda bekerja',
    welcomeBody: 'Alat penemuan diri yang ringkas dan peribadi. Tiada jawapan betul atau salah, dan tiada lulus atau gagal.',
    eventCode: 'Kod acara',
    start: 'Mula',
    timeNote: 'Lebih kurang 25 minit. Kemajuan anda disimpan secara automatik, jadi anda boleh tutup dan kembali semula.',
    aboutYou: 'Tentang anda',
    fullName: 'Nama penuh', preferredName: 'Nama panggilan', contact: 'Telefon atau e-mel',
    country: 'Negara', experience: 'Pengalaman hartanah', leadership: 'Tanggungjawab kepimpinan',
    expBands: ['Belum bermula', 'Kurang 1 tahun', '1–3 tahun', 'Lebih 3 tahun'],
    leadBands: ['Tiada', 'Mentor tidak formal', 'Mengetuai pasukan kecil', 'Mengetuai pemimpin'],
    consentTitle: 'Sebelum anda mula',
    disclaimer:
      'Hero Talent Compass ialah alat penemuan diri dan penerokaan peranan berbantukan AI. Ia berdasarkan jawapan anda, keyakinan yang anda laporkan sendiri dan pilihan dalam situasi tertentu. Ia bukan penilaian psikologi klinikal, perubatan atau diagnostik, dan bukan instrumen psikometrik yang disahkan. Keputusan adalah untuk pembangunan diri dan coaching. Ia tidak menjamin prestasi, kesesuaian pekerjaan, pelesenan, pendapatan, hasil jualan, pulangan pengiklanan atau pelantikan kepimpinan. Cadangan peranan ialah bidang untuk diterokai, bukan label kekal — keupayaan berubah melalui pengalaman, latihan dan amalan. AI hanya membantu tafsiran; keputusan tentang pekerjaan, kepimpinan, coaching, pembiayaan atau kuasa profesional dibuat oleh orang yang diberi kuasa.',
    ack1: 'Saya faham ini alat pembangunan diri, bukan ujian yang boleh lulus atau gagal.',
    ack2: 'Saya faham ini bukan penilaian psikologi klinikal atau diagnostik.',
    ack3: 'Saya faham keputusan datang daripada jawapan saya sendiri dan boleh berubah.',
    ack4: 'Saya menerima cara jawapan saya disimpan dan digunakan, termasuk bahagian bertulis diproses oleh perkhidmatan AI untuk menyediakan laporan saya.',
    allAcksNeeded: 'Sila tandakan keempat-empatnya untuk teruskan.',
    sharingTitle: 'Siapa boleh lihat keputusan anda?',
    sharePrivate: 'Peribadi untuk saya — fasilitator hanya tahu saya telah selesai, serta jumlah kumpulan tanpa nama.',
    shareSummary: 'Kongsi ringkasan — fasilitator boleh membaca ringkasan saya.',
    shareFull: 'Kongsi laporan penuh — fasilitator boleh membaca laporan lengkap saya.',
    begin: 'Mula penilaian',
    back: 'Kembali', next: 'Seterusnya', optional: 'Yang ini pilihan sahaja.',
    yourAnswer: 'Jawapan anda…',
    about: 'lebih kurang', minutesLeft: 'minit lagi',
    reviewAnswers: 'Semak jawapan saya',
    reviewTitle: 'Sedia untuk hantar?',
    answered: 'dijawab', stillMissing: 'belum dijawab',
    submit: 'Hantar dan lihat profil saya', scoring: 'Menyediakan profil anda…',
    keepEditing: 'Kembali dan ubah sesuatu',
    thanks: 'Terima kasih — sudah selesai',
    reportComing: 'Profil anda sedang disediakan. Fasilitator anda akan membimbing anda melaluinya.',
  },

  'id-ID': {
    welcome: 'Kenali cara alami Anda bekerja',
    welcomeBody: 'Alat penemuan diri yang singkat dan pribadi. Tidak ada jawaban benar atau salah, dan tidak ada lulus atau gagal.',
    eventCode: 'Kode acara',
    start: 'Mulai',
    timeNote: 'Sekitar 25 menit. Kemajuan Anda tersimpan otomatis, jadi Anda bisa menutupnya dan kembali lagi.',
    aboutYou: 'Tentang Anda',
    fullName: 'Nama lengkap', preferredName: 'Nama panggilan', contact: 'Telepon atau email',
    country: 'Negara', experience: 'Pengalaman properti', leadership: 'Tanggung jawab kepemimpinan',
    expBands: ['Belum mulai', 'Kurang dari 1 tahun', '1–3 tahun', 'Lebih dari 3 tahun'],
    leadBands: ['Tidak ada', 'Mentor informal', 'Memimpin tim kecil', 'Memimpin para pemimpin'],
    consentTitle: 'Sebelum Anda mulai',
    disclaimer:
      'Hero Talent Compass adalah alat penemuan diri dan eksplorasi peran berbantuan AI. Alat ini didasarkan pada jawaban Anda, keyakinan yang Anda laporkan sendiri, dan pilihan dalam situasi tertentu. Ini bukan asesmen psikologi klinis, medis, atau diagnostik, dan bukan instrumen psikometri tervalidasi. Hasilnya untuk pengembangan diri dan coaching. Hasil ini tidak menjamin kinerja, kesesuaian pekerjaan, lisensi, penghasilan, hasil penjualan, hasil iklan, atau pengangkatan kepemimpinan. Saran peran adalah area untuk dijajaki, bukan label permanen — kemampuan berubah melalui pengalaman, pelatihan, dan praktik. AI hanya membantu interpretasi; keputusan tentang pekerjaan, kepemimpinan, coaching, pembiayaan, atau kewenangan profesional dibuat oleh pihak yang berwenang.',
    ack1: 'Saya paham ini alat pengembangan diri, bukan tes yang bisa lulus atau gagal.',
    ack2: 'Saya paham ini bukan asesmen psikologi klinis atau diagnostik.',
    ack3: 'Saya paham hasilnya berasal dari jawaban saya sendiri dan bisa berubah.',
    ack4: 'Saya menerima cara jawaban saya disimpan dan digunakan, termasuk bagian tertulis diproses oleh layanan AI untuk menyiapkan laporan saya.',
    allAcksNeeded: 'Silakan centang keempatnya untuk melanjutkan.',
    sharingTitle: 'Siapa yang boleh melihat hasil Anda?',
    sharePrivate: 'Pribadi untuk saya — fasilitator hanya tahu saya sudah selesai, serta total kelompok tanpa nama.',
    shareSummary: 'Bagikan ringkasan — fasilitator boleh membaca ringkasan saya.',
    shareFull: 'Bagikan laporan lengkap — fasilitator boleh membaca laporan saya sepenuhnya.',
    begin: 'Mulai asesmen',
    back: 'Kembali', next: 'Berikutnya', optional: 'Yang ini opsional.',
    yourAnswer: 'Jawaban Anda…',
    about: 'sekitar', minutesLeft: 'menit lagi',
    reviewAnswers: 'Tinjau jawaban saya',
    reviewTitle: 'Siap mengirim?',
    answered: 'dijawab', stillMissing: 'belum dijawab',
    submit: 'Kirim dan lihat profil saya', scoring: 'Menyiapkan profil Anda…',
    keepEditing: 'Kembali dan ubah sesuatu',
    thanks: 'Terima kasih — sudah selesai',
    reportComing: 'Profil Anda sedang disiapkan. Fasilitator Anda akan memandu Anda.',
  },
}
