/* Hero Talent Compass — the participant's report (spec §12).
   Two renderings on purpose: this screen layout (a scrolling mobile card stack)
   and TalentReportPrint, a proper A4 document with a cover page and signature
   block. Printing the screen produced a poor keepsake, which is what the second
   layout fixes. Both are fed from the SAME report + scores objects, so they
   cannot disagree about content — only about presentation. */
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { Bars, Donut, ScoreBars } from '../../components/charts'
import TalentReportPrint from './TalentReportPrint'
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
  // translated names for every key this attempt scored (added by the worker)
  labels?: {
    dimensions?: Record<string, string>; roles?: Record<string, string>
    motivations?: Record<string, string>; demotivators?: Record<string, string>
    bands?: Record<string, string>
  }
}

/* Raw scores, straight from the deterministic engine. The narrative is prose;
   these are the numbers behind it, and they are what the charts draw. */
interface Scores {
  // present when the report is reopened later, where the component's own
  // `name` prop is empty because the details form was never re-filled
  participant?: { preferred_name?: string | null; full_name?: string | null }
  dimensions: Record<string, { score: number | null; band: string | null }>
  roles: { key: string; score: number | null; band: string | null }[]
  motivations: { key: string; score: number | null }[]
  demotivators: { key: string; score: number | null }[]
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


/* Charts read the engine's numbers and the worker's translated labels, so they
   stay correct in every language without a second copy of the label tables. */
const CHART_COPY: Record<string, Record<string, string>> = {
  en: { profileChart: 'Your profile at a glance', style: 'Working style',
        ent: 'Entrepreneurial readiness', success: 'Success drive',
        motivChart: 'What drives you', drainChart: 'What drains you',
        pathwayChart: 'Pathway fit', scale: 'Scored 0-100 from your own answers.',
        switchLang: 'Read this in', regenerating: 'Rewriting your profile…' },
  'ms-MY': { profileChart: 'Profil anda secara ringkas', style: 'Gaya kerja',
        ent: 'Kesediaan keusahawanan', success: 'Dorongan kejayaan',
        motivChart: 'Apa yang mendorong anda', drainChart: 'Apa yang melemahkan anda',
        pathwayChart: 'Kesesuaian laluan', scale: 'Dinilai 0-100 daripada jawapan anda sendiri.',
        switchLang: 'Baca dalam', regenerating: 'Menulis semula profil anda…' },
  'id-ID': { profileChart: 'Profil Anda sekilas', style: 'Gaya kerja',
        ent: 'Kesiapan kewirausahaan', success: 'Dorongan kesuksesan',
        motivChart: 'Apa yang mendorong Anda', drainChart: 'Apa yang menurunkan semangat Anda',
        pathwayChart: 'Kecocokan jalur', scale: 'Dinilai 0-100 dari jawaban Anda sendiri.',
        switchLang: 'Baca dalam', regenerating: 'Menulis ulang profil Anda…' },
}

const LANG_NAME: Record<string, string> = {
  'ms-MY': 'Bahasa Melayu', en: 'English', 'id-ID': 'Bahasa Indonesia',
}

function family(scores: Scores | null, labels: Record<string, string> | undefined, prefix: string) {
  if (!scores) return []
  return Object.entries(scores.dimensions ?? {})
    .filter(([k, v]) => k.startsWith(prefix + '.') && v.score !== null)
    .map(([k, v]) => ({ label: labels?.[k] ?? k.split('.')[1].replace(/_/g, ' '), value: v.score as number }))
    .sort((a, b) => b.value - a.value)
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

export default function TalentReport({ token, name, onLangChange }: {
  token: string; name: string
  // the report's own language is authoritative; this just tells TestMe when the
  // reader switches, so its chrome follows along
  onLangChange?: (l: TLang) => void
}) {
  const [report, setReport] = useState<Report | null>(null)
  const [scores, setScores] = useState<Scores | null>(null)
  const [err, setErr] = useState('')
  const [switching, setSwitching] = useState(false)

  const load = useCallback(async (regenerate = false) => {
    const res = await fetch(WORKER, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, regenerate }),
    })
    if (!res.ok) throw new Error(`report unavailable (${res.status})`)
    return (await res.json()) as Report
  }, [token])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await load()
        if (!cancelled) setReport(data)
        // scores come straight from the engine, not from the narrative
        if (supabase) {
          const { data: r } = await supabase.rpc('talent_result_mine', { p_token: token })
          if (!cancelled && r) setScores(r as Scores)
        }
      } catch (e) { if (!cancelled) setErr((e as Error).message) }
    })()
    return () => { cancelled = true }
  }, [token, load])

  /* Switching language after submission re-renders the same numbers with
     different wording, so the narrative has to be regenerated to match —
     otherwise the prose and the labels would disagree. */
  const switchLang = async (l: TLang) => {
    if (!supabase || switching || l === report?.language) return
    setSwitching(true)
    try {
      const { error } = await supabase.rpc('talent_set_language', { p_token: token, p_language: l })
      if (error) throw new Error(error.message)
      setReport(await load(true))
      const { data: r } = await supabase.rpc('talent_result_mine', { p_token: token })
      if (r) setScores(r as Scores)
      onLangChange?.(l)
    } catch (e) { setErr((e as Error).message) }
    setSwitching(false)
  }

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

  // A resumed report has no local details state, so fall back to the name the
  // participant actually saved — otherwise the PDF says "Prepared for" and nothing.
  const displayName = name?.trim()
    || scores?.participant?.preferred_name?.trim()
    || scores?.participant?.full_name?.trim()
    || ''
  const t = R[report.language] ?? R.en
  const c = CHART_COPY[report.language] ?? CHART_COPY.en

  return (
    <div className="print-report">
      {/* cover */}
      <div className="mb-4 rounded-2xl border border-accent/40 bg-accent-soft p-5 text-center">
        <p className="text-[10px] uppercase tracking-widest text-muted">{t.prepared}</p>
        <p className="font-display text-lg font-extrabold">{displayName}</p>
        <p className="mt-1 text-[11px] text-muted">
          Hero Talent Compass · {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Read it in another language. The numbers do not change — only the wording —
          so the narrative is regenerated to match rather than left inconsistent. */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-1.5 print:hidden">
        <span className="mr-1 text-[10px] uppercase tracking-wide text-muted">{c.switchLang}</span>
        {(['ms-MY', 'en', 'id-ID'] as TLang[]).map((l) => (
          <button key={l} type="button" disabled={switching} onClick={() => switchLang(l)}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40 ${
              report.language === l ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink'}`}>
            {LANG_NAME[l]}
          </button>
        ))}
        {switching && <span className="w-full text-center text-[10px] text-muted">{c.regenerating}</span>}
      </div>

      {scores && (
        <section className="mb-4 break-inside-avoid rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-accent">{c.profileChart}</h2>

          {report.roles?.length > 0 && scores.roles?.length > 0 && (
            <div className="mb-4">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">{c.pathwayChart}</p>
              <ScoreBars data={scores.roles.filter((r) => (r.score ?? 0) > 0).slice(0, 6)
                .map((r) => ({ label: report.labels?.roles?.[r.key] ?? r.key, value: r.score ?? 0 }))} />
            </div>
          )}

          {(['style', 'ent', 'success'] as const).map((fam) => {
            const data = family(scores, report.labels?.dimensions, fam)
            if (!data.length) return null
            return (
              <div key={fam} className="mb-4">
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">{c[fam]}</p>
                <ScoreBars data={data} />
              </div>
            )
          })}

          <div className="grid gap-4 sm:grid-cols-2">
            {scores.motivations?.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">{c.motivChart}</p>
                <Donut size={140} showTotal={false} data={scores.motivations.filter((m) => (m.score ?? 0) > 0)
                  .map((m) => ({ label: report.labels?.motivations?.[m.key] ?? m.key, value: Math.round(m.score ?? 0) }))} />
              </div>
            )}
            {scores.demotivators?.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">{c.drainChart}</p>
                <Bars data={scores.demotivators.filter((d) => (d.score ?? 0) > 0)
                  .map((d) => ({ label: report.labels?.demotivators?.[d.key] ?? d.key, value: Math.round(d.score ?? 0) }))} />
              </div>
            )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-muted">{c.scale}</p>
        </section>
      )}

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

      {report.roles?.length > 0 && (
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
                    {report.labels?.bands?.[r.band] ?? r.band}
                  </span>
                </div>
                {note?.why && <p className="text-xs leading-relaxed text-muted">{note.why}</p>}
                {note?.readiness && <p className="mt-1 text-[11px] italic text-muted">{note.readiness}</p>}
              </div>
            )
          })}
        </div>
      </Section>
      )}

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

      {/* Same data, A4 layout. Portalled to <body> so the print stylesheet can
          hide #root outright without hiding this along with it. */}
      {createPortal(
        <TalentReportPrint report={report} scores={scores} name={displayName} disclaimer={t.disclaimer} />,
        document.body,
      )}

    </div>
  )
}
