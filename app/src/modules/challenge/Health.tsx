/* P1 — Master Mentor: programme health, not raw noise.
   Answers "where is this cohort breaking down?" Plus the OPEN DECISION register,
   which is deliberately visible in Command HQ: every rule Hero cannot enforce yet
   is named here with what it blocks, instead of being silently faked. */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'
import MentorPanel from './MentorPanel'

interface Health {
  warriors: number; active: number; onboarding: number; paused: number
  active_today: number; inactive_2d: number
  review_backlog: number; readiness_backlog: number; oldest_pending_hours: number | null
  leads: number; qualified: number; appointments: number; viewings_done: number
  negotiation: number; closing_process: number; verified_closings: number
  coach_load: { coach: string; warriors: number }[]
  unassigned: number
  bottlenecks: { code: string; n: number }[]
}

const BN: Record<string, string> = {
  PROSPECTING_GAP: 'Prospecting', OPENING_GAP: 'Opening & relevance', DISCOVERY_GAP: 'Needs discovery',
  NEXT_STEP_GAP: 'Qualified → Appointment', FOLLOW_UP_GAP: 'Follow-up discipline',
  PRESENTATION_GAP: 'Presentation & fit', OBJECTION_GAP: 'Objection handling',
  CLOSING_READINESS_GAP: 'Closing readiness', NONE: 'No bottleneck detected',
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'warn' | 'good' }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className={clsx('font-display text-xl font-extrabold',
        tone === 'warn' && Number(value) > 0 && 'text-warning', tone === 'good' && 'text-success')}>{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
    </div>
  )
}

export default function Health({ team, realId }: { team: 'ALL' | 'MY' | 'ID'; realId: boolean }) {
  const [h, setH] = useState<Health | null>(null)
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [err, setErr] = useState('')
  const [asOf, setAsOf] = useState('')

  const load = useCallback(async () => {
    if (!realId || !supabase) { setState('ready'); return }
    setState('loading'); setErr('')
    const hr = await supabase.rpc('fn_programme_health', { p_country: team === 'ALL' ? null : team })
    if (hr.error) { setErr(hr.error.message); setState('error'); return }
    setH(hr.data as unknown as Health)
    setAsOf(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    setState('ready')
  }, [realId, team])
  useEffect(() => { load() }, [load])

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account on production to see programme health.</Card>
  if (state === 'error') return (
    <Card className="p-6 text-center">
      <p className="text-sm font-bold text-danger">⚠ Could not load programme health</p>
      <p className="mt-1 text-xs text-muted">{err}</p>
    </Card>
  )

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={load} disabled={state === 'loading'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Refresh
        </button>
        {asOf && state === 'ready' && <span className="text-[11px] text-muted">as of {asOf}</span>}
      </div>

      {state === 'loading' && <Card className="p-6 text-center text-xs text-muted">Loading programme health…</Card>}

      {state === 'ready' && h && (
        <>
          {h.warriors === 0 ? (
            <Card className="mb-4 p-8 text-center">
              <p className="text-sm font-bold">No Warriors are enrolled yet</p>
              <p className="mx-auto mt-2 max-w-md text-xs text-muted">
                Cohorts exist and the curriculum is published, but nobody has been enrolled.
                Use <b>30 Days → Enrolment</b> to place warriors into a cohort.
              </p>
            </Card>
          ) : (
            <>
              <SectionTitle>People</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Warriors" value={h.warriors} />
                <Stat label="Active" value={h.active} />
                <Stat label="Onboarding" value={h.onboarding} />
                <Stat label="Paused" value={h.paused} tone="warn" />
                <Stat label="Active today" value={h.active_today} tone="good" />
                <Stat label="Inactive 2d+" value={h.inactive_2d} tone="warn" />
              </div>

              <SectionTitle>Review backlog</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Evidence waiting" value={h.review_backlog} tone="warn" />
                <Stat label="Readiness waiting" value={h.readiness_backlog} tone="warn" />
                <Stat label="Oldest (hours)" value={h.oldest_pending_hours ?? '—'} tone="warn" />
                <Stat label="Unassigned warriors" value={h.unassigned} tone="warn" />
              </div>

              <SectionTitle>Pipeline</SectionTitle>
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Leads" value={h.leads} />
                <Stat label="Qualified" value={h.qualified} />
                <Stat label="Appointments" value={h.appointments} />
                <Stat label="Viewings done" value={h.viewings_done} />
                <Stat label="Negotiation" value={h.negotiation} />
                <Stat label="Verified closings" value={h.verified_closings} tone="good" />
              </div>

              <SectionTitle>Where the cohort is breaking down</SectionTitle>
              <Card className="mb-4 p-4">
                {(h.bottlenecks ?? []).length === 0 && <p className="text-xs text-muted">No active warriors to diagnose.</p>}
                {(h.bottlenecks ?? []).map((b) => {
                  const total = (h.bottlenecks ?? []).reduce((t, x) => t + x.n, 0) || 1
                  return (
                    <div key={b.code} className="mb-2.5 last:mb-0">
                      <div className="mb-1 flex justify-between text-xs">
                        <span className={clsx('font-semibold', b.code === 'NONE' && 'text-success')}>{BN[b.code] ?? b.code}</span>
                        <span className="text-muted">{b.n}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                        <div className={clsx('h-full rounded-full', b.code === 'NONE' ? 'bg-success' : 'bg-accent')}
                          style={{ width: `${(b.n / total) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
                <p className="mt-3 text-[10px] text-muted">
                  Structural diagnosis from each warrior's own records — no benchmark conversion rates are assumed.
                </p>
              </Card>

              <SectionTitle>Coach workload</SectionTitle>
              <Card className="mb-4 divide-y divide-border">
                {(h.coach_load ?? []).length === 0 && <p className="p-4 text-center text-xs text-muted">No coaches assigned yet.</p>}
                {(h.coach_load ?? []).map((c) => (
                  <div key={c.coach} className="flex items-center gap-3 p-3">
                    <span className="flex-1 text-sm font-semibold">{c.coach}</span>
                    <Chip tone={c.warriors > 10 ? 'warning' : 'default'}>{c.warriors} warriors</Chip>
                  </div>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {/* Master Mentor operational panel: coaching health, verification backlog,
          graduation readiness and country content completeness. */}
      {state === 'ready' && <MentorPanel team={team} realId={realId} />}

      {/* Governance decisions now live in their own Command HQ tab (fn_governance).
          The old Open Decisions panel is gone — every question it listed is a
          versioned policy with a status, an effective date and a history. */}
    </>
  )
}
