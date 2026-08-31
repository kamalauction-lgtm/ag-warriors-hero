/* AG AI Coach — the agent-facing daily brief.
   Scores come from the worker's arithmetic, the prose from the AI (or its
   complete fallback). Visible to the agent and their assigned Coach — the sheet
   says so, because a coaching tool that watches silently stops being trusted.
   The sheet has its own language switch: picking a language the cached brief
   is not in regenerates it in that language (same pattern as the talent report). */
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrainCircuit, X, RefreshCw, Trophy, AlertTriangle, CheckCircle2, Camera } from 'lucide-react'
import clsx from 'clsx'
import { supabase, supabaseReady } from '../lib/supabase'
import { useApp } from '../lib/store'
import { Card, Bar } from './ui'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev/coach/analyse'

type Lang = 'en' | 'ms' | 'id'

interface Brief {
  on_date: string
  language?: Lang
  generated_by: 'ai' | 'fallback'
  scores: Record<string, number> & { _explain?: Record<string, number> }
  narrative: {
    win: string
    gaps: { issue: string; why: string; cost: string }[]
    top5: string[]
    marketing?: { todays_move: string; twist: string | null; best_times: string[]; study: string | null }
    quote?: { body: string; author: string } | null
    grooming?: { focus_key: string; focus_set_by: string; drill: string; technique_tip: string | null } | null
    closing_line: string
    talent_note: string | null
  }
}

const SCORE_LABELS: Record<string, Record<Lang, string>> = {
  overall: { en: 'Overall', ms: 'Keseluruhan', id: 'Keseluruhan' },
  calls: { en: 'Calls', ms: 'Panggilan', id: 'Panggilan' },
  followup: { en: 'Follow-up', ms: 'Susulan', id: 'Tindak lanjut' },
  productivity: { en: 'Productivity', ms: 'Produktiviti', id: 'Produktivitas' },
  time_management: { en: 'Time mgmt', ms: 'Urus masa', id: 'Atur waktu' },
  recruitment: { en: 'Recruitment', ms: 'Rekrutmen', id: 'Rekrutmen' },
}

/* sheet chrome in the three brief languages — the narrative itself comes from
   the worker already in the right language */
const UI = {
  shared: { en: 'shared with your Coach', ms: 'dikongsi dengan Coach anda', id: 'dibagikan dengan Coach Anda' },
  scoreNote: {
    en: 'Scored from tracked activity only — calls, leads and your My Day plan. Work done outside the system is not counted against you.',
    ms: 'Diskor dari aktiviti yang dijejak sahaja — panggilan, leads dan rancangan My Day anda. Kerja di luar sistem tidak dikira menentang anda.',
    id: 'Dinilai dari aktivitas yang terlacak saja — panggilan, leads dan rencana My Day Anda. Kerja di luar sistem tidak dihitung merugikan Anda.',
  },
  top5: { en: 'Top 5 actions today', ms: 'Top 5 tindakan hari ini', id: 'Top 5 tindakan hari ini' },
  focus: { en: 'Focus this week', ms: 'Fokus minggu ini', id: 'Fokus minggu ini' },
  setByCoach: { en: 'Set by your Coach', ms: 'Ditetapkan oleh Coach anda', id: 'Ditetapkan oleh Coach Anda' },
  setByAI: {
    en: 'Suggested from your Talent profile — your Coach can change it',
    ms: 'Dicadangkan dari profil Talent anda — Coach boleh mengubahnya',
    id: 'Disarankan dari profil Talent Anda — Coach dapat mengubahnya',
  },
  marketing: { en: 'Marketing today', ms: 'Marketing hari ini', id: 'Marketing hari ini' },
  mktNote: {
    en: 'Guidance, not a grade — the system does not track your posting.',
    ms: 'Panduan, bukan gred — sistem tidak menjejak posting anda.',
    id: 'Panduan, bukan nilai — sistem tidak melacak posting Anda.',
  },
  offline: { en: 'AG Coach (offline brief)', ms: 'AG Coach (brief luar talian)', id: 'AG Coach (brief offline)' },
  explain: {
    en: 'scores are explainable — ask your Coach',
    ms: 'skor boleh dijelaskan — tanya Coach anda',
    id: 'skor dapat dijelaskan — tanyakan Coach Anda',
  },
} as const

