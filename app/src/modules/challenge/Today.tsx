/* P1 — TODAY: the main participant experience.
   Answers, in order, without scrolling on a phone:
     What day am I on? · What must I do today? · What business action is due?
     Which lead needs attention? · Am I on track? · Where am I stuck? · What next?

   Five layers: LEARN · TALK · FOLLOW UP · MOVE · REVIEW.
   One dominant CTA. Counts come from real Hero records — a target ring only
   appears when an ACTIVE target exists (they are DRAFT until Commander approves,
   so Hero shows the count and never claims "on track"). */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Target, PhoneCall, CalendarClock, BookOpen, ArrowRight, Compass, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Card, Chip, Bar, SectionTitle } from '../../components/ui'
import NextActions from './NextActions'

const LKEY: Record<string, string> = { en: 'en', bm: 'ms-MY', id: 'id-ID' }
const jt = (j: Record<string, string> | null | undefined, loc: string) =>
  j?.[LKEY[loc] ?? 'en'] ?? j?.en ?? ''

export interface Mission {
  enrolment_id: string
  local_date: string
  cohort_day: number
  accessible_day: number
  curriculum: { day_no: number; phase: number; title: Record<string, string>; objective: Record<string, string>; xp_amount: number; proof_type: string | null; status: string } | null
  proof: { applicable: boolean; source?: string; required?: number; have?: number; satisfied?: boolean }
  business: { new_conversations: number; followups_due: number; touches_today: number; active_leads: number; leads_without_next_action: number }
  targets: Partial<Record<'new_conversations' | 'followups_cleared' | 'active_leads_with_next_action', number>>
  priority: { code: string; count: number; link: string } | null
}
export interface Targets {
  policy_active: boolean
  outreach: { done: number; target: number | null }
  followups: { done: number; due: number }
  next_action: { done: number; of: number }
  replies_outcome_only: number
  touches_total: number
  language: string | null
}
export interface Bottle {
  code: string | null
  label?: Record<string, string>
  explanation?: Record<string, string>
  recommend_day?: number
  evidence: Record<string, number>
}

/* A count with an optional target. No target → no ring, no "on track" claim. */
function Metric({ label, value, target, tone }: { label: string; value: number; target?: number; tone?: 'warn' | 'good' }) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : null
  return (
    <div className="min-w-0">
      <p className="font-display text-2xl font-extrabold leading-none">
        <span className={clsx(tone === 'warn' && value > 0 && 'text-warning', tone === 'good' && value > 0 && 'text-success')}>{value}</span>
        {target != null && <span className="text-sm font-bold text-muted"> / {target}</span>}
      </p>
      <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      {pct != null && <Bar pct={pct} className="mt-1.5" />}
    </div>
  )
}

