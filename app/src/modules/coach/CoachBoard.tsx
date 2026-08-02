/* Coach Dashboard (§23) — assigned-participant overview with risk flags + filters.
   Data scope comes from RLS: a coach sees only assigned participants; admin/mentor see all. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface Row {
  pid: string; name: string; country: string | null
  cohortId: string; cohortName: string; status: string; catchUp: boolean
  approved: number; lastSub: string | null; revisionPending: boolean; awaitingReview: boolean
  leadsActive: number; leadsWon: number; nextAppt: string | null
  closingStatus: string | null; reportUnacked: boolean
}

const REL_DAYS = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null

export default function CoachBoard() {
  const { user } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [rows, setRows] = useState<Row[]>([])
  const [cohorts, setCohorts] = useState<{ id: string; name: string }[]>([])
  const [fCohort, setFCohort] = useState('all')
  const [fCountry, setFCountry] = useState('all')
  const [fStatus, setFStatus] = useState('all')
  const [fFlag, setFFlag] = useState('all')

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const [en, subs, leads, closes, reports, appts] = await Promise.all([
      supabase.from('enrolments').select(
        'id,participant_id,status,catch_up,cohort_id,cohorts(name),profiles!enrolments_participant_id_fkey(name,country)'),
      supabase.from('task_submissions').select('enrolment_id,day_no,version,status,submitted_at'),
      supabase.from('ch_leads').select('participant_id,stage'),
      supabase.from('ch_closings').select('participant_id,status'),
      supabase.from('coaching_reports').select('participant_id,status'),
      supabase.from('ch_appointments').select('participant_id,starts_at,status'),
    ])
    const cs: Record<string, string> = {}
    const out: Row[] = ((en.data ?? []) as unknown as {
      id: string; participant_id: string; status: string; catch_up: boolean; cohort_id: string
      cohorts: { name: string } | null; profiles: { name: string; country: string | null } | null
    }[]).map((e) => {
      cs[e.cohort_id] = e.cohorts?.name ?? '—'
      const allSubs = (subs.data ?? []).filter((s: { enrolment_id: string }) => s.enrolment_id === e.id) as
        { day_no: number; version: number; status: string; submitted_at: string }[]
      // only the LATEST version of each day counts for status flags (§9: originals preserved)
      const byDay: Record<number, { version: number; status: string }> = {}
      allSubs.forEach((s) => { if (!byDay[s.day_no] || s.version > byDay[s.day_no].version) byDay[s.day_no] = s })
      const mySubs = Object.values(byDay)
      const myLeads = (leads.data ?? []).filter((l: { participant_id: string }) => l.participant_id === e.participant_id)
      const myCloses = (closes.data ?? []).filter((c: { participant_id: string }) => c.participant_id === e.participant_id)
      const upcoming = (appts.data ?? [])
        .filter((a: { participant_id: string; starts_at: string | null; status: string }) =>
          a.participant_id === e.participant_id && a.starts_at && new Date(a.starts_at) > new Date()
          && !['CANCELLED', 'COMPLETED'].includes(a.status))
        .sort((a: { starts_at: string }, b: { starts_at: string }) => a.starts_at.localeCompare(b.starts_at))
      const lastSub = allSubs.map((s) => s.submitted_at).sort().pop() ?? null
      return {
        pid: e.participant_id,
        name: e.profiles?.name ?? 'Warrior',
        country: e.profiles?.country ?? null,
        cohortId: e.cohort_id, cohortName: e.cohorts?.name ?? '—',
        status: e.status, catchUp: e.catch_up,
        approved: mySubs.filter((s: { status: string }) => s.status === 'approved').length,
        lastSub,
        revisionPending: mySubs.some((s: { status: string }) => s.status === 'revision_required'),
        awaitingReview: mySubs.some((s: { status: string }) => ['submitted', 'under_review'].includes(s.status)),
        leadsActive: myLeads.filter((l: { stage: string }) => !['CLOSED_WON', 'CLOSED_LOST', 'DISQUALIFIED'].includes(l.stage)).length,
        leadsWon: myLeads.filter((l: { stage: string }) => l.stage === 'CLOSED_WON').length,
        nextAppt: upcoming[0]?.starts_at ?? null,
        closingStatus: myCloses.find((c: { status: string }) => c.status !== 'CANCELLED')?.status ?? null,
        reportUnacked: (reports.data ?? []).some((r: { participant_id: string; status: string }) =>
          r.participant_id === e.participant_id && r.status === 'shared'),
      }
    })
    setCohorts(Object.entries(cs).map(([id, name]) => ({ id, name })))
    setRows(out)
  }, [isReal])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => rows.filter((r) =>
    (fCohort === 'all' || r.cohortId === fCohort)
    && (fCountry === 'all' || r.country === fCountry)
    && (fStatus === 'all' || r.status === fStatus)
    && (fFlag === 'all'
      || (fFlag === 'inactive' && r.status === 'active' && (REL_DAYS(r.lastSub) ?? 99) >= 2)
      || (fFlag === 'revision' && r.revisionPending)
      || (fFlag === 'review' && r.awaitingReview)
      || (fFlag === 'closing' && !!r.closingStatus))),
  [rows, fCohort, fCountry, fStatus, fFlag])

  if (!isReal) return null
  const sel = 'h-9 cursor-pointer rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent'

  return (
    <>
      <SectionTitle className="mt-1"><Users size={12} className="mr-1 inline" /> My Warriors ({shown.length})</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={fCohort} onChange={(e) => setFCohort(e.target.value)} className={sel} aria-label="Cohort filter">
          <option value="all">All cohorts</option>
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={fCountry} onChange={(e) => setFCountry(e.target.value)} className={sel} aria-label="Country filter">
          <option value="all">🌐 All</option><option value="MY">🇲🇾 MY</option><option value="ID">🇮🇩 ID</option>
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={sel} aria-label="Status filter">
          <option value="all">Any status</option>
          {['applied', 'ready_for_review', 'active', 'completed', 'withdrawn'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fFlag} onChange={(e) => setFFlag(e.target.value)} className={sel} aria-label="Attention filter">
          <option value="all">Any activity</option>
          <option value="inactive">⚠ Inactive 2d+</option>
          <option value="revision">🔄 Revision pending</option>
          <option value="review">📨 Awaiting my review</option>
          <option value="closing">🏁 In closing</option>
        </select>
      </div>

      {shown.length === 0 && <Card className="mb-4 p-4 text-center text-xs text-muted">No participants match these filters.</Card>}
      {shown.map((r) => {
        const idle = REL_DAYS(r.lastSub)
        const inactive = r.status === 'active' && (idle ?? 99) >= 2
        return (
          <Card key={r.pid} className={clsx('mb-2.5 p-3.5', inactive && 'border-warning/50')}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold">{r.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.name}</p>
              <Chip tone="muted">{r.cohortName}</Chip>
              <Chip tone={r.status === 'active' ? 'success' : r.status === 'withdrawn' ? 'danger' : 'warning'}>{r.status}</Chip>
              {r.catchUp && <Chip tone="warning">catch-up</Chip>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span>✅ {r.approved}/30 days</span>
              <span>📇 {r.leadsActive} active leads{r.leadsWon > 0 ? ` · 🏆 ${r.leadsWon} won` : ''}</span>
              {r.nextAppt && <span>📅 {new Date(r.nextAppt).toLocaleString()}</span>}
              {r.closingStatus && <span>🏁 {r.closingStatus.replaceAll('_', ' ')}</span>}
              <span>{r.lastSub ? `last submission ${idle === 0 ? 'today' : `${idle}d ago`}` : 'no submissions yet'}</span>
            </div>
            {(inactive || r.revisionPending || r.awaitingReview || r.reportUnacked) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {inactive && <Chip tone="warning">⚠ inactive {idle}d</Chip>}
                {r.awaitingReview && <Chip tone="accent">📨 awaiting review</Chip>}
                {r.revisionPending && <Chip tone="warning">🔄 revision pending</Chip>}
                {r.reportUnacked && <Chip tone="muted">🧭 report not acknowledged</Chip>}
              </div>
            )}
          </Card>
        )
      })}
    </>
  )
}