export default function CoachBrief() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // app locale 'bm' is worker 'ms'
  const appLang: Lang = locale === 'bm' ? 'ms' : locale === 'id' ? 'id' : 'en'
  // all three languages always offered (Kamal, 2026-08-10)
  const langOptions: { v: Lang; label: string }[] = [
    { v: 'en', label: 'EN' }, { v: 'ms', label: 'BM' }, { v: 'id', label: 'ID' },
  ]

  const analyse = async (regenerate = false, lang?: Lang) => {
    if (!supabase) return
    setBusy(true); setErr('')
    try {
      const { data: s } = await supabase.auth.getSession()
      const token = s?.session?.access_token
      if (!token) throw new Error(L('Sign in again to analyse your day', 'Log masuk semula untuk analisis hari anda', 'Masuk lagi untuk menganalisis harimu'))
      const res = await fetch(WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ regenerate, lang: lang ?? appLang }),
      })
      if (!res.ok) throw new Error(`${L('analysis unavailable', 'analisis tidak tersedia', 'analisis tidak tersedia')} (${res.status})`)
      setBrief(await res.json() as Brief)
      setOpen(true)
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  if (!isReal) return null

  const blang = brief?.language ?? appLang
  const ui = (k: keyof typeof UI) => UI[k][blang]

  return (
    <>
      <button type="button" disabled={busy} onClick={() => analyse()}
        className="mb-4 flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-accent/50 bg-accent-soft p-3.5 text-left transition-opacity hover:opacity-90 disabled:opacity-50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
          <BrainCircuit size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-accent">
            {busy
              ? L('Analysing your day…', 'Menganalisis hari anda…', 'Menganalisis harimu…')
              : L('Analyse My Day', 'Analisis My Day', 'Analisis My Day')}
          </span>
          <span className="block text-[11px] text-muted">
            {L('AG AI Coach — your calls, leads and plan, scored and prioritised',
              'AG AI Coach — panggilan, leads dan rancangan anda, diskor dan diutamakan',
              'AG AI Coach — panggilan, leads dan rencanamu, dinilai dan diprioritaskan')}
          </span>
        </span>
      </button>
      {err && <p className="mb-3 rounded-lg bg-danger/10 p-2 text-xs text-danger">{err}</p>}

      {open && brief && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}>
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-extrabold">AG AI Coach</h2>
                <p className="text-[11px] text-muted">
                  {new Date(brief.on_date).toLocaleDateString(blang === 'ms' ? 'ms-MY' : blang === 'id' ? 'id-ID' : 'en-GB')} · {ui('shared')}
                </p>
              </div>
              {/* language switch — regenerates the brief in the chosen language */}
              <div className="flex rounded-full border border-border p-0.5">
                {langOptions.map((l) => (
                  <button key={l.v} type="button" disabled={busy}
                    onClick={() => { if (l.v !== blang) analyse(false, l.v) }}
                    className={clsx('cursor-pointer rounded-full px-2.5 py-1 text-[10px] font-extrabold',
                      blang === l.v ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink')}>
                    {l.label}
                  </button>
                ))}
              </div>
              <button type="button" disabled={busy} onClick={() => analyse(true, blang)} aria-label={L('Re-analyse', 'Analisis semula', 'Analisis ulang')}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
                <RefreshCw size={14} className={clsx(busy && 'animate-spin')} />
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label={L('Close', 'Tutup', 'Tutup')}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
                <X size={15} />
              </button>
            </div>

            {/* scores — tap mentality: overall big, rest as bars */}
            <Card className="mb-3 p-4">
              <div className="mb-3 flex items-center gap-4">
                <p className={clsx('font-display text-4xl font-extrabold',
                  brief.scores.overall >= 70 ? 'text-success' : brief.scores.overall >= 40 ? 'text-warning' : 'text-danger')}>
                  {brief.scores.overall}
                </p>
                <p className="text-[11px] leading-relaxed text-muted">{ui('scoreNote')}</p>
              </div>
              {Object.entries(brief.scores)
                .filter(([k]) => k !== 'overall' && k !== '_explain')
                .map(([k, v]) => (
                  <div key={k} className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 text-muted">{SCORE_LABELS[k]?.[blang] ?? k}</span>
                    <Bar pct={v as number} className="flex-1" />
                    <b className="w-8 text-right">{v as number}</b>
                  </div>
                ))}
            </Card>

            {/* win first — that is the deal */}
            <Card className="mb-3 border-success/40 p-3.5">
              <p className="flex items-start gap-2 text-sm">
                <Trophy size={15} className="mt-0.5 shrink-0 text-success" />
                <span>{brief.narrative.win}</span>
              </p>
            </Card>

            {brief.narrative.gaps.map((g, i) => (
              <Card key={i} className="mb-2 border-warning/40 p-3.5">
                <p className="mb-1 flex items-center gap-2 text-sm font-bold">
                  <AlertTriangle size={14} className="shrink-0 text-warning" /> {g.issue}
                </p>
                <p className="text-xs leading-relaxed text-muted">{g.why}</p>
                <p className="mt-1 text-[11px] font-semibold text-warning">💸 {g.cost}</p>
              </Card>
            ))}

            <Card className="mb-3 p-4">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
                {ui('top5')}
              </p>
              <ol className="space-y-2">
                {brief.narrative.top5.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-muted" />
                    <span><b className="mr-1 text-accent">{i + 1}.</b>{a}</span>
                  </li>
                ))}
              </ol>
            </Card>

            {/* grooming: this week's development focus + today's micro-drill */}
            {brief.narrative.grooming && (
              <Card className="mb-3 border-accent/50 p-4">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-accent">
                  🎯 {ui('focus')}: {brief.narrative.grooming.focus_key.split('.').pop()?.replace(/_/g, ' ')}
                </p>
                <p className="text-[13px] leading-relaxed">{brief.narrative.grooming.drill}</p>
                {brief.narrative.grooming.technique_tip && (
                  <p className="mt-2 rounded-lg bg-surface2 p-2.5 text-xs leading-relaxed">
                    💪 {brief.narrative.grooming.technique_tip}
                  </p>
                )}
                <p className="mt-2 text-[10px] text-muted">
                  {brief.narrative.grooming.focus_set_by === 'coach' ? ui('setByCoach') : ui('setByAI')}
                </p>
              </Card>
            )}

            {/* marketing: advised, never scored — we do not track posting */}
            {brief.narrative.marketing && (
              <Card className="mb-3 p-4">
                <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
                  📣 {ui('marketing')}
                </p>
                <p className="text-[13px] leading-relaxed">{brief.narrative.marketing.todays_move}</p>
                {brief.narrative.marketing.twist && (
                  <p className="mt-1 text-xs italic text-muted">{brief.narrative.marketing.twist}</p>
                )}
                {brief.narrative.marketing.study && (
                  <p className="mt-2 rounded-lg bg-surface2 p-2.5 text-xs leading-relaxed">
                    📚 {brief.narrative.marketing.study}
                  </p>
                )}
                <div className="mt-3 space-y-1">
                  {brief.narrative.marketing.best_times.map((t, i) => (
                    <p key={i} className="text-[11px] leading-relaxed text-muted">⏰ {t}</p>
                  ))}
                </div>
                {/* the DO for this advice lives in Social Coaching */}
                <Link to="/grow/social"
                  className="mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-accent/50 py-2.5 text-xs font-extrabold text-accent no-underline">
                  <Camera size={13} />
                  {blang === 'ms' ? 'Buka Social Coaching — caption sedia guna →'
                    : blang === 'id' ? 'Buka Social Coaching — caption siap pakai →'
                    : 'Open Social Coaching — ready captions →'}
                </Link>
                <p className="mt-2 text-[10px] text-muted">{ui('mktNote')}</p>
              </Card>
            )}

            {brief.narrative.quote && (
              <Card className="mb-3 border-accent/40 p-4 text-center">
                <p className="text-sm italic leading-relaxed">“{brief.narrative.quote.body}”</p>
                <p className="mt-1 text-[11px] text-muted">— {brief.narrative.quote.author}</p>
              </Card>
            )}

            {brief.narrative.talent_note && (
              <p className="mb-3 rounded-xl bg-accent-soft p-3 text-xs leading-relaxed text-accent">
                🧭 {brief.narrative.talent_note}
              </p>
            )}

            <p className="mb-1 text-center text-sm font-bold">{brief.narrative.closing_line}</p>
            <p className="text-center text-[10px] text-muted">
              {brief.generated_by === 'ai' ? 'AG AI Coach' : ui('offline')} · {ui('explain')}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
