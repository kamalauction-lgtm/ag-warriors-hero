/* P1 — MY POD TODAY. A Coach should not have to inspect every warrior every day.
   This answers three questions and nothing else: who is moving, who is stuck,
   who needs me today — and puts the important case within one or two taps.
   Every number is a fact from the warrior's own records; "urgency" is a sort key
   built from those facts, never a judgement about the person. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, ChevronRight, AlertTriangle, Clock, Users } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface Pod {
  enrolment_id: string; participant_id: string; name: string; country: string
  stage: string; cohort: string; cohort_day: number; accessible_day: number
  days_approved: number; pending_reviews: number; oldest_pending_hours: number | null
  readiness_pending: number; days_inactive: number; overdue_followups: number
  active_leads: number; bottleneck: string | null; urgency: string
}

const BN_LABEL: Record<string, [string, string, string]> = {
  PROSPECTING_GAP: ['Prospecting', 'Prospek', 'Prospek'],
  OPENING_GAP: ['Opening', 'Pembukaan', 'Pembuka'],
  DISCOVERY_GAP: ['Discovery', 'Menggali keperluan', 'Menggali kebutuhan'],
  NEXT_STEP_GAP: ['Qualified → Appointment', 'Layak → Temujanji', 'Qualified → Janji temu'],
  FOLLOW_UP_GAP: ['Follow-up', 'Susulan', 'Follow-up'],
  PRESENTATION_GAP: ['Presentation & fit', 'Persembahan', 'Presentasi'],
  OBJECTION_GAP: ['Objections', 'Bantahan', 'Keberatan'],
  CLOSING_READINESS_GAP: ['Closing readiness', 'Kesediaan closing', 'Kesiapan closing'],
}

export default function PodToday() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [rows, setRows] = useState<Pod[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [err, setErr] = useState('')
  const [asOf, setAsOf] = useState('')
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !user) return
    setState('loading'); setErr('')
    const { data, error } = await supabase.rpc('fn_coach_pod')
    if (error) { setErr(error.message); setState('error'); setRows([]); return }
    setRows((data as unknown as Pod[]) ?? [])
    setAsOf(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    setState('ready')
  }, [user])
  useEffect(() => { load() }, [load])

  const needsMe = rows.filter((r) => r.urgency === '3')
  const attention = rows.filter((r) => r.urgency === '2')
  const watch = rows.filter((r) => r.urgency === '1')
  const onTrack = rows.filter((r) => r.urgency === '0')

  const why = (r: Pod) => {
    const bits: string[] = []
    if (r.readiness_pending > 0) bits.push(L('readiness waiting', 'kesediaan menunggu', 'kesiapan menunggu'))
    if (r.pending_reviews > 0)
      bits.push(`${r.pending_reviews} ${L('to review', 'untuk disemak', 'untuk ditinjau')}${r.oldest_pending_hours != null ? ` · ${r.oldest_pending_hours}h` : ''}`)
    if (r.days_inactive >= 2 && r.days_inactive < 900)
      bits.push(`${L('inactive', 'tidak aktif', 'tidak aktif')} ${r.days_inactive}d`)
    if (r.days_inactive >= 900) bits.push(L('no activity yet', 'belum ada aktiviti', 'belum ada aktivitas'))
    if (r.overdue_followups > 0) bits.push(`${r.overdue_followups} ${L('overdue', 'tertunggak', 'terlambat')}`)
    return bits.join(' · ') || L('moving', 'bergerak', 'bergerak')
  }

  const Row = ({ r }: { r: Pod }) => (
    <Link to="/coach" onClick={(e) => e.preventDefault()}
      className="flex items-center gap-3 border-b border-border py-2.5 no-underline last:border-0">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{r.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.name}</span>
          {r.stage !== 'active' && <Chip tone="warning">{r.stage}</Chip>}
        </span>
        <span className="block truncate text-[11px] text-muted">{why(r)}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-display text-sm font-extrabold">
          {r.stage === 'active' ? `${r.days_approved}/30` : '—'}
        </span>
        {r.bottleneck && (
          <span className="block text-[10px] text-muted">
            {L(...(BN_LABEL[r.bottleneck] ?? [r.bottleneck, r.bottleneck, r.bottleneck]))}
          </span>
        )}
      </span>
      <ChevronRight size={15} className="shrink-0 text-muted" />
    </Link>
  )

  if (state === 'error') return (
    <Card className="mb-4 p-4 text-center">
      <p className="text-sm font-bold text-danger">⚠ {L('Could not load your pod', 'Tidak dapat memuatkan pod anda', 'Tidak dapat memuat pod Anda')}</p>
      <p className="mt-1 text-xs text-muted">{err}</p>
    </Card>
  )

  return (
    <>
      <SectionTitle>
        <Users size={13} className="mr-1 inline" />{L('My pod today', 'Pod saya hari ini', 'Pod saya hari ini')}
      </SectionTitle>
      <Card className="mb-4 p-4">
        <div className="mb-3 flex items-center gap-2">
          <button type="button" onClick={load} disabled={state === 'loading'}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-bold disabled:opacity-40">
            <RefreshCw size={12} className={state === 'loading' ? 'animate-spin' : ''} /> {L('Refresh', 'Muat semula', 'Muat ulang')}
          </button>
          {asOf && state === 'ready' && <span className="text-[10px] text-muted">{L('as of', 'setakat', 'per')} {asOf}</span>}
        </div>

        {state === 'loading' && <p className="py-6 text-center text-xs text-muted">{L('Loading…', 'Memuatkan…', 'Memuat…')}</p>}

        {state === 'ready' && rows.length === 0 && (
          <p className="py-6 text-center text-xs text-muted">
            {L('No Warriors are assigned to you yet.', 'Tiada Warrior ditugaskan kepada anda lagi.', 'Belum ada Warrior yang ditugaskan kepada Anda.')}
          </p>
        )}

        {state === 'ready' && rows.length > 0 && (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              {([[onTrack.length, L('On track', 'Di landasan', 'On track'), 'text-success'],
                 [attention.length + watch.length, L('Need attention', 'Perlu perhatian', 'Perlu perhatian'), 'text-warning'],
                 [needsMe.length, L('Need me today', 'Perlu saya hari ini', 'Perlu saya hari ini'), 'text-accent']] as const).map(([n, lbl, cls], i) => (
                <div key={i} className="rounded-xl border border-border p-2">
                  <p className={clsx('font-display text-xl font-extrabold', cls)}>{n}</p>
                  <p className="text-[10px] font-semibold text-muted">{lbl}</p>
                </div>
              ))}
            </div>

            {needsMe.length > 0 && (
              <>
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-accent">
                  <AlertTriangle size={11} /> {L('Needs you today', 'Perlukan anda hari ini', 'Perlu Anda hari ini')}
                </p>
                <div className="mb-3">{needsMe.map((r) => <Row key={r.enrolment_id} r={r} />)}</div>
              </>
            )}
            {(attention.length > 0 || watch.length > 0) && (
              <>
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-warning">
                  <Clock size={11} /> {L('Watch', 'Perhati', 'Perhatikan')}
                </p>
                <div className="mb-3">{[...attention, ...watch].map((r) => <Row key={r.enrolment_id} r={r} />)}</div>
              </>
            )}
            {onTrack.length > 0 && (
              <>
                <button type="button" onClick={() => setShowAll((v) => !v)}
                  className="cursor-pointer text-[11px] font-bold text-accent">
                  {showAll ? L('Hide', 'Sembunyi', 'Sembunyikan') : L('Show', 'Papar', 'Tampilkan')} {onTrack.length} {L('on track', 'di landasan', 'on track')}
                </button>
                {showAll && <div className="mt-2">{onTrack.map((r) => <Row key={r.enrolment_id} r={r} />)}</div>}
              </>
            )}
            <p className="mt-3 text-[10px] text-muted">
              {L('Ordered by what is waiting on you — pending reviews first, then inactivity, then overdue follow-ups. The queues below are where you act.',
                 'Disusun mengikut apa yang menunggu anda — semakan tertunggak dahulu, kemudian ketidakaktifan, kemudian susulan tertunggak. Barisan di bawah tempat anda bertindak.',
                 'Diurutkan berdasarkan apa yang menunggu Anda — tinjauan tertunda dulu, lalu ketidakaktifan, lalu follow-up terlambat. Antrean di bawah tempat Anda bertindak.')}
            </p>
          </>
        )}
      </Card>
    </>
  )
}
