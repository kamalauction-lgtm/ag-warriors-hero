/* Caller · M4U admin console on live data (spec §9).
   Charts are inline SVG — no chart library, theme-aware via CSS vars, and every
   number in the pivot drills into the audit trail. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { displayPhone, phoneProblem } from '../../lib/phone'
import { Card, Chip } from '../../components/ui'
import CallerSetup, { type SetupTab } from './CallerSetup'
import CallerImport from './CallerImport'

type Tab = 'overview' | 'leads' | 'reports' | 'audit' | 'import' | SetupTab
const SETUP_TABS: SetupTab[] = ['projects', 'pipelines', 'fields', 'quotes', 'bop']
const ALL_EXTRA = [...SETUP_TABS, 'import'] as const

interface Attempt { agent_id: string; disposition: string; called_at: string; note: string | null; lead_id: number }
interface LeadRow { id: number; name: string | null; phone_norm: string | null; current_label: string; status: string; attempt_count: number; property_id: number | null; updated_at: string }
interface Person { id: string; name: string; status: string; country: string | null }
interface Prop { id: number; name: string; type: string }

const PALETTE = ['#d4ac4a', '#4f9cf9', '#43c59e', '#f4826d', '#a78bfa', '#f2b544', '#6ee7b7', '#fb7185', '#60a5fa', '#facc15', '#94a3b8']

/* ---------- tiny chart primitives ---------- */
function Donut({ data, size = 168 }: { data: { label: string; value: number }[]; size?: number }) {
  const total = data.reduce((t, d) => t + d.value, 0) || 1
  const r = size / 2 - 14, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} role="img" aria-label="Outcome distribution">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={18} />
        {data.map((d, i) => {
          const frac = d.value / total
          const el = (
            <circle key={`${d.label}-${i}`} cx={cx} cy={cy} r={r} fill="none" stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={18} strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-acc * C} transform={`rotate(-90 ${cx} ${cy})`}>
              <title>{d.label}: {d.value} ({Math.round(frac * 100)}%)</title>
            </circle>
          )
          acc += frac
          return el
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-ink" style={{ fontSize: 22, fontWeight: 800 }}>{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-muted" style={{ fontSize: 10 }}>calls</text>
      </svg>
      <ul className="min-w-[150px] flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={`${d.label}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate text-muted">{d.label}</span>
            <b>{d.value}</b>
            <span className="w-9 text-right text-[10px] text-muted">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Bars({ data, onPick }: { data: { label: string; value: number }[]; onPick?: (l: string) => void }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <button key={`${d.label}-${i}`} type="button" onClick={() => onPick?.(d.label)}
          className={`flex w-full items-center gap-2 text-left text-xs ${onPick ? 'cursor-pointer' : 'cursor-default'}`}>
          <span className="w-32 shrink-0 truncate text-muted">{d.label}</span>
          <span className="h-4 flex-1 overflow-hidden rounded bg-surface2">
            <span className="block h-full rounded transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
          </span>
          <b className="w-10 text-right">{d.value}</b>
        </button>
      ))}
    </div>
  )
}

