/* GROW → DIAG ACADEMY — participant experience.
   DIAGNOSE → PRESCRIBE → LEARN. Scoring is deterministic and server-side;
   Talent Compass enriches the prescription when available but never blocks it.
   Knowledge and confidence stay SEPARATE (spec §7). Lessons render through the
   shared LessonEngine against the aca_* RPCs. Developmental language only —
   bands, priorities and explanation, never verdicts. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ChevronRight, CheckCircle2, Circle, Play, Compass,
  Sparkles, Target, BookOpen, History,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Bar, Card, Chip } from '../../components/ui'
import {
  LessonView, lessonDone, useTLocale, useL,
  type LessonData, type TX, type LearnApi,
} from '../learn/LessonEngine'

const ACA_API: LearnApi = { touch: 'aca_touch', ack: 'aca_ack', quiz: 'aca_quiz', bucket: 'academy' }

interface DiagQuestion {
  id: number; qtype: 'single' | 'scenario' | 'confidence'
  dimension_key: string; dimension: TX; question: TX; options: TX[]
  answer: number | null
}
interface DimResult {
  dimension_key: string; title: TX; category: string
  knowledge_pct: number | null; confidence_level: number | null; band: string
}
interface RxItem {
  category: 'required' | 'priority' | 'accelerator' | 'optional' | 'assigned'
  rank: number; dimension_key: string | null
  module: { id: number; title: TX; subtitle: TX }
  lessons: LessonData[]
}
export interface AcaData {
  diag_completed: boolean; in_progress: boolean
  attempt: { id: number; submitted_at: string
    talent: { top_roles?: { key: string; band: string }[]; low_confidence?: boolean } | null
    results: DimResult[]
    history: { id: number; submitted_at: string }[] } | null
  prescription: { id: number; items: RxItem[] } | null
}

export const BAND_LABEL: Record<string, { en: string; ms: string; id: string }> = {
  foundation: { en: 'Foundation Required', ms: 'Perlukan Asas', id: 'Perlu Fondasi' },
  developing: { en: 'Developing', ms: 'Sedang Berkembang', id: 'Sedang Berkembang' },
  working: { en: 'Working Knowledge', ms: 'Pengetahuan Berfungsi', id: 'Pengetahuan Berfungsi' },
  ready: { en: 'Ready To Apply', ms: 'Sedia Diterapkan', id: 'Siap Diterapkan' },
  accelerator: { en: 'Accelerator', ms: 'Pemecut', id: 'Akselerator' },
  unknown: { en: 'Not Assessed Yet', ms: 'Belum Dinilai', id: 'Belum Dinilai' },
}
const CAT_LABEL: Record<string, { en: string; ms: string; id: string }> = {
  required: { en: 'Required Foundation', ms: 'Asas Wajib', id: 'Fondasi Wajib' },
  priority: { en: 'Priority Development', ms: 'Pembangunan Keutamaan', id: 'Pengembangan Prioritas' },
  assigned: { en: 'Assigned By Your Mentor', ms: 'Ditetapkan Mentor Anda', id: 'Ditugaskan Mentor Anda' },
  accelerator: { en: 'Role Accelerator', ms: 'Pemecut Peranan', id: 'Akselerator Peran' },
  optional: { en: 'Optional Exploration', ms: 'Penerokaan Pilihan', id: 'Eksplorasi Opsional' },
}
const ROLE_NAME: Record<string, string> = {
  content_creator: 'Content Creator', live_host: 'Live Host', advertiser: 'Advertiser',
  team_growth_funder: 'Team Growth Funder', prospector: 'Prospector',
  relationship_builder: 'Relationship Builder', presenter: 'Presenter', closer: 'Closer',
  financing_coordinator: 'Financing Coordinator', recruiter: 'Recruiter',
  coach_trainer: 'Coach / Trainer', leader: 'Leader',
}

export function acaSummary(d: AcaData | null) {
  if (!d) return null
  if (!d.diag_completed) return { state: 'diagnostic' as const }
  const items = d.prescription?.items ?? []
  const lessons = items.flatMap((i) => i.lessons)
  const req = lessons.filter((l) => l.required)
  const done = req.filter(lessonDone).length
  const focus = d.attempt?.results.find((r) =>
    r.category !== 'foundation' && ['foundation', 'developing'].includes(r.band))
    ?? d.attempt?.results[0]
  const next = lessons.find((l) => l.required && !lessonDone(l)) ?? lessons.find((l) => !lessonDone(l))
  return { state: 'learning' as const, total: req.length, done,
    pct: req.length ? Math.round((done / req.length) * 100) : 0, next, focus }
}

const bandTone = (b: string): 'success' | 'accent' | 'warning' | 'default' =>
  b === 'ready' || b === 'accelerator' ? 'success' : b === 'working' ? 'accent'
    : b === 'developing' || b === 'foundation' ? 'warning' : 'default'

export default function Academy() {
  const { user, locale } = useApp()
  const T = useTLocale()
  const L = useL()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [data, setData] = useState<AcaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'home' | 'intro' | 'quiz' | 'results'>('home')
  const [questions, setQuestions] = useState<DiagQuestion[]>([])
  const [qi, setQi] = useState(0)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [expl, setExpl] = useState<{ paragraphs: string[]; generated_by: string } | null>(null)

  /* AI explanation of MY results — optional enhancement; the deterministic UI
     below stands alone if this never arrives (spec §30) */
  useEffect(() => {
    if (!data?.diag_completed || !supabase) return
    let dead = false
    ;(async () => {
      const { data: s } = await supabase!.auth.getSession()
      const token = s?.session?.access_token
      if (!token) return
      try {
        const res = await fetch('https://m4u-api.iqiaggroup.workers.dev/diag/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ lang: locale === 'bm' ? 'ms' : locale }),
        })
        if (res.ok && !dead) setExpl(await res.json())
      } catch { /* rule-based sections below already explain */ }
    })()
    return () => { dead = true }
  }, [data?.diag_completed, locale])

  const load = useCallback(async () => {
    if (!isReal || !supabase) { setLoading(false); return }
    const { data: d } = await supabase.rpc('aca_my')
    setData((d as AcaData) ?? null)
    setLoading(false)
  }, [isReal])
  useEffect(() => { load() }, [load])

  const startDiag = async () => {
    if (!supabase) return
    setBusy(true)
    const { data: d, error } = await supabase.rpc('diag_start')
    setBusy(false)
    if (error) return
    const qs = ((d as { questions: DiagQuestion[] })?.questions ?? [])
    setQuestions(qs)
    const firstUnanswered = qs.findIndex((q) => q.answer === null)
    setQi(firstUnanswered === -1 ? 0 : firstUnanswered)
    setView('quiz')
  }

  const answer = async (q: DiagQuestion, i: number) => {
    if (!supabase) return
    setQuestions((qs) => qs.map((x) => (x.id === q.id ? { ...x, answer: i } : x)))
    supabase.rpc('diag_answer', { p_question: q.id, p_answer: i }).then(() => {})
    if (qi < questions.length - 1) window.setTimeout(() => setQi((n) => n + 1), 250)
  }

  const submitDiag = async () => {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.rpc('diag_submit')
    setBusy(false)
    if (error) return
    await load()
    setView('results')
  }

  const sum = useMemo(() => acaSummary(data), [data])
  const allLessons = useMemo(
    () => data?.prescription?.items.flatMap((i) => i.lessons) ?? [], [data])
  const open = allLessons.find((l) => l.id === openId) ?? null
  const answered = questions.filter((q) => q.answer !== null).length

  if (!user) return null

  const results = data?.attempt?.results ?? []
  const strengths = results.filter((r) => ['ready', 'accelerator'].includes(r.band)).slice(0, 3)
  const priorities = results.filter((r) => ['foundation', 'developing'].includes(r.band)).slice(0, 3)
  const talent = data?.attempt?.talent

  return (
    <div className="animate-rise px-4 pt-5 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/grow" aria-label="Back"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">AG Academy</h1>
          <p className="text-xs text-muted">
            {L('Discover what to learn next', 'Temui apa yang perlu dipelajari seterusnya', 'Temukan apa yang perlu dipelajari berikutnya')}
          </p>
        </div>
      </header>

      {loading && <Card className="p-6 text-center text-xs text-muted">Loading…</Card>}

      {/* ---------------- LESSON ---------------- */}
      {!loading && open && (
        <LessonView api={ACA_API} lesson={open} onBack={() => { setOpenId(null); load() }} onRefresh={load} />
      )}

      {/* ---------------- INTRO ---------------- */}
      {!loading && !open && !data?.diag_completed && view !== 'quiz' && (
        <>
          <Card className="mb-3 p-5">
            <Compass size={26} className="mb-2 text-accent" />
            <p className="mb-1 font-display text-lg font-extrabold">
              {L('Learning Diagnostic', 'Diagnostik Pembelajaran', 'Diagnostik Pembelajaran')}
            </p>
            <p className="text-[13px] leading-relaxed text-muted">
              {L('Let us understand where you are today so Hero can recommend what to learn next.',
                 'Mari fahami di mana anda hari ini supaya Hero boleh mengesyorkan apa yang perlu dipelajari seterusnya.',
                 'Mari pahami posisi Anda hari ini agar Hero bisa merekomendasikan apa yang perlu dipelajari berikutnya.')}
            </p>
            <div className="mt-3 space-y-1.5 rounded-xl bg-surface2 p-3 text-[11px] leading-relaxed text-muted">
              <p>✓ {L('This is developmental — not an exam, not a hiring test, not a permanent label.',
                     'Ini untuk pembangunan — bukan peperiksaan, bukan ujian pengambilan, bukan label kekal.',
                     'Ini untuk pengembangan — bukan ujian, bukan tes rekrutmen, bukan label permanen.')}</p>
              <p>✓ {L('Results personalise your learning path. Nothing else.',
                     'Keputusan digunakan untuk memperibadikan laluan pembelajaran anda. Itu sahaja.',
                     'Hasil dipakai mempersonalisasi jalur belajar Anda. Itu saja.')}</p>
              <p>✓ {L('You can pause and continue anytime.', 'Anda boleh berhenti dan sambung bila-bila masa.', 'Anda bisa berhenti dan lanjut kapan saja.')}</p>
            </div>
            <button type="button" disabled={busy} onClick={startDiag}
              className="mt-4 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {busy ? '…' : data?.in_progress
                ? L('Continue Diagnostic', 'Sambung Diagnostik', 'Lanjutkan Diagnostik')
                : L('Start Learning Diagnostic', 'Mula Diagnostik Pembelajaran', 'Mulai Diagnostik Pembelajaran')}
            </button>
          </Card>
          <p className="text-center text-[10px] text-muted">
            {L('Hero Talent Compass results, where available, will help personalise your path — but are never required.',
               'Keputusan Hero Talent Compass, jika ada, membantu memperibadikan laluan anda — tetapi tidak pernah diwajibkan.',
               'Hasil Hero Talent Compass, bila ada, membantu mempersonalisasi jalur Anda — tapi tidak pernah diwajibkan.')}
          </p>
        </>
      )}

      {/* ---------------- DIAGNOSTIC ---------------- */}
      {!loading && view === 'quiz' && questions.length > 0 && (() => {
        const q = questions[qi]
        const isConf = q.qtype === 'confidence'
        return (
          <>
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-[11px] text-muted">
                <span>{answered}/{questions.length}</span>
                <span>{isConf
                  ? L('Confidence check', 'Semakan keyakinan', 'Cek keyakinan')
                  : T(q.dimension)}</span>
              </div>
              <Bar pct={(answered / questions.length) * 100} />
            </div>
            <Card className="p-4">
              {isConf && (
                <Chip tone="info" className="mb-2">
                  {L('Not scored right/wrong — just honest', 'Tiada betul/salah — jujur sahaja', 'Tidak ada benar/salah — jujur saja')}
                </Chip>
              )}
              <p className="mb-3 text-[15px] font-bold leading-relaxed">{T(q.question)}</p>
              {q.options.map((o, i) => (
                <button key={i} type="button" onClick={() => answer(q, i)}
                  className={clsx('mb-2 block w-full cursor-pointer rounded-xl border p-3 text-left text-[13px] transition-colors',
                    q.answer === i ? 'border-accent bg-accent-soft font-bold' : 'border-border hover:border-accent/50')}>
                  {!isConf && <b className="mr-1.5 text-accent">{String.fromCharCode(65 + i)}.</b>}{T(o)}
                </button>
              ))}
              <div className="mt-2 flex items-center justify-between">
                <button type="button" disabled={qi === 0} onClick={() => setQi((n) => n - 1)}
                  className="cursor-pointer text-xs font-bold text-muted disabled:opacity-30">
                  ← {L('Back', 'Kembali', 'Kembali')}
                </button>
                {qi < questions.length - 1 ? (
                  <button type="button" disabled={q.answer === null} onClick={() => setQi((n) => n + 1)}
                    className="cursor-pointer rounded-full bg-surface2 px-4 py-2 text-xs font-bold disabled:opacity-30">
                    {L('Next', 'Seterusnya', 'Berikutnya')} →
                  </button>
                ) : (
                  <button type="button" disabled={busy || answered < questions.length} onClick={submitDiag}
                    className="cursor-pointer rounded-full bg-accent px-5 py-2.5 text-xs font-extrabold text-on-accent disabled:opacity-40">
                    {busy ? '…' : L('See My Results', 'Lihat Keputusan Saya', 'Lihat Hasil Saya')}
                  </button>
                )}
              </div>
            </Card>
          </>
        )
      })()}

      {/* ---------------- RESULTS + HOME ---------------- */}
      {!loading && !open && data?.diag_completed && view !== 'quiz' && (
        <>
          {view === 'results' && (
            <div className="hero-user mb-4 p-5 text-center">
              <Sparkles size={22} className="mx-auto text-[#e7c96a]" />
              <p className="gold-text mt-1 font-display text-lg font-extrabold">
                {L('Your Development Profile Is Ready', 'Profil Pembangunan Anda Sedia', 'Profil Pengembangan Anda Siap')}
              </p>
              <p className="mt-1 text-[11px] text-[#c9c2a8]">
                {L('A starting picture — not a verdict. It improves as you do.',
                   'Gambaran permulaan — bukan hukuman. Ia bertambah baik seiring anda.',
                   'Gambaran awal — bukan vonis. Membaik seiring Anda berkembang.')}
              </p>
            </div>
          )}

          {/* strengths + priorities */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Card className="p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-success">
                <CheckCircle2 size={12} /> {L('Current Strengths', 'Kekuatan Semasa', 'Kekuatan Saat Ini')}
              </p>
              {strengths.length === 0 && <p className="text-[11px] text-muted">{L('Keep building — they will show', 'Terus bina — ia akan muncul', 'Terus bangun — nanti terlihat')}</p>}
              {strengths.map((r) => (
                <p key={r.dimension_key} className="mb-1 text-xs font-bold">{T(r.title)}</p>
              ))}
            </Card>
            <Card className="p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-warning">
                <Target size={12} /> {L('Priority Development', 'Keutamaan Pembangunan', 'Prioritas Pengembangan')}
              </p>
              {priorities.length === 0 && <p className="text-[11px] text-muted">—</p>}
              {priorities.map((r) => (
                <p key={r.dimension_key} className="mb-1 text-xs font-bold">{T(r.title)}</p>
              ))}
            </Card>
          </div>

          {/* AG AI Coach explains — optional layer over the deterministic result */}
          {expl && expl.paragraphs?.length > 0 && (
            <Card className="mb-3 border-accent/40 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-accent">
                <Sparkles size={12} /> {L('What this means for you', 'Apa maksudnya untuk anda', 'Apa artinya untuk Anda')}
              </p>
              <div className="space-y-2">
                {expl.paragraphs.map((p, i) => (
                  <p key={i} className="text-[12.5px] leading-relaxed">{p}</p>
                ))}
              </div>
              <p className="mt-2 text-[9px] text-muted">
                {expl.generated_by === 'ai' ? 'AG AI Coach' : L('AG Coach (rule-based)', 'AG Coach (berperaturan)', 'AG Coach (berbasis aturan)')}
                {' · '}{L('explains only — scores and priorities are fixed by the diagnostic', 'menjelaskan sahaja — skor dan keutamaan ditetapkan oleh diagnostik', 'hanya menjelaskan — skor dan prioritas ditetapkan oleh diagnostik')}
              </p>
            </Card>
          )}

          {/* knowledge vs confidence + bands */}
          <Card className="mb-3 p-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              {L('Knowledge vs Confidence', 'Pengetahuan vs Keyakinan', 'Pengetahuan vs Keyakinan')}
            </p>
            {results.map((r) => (
              <div key={r.dimension_key} className="mb-2 border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-bold">{T(r.title)}</p>
                  <Chip tone={bandTone(r.band)}>
                    {BAND_LABEL[r.band]?.[locale === 'bm' ? 'ms' : locale === 'id' ? 'id' : 'en'] ?? r.band}
                  </Chip>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted">
                  {r.knowledge_pct !== null && (
                    <span className="flex flex-1 items-center gap-1.5">
                      {L('Knowledge', 'Pengetahuan', 'Pengetahuan')}
                      <Bar pct={r.knowledge_pct} className="flex-1" />
                    </span>
                  )}
                  {r.confidence_level !== null && (
                    <span>{L('Confidence', 'Keyakinan', 'Keyakinan')}: {
                      r.confidence_level === 3 ? L('High', 'Tinggi', 'Tinggi')
                        : r.confidence_level === 2 ? L('Moderate', 'Sederhana', 'Sedang')
                        : L('Low', 'Rendah', 'Rendah')}</span>
                  )}
                </div>
                {r.knowledge_pct !== null && r.confidence_level === 3 && r.knowledge_pct < 60 && (
                  <p className="mt-1 text-[10px] text-warning">
                    ⚠ {L('High confidence with lower knowledge — worth a careful look, it may hide a blind spot.',
                          'Keyakinan tinggi dengan pengetahuan lebih rendah — berbaloi diteliti, mungkin ada titik buta.',
                          'Keyakinan tinggi dengan pengetahuan lebih rendah — layak dicermati, mungkin ada titik buta.')}
                  </p>
                )}
              </div>
            ))}
          </Card>

          {/* talent alignment (structured summary only) */}
          {talent?.top_roles?.length && !talent.low_confidence ? (
            <Card className="mb-3 p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-accent">
                <Compass size={12} /> {L('Talent Compass Alignment', 'Kesejajaran Talent Compass', 'Keselarasan Talent Compass')}
              </p>
              <p className="mb-1.5 text-[11px] leading-relaxed text-muted">
                {L('Your responses suggest current alignment with:', 'Jawapan anda mencadangkan kesejajaran semasa dengan:', 'Jawaban Anda menunjukkan keselarasan saat ini dengan:')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {talent.top_roles.map((r) => (
                  <Chip key={r.key} tone="accent">{ROLE_NAME[r.key] ?? r.key}</Chip>
                ))}
              </div>
            </Card>
          ) : null}

          {/* the prescription */}
          {(data.prescription?.items ?? []).length === 0 && (
            <Card className="mb-3 p-5 text-center text-xs text-muted">
              {L('No matching modules yet — your admin is still building the catalogue.',
                 'Belum ada modul sepadan — admin masih membina katalog.',
                 'Belum ada modul yang cocok — admin masih membangun katalog.')}
            </Card>
          )}
          {sum?.state === 'learning' && sum.next && (
            <button type="button" onClick={() => setOpenId(sum.next!.id)}
              className="mb-3 flex w-full cursor-pointer items-center gap-2.5 rounded-xl bg-accent p-3.5 text-left text-on-accent">
              <Play size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
                  {L('Next Best Action', 'Tindakan Terbaik Seterusnya', 'Aksi Terbaik Berikutnya')}
                </span>
                <span className="block truncate text-sm font-extrabold">{T(sum.next.title)}</span>
              </span>
              <ChevronRight size={16} className="shrink-0" />
            </button>
          )}

          {(['required', 'priority', 'assigned', 'accelerator', 'optional'] as const).map((cat) => {
            const items = (data.prescription?.items ?? []).filter((i) => i.category === cat)
            if (!items.length) return null
            return (
              <div key={cat} className="mb-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                  <BookOpen size={12} />
                  {CAT_LABEL[cat][locale === 'bm' ? 'ms' : locale === 'id' ? 'id' : 'en']}
                </p>
                {items.map((it) => {
                  const req = it.lessons.filter((l) => l.required)
                  const done = req.filter(lessonDone).length
                  return (
                    <Card key={it.module.id} className="mb-2 overflow-hidden">
                      <div className="flex items-center gap-2 p-3.5 pb-2">
                        <p className="min-w-0 flex-1 text-sm font-extrabold">{T(it.module.title)}</p>
                        {req.length > 0 && (
                          <span className="shrink-0 text-[10px] font-bold text-muted">{done}/{req.length}</span>
                        )}
                      </div>
                      {it.lessons.length === 0 && (
                        <p className="px-3.5 pb-3 text-[11px] text-muted">
                          {L('Lessons coming soon', 'Pelajaran akan datang', 'Pelajaran segera hadir')}
                        </p>
                      )}
                      {it.lessons.map((l) => (
                        <button key={l.id} type="button" onClick={() => setOpenId(l.id)}
                          className="flex w-full cursor-pointer items-center gap-2.5 border-t border-border p-3 text-left transition-colors hover:bg-surface2">
                          {lessonDone(l) ? <CheckCircle2 size={16} className="shrink-0 text-success" />
                            : l.progress ? <Play size={15} className="shrink-0 text-accent" />
                            : <Circle size={15} className="shrink-0 text-border" />}
                          <span className={clsx('min-w-0 flex-1 truncate text-[13px]', lessonDone(l) ? 'text-muted' : 'font-bold')}>
                            {T(l.title)}
                          </span>
                          {l.duration_min && <span className="shrink-0 text-[10px] text-muted">≈{l.duration_min}m</span>}
                          <ChevronRight size={14} className="shrink-0 text-muted" />
                        </button>
                      ))}
                    </Card>
                  )
                })}
              </div>
            )
          })}

          {/* history + reassess */}
          {(data.attempt?.history?.length ?? 0) > 0 && (
            <Card className="mb-2 flex items-center gap-2.5 p-3.5">
              <History size={15} className="shrink-0 text-muted" />
              <p className="min-w-0 flex-1 text-[11px] text-muted">
                {L('Diagnostic history', 'Sejarah diagnostik', 'Riwayat diagnostik')}: {data.attempt!.history.length}
                {' · '}{L('latest', 'terkini', 'terbaru')} {new Date(data.attempt!.submitted_at).toLocaleDateString()}
              </p>
              <button type="button" onClick={startDiag}
                className="shrink-0 cursor-pointer rounded-full border border-border px-3 py-1.5 text-[10px] font-bold text-muted hover:border-accent hover:text-accent">
                {L('Reassess', 'Nilai semula', 'Nilai ulang')}
              </button>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
