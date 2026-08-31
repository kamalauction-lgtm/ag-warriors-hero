/* Master Mentor — executive operational panel.
   Four questions only: is coaching keeping up, is verification keeping up, who is
   ready for a graduation decision, and is our country content complete.
   Everything aggregates from RPCs the mentor is already authorised to call —
   no new database surface, and no routine evidence review lands here. */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Timer, ShieldCheck, GraduationCap, Globe2, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'
import type { SlaRow } from '../coach/SlaBoard'

interface Pod { participant_id: string; enrolment_id: string; name: string; country: string; stage: string }
interface Closing { id: string; status: string; participant_id: string; updated_at: string; country: string | null }
interface Gap { day_no: number; country: string; content_status: string }
interface Grad { name: string; pct: number; eligible: boolean; blockers: string[] }

function Stat({ label, value, tone, onClick }: {
  label: string; value: number | string; tone?: 'warn' | 'good' | 'bad'; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={clsx('rounded-xl border border-border p-3 text-left', onClick && 'cursor-pointer hover:bg-surface2/50')}>
      <p className={clsx('font-display text-xl font-extrabold',
        tone === 'warn' && Number(value) > 0 && 'text-warning',
        tone === 'bad' && Number(value) > 0 && 'text-danger',
        tone === 'good' && 'text-success')}>{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
    </button>
  )
}

export default function MentorPanel({ team, realId }: { team: 'ALL' | 'MY' | 'ID'; realId: boolean }) {
  const [sla, setSla] = useState<SlaRow[]>([])
  const [closings, setClosings] = useState<Closing[]>([])
  const [gaps, setGaps] = useState<Gap[]>([])
  const [grads, setGrads] = useState<Grad[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [err, setErr] = useState('')
  const [asOf, setAsOf] = useState('')
  const [drill, setDrill] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!realId || !supabase) { setState('ready'); return }
    setState('loading'); setErr('')
    const [s, c, g, pod] = await Promise.all([
      supabase.rpc('fn_sla_board'),
      supabase.from('ch_closings').select('id,status,participant_id,updated_at,country')
        .not('status', 'in', '("CANCELLED","UNSUCCESSFUL")'),
      supabase.rpc('fn_content_gaps', { p_version: null }),
      supabase.rpc('fn_coach_pod'),
    ])
    if (s.error) { setErr(s.error.message); setState('error'); return }
    setSla((s.data as unknown as SlaRow[]) ?? [])
    setClosings(((c.data as Closing[]) ?? []).filter((x) => team === 'ALL' || x.country === team))
    setGaps(((g.data as Gap[]) ?? []).filter((x) => team === 'ALL' || x.country === team))

    // graduation readiness per active warrior — small cohorts, one call each
    const people = ((pod.data as unknown as Pod[]) ?? []).filter((p) => p.stage === 'active')
    const out: Grad[] = []
    await Promise.all(people.map(async (p) => {
      const { data } = await supabase!.rpc('fn_graduation_readiness', { p_enrolment: p.enrolment_id })
      const r = data as unknown as { pct: number; graduation_eligible: boolean; blockers: string[] } | null
      if (r) out.push({ name: p.name, pct: r.pct, eligible: r.graduation_eligible, blockers: r.blockers ?? [] })
    }))
    setGrads(out)
    setAsOf(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    setState('ready')
  }, [realId, team])
  useEffect(() => { load() }, [load])

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account on production.</Card>
  if (state === 'error') return (
    <Card className="p-6 text-center">
      <p className="text-sm font-bold text-danger">⚠ Could not load the mentor panel</p>
      <p className="mt-1 text-xs text-muted">{err}</p>
    </Card>
  )

  const onTime = sla.filter((r) => r.state === 'on_time').length
  const overdue = sla.filter((r) => r.state === 'overdue').length
  const escM = sla.filter((r) => r.state === 'escalated_mentor').length
  const escA = sla.filter((r) => r.state === 'escalated_admin').length
  const oldest = sla.length ? Math.max(...sla.map((r) => r.hours_waiting)) : 0

  const awaitingCoach = closings.filter((c) => ['NOT_STARTED', 'PREPARING', 'DOCUMENTATION'].includes(c.status))
  const awaitingVerifier = closings.filter((c) => ['INTERNAL_REVIEW', 'CUSTOMER_DECISION'].includes(c.status))
  const verified = closings.filter((c) => c.status === 'COMPLETED')
  const oldestClosing = awaitingVerifier.length
    ? Math.max(...awaitingVerifier.map((c) => Math.round((Date.now() - new Date(c.updated_at).getTime()) / 86400000)))
    : 0

  const ready = grads.filter((g) => g.eligible)
  const blocked = grads.filter((g) => !g.eligible)
  const blockerTally = blocked.reduce<Record<string, number>>((acc, g) => {
    g.blockers.forEach((b) => { acc[b] = (acc[b] ?? 0) + 1 })
    return acc
  }, {})

  const gapsBy = (c: string) => gaps.filter((g) => g.country === c && g.content_status === 'content_required').length

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={load} disabled={state === 'loading'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Refresh
        </button>
        {asOf && state === 'ready' && <span className="text-[11px] text-muted">as of {asOf}</span>}
      </div>

      {state === 'loading' && <Card className="p-6 text-center text-xs text-muted">Loading…</Card>}

      {state === 'ready' && (
        <>
          <SectionTitle><Timer size={13} className="mr-1 inline" />Coaching health</SectionTitle>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Reviews on time" value={onTime} tone="good" />
            <Stat label="Overdue" value={overdue} tone="warn" />
            <Stat label="Escalated to me" value={escM} tone="bad" onClick={() => setDrill(drill === 'sla' ? null : 'sla')} />
            <Stat label="Escalated to HQ" value={escA} tone="bad" onClick={() => setDrill(drill === 'sla' ? null : 'sla')} />
            <Stat label="Oldest wait (h)" value={oldest} tone="warn" />
          </div>
          {drill === 'sla' && (
            <Card className="mb-4 divide-y divide-border">
              {sla.filter((r) => r.state.startsWith('escalated')).map((r) => (
                <div key={r.kind + r.id} className="flex items-center gap-2 p-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.name}</span>
                    <span className="block text-[11px] text-muted">{r.kind} · target {r.sla_hours}h</span>
                  </span>
                  <Chip tone="danger">overdue {r.hours_over}h</Chip>
                </div>
              ))}
              {sla.filter((r) => r.state.startsWith('escalated')).length === 0 && (
                <p className="p-4 text-center text-xs text-muted">Nothing escalated.</p>)}
            </Card>
          )}

          <SectionTitle><ShieldCheck size={13} className="mr-1 inline" />Closing verification backlog</SectionTitle>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Awaiting Coach" value={awaitingCoach.length} tone="warn" />
            <Stat label="Awaiting verifier" value={awaitingVerifier.length} tone="warn" />
            <Stat label="Verified" value={verified.length} tone="good" />
            <Stat label="Oldest pending (days)" value={oldestClosing} tone="warn" />
          </div>

          <SectionTitle><GraduationCap size={13} className="mr-1 inline" />Graduation readiness</SectionTitle>
          <Card className="mb-4 p-4">
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Stat label="Ready for human review" value={ready.length} tone="good" />
              <Stat label="Blocked" value={blocked.length} tone="warn" />
            </div>
            {ready.length > 0 && (
              <div className="mb-3 divide-y divide-border rounded-xl border border-success/40">
                {ready.map((g) => (
                  <div key={g.name} className="flex items-center gap-2 p-2.5">
                    <span className="flex-1 text-sm font-semibold">{g.name}</span>
                    <Chip tone="success">{g.pct}% · ready</Chip>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(blockerTally).length > 0 && (
              <>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">Main blockers</p>
                {Object.entries(blockerTally).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                  <div key={k} className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">{k.replaceAll('_', ' ')}</span>
                    <span className="text-muted">{n}</span>
                  </div>
                ))}
              </>
            )}
            {grads.length === 0 && <p className="py-3 text-center text-xs text-muted">No active warriors to assess.</p>}
            <p className="mt-3 text-[10px] text-muted">
              A verified closing is not required. Reaching Day 30 does not graduate anyone — the final
              approval is a human decision, and Elite Warrior is never granted automatically.
            </p>
          </Card>

          <SectionTitle><Globe2 size={13} className="mr-1 inline" />Country content health</SectionTitle>
          <Card className="mb-4 p-4">
            <div className="grid grid-cols-2 gap-2">
              {(['MY', 'ID'] as const).filter((c) => team === 'ALL' || team === c).map((c) => (
                <div key={c} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-bold">{c === 'MY' ? '🇲🇾 Malaysia' : '🇮🇩 Indonesia'}</p>
                  <p className={clsx('mt-1 font-display text-xl font-extrabold',
                    gapsBy(c) > 0 ? 'text-warning' : 'text-success')}>{gapsBy(c)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">CONTENT REQUIRED</p>
                </div>
              ))}
            </div>
            {gaps.length > 0 && (
              <button type="button" onClick={() => setDrill(drill === 'content' ? null : 'content')}
                className="mt-3 flex cursor-pointer items-center gap-1 text-[11px] font-bold text-accent">
                {drill === 'content' ? 'Hide' : 'Show'} the {gaps.length} rows awaiting authorised local content
                <ChevronRight size={12} className={clsx(drill === 'content' && 'rotate-90')} />
              </button>
            )}
            {drill === 'content' && (
              <div className="mt-2 divide-y divide-border rounded-xl border border-border">
                {gaps.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 p-2">
                    <span className="flex-1 text-xs">Day {g.day_no}</span>
                    <Chip>{g.country}</Chip>
                    <Chip tone="warning">{g.content_status}</Chip>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] text-muted">
              A missing country variant is a governance-controlled content gap, not a defect. Warriors read
              the generic row; the other country's content is never substituted.
            </p>
          </Card>
        </>
      )}
    </>
  )
}
