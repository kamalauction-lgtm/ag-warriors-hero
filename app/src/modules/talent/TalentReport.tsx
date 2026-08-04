/* Hero Talent Compass — the participant's report (spec §12).
   Print-friendly: the same markup produces the PDF via the browser's own
   print dialogue, so there is no second rendering path to drift out of sync. */
import { useEffect, useState } from 'react'
import type { TLang } from './talentText'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev/talent/report'

interface Role { name: string; key: string; band: string; score: number }
interface RoleNote { key: string; why: string; readiness: string }
export interface Report {
  generated_by: string; language: TLang; low_confidence?: boolean
  confidence_note?: string | null
  profile: string
  entrepreneurial_note?: string | null; success_note?: string | null
  motivation_note?: string | null; demotivation_note?: string | null
  environment_note?: string | null; real_estate_application?: string | null
  strengths: string[]; entrepreneurial: string[]; success_drive: string[]
  motivations: string[]; demotivators: string[]; environment: string[]
  roles: Role[]; role_notes?: RoleNote[] | null
  development: string[]; blind_spots: string[]
  experiments: string[]; plan_14_day?: string[] | null
  coach_questions?: string[] | null; formula?: string | null
}

const R = {
  en: {
    title: 'Your Hero Profile', prepared: 'Prepared for', pathways: 'Your top pathways',
    entrepreneurial: 'Entrepreneurial readiness', success: 'Success drive',
    motivates: 'What motivates you', drains: 'What may reduce your motivation',
    environment: 'Where you work best', development: 'Development opportunities',
    blind: 'Possible blind spots', applying: 'Applying this in real estate',
    experiments: 'Three things to test next', plan: 'Your first fourteen days',
    coachQs: 'Questions for your coach', formula: 'Your success formula',
    disclaimerTitle: 'Important', print: 'Save as PDF', strengthsLabel: 'Natural strengths',
    disclaimer: 'Hero Talent Compass is an AI-assisted self-discovery and role-exploration tool, based on your own responses. It is not a clinical, medical or diagnostic psychological assessment and is not a validated psychometric instrument. Results are for personal development and coaching. They do not guarantee performance, employment suitability, licensing, income, sales results, advertising returns or leadership appointment. Role suggestions are areas to explore, not permanent labels — capabilities change with experience, training and practice. Decisions about employment, leadership, coaching, financing or professional authority are made by authorised people. Advertising results are not guaranteed; never use essential household funds or borrowed money to fund a campaign, and agree budget, ownership, reporting and lead distribution first.',
  },
  'ms-MY': {
    title: 'Profil Hero Anda', prepared: 'Disediakan untuk', pathways: 'Laluan utama anda',
    entrepreneurial: 'Kesediaan keusahawanan', success: 'Dorongan kejayaan',
    motivates: 'Apa yang mendorong anda', drains: 'Apa yang mungkin mengurangkan motivasi anda',
    environment: 'Di mana anda bekerja paling baik', development: 'Peluang pembangunan',
    blind: 'Kemungkinan titik buta', applying: 'Menerapkannya dalam hartanah',
    experiments: 'Tiga perkara untuk dicuba', plan: 'Empat belas hari pertama anda',
    coachQs: 'Soalan untuk coach anda', formula: 'Formula kejayaan anda',
    disclaimerTitle: 'Penting', print: 'Simpan sebagai PDF', strengthsLabel: 'Kekuatan semula jadi',
    disclaimer: 'Hero Talent Compass ialah alat penemuan diri dan penerokaan peranan berbantukan AI, berdasarkan jawapan anda sendiri. Ia bukan penilaian psikologi klinikal, perubatan atau diagnostik dan bukan instrumen psikometrik yang disahkan. Keputusan adalah untuk pembangunan diri dan coaching. Ia tidak menjamin prestasi, kesesuaian pekerjaan, pelesenan, pendapatan, hasil jualan, pulangan pengiklanan atau pelantikan kepimpinan. Cadangan peranan ialah bidang untuk diterokai, bukan label kekal — keupayaan berubah melalui pengalaman, latihan dan amalan. Keputusan tentang pekerjaan, kepimpinan, coaching, pembiayaan atau kuasa profesional dibuat oleh orang yang diberi kuasa. Hasil pengiklanan tidak dijamin; jangan sekali-kali gunakan wang keperluan asas rumah tangga atau wang pinjaman untuk membiayai kempen, dan persetujui bajet, pemilikan, pelaporan dan pengagihan lead terlebih dahulu.',
  },
  'id-ID': {
    title: 'Profil Hero Anda', prepared: 'Disiapkan untuk', pathways: 'Jalur utama Anda',
    entrepreneurial: 'Kesiapan kewirausahaan', success: 'Dorongan kesuksesan',
    motivates: 'Apa yang memotivasi Anda', drains: 'Apa yang mungkin menurunkan motivasi Anda',
    environment: 'Di mana Anda bekerja paling baik', development: 'Peluang pengembangan',
    blind: 'Kemungkinan titik buta', applying: 'Menerapkannya di properti',
    experiments: 'Tiga hal untuk dicoba', plan: 'Empat belas hari pertama Anda',
    coachQs: 'Pertanyaan untuk coach Anda', formula: 'Formula sukses Anda',
    disclaimerTitle: 'Penting', print: 'Simpan sebagai PDF', strengthsLabel: 'Kekuatan alami',
    disclaimer: 'Hero Talent Compass adalah alat penemuan diri dan eksplorasi peran berbantuan AI, berdasarkan jawaban Anda sendiri. Ini bukan asesmen psikologi klinis, medis, atau diagnostik dan bukan instrumen psikometri tervalidasi. Hasilnya untuk pengembangan diri dan coaching. Hasil ini tidak menjamin kinerja, kesesuaian pekerjaan, lisensi, penghasilan, hasil penjualan, hasil iklan, atau pengangkatan kepemimpinan. Saran peran adalah area untuk dijajaki, bukan label permanen — kemampuan berubah melalui pengalaman, pelatihan, dan praktik. Keputusan tentang pekerjaan, kepemimpinan, coaching, pembiayaan, atau kewenangan profesional dibuat oleh pihak berwenang. Hasil iklan tidak dijamin; jangan pernah menggunakan dana kebutuhan pokok rumah tangga atau uang pinjaman untuk mendanai kampanye, dan sepakati anggaran, kepemilikan, pelaporan, serta distribusi lead terlebih dahulu.',
  },
}

