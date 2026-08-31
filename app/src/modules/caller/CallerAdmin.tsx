/* Caller · M4U admin console on live data (spec §9).
   Charts are inline SVG — no chart library, theme-aware via CSS vars, and every
   number in the pivot drills into the audit trail. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { displayPhone, phoneProblem } from '../../lib/phone'
import { exportCsv } from '../../lib/csv'
import { Card, Chip } from '../../components/ui'
import CallerSetup, { type SetupTab } from './CallerSetup'
import CallerImport from './CallerImport'

type Tab = 'overview' | 'leads' | 'reports' | 'audit' | 'import' | SetupTab
const SETUP_TABS: SetupTab[] = ['agents', 'projects', 'pipelines', 'fields', 'quotes', 'bop']
const ALL_EXTRA = [...SETUP_TABS, 'import'] as const

interface Attempt { agent_id: string; disposition: string; called_at: string; note: string | null; lead_id: number }
interface LeadRow {
  id: number; name: string | null; phone_norm: string | null; current_label: string
  status: string; attempt_count: number; property_id: number | null; updated_at: string
  country: string
  // who is actually holding the lead — the old console showed this and it was the
  // one genuinely missing field here
  owner_agent_id: string | null; assigned_to: string | null; reserved_for: string | null
}
interface Person { id: string; name: string; status: string; country: string | null; role: string }
interface Prop { id: number; name: string; type: string; country: string }
interface Note {
  id: number; lead_id: number | null; parent_id: number | null
  author_id: string | null; author_role: string | null; target_agent_id: string | null
  body: string; requires_response: boolean; resolved_at: string | null; created_at: string
}


/* PostgREST caps every GET at 1000 rows regardless of .limit() — page until a
   short page. Without this the reports counted at most 1000 of 3,701 calls. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown }>, maxPages = 6): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const { data } = await build(page * 1000, page * 1000 + 999)
    const rows = (data as T[]) ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

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

export default function CallerAdmin({ team = 'ALL' }: { team?: 'ALL' | 'MY' | 'ID' }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [attemptsRaw, setAttempts] = useState<Attempt[]>([])
  const [leadsRaw, setLeads] = useState<LeadRow[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [propsRaw, setProps] = useState<Prop[]>([])

  /* the Command HQ All/MY/ID switcher scopes the WHOLE console: leads by their
     own country, attempts by the calling agent's country, projects by country.
     people stay unfiltered — names must resolve across the border. */
  const inTeam = useCallback((c: string | null | undefined) => team === 'ALL' || c === team, [team])
  const leads = useMemo(() => leadsRaw.filter((l) => inTeam(l.country)), [leadsRaw, inTeam])
  const props = useMemo(() => propsRaw.filter((p) => inTeam(p.country)), [propsRaw, inTeam])
  const attempts = useMemo(() => {
    if (team === 'ALL') return attemptsRaw
    const co = Object.fromEntries(people.map((p) => [p.id, p.country]))
    return attemptsRaw.filter((a) => inTeam(co[a.agent_id]))
  }, [attemptsRaw, people, team, inTeam])
  const [days, setDays] = useState(30)
  const [drill, setDrill] = useState<{ agent?: string; dispo?: string } | null>(null)
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [loading, setLoading] = useState(true)
  const [winKeys, setWinKeys] = useState<Set<string>>(new Set())
  const [openAsks, setOpenAsks] = useState<Record<number, number>>({})
  const [chatLead, setChatLead] = useState<LeadRow | null>(null)
  const [propF, setPropF] = useState<'all' | 'triage' | number>('all')
  const [lastCall, setLastCall] = useState<Record<number, string>>({})
  const [histLead, setHistLead] = useState<LeadRow | null>(null)
  const [manageLead, setManageLead] = useState<LeadRow | null>(null)
  const [toast, setToastRaw] = useState('')
  const setToast = (m: string) => { setToastRaw(m); setTimeout(() => setToastRaw(''), 3500) }
  /* Project requests waiting on a decision. Counted here so the Agents tab
     carries a badge — before this an agent's request was visible nowhere. */
  const [pendingN, setPendingN] = useState(0)
  useEffect(() => {
    if (!supabase) return
    supabase.rpc('fn_m4u_pending_requests').then(({ data }) =>
      setPendingN(Array.isArray(data) ? data.length : 0))
  }, [tab])

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const since = new Date(Date.now() - days * 864e5).toISOString()
    const [a, l, p, pr, dp, nt, lc] = await Promise.all([
      fetchAll<Attempt>((from, to) => supabase!.from('m4u_attempts')
        .select('agent_id,disposition,called_at,note,lead_id')
        .gte('called_at', since).order('called_at', { ascending: false }).range(from, to))
        .then((rows) => ({ data: rows })),
      fetchAll<LeadRow>((from, to) => supabase!.from('m4u_leads')
        .select('id,name,phone_norm,current_label,status,attempt_count,property_id,updated_at,country,owner_agent_id,assigned_to,reserved_for')
        .order('updated_at', { ascending: false }).range(from, to))
        .then((rows) => ({ data: rows })),
      supabase.from('profiles').select('id,name,status,country,role'),
      supabase.from('m4u_properties').select('id,name,type,country'),
      supabase.from('m4u_dispositions').select('key,is_win,active'),
      // open questions per lead — powers the red dot on the Chat buttons
      supabase.from('m4u_notes').select('lead_id')
        .is('parent_id', null).is('resolved_at', null).eq('requires_response', true),
      // honest "last updated": the latest REAL call per lead (067) — updated_at
      // moves on any row touch and lied about phone activity
      supabase.rpc('m4u_last_calls'),
    ])
    setAttempts((a.data as Attempt[]) ?? [])
    setLeads((l.data as LeadRow[]) ?? [])
    setPeople((p.data as Person[]) ?? [])
    setProps((pr.data as Prop[]) ?? [])
    const open: Record<number, number> = {}
    ;((nt.data as { lead_id: number | null }[]) ?? []).forEach((n) => {
      if (n.lead_id != null) open[n.lead_id] = (open[n.lead_id] ?? 0) + 1
    })
    setOpenAsks(open)
    setLastCall(Object.fromEntries(
      ((lc.data as { lead_id: number; last_called: string }[]) ?? [])
        .map((r) => [r.lead_id, r.last_called])))
    // An appointment IS a winning disposition (Booked, Attend BOP). Reading it from
    // config means a new win outcome starts counting without a code change.
    setWinKeys(new Set(((dp.data as { key: string; is_win: boolean; active: boolean }[]) ?? [])
      .filter((d) => d.is_win && d.active).map((d) => d.key)))
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
    /* The old console had a "Janji Temu Diatur" column. It disappeared here because
       the pivot only showed the six highest-volume dispositions, and appointments
       are by nature rare — Booked and Attend BOP were pushed off the table by
       No Answer and Wrong Number. Win columns are now always included, and the
       appointment total gets its own column so it can never be crowded out. */
    const top = stats.byDispo.slice(0, 6).map((d) => d.label)
    const wins = [...new Set(attempts.map((x) => x.disposition))].filter((d) => winKeys.has(d))
    const dispos = [...new Set([...wins, ...top])]
    const rows = stats.byAgent.map((a) => {
      const id = (a as { id: string }).id
      const mine = attempts.filter((x) => x.agent_id === id)
      return {
        id, name: a.label, total: a.value,
        appointments: mine.filter((x) => winKeys.has(x.disposition)).length,
        cells: dispos.map((dp) => mine.filter((x) => x.disposition === dp).length),
      }
    })
    return { dispos, rows }
  }, [stats, attempts, winKeys])

  const totalAppointments = useMemo(
    () => attempts.filter((a) => winKeys.has(a.disposition)).length, [attempts, winKeys])

  const [auditQ, setAuditQ] = useState('')
  const drilled = useMemo(() => {
    const needle = auditQ.trim().toLowerCase()
    return attempts.filter((a) => {
      if (drill?.agent && a.agent_id !== drill.agent) return false
      if (drill?.dispo && a.disposition !== drill.dispo) return false
      if (!needle) return true
      const lead = leads.find((x) => x.id === a.lead_id)
      return (lead?.name ?? '').toLowerCase().includes(needle)
        || (lead?.phone_norm ?? '').includes(needle)
        || String(a.lead_id).includes(needle)
        || (a.note ?? '').toLowerCase().includes(needle)
    }).slice(0, 300)
  }, [attempts, drill, auditQ, leads])

  /* outcome colour: win green · dead-end red · retry orange */
  const dispoTone = useCallback((d: string): 'success' | 'warning' | 'danger' | 'default' =>
    winKeys.has(d) ? 'success'
      : ['Not Interested', 'Wrong Number', 'Not a Real Number'].includes(d) ? 'danger'
      : ['No Answer', 'Call Back Later', 'Interested Not Ready', 'Working Full-Time'].includes(d) ? 'warning'
      : 'default', [winKeys])

  /* audit rows grouped by calendar day, newest day first */
  const auditDays = useMemo(() => {
    const groups: { day: string; label: string; rows: Attempt[] }[] = []
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 864e5).toDateString()
    for (const a of drilled) {
      const d = new Date(a.called_at)
      const key = d.toDateString()
      let g = groups[groups.length - 1]
      if (!g || g.day !== key) {
        g = {
          day: key,
          label: key === today ? 'Today' : key === yesterday ? 'Yesterday'
            : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
          rows: [],
        }
        groups.push(g)
      }
      g.rows.push(a)
    }
    return groups
  }, [drilled])

  /* A lead is held by whoever owns it outright, or has it assigned, or has it
     reserved after a callback — in that order of strength. heldFor = time since
     the holder's latest attempt on the lead (the moment the hold started for
     dispositions), falling back to the row's updated_at for admin assignments. */
  const holderOf = (l: LeadRow) => {
    const id = l.owner_agent_id ?? l.assigned_to ?? l.reserved_for
    if (!id) return null
    const who = people.find((p) => p.id === id)?.name ?? 'Unknown agent'
    const lastByHolder = attempts.find((a) => a.lead_id === l.id && a.agent_id === id)?.called_at
    return {
      id, who,
      kind: l.owner_agent_id ? 'owner' : l.assigned_to ? 'assigned' : 'reserved',
      since: lastByHolder ?? l.updated_at,
    }
  }

  /* how long a lead has been held — a duration ("6 d 3 h"), not a time-ago */
  const heldFor = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (mins < 1) return '<1 min'
    if (mins < 60) return `${mins} min`
    const h = Math.floor(mins / 60)
    if (h < 24) return `${h} h${mins % 60 ? ` ${mins % 60} min` : ''}`
    const d = Math.floor(h / 24)
    return `${d} d${h % 24 ? ` ${h % 24} h` : ''}`
  }

  /* "3 hours ago" reads faster than a date when you are scanning for stalled leads. */
  const ago = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const h = Math.round(mins / 60)
    if (h < 24) return `${h} h ago`
    const d = Math.round(h / 24)
    return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString()
  }

  const [leadLimit, setLeadLimit] = useState(100)
  const leadMatches = useMemo(() => leads.filter((l) =>
    (statusF === 'all' || l.status === statusF)
    && (propF === 'all' || (propF === 'triage' ? l.property_id == null : l.property_id === propF))
    && (!q || (l.name ?? '').toLowerCase().includes(q.toLowerCase()) || (l.phone_norm ?? '').includes(q))),
  [leads, statusF, propF, q])
  const shownLeads = useMemo(() => leadMatches.slice(0, leadLimit), [leadMatches, leadLimit])
  /* status counts inside the current search+project filter — the clickable chips */
  const statusCounts = useMemo(() => {
    const base = leads.filter((l) =>
      (propF === 'all' || (propF === 'triage' ? l.property_id == null : l.property_id === propF))
      && (!q || (l.name ?? '').toLowerCase().includes(q.toLowerCase()) || (l.phone_norm ?? '').includes(q)))
    const c: Record<string, number> = { all: base.length, pool: 0, assigned: 0, locked: 0, dead: 0 }
    base.forEach((l) => { c[l.status] = (c[l.status] ?? 0) + 1 })
    return c
  }, [leads, propF, q])

  const TILES = [
    { l: 'Pool', v: stats.byStatus.pool ?? 0, c: '#4f9cf9' },
    { l: 'Assigned', v: stats.byStatus.assigned ?? 0, c: '#f2b544' },
    { l: 'Booked/locked', v: stats.byStatus.locked ?? 0, c: '#43c59e' },
    { l: 'Dead', v: stats.byStatus.dead ?? 0, c: '#f4826d' },
    { l: 'Appointments', v: totalAppointments, c: '#a78bfa' },
  ]

  return (
    <>
      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto">
        {(['overview', 'leads', 'reports', 'audit', ...ALL_EXTRA] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => { setTab(t); setDrill(null) }}
            className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold capitalize ${
              tab === t ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink'}`}>
            {t === 'bop' ? 'BOP' : t}
            {t === 'agents' && pendingN > 0 && (
              <span className="ml-1.5 rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-extrabold text-bg">
                {pendingN}
              </span>
            )}
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
                <th className="px-2 text-right text-accent">Appointments</th>
                {pivot.dispos.map((d) => <th key={d} className="px-2 text-right">{d}</th>)}
                <th className="px-2 text-right">Total</th>
              </tr></thead>
              <tbody>
                {pivot.rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2 font-bold">{r.name}</td>
                    <td className="px-2 text-right">
                      {r.appointments > 0
                        ? <b className="text-accent">{r.appointments}</b>
                        : <span className="text-muted">·</span>}
                    </td>
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

      {!loading && tab === 'audit' && (() => {
        const dispoOptions = [...new Set(attempts.map((a) => a.disposition))].sort()
        const agentOptions = [...new Set(attempts.map((a) => a.agent_id))]
          .map((id) => ({ id, name: nameOf(id) }))
          .sort((x, y) => x.name.localeCompare(y.name))
        const wins = drilled.filter((a) => winKeys.has(a.disposition)).length
        const uniqueLeads = new Set(drilled.map((a) => a.lead_id)).size
        return (
          <>
            {/* filters — everything editable right here, not only via pivot drills */}
            <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
              <input value={auditQ} onChange={(e) => setAuditQ(e.target.value)}
                placeholder="Search lead, phone, #id or note…"
                className="h-10 min-w-[180px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <select value={drill?.agent ?? ''} aria-label="Agent"
                onChange={(e) => setDrill({ ...drill, agent: e.target.value || undefined })}
                className="h-10 max-w-[170px] cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
                <option value="">All agents</option>
                {agentOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={drill?.dispo ?? ''} aria-label="Disposition"
                onChange={(e) => setDrill({ ...drill, dispo: e.target.value || undefined })}
                className="h-10 max-w-[170px] cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
                <option value="">All outcomes</option>
                {dispoOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {(drill?.agent || drill?.dispo || auditQ) && (
                <button type="button" onClick={() => { setDrill(null); setAuditQ('') }}
                  className="h-10 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold text-muted hover:text-ink">
                  ✕ Clear
                </button>
              )}
            </Card>

            {/* summary strip */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <Card className="p-3.5">
                <p className="font-display text-xl font-extrabold">{drilled.length}{drilled.length === 300 ? '+' : ''}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">Calls · last {days}d</p>
              </Card>
              <Card className="p-3.5">
                <p className="font-display text-xl font-extrabold text-success">{wins}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">Wins</p>
              </Card>
              <Card className="p-3.5">
                <p className="font-display text-xl font-extrabold text-accent">{uniqueLeads}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">Leads touched</p>
              </Card>
            </div>

            {/* timeline, grouped by day */}
            {auditDays.map((g) => (
              <div key={g.day} className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-accent">{g.label}</p>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] text-muted">{g.rows.length} calls</span>
                </div>
                <Card className="divide-y divide-border">
                  {g.rows.map((a, i) => {
                    const lrow = leads.find((x) => x.id === a.lead_id)
                    return (
                      <div key={i} className="flex items-start gap-3 p-3">
                        <span className="w-11 shrink-0 pt-0.5 text-right font-display text-xs font-extrabold text-muted">
                          {new Date(a.called_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold">{nameOf(a.agent_id)}</span>
                            <Chip tone={dispoTone(a.disposition)}>{a.disposition}</Chip>
                            <span className="truncate text-xs text-muted">
                              {lrow?.name ?? `lead #${a.lead_id}`}
                              {lrow?.phone_norm ? ` · ${displayPhone(lrow.phone_norm)}` : ''}
                            </span>
                          </div>
                          {a.note && (
                            <p className="mt-1 rounded-lg bg-surface2/60 px-2.5 py-1.5 text-xs italic leading-relaxed text-muted">
                              “{a.note}”
                            </p>
                          )}
                        </div>
                        {lrow && (
                          <div className="flex shrink-0 gap-1.5 pt-0.5">
                            <button type="button" onClick={() => setChatLead(lrow)} title="Chat with holder"
                              className="relative cursor-pointer rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted hover:text-ink">
                              💬
                              {(openAsks[lrow.id] ?? 0) > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[8px] font-extrabold text-white">
                                  {openAsks[lrow.id]}
                                </span>
                              )}
                            </button>
                            <button type="button" onClick={() => setHistLead(lrow)} title="Full call history"
                              className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[11px] font-bold text-muted hover:text-ink">
                              🕘
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </Card>
              </div>
            ))}
            {drilled.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-sm font-bold">No calls match</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
                  Adjust the filters above, or widen the date range (top right).
                </p>
              </Card>
            )}
          </>
        )
      })()}

      {!loading && tab === 'leads' && (
        <>
          {/* search + project + export */}
          <Card className="mb-3 flex flex-wrap gap-2 p-3">
            <input value={q} onChange={(e) => { setQ(e.target.value); setLeadLimit(100) }} placeholder="Search name or phone…"
              className="h-10 min-w-[180px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <select value={String(propF)} aria-label="Project"
              onChange={(e) => { setPropF(e.target.value === 'all' ? 'all' : e.target.value === 'triage' ? 'triage' : Number(e.target.value)); setLeadLimit(100) }}
              className="h-10 max-w-[180px] cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
              <option value="all">All projects</option>
              <option value="triage">Triage (no project)</option>
              {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button"
              onClick={() => {
                if (!leadMatches.length) { setToast('No leads in this view'); return }
                exportCsv(`m4u-leads-${statusF}-${new Date().toISOString().slice(0, 10)}`, leadMatches.map((l) => ({
                  name: l.name, phone: l.phone_norm, label: l.current_label, status: l.status,
                  property: propOf(l.property_id), holder: holderOf(l)?.who ?? '',
                  attempts: l.attempt_count, last_call: lastCall[l.id] ?? '',
                  updated: l.updated_at?.slice(0, 10),
                })))
                setToast(`Exported ${leadMatches.length} leads`)
              }}
              className="h-10 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink">
              ⬇ CSV
            </button>
          </Card>

          {/* status chips — one tap to slice the queue */}
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
            {([['all', 'All', 'var(--accent)'], ['pool', 'Pool', '#4f9cf9'], ['assigned', 'Assigned', '#f2b544'],
               ['locked', 'Booked', '#43c59e'], ['dead', 'Dead', '#f4826d']] as [string, string, string][]).map(([k, label, tint]) => (
              <button key={k} type="button" onClick={() => { setStatusF(k); setLeadLimit(100) }}
                className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
                  statusF === k ? 'border-accent bg-accent-soft text-ink' : 'border-border text-muted hover:text-ink'}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: tint }} />
                {label} · {(statusCounts[k] ?? 0).toLocaleString()}
              </button>
            ))}
          </div>

          {/* the queue — a real table, scannable like the old console */}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                  <th className="px-3 py-2.5">Lead</th>
                  <th className="px-3 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Label</th>
                  <th className="px-3 py-2.5">Holder</th>
                  <th className="px-3 py-2.5 text-right">Last call</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shownLeads.map((l) => {
                  const bad = phoneProblem(l.phone_norm)
                  const h = holderOf(l)
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                      <td className="px-3 py-2.5">
                        <p className="font-bold">{l.name ?? 'Unnamed'}
                          {l.attempt_count > 0 && <span className="ml-1.5 font-normal text-muted">↻{l.attempt_count}</span>}
                        </p>
                        <p className={bad ? 'text-danger' : 'text-muted'}>{bad ? `⚠ ${bad}` : displayPhone(l.phone_norm)}</p>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{propOf(l.property_id)}</td>
                      <td className="px-3 py-2.5">
                        <Chip tone={l.status === 'locked' ? 'success' : l.status === 'dead' ? 'danger' : l.current_label === 'New' ? 'info' : 'default'}>
                          {l.current_label}
                        </Chip>
                      </td>
                      <td className="px-3 py-2.5">
                        {h ? (
                          <div title={`${h.kind} by ${h.who} · since ${new Date(h.since).toLocaleString()}`}>
                            <p className="font-semibold">
                              {h.kind === 'owner' ? '🔒' : h.kind === 'assigned' ? '👤' : '⏳'} {h.who}
                            </p>
                            <p className="text-[10px] text-muted">
                              since {new Date(h.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · held {heldFor(h.since)}
                            </p>
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {lastCall[l.id] ? (
                          <div title={`Last call ${ago(lastCall[l.id])} · row updated ${ago(l.updated_at)}`}>
                            <p className="font-semibold">
                              📞 {new Date(lastCall[l.id]).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-[10px] text-muted">{ago(lastCall[l.id])}</p>
                          </div>
                        ) : <span className="text-[10px] text-muted">no call yet</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          {(h || (openAsks[l.id] ?? 0) > 0) && (
                            <button type="button" onClick={() => setChatLead(l)} title="Chat with holder"
                              className="relative cursor-pointer rounded-lg border border-border px-2 py-1 font-bold text-muted hover:text-ink">
                              💬
                              {(openAsks[l.id] ?? 0) > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[8px] font-extrabold text-white">
                                  {openAsks[l.id]}
                                </span>
                              )}
                            </button>
                          )}
                          <button type="button" onClick={() => setHistLead(l)} title="Call history"
                            className="cursor-pointer rounded-lg border border-border px-2 py-1 font-bold text-muted hover:text-ink">🕘</button>
                          <button type="button" onClick={() => setManageLead(l)} title="Manage lead"
                            className="cursor-pointer rounded-lg border border-border px-2 py-1 font-bold text-muted hover:text-ink">⚙</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {shownLeads.length === 0 && <p className="p-6 text-center text-xs text-muted">No leads match these filters.</p>}
          </Card>

          {/* honest count + load more */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] text-muted">
              Showing {shownLeads.length.toLocaleString()} of {leadMatches.length.toLocaleString()} leads
            </p>
            {leadMatches.length > shownLeads.length && (
              <button type="button" onClick={() => setLeadLimit((n) => n + 200)}
                className="cursor-pointer rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink">
                Show 200 more
              </button>
            )}
          </div>
        </>
      )}

      {!loading && (SETUP_TABS as string[]).includes(tab) && (
        <CallerSetup tab={tab as SetupTab} onToast={setToast} />
      )}

      {!loading && tab === 'import' && <CallerImport onToast={setToast} />}

      {chatLead && (
        <LeadChat lead={chatLead} holder={holderOf(chatLead)} nameOf={nameOf}
          onClose={() => { setChatLead(null); load() }} onToast={setToast} />
      )}

      {histLead && (
        <LeadHistory lead={histLead} nameOf={nameOf} onClose={() => setHistLead(null)} />
      )}

      {manageLead && (
        <LeadManage lead={manageLead} props={props}
          agents={people.filter((p) => p.status === 'active'
            && !['master_admin', 'country_admin'].includes(p.role))}
          onClose={() => setManageLead(null)}
          onDone={(msg) => { setManageLead(null); setToast(msg); load() }}
          onToast={setToast} />
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}

/* Riwayat — the lead's full call history (every attempt, newest first), same
   as the PHP console's lead_history.php. */
function LeadHistory({ lead, nameOf, onClose }: {
  lead: LeadRow; nameOf: (id: string) => string; onClose: () => void
}) {
  const [rows, setRows] = useState<Attempt[] | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.from('m4u_attempts')
      .select('agent_id,disposition,called_at,note,lead_id')
      .eq('lead_id', lead.id).order('called_at', { ascending: false }).limit(200)
      .then(({ data }) => setRows((data as Attempt[]) ?? []))
  }, [lead.id])
  return (
    <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-bg p-4 sm:rounded-2xl">
        <div className="mb-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-extrabold">
            🕘 {lead.name ?? 'Unnamed'} <span className="font-normal text-muted">{displayPhone(lead.phone_norm)}</span>
          </p>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">✕</button>
        </div>
        <div className="min-h-[100px] flex-1 space-y-2 overflow-y-auto py-2">
          {rows === null && <p className="py-6 text-center text-xs text-muted">Loading…</p>}
          {rows !== null && rows.length === 0 && (
            <p className="py-6 text-center text-xs text-muted">No calls recorded on this lead yet.</p>
          )}
          {(rows ?? []).map((a, i) => (
            <div key={i} className="rounded-xl border border-border p-2.5 text-xs">
              <p className="mb-0.5 flex flex-wrap items-center gap-2">
                <b>{nameOf(a.agent_id)}</b>
                <Chip>{a.disposition}</Chip>
                <span className="ml-auto text-[10px] text-muted">{new Date(a.called_at).toLocaleString()}</span>
              </p>
              {a.note && <p className="italic leading-relaxed text-muted">“{a.note}”</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* Kelola — the five admin verbs from the PHP console, via m4u_admin_lead (066):
   revive a dead lead, release ownership, force a stuck assignment back to the
   pool, route to a chosen agent (24h reserve), re-triage the project. */
function LeadManage({ lead, props, agents, onClose, onDone, onToast }: {
  lead: LeadRow; props: Prop[]; agents: Person[]
  onClose: () => void; onDone: (msg: string) => void; onToast: (m: string) => void
}) {
  const [toAgent, setToAgent] = useState(agents[0]?.id ?? '')
  const [toProp, setToProp] = useState<number>(lead.property_id ?? props[0]?.id ?? 0)
  const [busy, setBusy] = useState(false)

  const run = async (action: string, extra: { p_agent?: string; p_property?: number }, ok: string) => {
    if (!supabase || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('m4u_admin_lead', {
      p_lead: lead.id, p_action: action,
      p_agent: extra.p_agent ?? null, p_property: extra.p_property ?? null,
    })
    setBusy(false)
    if (error) { onToast('⚠ ' + error.message); return }
    onDone(ok)
  }

  const btn = 'w-full cursor-pointer rounded-xl border border-border py-2.5 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink disabled:opacity-40'
  const sel = 'min-h-[38px] flex-1 rounded-lg border border-border bg-surface px-2 text-xs outline-none'
  return (
    <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-bg p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-extrabold">
            ⚙ {lead.name ?? 'Unnamed'} <span className="font-normal text-muted">{displayPhone(lead.phone_norm)}</span>
          </p>
          <Chip tone={lead.status === 'locked' ? 'success' : lead.status === 'dead' ? 'danger' : 'default'}>{lead.status}</Chip>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">✕</button>
        </div>
        <div className="space-y-2.5">
          {lead.status === 'dead' && (
            <button type="button" disabled={busy} className={btn}
              onClick={() => run('undead', {}, '♻ Lead revived — back in the queue, counter reset')}>
              ♻ Revive to queue
            </button>
          )}
          {lead.status === 'locked' && (
            <button type="button" disabled={busy} className={btn}
              onClick={() => window.confirm('Release ownership? The lead returns to the open pool.')
                && run('release', {}, '🔓 Ownership released — back in the pool')}>
              🔓 Release ownership
            </button>
          )}
          {lead.status === 'assigned' && (
            <button type="button" disabled={busy} className={btn}
              onClick={() => run('force_pool', {}, '↩ Returned to the queue')}>
              ↩ Return to queue
            </button>
          )}
          {lead.status !== 'locked' && (
            <>
              <div className="flex items-center gap-2">
                <select value={toAgent} onChange={(e) => setToAgent(e.target.value)} aria-label="Assign to" className={sel}>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <button type="button" disabled={busy || !toAgent}
                  className="cursor-pointer rounded-lg bg-accent px-3 py-2 text-xs font-extrabold text-on-accent disabled:opacity-40"
                  onClick={() => run('reassign', { p_agent: toAgent }, '🎯 Reserved for the chosen agent for 24 h')}>
                  Assign
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select value={toProp} onChange={(e) => setToProp(Number(e.target.value))} aria-label="Set project" className={sel}>
                  {props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" disabled={busy || !toProp}
                  className="cursor-pointer rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted hover:text-ink disabled:opacity-40"
                  onClick={() => run('set_property', { p_property: toProp }, '🏠 Project updated')}>
                  Set project
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* Two-way chat with the lead's holder — the production console had this and it
   was the genuinely missing loop: admin asks, agent answers from their Messages
   tab, admin follows up on the SAME thread. Follow-ups reopen the thread
   (requires_response) so the agent's badge lights up again. */
function LeadChat({ lead, holder, nameOf, onClose, onToast }: {
  lead: LeadRow
  holder: { id: string; who: string; kind: string; since: string } | null
  nameOf: (id: string) => string
  onClose: () => void
  onToast: (m: string) => void
}) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [text, setText] = useState('')
  const [mustAnswer, setMustAnswer] = useState(true)
  const [busy, setBusy] = useState(false)

  const loadThread = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('m4u_notes').select('*')
      .eq('lead_id', lead.id).order('created_at')
    setNotes((data as Note[]) ?? [])
  }, [lead.id])
  useEffect(() => { loadThread() }, [loadThread])

  const send = async () => {
    if (!supabase || !text.trim() || busy) return
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const target = holder?.id ?? [...(notes ?? [])].reverse().find((n) => n.target_agent_id)?.target_agent_id ?? null
    if (!target) { onToast('⚠ No holder to send to'); setBusy(false); return }
    const parent = (notes ?? []).filter((n) => n.parent_id == null && n.target_agent_id === target).pop()
    let error: { message: string } | null
    if (!parent) {
      ({ error } = await supabase.from('m4u_notes').insert({
        lead_id: lead.id, author_id: u.user?.id, author_role: 'admin',
        target_agent_id: target, body: text.trim(), requires_response: mustAnswer,
      }))
    } else {
      ({ error } = await supabase.from('m4u_notes').insert({
        lead_id: lead.id, parent_id: parent.id, author_id: u.user?.id, author_role: 'admin',
        target_agent_id: target, body: text.trim(),
      }))
      if (!error && mustAnswer) {
        await supabase.from('m4u_notes')
          .update({ resolved_at: null, requires_response: true }).eq('id', parent.id)
      }
    }
    setBusy(false)
    if (error) { onToast('⚠ ' + error.message); return }
    setText('')
    onToast(`💬 Sent to ${holder?.who ?? nameOf(target)}`)
    loadThread()
  }

  const openQ = (notes ?? []).some((n) => n.parent_id == null && !n.resolved_at && n.requires_response)
  return (
    <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-bg p-4 sm:rounded-2xl">
        <div className="mb-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold">💬 {lead.name ?? 'Unnamed'} <span className="font-normal text-muted">{displayPhone(lead.phone_norm)}</span></p>
            <p className="text-[11px] text-muted">
              {holder ? `${holder.kind === 'owner' ? '🔒' : holder.kind === 'assigned' ? '👤' : '⏳'} ${holder.who}` : 'no current holder'}
              {openQ ? ' · awaiting answer' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">✕</button>
        </div>

        <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto py-2">
          {notes === null && <p className="py-6 text-center text-xs text-muted">Loading…</p>}
          {notes !== null && notes.length === 0 && (
            <p className="py-6 text-center text-xs text-muted">No messages yet — start the conversation below.</p>
          )}
          {(notes ?? []).map((n) => {
            const admin = n.author_role !== 'agent'
            return (
              <div key={n.id} className={`max-w-[85%] rounded-xl border p-2.5 text-xs ${
                admin ? 'ml-auto border-accent/40 bg-accent-soft/40' : 'mr-auto border-border bg-surface'}`}>
                <p className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold text-muted">
                  {admin ? '🛡 Admin' : `🎧 ${n.author_id ? nameOf(n.author_id) : 'Agent'}`}
                  <span className="font-normal">· {new Date(n.created_at).toLocaleString()}</span>
                  {n.parent_id == null && n.requires_response && !n.resolved_at && (
                    <span className="rounded-full bg-danger/15 px-1.5 py-0.5 font-extrabold text-danger">must answer</span>
                  )}
                  {n.parent_id == null && n.resolved_at && <span className="text-success">✓ answered</span>}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{n.body}</p>
              </div>
            )
          })}
        </div>

        <div className="mt-2 border-t border-border pt-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
            placeholder={holder ? `Message ${holder.who.split(' ')[0]} about this lead…` : 'Message the last holder…'}
            className="mb-2 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent" />
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-muted">
              <input type="checkbox" checked={mustAnswer} onChange={(e) => setMustAnswer(e.target.checked)}
                className="h-3.5 w-3.5" style={{ accentColor: 'var(--accent)' }} />
              Must be answered
            </label>
            <span className="flex-1" />
            <button type="button" disabled={!text.trim() || busy} onClick={send}
              className="cursor-pointer rounded-xl bg-accent px-4 py-2 text-xs font-extrabold text-on-accent disabled:opacity-40">
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
