/* Command HQ → Governance Decisions.
   Replaces the old "Open Decisions (9)" panel. Every rule Hero enforces is a
   versioned, effective-dated policy row — never a constant in this file.
   Superseded versions stay visible: history is not hidden. */
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, History, Lock, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface Gov {
  code: string; title: string; summary: string; kind: 'principle' | 'operational'
  status: string; version: number | null
  scope_country: string | null; scope_cohort: string | null
  effective_from: string | null; effective_to: string | null
  approved_by_name: string | null; updated_at: string | null
  config: Record<string, unknown> | null
}
interface Ver {
  version: number; status: string; scope_country: string | null; scope_cohort: string | null
  effective_from: string; effective_to: string | null
  approved_by_name: string | null; approved_at: string | null; note: string | null
  config: Record<string, unknown>
}

const TONE: Record<string, 'success' | 'warning' | 'accent' | 'default' | 'danger'> = {
  active: 'success', approved: 'accent', draft: 'warning', superseded: 'default', retired: 'danger',
}

/* A compact, human summary of the configuration. Deliberately reads the values
   out of the policy row — nothing here restates a number from memory. */
function summarise(code: string, c: Record<string, unknown> | null): string[] {
  if (!c) return []
  const n = (k: string) => (c[k] === null || c[k] === undefined ? '—' : String(c[k]))
  switch (code) {
    case 'daily_targets':
      return [`${n('new_outreach_per_day')} distinct new outreaches/day`,
              `${n('followups_due_pct')}% of follow-ups actually due`,
              `${n('active_leads_with_next_action_pct')}% of active leads carry a next action`,
              `${n('curriculum_missions_per_accessible_day')} curriculum mission per accessible day`]
    case 'coach_sla':
      return [`Readiness ${n('readiness_hours')}h`, `Evidence ${n('evidence_hours')}h`,
              `Urgent ${n('urgent_hours')}h`,
              `Escalate: mentor +${n('escalate_master_mentor_after_hours')}h · admin +${n('escalate_admin_after_hours')}h`,
              'No auto-approve, no auto-reject']
    case 'grace_streak':
      return [`${n('grace_hours')}h grace, then MISSED`,
              'Missed breaks the streak', 'Missed does not block future days',
              'Excused is neutral', 'Paused holds the participant clock']
    case 'completion_graduation':
      return [`Completion ${n('completion_pct')}% + Day 30 review`,
              `Graduation ${n('graduation_pct')}% + all critical items`,
              'Day 27 + Day 30 reviews, coach recommendation, human approval',
              `Verified closing required: ${String(c.verified_closing_required)}`,
              `Elite auto-awarded: ${String(c.elite_warrior_auto_awarded)}`]
    case 'closing_verification':
      return [`Requires ${n('required_permission')} permission, country-scoped`,
              'Participant may never self-verify',
              'Assigned Coach is not automatically the verifier']
    case 'mentor_points': {
      const a = (c.amounts ?? {}) as Record<string, { mp: number }>
      const cap = (c.weekly_cap ?? {}) as Record<string, number>
      return [...Object.entries(a).map(([k, v]) => `+${v.mp} MP · ${k.replaceAll('_', ' ')}`),
              ...Object.entries(cap).map(([k, v]) => `Weekly cap ${v} MP · ${k.replaceAll('_', ' ')}`)]
    }
    case 'evidence_rubric': {
      const cr = (c.criteria ?? []) as { key: string }[]
      return [`Criteria: ${cr.map((x) => x.key).join(' · ')}`,
              'Approve / revision required / reject',
              `Numeric score required: ${String(c.numeric_score_required)}`,
              `Source priority: ${((c.source_priority ?? []) as string[]).join(' → ')}`]
    }
    case 'country_content_ownership':
      return [`Country-sensitive days: ${((c.country_variant_days ?? []) as number[]).join(', ')}`,
              `Missing → ${n('missing_content_status')}`,
              `Cross-country fallback: ${String(c.cross_country_fallback)}`]
    case 'language_default': {
      const my = (c.MY ?? {}) as { default?: string }
      const id = (c.ID ?? {}) as { default?: string }
      return [`MY default ${my.default}`, `ID default ${id.default}`,
              'English optional in both',
              `Mass-overwrite existing users: ${String(c.existing_users_mass_overwrite)}`]
    }
    case 'badge_rules': {
      const b = (c.badges ?? {}) as Record<string, { rule: string }>
      return Object.entries(b).map(([k, v]) => `${k}: ${v.rule}`)
    }
    case 'controlled_principles':
      return (c.principles ?? []) as string[]
    default:
      return Object.keys(c).slice(0, 6).map((k) => `${k}: ${JSON.stringify(c[k])}`)
  }
}