export default function Today({ enrolmentId, onOpenDay, onQuickLog }: {
  enrolmentId: string
  onOpenDay: (day: number) => void
  onQuickLog: () => void
}) {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [m, setM] = useState<Mission | null>(null)
  const [b, setB] = useState<Bottle | null>(null)
  /* Targets are resolved SERVER-SIDE from the active daily_targets policy version.
     No number in this file is a governance value. */
  const [tg, setTg] = useState<Targets | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !user) return
    setErr('')
    const { data, error } = await supabase.rpc('fn_daily_mission', { p_enrolment: enrolmentId })
    if (error) { setErr(error.message); return }
    setM(data as unknown as Mission)
    const { data: bn } = await supabase.rpc('fn_bottleneck', { p_participant: user.id })
    setB(bn as unknown as Bottle)
    const { data: t } = await supabase.rpc('fn_targets_for', { p_enrolment: enrolmentId })
    setTg((t as unknown as Targets) ?? null)
  }, [enrolmentId, user])
  useEffect(() => { load() }, [load])

  if (err) return <Card className="mb-4 border-danger/50 bg-danger/10 p-3 text-xs font-bold text-danger">⚠ {err}</Card>
  if (!m) return <Card className="mb-4 p-6 text-center text-xs text-muted">{L('Loading your day…', 'Memuatkan hari anda…', 'Memuat hari Anda…')}</Card>

  const PRIORITY: Record<string, { icon: typeof PhoneCall; title: string; cta: string; tone: string }> = {
    VIEWING_PREP: {
      icon: CalendarClock, tone: 'accent',
      title: L('Viewing preparation', 'Persediaan viewing', 'Persiapan viewing'),
      cta: L('Prepare now', 'Sedia sekarang', 'Siapkan sekarang'),
    },
    POST_VIEWING_FOLLOW_UP: {
      icon: PhoneCall, tone: 'warning',
      title: L('Viewing done, no follow-up yet', 'Viewing selesai, belum susulan', 'Viewing selesai, belum follow-up'),
      cta: L('Follow up', 'Buat susulan', 'Follow up'),
    },
    FOLLOW_UPS_DUE: {
      icon: PhoneCall, tone: 'warning',
      title: L('Follow-ups due', 'Susulan perlu dibuat', 'Follow-up jatuh tempo'),
      cta: L('Start my mission', 'Mula misi saya', 'Mulai misi saya'),
    },
    SET_APPOINTMENT: {
      icon: Target, tone: 'accent',
      title: L('Qualified — needs an appointment', 'Layak — perlu temujanji', 'Qualified — perlu janji temu'),
      cta: L('Set appointment', 'Tetapkan temujanji', 'Atur janji temu'),
    },
  }
  const pri = m.priority ? PRIORITY[m.priority.code] : null
  const dayLocked = m.accessible_day < 1
  const dayDone = m.curriculum?.status === 'approved'

  return (
    <>
      {/* ---- the day ---- */}
      <Card className="mb-3 p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
              {L('Day', 'Hari', 'Hari')} {Math.max(m.accessible_day, 0)} <span className="text-muted/60">/ 30</span>
            </p>
            <p className="font-display text-lg font-extrabold leading-tight">
              {m.curriculum ? jt(m.curriculum.title, locale) : L('Not started yet', 'Belum bermula', 'Belum dimulai')}
            </p>
            {m.curriculum && <p className="mt-0.5 text-xs text-muted">{jt(m.curriculum.objective, locale)}</p>}
          </div>
          {dayDone
            ? <Chip tone="success"><CheckCircle2 size={11} /> {L('Done', 'Selesai', 'Selesai')}</Chip>
            : m.curriculum && <Chip tone="accent">+{m.curriculum.xp_amount} XP</Chip>}
        </div>
        <Bar pct={(Math.max(m.accessible_day, 0) / 30) * 100} className="mt-3" />
        <p className="mt-1.5 text-[10px] text-muted">
          {L('Cohort day', 'Hari kohort', 'Hari cohort')} {m.cohort_day}/30
          {m.accessible_day < m.cohort_day && ` · ${L('you move at your own pace', 'anda maju ikut rentak sendiri', 'Anda maju sesuai ritme sendiri')}`}
        </p>
      </Card>

      {/* ---- ONE dominant CTA: the live customer commitment outranks the lesson ---- */}
      {pri && m.priority && (
        <Card className={clsx('mb-3 p-4', pri.tone === 'warning' ? 'border-warning/50 bg-warning/10' : 'border-accent/50 bg-accent-soft')}>
          <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">
            <Flame size={11} /> {L('Hero priority', 'Keutamaan Hero', 'Prioritas Hero')}
          </p>
          <p className="mt-1 font-display text-lg font-extrabold leading-tight">
            {m.priority.count} · {pri.title}
          </p>
          <Link to="/pipeline"
            className="mt-3 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-sm font-extrabold text-on-accent no-underline">
            {pri.cta} <ArrowRight size={16} />
          </Link>
        </Card>
      )}

      {/* ---- NEXT-ACTION DISCIPLINE: what is actually waiting on you ---- */}
      {user && <NextActions participantId={user.id} />}

      {/* ---- TALK / FOLLOW UP / MOVE ---- */}
      <SectionTitle>{L('Daily business', 'Perniagaan harian', 'Bisnis harian')}</SectionTitle>
      <Card className="mb-3 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* "New outreaches" counts DISTINCT people contacted for the first time
              today. Ten messages to the same person is one outreach. */}
          <Metric label={L('New outreaches', 'Hubungan baharu', 'Jangkauan baru')}
            value={tg?.outreach.done ?? m.business.new_conversations}
            target={tg?.outreach.target ?? undefined} />
          <Metric label={L('Follow-ups', 'Susulan', 'Follow-up')}
            value={tg?.followups.done ?? 0} target={tg?.followups.due || undefined}
            tone={(tg?.followups.due ?? 0) > (tg?.followups.done ?? 0) ? 'warn' : 'good'} />
          <Metric label={L('Leads with next action', 'Lead ada tindakan', 'Lead ada tindakan')}
            value={tg?.next_action.done ?? 0} target={tg?.next_action.of || undefined} />
          <Metric label={L('No next action', 'Tiada tindakan', 'Tanpa tindakan')}
            value={m.business.leads_without_next_action} tone="warn" />
        </div>
        {tg?.policy_active && (
          <p className="mt-2 text-[10px] text-muted">
            {L('Replies', 'Balasan', 'Balasan')}: {tg.replies_outcome_only} ·{' '}
            {L('You control the reaching out, not the answering — replies are an outcome, never a target.',
               'Anda kawal usaha menghubungi, bukan jawapan — balasan ialah hasil, bukan sasaran.',
               'Anda mengendalikan penjangkauan, bukan balasannya — balasan adalah hasil, bukan target.')}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onQuickLog}
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-ink text-xs font-extrabold text-bg">
            <PhoneCall size={14} /> {L('Log a conversation', 'Rekod perbualan', 'Catat percakapan')}
          </button>
          <Link to="/pipeline"
            className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-4 text-xs font-extrabold text-muted no-underline">
            {L('My leads', 'Lead saya', 'Lead saya')}
          </Link>
        </div>
        {!tg?.policy_active && (
          <p className="mt-2 text-[10px] text-muted">
            {L('Daily targets are not set yet — Hero shows your real counts and will not guess whether you are on track.',
               'Sasaran harian belum ditetapkan — Hero papar kiraan sebenar dan tidak akan meneka sama ada anda di landasan.',
               'Target harian belum ditetapkan — Hero menampilkan hitungan nyata dan tidak menebak apakah Anda on track.')}
          </p>
        )}
      </Card>

      {/* ---- WHERE AM I STUCK: data → explanation → action ---- */}
      {b?.code && (
        <>
          <SectionTitle>{L('Your current focus', 'Fokus semasa anda', 'Fokus Anda saat ini')}</SectionTitle>
          <Card className="mb-3 border-accent/40 p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-accent">
              <Compass size={11} /> {L('Possible current bottleneck', 'Kemungkinan halangan semasa', 'Kemungkinan hambatan saat ini')}
            </p>
            <p className="mt-1 font-display text-base font-extrabold">{jt(b.label, locale)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([
                ['qualified', L('Qualified', 'Layak', 'Qualified')],
                ['appointments', L('Appointments', 'Temujanji', 'Janji temu')],
                ['overdue_followups', L('Overdue', 'Tertunggak', 'Terlambat')],
                ['leads_without_next_action', L('No next action', 'Tiada tindakan', 'Tanpa tindakan')],
              ] as const).map(([k, lbl]) => (
                <Chip key={k}>{lbl}: {b.evidence?.[k] ?? 0}</Chip>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{jt(b.explanation, locale)}</p>
            <div className="mt-3 flex gap-2">
              {b.recommend_day != null && b.recommend_day <= m.accessible_day && (
                <button type="button" onClick={() => onOpenDay(b.recommend_day!)}
                  className="h-11 flex-1 cursor-pointer rounded-xl border border-accent/60 text-xs font-extrabold text-accent">
                  {L('Revisit Day', 'Semak semula Hari', 'Tinjau ulang Hari')} {b.recommend_day}
                </button>
              )}
              <Link to="/pipeline"
                className="flex h-11 flex-1 cursor-pointer items-center justify-center rounded-xl bg-accent text-xs font-extrabold text-on-accent no-underline">
                {L('Open my pipeline', 'Buka pipeline saya', 'Buka pipeline saya')}
              </Link>
            </div>
          </Card>
        </>
      )}
      {b && !b.code && (m.business.active_leads > 0) && (
        <Card className="mb-3 border-success/40 bg-success/10 p-3.5">
          <p className="text-xs font-extrabold text-success">
            ✓ {L('No bottleneck detected — your pipeline is moving.', 'Tiada halangan dikesan — pipeline anda bergerak.', 'Tidak ada hambatan — pipeline Anda bergerak.')}
          </p>
        </Card>
      )}

      {/* ---- LEARN ---- */}
      <SectionTitle>{L('Learn', 'Belajar', 'Belajar')}</SectionTitle>
      <Card className="mb-3 flex items-center gap-3 p-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <BookOpen size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {m.curriculum ? jt(m.curriculum.title, locale) : L('Waiting for activation', 'Menunggu pengaktifan', 'Menunggu aktivasi')}
          </p>
          <p className="text-[11px] text-muted">
            {dayLocked
              ? L('Your Coach approves readiness first', 'Coach anda luluskan kesediaan dahulu', 'Coach Anda menyetujui kesiapan dulu')
              : m.proof?.applicable
                ? `${L('Proven by your Hero records', 'Dibuktikan oleh rekod Hero anda', 'Dibuktikan oleh catatan Hero Anda')} — ${m.proof.have}/${m.proof.required}`
                : L('Read, act, then submit your evidence', 'Baca, bertindak, kemudian hantar bukti', 'Baca, lakukan, lalu kirim bukti')}
          </p>
        </div>
        {!dayLocked && m.curriculum && (
          <button type="button" onClick={() => onOpenDay(m.curriculum!.day_no)}
            className="h-10 shrink-0 cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent">
            {dayDone ? L('Review', 'Semak', 'Tinjau') : L('Learn now', 'Belajar kini', 'Belajar sekarang')}
          </button>
        )}
      </Card>
    </>
  )
}
