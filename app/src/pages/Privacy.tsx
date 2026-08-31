/* /privacy — public privacy policy, required for the Play Store listing and
   good practice regardless. Static, trilingual (EN + BM + ID), no login needed. */
import { useBrand } from '../lib/brand'

const S = ({ en, bm, id }: { en: string; bm: string; id: string }) => (
  <div className="mb-4">
    <p className="text-[13px] leading-relaxed">{en}</p>
    <p className="mt-1 text-[12px] leading-relaxed text-muted">{bm}</p>
    <p className="mt-1 text-[12px] leading-relaxed text-muted">{id}</p>
  </div>
)

export default function Privacy() {
  const shield = useBrand('GLOBAL', 'shield')
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 text-center">
        <img src={shield ?? '/brand/ag-shield.png'} alt="AG" className="mx-auto mb-3 h-14 w-14 object-contain" />
        <h1 className="font-display text-2xl font-extrabold">Privacy Policy</h1>
        <p className="mt-1 text-xs text-muted">IQI AG Warriors (Hero) · hero.iqiaggroup.com · Last updated: 10 August 2026</p>
      </div>

      <h2 className="mb-2 font-display text-base font-extrabold text-accent">Who we are · Siapa kami</h2>
      <S en="IQI AG Hero is an internal productivity and development application for real-estate agents of the IQI AG Group (Malaysia and Indonesia). It is operated by the AG Group leadership team."
         bm="IQI AG Hero ialah aplikasi produktiviti dan pembangunan dalaman untuk ejen hartanah IQI AG Group (Malaysia dan Indonesia), dikendalikan oleh pasukan kepimpinan AG Group."
         id="IQI AG Hero adalah aplikasi produktivitas dan pengembangan internal untuk agen properti IQI AG Group (Malaysia dan Indonesia), dioperasikan oleh tim kepemimpinan AG Group." />

      <h2 className="mb-2 font-display text-base font-extrabold text-accent">What we collect · Apa yang kami kumpul · Apa yang kami kumpulkan</h2>
      <S en="Account details (name, email, phone, country, role); work activity you record in the app (call outcomes, leads you handle, daily plans, sales pipeline entries, learning progress, booth signups); self-assessment responses you choose to complete (Talent Compass, learning diagnostics); and messages you send within the app."
         bm="Butiran akaun (nama, emel, telefon, negara, peranan); aktiviti kerja yang anda rekod dalam aplikasi (hasil panggilan, lead yang anda uruskan, rancangan harian, pipeline jualan, kemajuan pembelajaran, pendaftaran booth); jawapan penilaian kendiri yang anda pilih untuk lengkapkan (Talent Compass, diagnostik pembelajaran); dan mesej yang anda hantar dalam aplikasi."
         id="Detail akun (nama, email, telepon, negara, peran); aktivitas kerja yang Anda catat di aplikasi (hasil panggilan, lead yang Anda tangani, rencana harian, entri pipeline penjualan, kemajuan pembelajaran, pendaftaran booth); jawaban penilaian mandiri yang Anda pilih untuk diisi (Talent Compass, diagnostik pembelajaran); dan pesan yang Anda kirim di dalam aplikasi." />

      <h2 className="mb-2 font-display text-base font-extrabold text-accent">How we use it · Bagaimana kami gunakannya · Bagaimana kami menggunakannya</h2>
      <S en="To run the app's features: lead distribution, activity tracking, personalised learning recommendations, AI coaching briefs, and team visibility for your assigned Coach and leadership. Assessment results are used for your development only — never as a hiring test, psychological diagnosis or permanent label. AI features explain and suggest; scores and records are never altered by AI."
         bm="Untuk menjalankan fungsi aplikasi: pengagihan lead, penjejakan aktiviti, cadangan pembelajaran diperibadikan, brief bimbingan AI, dan keterlihatan pasukan untuk Coach dan kepimpinan anda. Keputusan penilaian digunakan untuk pembangunan anda sahaja — bukan ujian pengambilan, diagnosis psikologi atau label kekal. Ciri AI menjelaskan dan mencadangkan; skor dan rekod tidak sesekali diubah oleh AI."
         id="Untuk menjalankan fitur aplikasi: distribusi lead, pelacakan aktivitas, rekomendasi pembelajaran yang dipersonalisasi, brief coaching AI, dan visibilitas tim untuk Coach serta pimpinan Anda. Hasil penilaian dipakai untuk pengembangan Anda saja — tidak pernah sebagai tes rekrutmen, diagnosis psikologis, atau label permanen. Fitur AI menjelaskan dan menyarankan; skor dan catatan tidak pernah diubah oleh AI." />

      <h2 className="mb-2 font-display text-base font-extrabold text-accent">Storage & sharing · Penyimpanan & perkongsian · Penyimpanan & berbagi data</h2>
      <S en="Data is stored with Supabase (managed PostgreSQL) and Cloudflare, protected by row-level security so each person sees only what their role allows. We do not sell your data. Limited data is shared with service providers strictly to operate the app: Google Gemini (AI text generation — activity summaries sent for coaching text), Resend (transactional email), and GoHighLevel (lead management integration). Customer lead data you handle belongs to the business and is governed by your agency agreement."
         bm="Data disimpan dengan Supabase (PostgreSQL terurus) dan Cloudflare, dilindungi row-level security supaya setiap orang hanya melihat apa yang peranannya benarkan. Kami tidak menjual data anda. Data terhad dikongsi dengan pembekal khidmat semata-mata untuk operasi aplikasi: Google Gemini (penjanaan teks AI), Resend (emel transaksi), dan GoHighLevel (integrasi pengurusan lead). Data lead pelanggan yang anda uruskan adalah milik perniagaan dan tertakluk kepada perjanjian agensi anda."
         id="Data disimpan di Supabase (PostgreSQL terkelola) dan Cloudflare, dilindungi row-level security sehingga setiap orang hanya melihat apa yang diizinkan perannya. Kami tidak menjual data Anda. Data terbatas dibagikan dengan penyedia layanan semata-mata untuk mengoperasikan aplikasi: Google Gemini (pembuatan teks AI), Resend (email transaksional), dan GoHighLevel (integrasi manajemen lead). Data lead pelanggan yang Anda tangani adalah milik bisnis dan diatur oleh perjanjian keagenan Anda." />

      <h2 className="mb-2 font-display text-base font-extrabold text-accent">Your choices · Pilihan anda · Pilihan Anda</h2>
      <S en="You may request a copy of your personal data, correction of inaccurate data, or deletion of your account by contacting us. Some records (e.g. audited business transactions) may be retained where legitimately required. Assessment participation is voluntary."
         bm="Anda boleh meminta salinan data peribadi anda, pembetulan data yang tidak tepat, atau pemadaman akaun anda dengan menghubungi kami. Sesetengah rekod (cth. transaksi perniagaan teraudit) mungkin dikekalkan jika diperlukan secara sah. Penyertaan penilaian adalah sukarela."
         id="Anda dapat meminta salinan data pribadi Anda, koreksi data yang tidak akurat, atau penghapusan akun Anda dengan menghubungi kami. Beberapa catatan (mis. transaksi bisnis teraudit) dapat tetap disimpan bila diwajibkan secara sah. Partisipasi penilaian bersifat sukarela." />

      <h2 className="mb-2 font-display text-base font-extrabold text-accent">Contact · Hubungi · Kontak</h2>
      <S en="Questions or requests: reply@iqiaggroup.com"
         bm="Soalan atau permintaan: reply@iqiaggroup.com"
         id="Pertanyaan atau permintaan: reply@iqiaggroup.com" />

      <p className="mt-8 text-center text-[10px] text-muted">
        Become Better · Build Better · Give Better
      </p>
    </div>
  )
}
