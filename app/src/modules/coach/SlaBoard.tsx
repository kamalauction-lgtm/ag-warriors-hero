/* Coach SLA — operational, never punitive.
   The Coach should never have to work out a deadline themselves. Every row says
   what is waiting, for whom, and how long is left or how long it has run over.
   Language is "Due in 3h" / "Overdue 2h" / "Escalated to Master Mentor" — never
   a verdict about the Coach. SLA hours come from the coach_sla policy. */
import { useCallback, useEffect, useState } from 'react'
import { Timer, AlertTriangle, ArrowUpCircle, RefreshCw, Zap } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

export interface SlaRow {
  kind: 'readiness' | 'evidence'
  id: string; participant_id: string; name: string
  submitted_at: string; urgent: boolean
  sla_hours: number; hours_waiting: number; hours_over: number
  state: 'on_time' | 'overdue' | 'escalated_mentor' | 'escalated_admin'
  timezone: string
}

export default function SlaBoard({ onReview }: { onReview?: (kind: string, id: string) => void }) {
  const { locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [rows, setRows] = useState<SlaRow[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [err, setErr] = useState('')
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    setState('loading'); setErr('')
    const { data, error } = await supabase.rpc('fn_sla_board')
    if (error) { setErr(error.message); setState('error'); return }
    setRows((data as unknown as SlaRow[]) ?? []); setState('ready')
  }, [])
  useEffect(() => { load() }, [load])

  if (state === 'error') return (
    <Card className="mb-4 border-danger/50 bg-danger/10 p-3 text-xs font-bold text-danger">⚠ {err}</Card>)

  const onTime = rows.filter((r) => r.state === 'on_time')
  const overdue = rows.filter((r) => r.state === 'overdue')
  const escMentor = rows.filter((r) => r.state === 'escalated_mentor')
  const escAdmin = rows.filter((r) => r.state === 'escalated_admin')
  const urgent = rows.filter((r) => r.urgent)
  const needsAction = [...escAdmin, ...escMentor, ...overdue]

  const when = (r: SlaRow) => {
    if (r.state === 'on_time') {
      const left = Math.max(0, r.sla_hours - r.hours_waiting)
      return left <= 0
        ? L('Due now', 'Perlu sekarang', 'Jatuh tempo sekarang')
        : `${L('Due in', 'Perlu dalam', 'Jatuh tempo dalam')} ${left}h`
    }
    return `${L('Overdue', 'Tertunggak', 'Terlambat')} ${r.hours_over}h`
  }
  const badge = (r: SlaRow) =>
    r.state === 'escalated_admin' ? L('Escalated to Command HQ', 'Dinaikkan ke Command HQ', 'Dieskalasi ke Command HQ')
    : r.state === 'escalated_mentor' ? L('Escalated to Master Mentor', 'Dinaikkan ke Master Mentor', 'Dieskalasi ke Master Mentor')
    : null

  const Row = ({ r }: { r: SlaRow }) => (
    <div className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-bold">{r.name}</span>
          <Chip>{r.kind === 'readiness' ? L('Readiness', 'Kesediaan', 'Kesiapan') : L('Evidence', 'Bukti', 'Bukti')}</Chip>
          {r.urgent && <Chip tone="danger"><Zap size={10} /> {L('Urgent', 'Segera', 'Mendesak')}</Chip>}
        </span>
        <span className="block text-[11px] text-muted">
          {L('Submitted', 'Dihantar', 'Dikirim')} {r.submitted_at.slice(0, 16).replace('T', ' ')} ·{' '}
          {L('target', 'sasaran', 'target')} {r.sla_hours}h
          {badge(r) && <span className="text-warning"> · {badge(r)}</span>}
        </span>
      </span>
      <span className={clsx('shrink-0 text-right text-xs font-extrabold',
        r.state === 'on_time' ? 'text-muted'
          : r.state === 'overdue' ? 'text-warning' : 'text-danger')}>
        {when(r)}
      </span>
      {onReview && r.kind === 'evidence' && (
        <button type="button" onClick={() => onReview(r.kind, r.id)}
          className="h-9 shrink-0 cursor-pointer rounded-xl bg-accent px-3 text-[11px] font-extrabold text-on-accent">
          {L('Review', 'Semak', 'Tinjau')}
        </button>
      )}
    </div>
  )

  return (
    <>
      <SectionTitle>
        <Timer size={13} className="mr-1 inline" />{L('Review timing', 'Masa semakan', 'Waktu tinjauan')}
      </SectionTitle>
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2">
          <button type="button" onClick={load} disabled={state === 'loading'}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-bold disabled:opacity-40">
            <RefreshCw size={12} className={state === 'loading' ? 'animate-spin' : ''} />
            {L('Refresh', 'Muat semula', 'Muat ulang')}
          </button>
        </div>

        {state === 'loading' && <p className="py-4 text-center text-xs text-muted">{L('Loading…', 'Memuatkan…', 'Memuat…')}</p>}

        {state === 'ready' && rows.length === 0 && (
          <p className="py-4 text-center text-xs font-bold text-success">
            ✓ {L('Nothing is waiting on a review.', 'Tiada apa-apa menunggu semakan.', 'Tidak ada yang menunggu tinjauan.')}
          </p>
        )}

        {state === 'ready' && rows.length > 0 && (
          <>
            <div className="mb-3 grid grid-cols-4 gap-2 text-center">
              {([[onTime.length, L('On time', 'Ikut masa', 'Tepat waktu'), 'text-success'],
                 [overdue.length, L('Overdue', 'Tertunggak', 'Terlambat'), 'text-warning'],
                 [urgent.length, L('Urgent', 'Segera', 'Mendesak'), 'text-danger'],
                 [escMentor.length + escAdmin.length, L('Escalated', 'Dinaikkan', 'Dieskalasi'), 'text-danger']] as const)
                .map(([n, lbl, cls], i) => (
                  <div key={i} className="rounded-xl border border-border p-2">
                    <p className={clsx('font-display text-xl font-extrabold', cls)}>{n}</p>
                    <p className="text-[10px] font-semibold text-muted">{lbl}</p>
                  </div>
                ))}
            </div>

            {needsAction.length > 0 && (
              <>
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-warning">
                  <AlertTriangle size={11} /> {L('Waiting on you', 'Menunggu anda', 'Menunggu Anda')}
                </p>
                <div className="mb-3">{needsAction.map((r) => <Row key={r.kind + r.id} r={r} />)}</div>
              </>
            )}

            {onTime.length > 0 && (
              <>
                <button type="button" onClick={() => setShowAll((v) => !v)}
                  className="cursor-pointer text-[11px] font-bold text-accent">
                  {showAll ? L('Hide', 'Sembunyi', 'Sembunyikan') : L('Show', 'Papar', 'Tampilkan')}{' '}
                  {onTime.length} {L('still within target', 'masih dalam sasaran', 'masih dalam target')}
                </button>
                {showAll && <div className="mt-2">{onTime.map((r) => <Row key={r.kind + r.id} r={r} />)}</div>}
              </>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-[10px] text-muted">
              <ArrowUpCircle size={12} className="mt-0.5 shrink-0" />
              {L('Targets are operational, not a score. Nothing is ever auto-approved or auto-rejected when a target passes — the decision stays yours.',
                 'Sasaran bersifat operasi, bukan markah. Tiada apa-apa diluluskan atau ditolak automatik apabila sasaran berlalu — keputusan kekal milik anda.',
                 'Target bersifat operasional, bukan skor. Tidak ada yang disetujui atau ditolak otomatis saat target lewat — keputusan tetap milik Anda.')}
            </p>
          </>
        )}
      </Card>
    </>
  )
}
