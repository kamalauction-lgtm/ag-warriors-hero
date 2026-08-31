/* P1 — Today / Week / 30 Days.
   TODAY      = the End-of-Day Review, generated entirely from Hero records.
                The warrior is never asked to re-type what the CRM already holds.
   WEEK       = this week against THEIR OWN previous week. No AG benchmark exists
                and none is invented — every comparison is self-referential.
   30 DAYS    = what they have actually built since activation. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, TrendingUp, TrendingDown, Minus, Trophy, Flame } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Bar, Card, Chip, SectionTitle } from '../../components/ui'

interface Week {
  from: string; to: string; active_days: number; new_leads: number; touches: number
  follow_ups: number; appointments: number; viewings_done: number
  days_approved: number; stage_moves: number; overdue_now: number
}
interface Funnel {
  conversations: number; leads: number; engaged: number; qualified: number
  appointments: number; viewings: number; viewings_done: number; follow_ups: number
  negotiation: number; closing_process: number; verified_closings: number
}
export interface ProgressData {
  today: {
    date: string; new_conversations: number; touches: number; followups_done: number
    followups_left: number; appointments_made: number; active_leads: number
    with_next_action: number; stage_moves: number
    curriculum: { day_no: number; status: string } | null
  }
  week: { current: Week; previous: Week; delta: Record<string, number> }
  programme: {
    accessible_day: number; cohort_day: number; started_on: string
    days_approved: number; days_awaiting: number; days_revision: number
    streak: number; verified_xp: number; badges: number; active_days_total: number
    funnel: Funnel
  }
}

function Delta({ n }: { n: number }) {
  const Icon = n > 0 ? TrendingUp : n < 0 ? TrendingDown : Minus
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-[11px] font-bold',
      n > 0 ? 'text-success' : n < 0 ? 'text-warning' : 'text-muted')}>
      <Icon size={11} />{n > 0 ? `+${n}` : n}
    </span>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-2xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Progress({ enrolmentId }: { enrolmentId: string }) {
  const { locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [tab, setTab] = useState<'today' | 'week' | 'all'>('today')
  const [d, setD] = useState<ProgressData | null>(null)
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setState('loading'); setErr('')
    const { data, error } = await supabase.rpc('fn_progress', { p_enrolment: enrolmentId })
    if (error) { setErr(error.message); setState('error'); return }
    setD(data as unknown as ProgressData); setState('ready')
  }, [enrolmentId])
  useEffect(() => { load() }, [load])

  if (state === 'error') return (
    <Card className="mb-3 border-danger/50 bg-danger/10 p-3 text-xs font-bold text-danger">⚠ {err}</Card>)
  if (!d) return <Card className="mb-3 p-6 text-center text-xs text-muted">{L('Loading…', 'Memuatkan…', 'Memuat…')}</Card>

  const TABS = [
    ['today', L('Today', 'Hari ini', 'Hari ini')],
    ['week', L('This week', 'Minggu ini', 'Minggu ini')],
    ['all', L('30 Days', '30 Hari', '30 Hari')],
  ] as const

  const w = d.week.current, prev = d.week.previous, dl = d.week.delta
  const f = d.programme.funnel

  return (
    <>
      <div className="mb-3 flex items-center gap-1.5">
        {TABS.map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={clsx('h-9 flex-1 cursor-pointer rounded-xl border text-xs font-extrabold',
              tab === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}>
            {lbl}
          </button>
        ))}
        <button type="button" onClick={load} aria-label={L('Refresh', 'Muat semula', 'Muat ulang')}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border text-muted">
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ---------- TODAY = End-of-Day Review, auto-generated ---------- */}
      {tab === 'today' && (
        <Card className="mb-3 p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">
            {L('My day', 'Hari saya', 'Hari saya')} · {d.today.date}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label={L('New conversations', 'Perbualan baharu', 'Percakapan baru')} value={d.today.new_conversations} />
            <Stat label={L('Touches logged', 'Sentuhan direkod', 'Interaksi tercatat')} value={d.today.touches} />
            <Stat label={L('Follow-ups done', 'Susulan selesai', 'Follow-up selesai')} value={d.today.followups_done} />
            <Stat label={L('Follow-ups left', 'Susulan berbaki', 'Follow-up tersisa')} value={d.today.followups_left} />
            <Stat label={L('Appointments made', 'Temujanji dibuat', 'Janji temu dibuat')} value={d.today.appointments_made} />
            <Stat label={L('Pipeline moves', 'Pergerakan pipeline', 'Pergerakan pipeline')} value={d.today.stage_moves} />
            <Stat label={L('Active leads', 'Lead aktif', 'Lead aktif')} value={d.today.active_leads} />
            <Stat label={L('With next action', 'Ada tindakan', 'Ada tindakan')}
              value={`${d.today.with_next_action}/${d.today.active_leads}`} />
          </div>
          <div className="mt-3 rounded-xl bg-surface2 p-3">
            <p className="text-xs">
              <b>{L('Curriculum', 'Kurikulum', 'Kurikulum')}:</b>{' '}
              {d.today.curriculum
                ? `${L('Day', 'Hari', 'Hari')} ${d.today.curriculum.day_no} — ${d.today.curriculum.status}`
                : L('nothing submitted today', 'tiada dihantar hari ini', 'belum ada yang dikirim hari ini')}
            </p>
          </div>
          <p className="mt-2 text-[10px] text-muted">
            {L('Generated from your Hero records. You never have to re-type what the CRM already holds.',
               'Dijana daripada rekod Hero anda. Anda tidak perlu menaip semula apa yang sudah ada dalam CRM.',
               'Dibuat dari catatan Hero Anda. Anda tidak perlu mengetik ulang apa yang sudah ada di CRM.')}
          </p>
        </Card>
      )}

      {/* ---------- WEEK = you vs your own previous week ---------- */}
      {tab === 'week' && (
        <Card className="mb-3 p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">
            {w.from} → {w.to}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label={L('Active days', 'Hari aktif', 'Hari aktif')} value={w.active_days} sub={<Delta n={dl.active_days} />} />
            <Stat label={L('New leads', 'Lead baharu', 'Lead baru')} value={w.new_leads} sub={<Delta n={dl.new_leads} />} />
            <Stat label={L('Touches', 'Sentuhan', 'Interaksi')} value={w.touches} sub={<Delta n={dl.touches} />} />
            <Stat label={L('Follow-ups', 'Susulan', 'Follow-up')} value={w.follow_ups} sub={<Delta n={dl.follow_ups} />} />
            <Stat label={L('Appointments', 'Temujanji', 'Janji temu')} value={w.appointments} sub={<Delta n={dl.appointments} />} />
            <Stat label={L('Days approved', 'Hari diluluskan', 'Hari disetujui')} value={w.days_approved} sub={<Delta n={dl.days_approved} />} />
          </div>
          {w.overdue_now > 0 && (
            <p className="mt-3 rounded-lg bg-warning/10 p-2.5 text-xs font-semibold text-warning">
              {w.overdue_now} {L('follow-up(s) are overdue right now.', 'susulan tertunggak sekarang.', 'follow-up terlambat saat ini.')}
            </p>
          )}
          <p className="mt-2 text-[10px] text-muted">
            {L('Compared with your own previous week', 'Dibandingkan dengan minggu anda sendiri sebelum ini', 'Dibandingkan dengan minggu Anda sendiri sebelumnya')}
            {' '}({prev.from} → {prev.to}). {L('Hero does not compare you to a benchmark.',
              'Hero tidak membandingkan anda dengan penanda aras.', 'Hero tidak membandingkan Anda dengan tolok ukur.')}
          </p>
        </Card>
      )}

      {/* ---------- 30 DAYS = what you actually built ---------- */}
      {tab === 'all' && (
        <>
          <Card className="mb-3 p-4">
            <div className="mb-1 flex justify-between text-xs font-bold">
              <span>{L('Verified days', 'Hari disahkan', 'Hari terverifikasi')} {d.programme.days_approved}/30</span>
              <span className="text-muted">{L('since', 'sejak', 'sejak')} {d.programme.started_on}</span>
            </div>
            <Bar pct={(d.programme.days_approved / 30) * 100} />
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={L('Awaiting review', 'Menunggu semakan', 'Menunggu tinjauan')} value={d.programme.days_awaiting} />
              <Stat label={L('Need revision', 'Perlu semakan', 'Perlu revisi')} value={d.programme.days_revision} />
              <Stat label={L('Active days', 'Hari aktif', 'Hari aktif')} value={d.programme.active_days_total} />
              <Stat label={L('Streak', 'Rentetan', 'Streak')} value={d.programme.streak} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone="accent"><Trophy size={11} /> {d.programme.verified_xp} XP</Chip>
              {d.programme.badges > 0 && <Chip tone="success">{d.programme.badges} {L('badges', 'lencana', 'lencana')}</Chip>}
              {d.programme.streak >= 7 && <Chip tone="success"><Flame size={11} /> {L('On fire', 'Membara', 'Membara')}</Chip>}
            </div>
          </Card>

          <SectionTitle>{L('My funnel', 'Funnel saya', 'Funnel saya')}</SectionTitle>
          <Card className="mb-3 p-4">
            {([
              ['conversations', L('Conversations', 'Perbualan', 'Percakapan')],
              ['engaged', L('Engaged', 'Melayan', 'Merespons')],
              ['qualified', L('Qualified', 'Layak', 'Qualified')],
              ['appointments', L('Appointments', 'Temujanji', 'Janji temu')],
              ['viewings_done', L('Viewings done', 'Viewing selesai', 'Viewing selesai')],
              ['negotiation', L('Negotiation', 'Rundingan', 'Negosiasi')],
              ['verified_closings', L('Verified closings', 'Closing disahkan', 'Closing terverifikasi')],
            ] as const).map(([k, lbl]) => {
              const n = f[k] ?? 0
              const top = Math.max(f.conversations, f.leads, 1)
              return (
                <div key={k} className="mb-2.5 last:mb-0">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">{lbl}</span><span className="text-muted">{n}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                    <div className={clsx('h-full rounded-full', k === 'verified_closings' ? 'bg-success' : 'bg-accent')}
                      style={{ width: `${Math.min(100, (n / top) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
            <p className="mt-3 text-[10px] text-muted">
              {L('Your actual counts. Hero does not assume a conversion rate.',
                 'Kiraan sebenar anda. Hero tidak mengandaikan kadar penukaran.',
                 'Hitungan nyata Anda. Hero tidak mengasumsikan tingkat konversi.')}
            </p>
          </Card>

          <Link to="/pipeline" className="mb-3 block">
            <Card className="flex items-center gap-3 p-3.5">
              <span className="text-xl">📇</span>
              <p className="flex-1 text-sm font-bold">{L('Open my pipeline', 'Buka pipeline saya', 'Buka pipeline saya')}</p>
              <Chip tone="accent">{L('Open', 'Buka', 'Buka')}</Chip>
            </Card>
          </Link>
        </>
      )}
    </>
  )
}