const BAND_TONE: Record<string, string> = {
  'Strong Alignment': 'border-success/50 bg-success/10 text-success',
  'Good Alignment': 'border-accent/50 bg-accent-soft text-accent',
  'Emerging Alignment': 'border-warning/50 bg-warning/10 text-warning',
  'Development Opportunity': 'border-border text-muted',
  'Worth Revisiting': 'border-warning/50 bg-warning/10 text-warning',
  'Insufficient Information': 'border-border text-muted',
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-4 break-inside-avoid rounded-2xl border border-border bg-surface p-4">
    <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">{title}</h2>
    {children}
  </section>
)

const Pills = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.filter(Boolean).map((s, i) => (
      <span key={i} className="rounded-full border border-border px-2.5 py-1 text-[11px] capitalize">{s}</span>
    ))}
  </div>
)

export default function TalentReport({ token, name }: { token: string; name: string }) {
  const [report, setReport] = useState<Report | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(WORKER, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (!res.ok) throw new Error(`report unavailable (${res.status})`)
        const data = await res.json()
        if (!cancelled) setReport(data)
      } catch (e) { if (!cancelled) setErr((e as Error).message) }
    })()
    return () => { cancelled = true }
  }, [token])

  if (err) return (
    <div className="rounded-2xl border border-border bg-surface p-6 text-center">
      <p className="text-sm font-bold">Your answers are saved</p>
      <p className="mx-auto mt-2 max-w-xs text-xs text-muted">
        We could not display your profile just now. Your facilitator can retrieve it — nothing is lost.
      </p>
    </div>
  )

  if (!report) return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <p className="animate-pulse text-sm text-muted">Preparing your profile…</p>
    </div>
  )

  const t = R[report.language] ?? R.en

  return (
    <div className="print-report">
      {/* cover */}
      <div className="mb-4 rounded-2xl border border-accent/40 bg-accent-soft p-5 text-center">
        <p className="text-[10px] uppercase tracking-widest text-muted">{t.prepared}</p>
        <p className="font-display text-lg font-extrabold">{name}</p>
        <p className="mt-1 text-[11px] text-muted">
          Hero Talent Compass · {new Date().toLocaleDateString()}
        </p>
      </div>

      {report.low_confidence && report.confidence_note && (
        <div className="mb-4 rounded-2xl border border-warning/50 bg-warning/10 p-4">
          <p className="text-xs leading-relaxed text-warning">{report.confidence_note}</p>
        </div>
      )}

      <Section title={t.title}>
        <p className="text-sm leading-relaxed">{report.profile}</p>
        {report.strengths?.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">{t.strengthsLabel}</p>
            <Pills items={report.strengths} />
          </div>
        )}
      </Section>

      <Section title={t.pathways}>
        <div className="space-y-2">
          {report.roles.map((r, i) => {
            const note = report.role_notes?.find((n) => n.key === r.key)
            return (
              <div key={r.key} className="rounded-xl border border-border p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-display text-sm font-extrabold text-accent">{i + 1}.</span>
                  <span className="flex-1 text-sm font-bold">{r.name}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${BAND_TONE[r.band] ?? ''}`}>
                    {r.band}
                  </span>
                </div>
                {note?.why && <p className="text-xs leading-relaxed text-muted">{note.why}</p>}
                {note?.readiness && <p className="mt-1 text-[11px] italic text-muted">{note.readiness}</p>}
              </div>
            )
          })}
        </div>
      </Section>

      {(report.entrepreneurial_note || report.entrepreneurial?.length > 0) && (
        <Section title={t.entrepreneurial}>
          {report.entrepreneurial_note && <p className="mb-2 text-sm leading-relaxed">{report.entrepreneurial_note}</p>}
          <Pills items={report.entrepreneurial} />
        </Section>
      )}

      {(report.success_note || report.success_drive?.length > 0) && (
        <Section title={t.success}>
          {report.success_note && <p className="mb-2 text-sm leading-relaxed">{report.success_note}</p>}
          <Pills items={report.success_drive} />
        </Section>
      )}

      <Section title={t.motivates}>
        {report.motivation_note && <p className="mb-2 text-sm leading-relaxed">{report.motivation_note}</p>}
        <Pills items={report.motivations} />
      </Section>

      {report.demotivators?.length > 0 && (
        <Section title={t.drains}>
          {report.demotivation_note && <p className="mb-2 text-sm leading-relaxed">{report.demotivation_note}</p>}
          <Pills items={report.demotivators} />
        </Section>
      )}

      {(report.environment_note || report.environment?.length > 0) && (
        <Section title={t.environment}>
          {report.environment_note && <p className="mb-2 text-sm leading-relaxed">{report.environment_note}</p>}
          <Pills items={report.environment} />
        </Section>
      )}

      {report.real_estate_application && (
        <Section title={t.applying}><p className="text-sm leading-relaxed">{report.real_estate_application}</p></Section>
      )}

      {report.development?.length > 0 && (
        <Section title={t.development}>
          <ul className="space-y-1.5">
            {report.development.map((d, i) => (
              <li key={i} className="flex gap-2 text-sm"><span className="text-accent">→</span><span className="capitalize">{d}</span></li>
            ))}
          </ul>
        </Section>
      )}

      {report.blind_spots?.length > 0 && (
        <Section title={t.blind}>
          <ul className="space-y-1.5">
            {report.blind_spots.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm"><span className="text-warning">•</span><span className="capitalize">{b}</span></li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t.experiments}>
        <ol className="space-y-2">
          {report.experiments.filter(Boolean).map((e, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-extrabold text-on-accent">{i + 1}</span>
              <span>{e}</span>
            </li>
          ))}
        </ol>
      </Section>

      {report.plan_14_day && report.plan_14_day.length > 0 && (
        <Section title={t.plan}>
          <ul className="space-y-1.5">
            {report.plan_14_day.map((p, i) => (
              <li key={i} className="border-b border-border pb-1.5 text-sm leading-relaxed last:border-0">{p}</li>
            ))}
          </ul>
        </Section>
      )}

      {report.coach_questions && report.coach_questions.length > 0 && (
        <Section title={t.coachQs}>
          <ul className="space-y-2">
            {report.coach_questions.map((q, i) => (
              <li key={i} className="text-sm italic leading-relaxed text-muted">“{q}”</li>
            ))}
          </ul>
        </Section>
      )}

      {report.formula && (
        <div className="mb-4 rounded-2xl border border-accent/40 bg-accent-soft p-4 text-center">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-muted">{t.formula}</p>
          <p className="font-display text-sm font-extrabold">{report.formula}</p>
        </div>
      )}

      <Section title={t.disclaimerTitle}>
        <p className="text-[10px] leading-relaxed text-muted">{t.disclaimer}</p>
      </Section>

      <button type="button" onClick={() => window.print()}
        className="mb-8 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent print:hidden">
        {t.print}
      </button>
    </div>
  )
}