export default function Governance({ realId }: { realId: boolean }) {
  const [rows, setRows] = useState<Gov[]>([])
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [err, setErr] = useState('')
  const [asOf, setAsOf] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [hist, setHist] = useState<Record<string, Ver[]>>({})

  const load = useCallback(async () => {
    if (!realId || !supabase) { setState('ready'); return }
    setState('loading'); setErr('')
    const { data, error } = await supabase.rpc('fn_governance')
    if (error) { setErr(error.message); setState('error'); return }
    setRows((data as unknown as Gov[]) ?? [])
    setAsOf(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    setState('ready')
  }, [realId])
  useEffect(() => { load() }, [load])

  const loadHistory = async (code: string) => {
    if (!supabase || hist[code]) return
    const { data } = await supabase.rpc('fn_governance_history', { p_code: code })
    setHist((h) => ({ ...h, [code]: (data as unknown as Ver[]) ?? [] }))
  }

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account on production to see governance.</Card>
  if (state === 'error') return (
    <Card className="p-6 text-center">
      <p className="text-sm font-bold text-danger">⚠ Could not load governance</p>
      <p className="mt-1 text-xs text-muted">{err}</p>
    </Card>
  )

  const principles = rows.filter((r) => r.kind === 'principle')
  const operational = rows.filter((r) => r.kind === 'operational')

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={load} disabled={state === 'loading'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Refresh
        </button>
        {asOf && state === 'ready' && <span className="text-[11px] text-muted">as of {asOf}</span>}
      </div>

      {state === 'loading' && <Card className="p-6 text-center text-xs text-muted">Loading governance…</Card>}

      {state === 'ready' && (
        <>
          {/* ---- controlled principles: recorded, not configurable ---- */}
          {principles.map((p) => (
            <Card key={p.code} className="mb-4 border-accent/40 bg-accent-soft p-4">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-accent">
                <Lock size={13} /> {p.title}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                These are not settings. They cannot be versioned as configuration.
              </p>
              <ul className="mt-2 space-y-1">
                {summarise(p.code, p.config).map((line) => (
                  <li key={line} className="text-xs">· {line}</li>
                ))}
              </ul>
            </Card>
          ))}

          <SectionTitle>
            <ShieldCheck size={13} className="mr-1 inline" />Governance decisions ({operational.length})
          </SectionTitle>

          {operational.map((g) => (
            <Card key={g.code} className="mb-2.5 overflow-hidden">
              <button type="button"
                onClick={() => { const nx = open === g.code ? null : g.code; setOpen(nx); if (nx) loadHistory(g.code) }}
                className="flex w-full cursor-pointer items-start gap-3 p-3.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold">{g.title}</span>
                    <Chip tone={TONE[g.status] ?? 'default'}>{g.status.toUpperCase()}</Chip>
                    {g.version != null && <Chip>v{g.version}</Chip>}
                    <Chip>{g.scope_country ?? 'ALL'}{g.scope_cohort ? ' · cohort' : ''}</Chip>
                  </span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted">{g.summary}</span>
                  <span className="mt-1 block text-[10px] text-muted">
                    {g.effective_from && `effective ${g.effective_from}`}
                    {g.effective_to && ` → ${g.effective_to}`}
                    {g.approved_by_name && ` · approved by ${g.approved_by_name}`}
                  </span>
                </span>
                <ChevronRight size={15} className={clsx('mt-0.5 shrink-0 text-muted transition-transform', open === g.code && 'rotate-90')} />
              </button>

              {open === g.code && (
                <div className="border-t border-border bg-surface2/40 p-3.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">Current configuration</p>
                  <ul className="mb-3 space-y-1">
                    {summarise(g.code, g.config).map((line) => (
                      <li key={line} className="text-xs">· {line}</li>
                    ))}
                  </ul>

                  <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
                    <History size={11} /> Version history
                  </p>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {(hist[g.code] ?? []).length === 0 && (
                      <p className="p-2.5 text-[11px] text-muted">Loading…</p>)}
                    {(hist[g.code] ?? []).map((v) => (
                      <div key={`${v.version}-${v.effective_from}`} className="p-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip tone={TONE[v.status] ?? 'default'}>v{v.version} · {v.status}</Chip>
                          <span className="text-[11px] text-muted">
                            {v.effective_from}{v.effective_to ? ` → ${v.effective_to}` : ' → current'}
                          </span>
                          {v.scope_cohort && <Chip tone="warning">cohort scope</Chip>}
                          {v.scope_country && <Chip>{v.scope_country}</Chip>}
                        </div>
                        {v.note && <p className="mt-0.5 text-[11px] text-muted">{v.note}</p>}
                        {v.approved_by_name && (
                          <p className="text-[10px] text-muted">approved by {v.approved_by_name}
                            {v.approved_at ? ` · ${v.approved_at.slice(0, 10)}` : ''}</p>)}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-muted">
                    A new version never rewrites an older one. Reports about a past date resolve the
                    policy that was in force then.
                  </p>
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </>
  )
}