export default function CallerAdmin() {
  const [tab, setTab] = useState<Tab>('overview')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [props, setProps] = useState<Prop[]>([])
  const [days, setDays] = useState(30)
  const [drill, setDrill] = useState<{ agent?: string; dispo?: string } | null>(null)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [loading, setLoading] = useState(true)
  const [toast, setToastRaw] = useState('')
  const setToast = (m: string) => { setToastRaw(m); setTimeout(() => setToastRaw(''), 3500) }

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const since = new Date(Date.now() - days * 864e5).toISOString()
    const [a, l, p, pr] = await Promise.all([
      supabase.from('m4u_attempts').select('agent_id,disposition,called_at,note,lead_id')
        .gte('called_at', since).order('called_at', { ascending: false }).limit(5000),
      supabase.from('m4u_leads').select('id,name,phone_norm,current_label,status,attempt_count,property_id,updated_at')
        .order('updated_at', { ascending: false }).limit(2000),
      supabase.from('profiles').select('id,name,status,country'),
      supabase.from('m4u_properties').select('id,name,type'),
    ])
    setAttempts((a.data as Attempt[]) ?? [])
    setLeads((l.data as LeadRow[]) ?? [])
    setPeople((p.data as Person[]) ?? [])
    setProps((pr.data as Prop[]) ?? [])
    setLoading(false)
  }, [days])
  useEffect(() => { load() }, [load])

  // A country admin cannot read other countries' profiles, so say so plainly
  // rather than rendering an anonymous dash.
  const nameOf = useCallback(
    (id: string) => people.find((p) => p.id === id)?.name ?? 'Agent (other country)', [people])
  const propOf = useCallback((id: number | null) => props.find((p) => p.id === id)?.name ?? 'Triage', [props])

  const stats = useMemo(() => {
    const byStatus = leads.reduce<Record<string, number>>((m, l) => ({ ...m, [l.status]: (m[l.status] ?? 0) + 1 }), {})
    const byLabel = Object.entries(leads.reduce<Record<string, number>>((m, l) => ({ ...m, [l.current_label]: (m[l.current_label] ?? 0) + 1 }), {}))
      .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10)
    const byDispo = Object.entries(attempts.reduce<Record<string, number>>((m, a) => ({ ...m, [a.disposition]: (m[a.disposition] ?? 0) + 1 }), {}))
      .map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
    const byAgent = Object.entries(attempts.reduce<Record<string, number>>((m, a) => ({ ...m, [a.agent_id]: (m[a.agent_id] ?? 0) + 1 }), {}))
      .map(([id, value]) => ({ label: nameOf(id), value, id })).sort((a, b) => b.value - a.value).slice(0, 10)
    const wins = attempts.filter((a) => a.disposition === 'Booked' || a.disposition.startsWith('Attend')).length
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return {
      byStatus, byLabel, byDispo, byAgent, wins,
      callsToday: attempts.filter((a) => new Date(a.called_at) >= today).length,
      conversion: attempts.length ? (wins / attempts.length) * 100 : 0,
      undialable: leads.filter((l) => phoneProblem(l.phone_norm)).length,
    }
  }, [leads, attempts, nameOf])

  /* agent × outcome pivot */
  const pivot = useMemo(() => {
    const dispos = stats.byDispo.slice(0, 6).map((d) => d.label)
    const rows = stats.byAgent.map((a) => ({
      id: (a as { id: string }).id, name: a.label, total: a.value,
      cells: dispos.map((dp) => attempts.filter((x) => x.agent_id === (a as { id: string }).id && x.disposition === dp).length),
    }))
    return { dispos, rows }
  }, [stats, attempts])

  const drilled = useMemo(() => attempts.filter((a) =>
    (!drill?.agent || a.agent_id === drill.agent) && (!drill?.dispo || a.disposition === drill.dispo)).slice(0, 300),
  [attempts, drill])

  const shownLeads = useMemo(() => leads.filter((l) =>
    (statusF === 'all' || l.status === statusF)
    && (!q || (l.name ?? '').toLowerCase().includes(q.toLowerCase()) || (l.phone_norm ?? '').includes(q))).slice(0, 100),
  [leads, statusF, q])

  const TILES = [
    { l: 'Pool', v: stats.byStatus.pool ?? 0, c: '#4f9cf9' },
    { l: 'Assigned', v: stats.byStatus.assigned ?? 0, c: '#f2b544' },
    { l: 'Booked/locked', v: stats.byStatus.locked ?? 0, c: '#43c59e' },
    { l: 'Dead', v: stats.byStatus.dead ?? 0, c: '#f4826d' },
  ]

  return (
    <>
      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
        {(['overview', 'leads', 'reports', 'audit', ...ALL_EXTRA] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => { setTab(t); setDrill(null) }}
            className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold capitalize ${
              tab === t ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink'}`}>
            {t === 'bop' ? 'BOP' : t}
          </button>
        ))}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Range"
          className="ml-auto h-9 shrink-0 cursor-pointer rounded-full border border-border bg-surface px-3 text-xs font-bold outline-none">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      {loading && <Card className="p-6 text-center text-sm text-muted">Loading live data…</Card>}

      {!loading && tab === 'overview' && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {TILES.map((t) => (
              <Card key={t.l} className="p-4">
                <p className="font-display text-2xl font-extrabold" style={{ color: t.c }}>{t.v.toLocaleString()}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">{t.l}</p>
              </Card>
            ))}
          </div>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Card className="p-4"><p className="font-display text-2xl font-extrabold text-accent">{stats.callsToday}</p><p className="text-[10px] uppercase tracking-wide text-muted">Calls today</p></Card>
            <Card className="p-4"><p className="font-display text-2xl font-extrabold text-success">{stats.wins}</p><p className="text-[10px] uppercase tracking-wide text-muted">Wins · last {days}d</p></Card>
            <Card className="p-4"><p className="font-display text-2xl font-extrabold">{stats.conversion.toFixed(1)}%</p><p className="text-[10px] uppercase tracking-wide text-muted">Conversion</p></Card>
          </div>
          {stats.undialable > 0 && (
            <Card className="mb-4 border-warning/50 p-3.5">
              <p className="text-xs font-bold text-warning">⚠ {stats.undialable} lead(s) have a number that cannot be dialled — see the Leads tab.</p>
            </Card>
          )}
          <Card className="mb-4 p-4">
            <p className="mb-3 text-sm font-bold">Queue by label</p>
            <Bars data={stats.byLabel} />
          </Card>
        </>
      )}

      {!loading && tab === 'reports' && (
        <>
          <Card className="mb-4 p-4">
            <p className="mb-3 text-sm font-bold">Outcomes · last {days} days</p>
            {stats.byDispo.length === 0 ? <p className="text-xs text-muted">No calls in this range.</p>
              : <Donut data={stats.byDispo.slice(0, 8)} />}
          </Card>
          <Card className="mb-4 p-4">
            <p className="mb-3 text-sm font-bold">Top agents by calls</p>
            <Bars data={stats.byAgent} onPick={(name) => {
              const p = people.find((x) => x.name === name)
              if (p) { setDrill({ agent: p.id }); setTab('audit') }
            }} />
          </Card>
          <Card className="overflow-x-auto p-4">
            <p className="mb-1 text-sm font-bold">Agent × outcome</p>
            <p className="mb-3 text-[11px] text-muted">Click any number to open it in the audit trail.</p>
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead><tr className="border-b border-border text-muted">
                <th className="py-2">Agent</th>
                {pivot.dispos.map((d) => <th key={d} className="px-2 text-right">{d}</th>)}
                <th className="px-2 text-right">Total</th>
              </tr></thead>
              <tbody>
                {pivot.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2 font-bold">{r.name}</td>
                    {r.cells.map((c, i) => (
                      <td key={i} className="px-2 text-right">
                        {c > 0 ? (
                          <button type="button" className="cursor-pointer font-bold text-accent underline-offset-2 hover:underline"
                            onClick={() => { setDrill({ agent: r.id, dispo: pivot.dispos[i] }); setTab('audit') }}>{c}</button>
                        ) : <span className="text-muted">·</span>}
                      </td>
                    ))}
                    <td className="px-2 text-right font-extrabold">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {!loading && tab === 'audit' && (
        <>
          <Card className="mb-3 flex flex-wrap items-center gap-2 p-3.5">
            <p className="text-xs font-bold">Audit trail</p>
            {drill?.agent && <Chip tone="accent">{nameOf(drill.agent)}</Chip>}
            {drill?.dispo && <Chip tone="accent">{drill.dispo}</Chip>}
            <span className="flex-1" />
            <span className="text-xs text-muted">{drilled.length} shown</span>
            {drill && <button type="button" onClick={() => setDrill(null)} className="cursor-pointer rounded-full border border-border px-3 py-1 text-[11px] font-bold">Clear</button>}
          </Card>
          {drilled.map((a, i) => (
            <Card key={i} className="mb-1.5 flex flex-wrap items-center gap-2 p-2.5 text-xs">
              <span className="font-bold">{nameOf(a.agent_id)}</span>
              <Chip>{a.disposition}</Chip>
              <span className="text-muted">lead #{a.lead_id}</span>
              {a.note && <span className="italic text-muted">“{a.note}”</span>}
              <span className="ml-auto text-[11px] text-muted">{new Date(a.called_at).toLocaleString()}</span>
            </Card>
          ))}
          {drilled.length === 0 && <Card className="p-5 text-center text-xs text-muted">Nothing matches this filter.</Card>}
        </>
      )}

      {!loading && tab === 'leads' && (
        <>
          <Card className="mb-3 flex flex-wrap gap-2 p-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…"
              className="h-10 min-w-[180px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status"
              className="h-10 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
              {['all', 'pool', 'assigned', 'locked', 'dead'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Card>
          {shownLeads.map((l) => {
            const bad = phoneProblem(l.phone_norm)
            return (
              <Card key={l.id} className="mb-1.5 flex flex-wrap items-center gap-2 p-3 text-xs">
                <span className="font-bold">{l.name ?? 'Unnamed'}</span>
                <span className={bad ? 'text-danger' : 'text-muted'}>{bad ? `⚠ ${bad}` : displayPhone(l.phone_norm)}</span>
                <Chip>{l.current_label}</Chip>
                <Chip tone={l.status === 'locked' ? 'success' : l.status === 'dead' ? 'danger' : 'default'}>{l.status}</Chip>
                <span className="text-muted">{propOf(l.property_id)}</span>
                {l.attempt_count > 0 && <span className="text-muted">↻{l.attempt_count}</span>}
                <span className="ml-auto text-[11px] text-muted">{new Date(l.updated_at).toLocaleDateString()}</span>
              </Card>
            )
          })}
          {shownLeads.length === 0 && <Card className="p-5 text-center text-xs text-muted">No leads match.</Card>}
        </>
      )}

      {!loading && (SETUP_TABS as string[]).includes(tab) && (
        <CallerSetup tab={tab as SetupTab} onToast={setToast} />
      )}

      {!loading && tab === 'import' && <CallerImport onToast={setToast} />}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
