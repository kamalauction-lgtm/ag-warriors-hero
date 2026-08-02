/* ADMIN CONSOLE — full-screen desktop dashboard for the ENTIRE super-app.
   Sections: Dashboard (whole business) · People · Sales · Activity · Elite ·
   Booths · Caller/M4U (one function, with its own sub-tabs) · Content ·
   Rewards · Country Settings */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Activity,
  Swords,
  Tent,
  PhoneCall,
  FolderCog,
  Gift,
  Globe2,
  X,
  Shield,
  Check,
  Ban,
  RotateCcw,
  Pause,
  Play,
  Download,
  Crown,
  Coins,
  Handshake,
  Zap,
  Flame,
  UserPlus,
  AlertTriangle,
  Timer,
  BellRing,
  Rocket,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { Avatar, Bar, Card, Chip } from '../components/ui'
import { setBrand, useBrand, type BrandCountry, type BrandSlot } from '../lib/brand'
import { getIncomeCfg, setIncomeCfg, useIncomeCfg } from '../lib/income'
import { supabase, supabaseReady } from '../lib/supabase'
import { useEffect } from 'react'
import './admin.css'

/* 30-Day Challenge — programme progress (Master Mentor view, live DB) */
interface ChRow {
  id: string; status: string; catch_up: boolean; cohort_id: string
  participant_id: string
  profiles: { name: string; country: string } | null
  cohorts: { name: string } | null
}
function ChallengeProgress({ realId }: { realId: boolean }) {
  const [rows, setRows] = useState<ChRow[]>([])
  const [ready, setReady] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<Record<string, { sub: number; ok: number; last: string }>>({})
  const [xp, setXp] = useState<Record<string, number>>({})
  const [dayNow, setDayNow] = useState<Record<string, number>>({})
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!realId || !supabase) return
    ;(async () => {
      const { data: es, error } = await supabase.from('enrolments')
        .select('id,status,catch_up,cohort_id,participant_id,profiles!enrolments_participant_id_fkey(name,country),cohorts(name)')
        .order('created_at')
      if (error) { setErr(error.message); return }
      const list = (es as unknown as ChRow[]) ?? []
      setRows(list)
      const { data: rs } = await supabase.from('readiness_submissions')
        .select('enrolment_id,status,created_at').order('created_at', { ascending: false })
      const rm: Record<string, string> = {}
      ;(rs ?? []).forEach((r: { enrolment_id: string; status: string }) => { if (!rm[r.enrolment_id]) rm[r.enrolment_id] = r.status })
      setReady(rm)
      const { data: ts } = await supabase.from('task_submissions').select('enrolment_id,day_no,status')
      const tm: Record<string, { sub: number; ok: number; last: string }> = {}
      ;(ts ?? []).forEach((t: { enrolment_id: string; day_no: number; status: string }) => {
        const e = tm[t.enrolment_id] ?? { sub: 0, ok: 0, last: '' }
        if (t.status === 'approved') e.ok++
        else if (['submitted', 'under_review'].includes(t.status)) e.sub++
        e.last = `D${t.day_no} ${t.status}`
        tm[t.enrolment_id] = e
      })
      setTasks(tm)
      const { data: pl } = await supabase.from('points_ledger').select('user_id,amount').eq('status', 'verified')
      const xm: Record<string, number> = {}
      ;(pl ?? []).forEach((p: { user_id: string; amount: number }) => { xm[p.user_id] = (xm[p.user_id] ?? 0) + p.amount })
      setXp(xm)
      const cids = [...new Set(list.map((r) => r.cohort_id))]
      const dm: Record<string, number> = {}
      for (const c of cids) {
        const { data: d } = await supabase.rpc('cohort_day', { p_cohort: c })
        dm[c] = (d as number) ?? 0
      }
      setDayNow(dm)
    })()
  }, [realId])

  const STAGE: Record<string, 'success' | 'warning' | 'info' | 'accent' | 'default' | 'danger'> = {
    active: 'success', onboarding: 'warning', invited: 'info', ready: 'accent',
    completed: 'accent', graduated: 'success', paused: 'default', withdrawn: 'danger',
  }
  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account on production to see live programme data.</Card>
  return (
    <>
      {err && <p className="mb-3 rounded-lg bg-danger/10 p-2 text-xs font-bold text-danger">⚠ {err}</p>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="px-4 py-3">Warrior</th><th className="px-2 py-3">Cohort</th>
              <th className="px-2 py-3">Stage</th><th className="px-2 py-3">Readiness</th>
              <th className="px-2 py-3">Day</th><th className="px-2 py-3">Tasks ✓/⏳</th>
              <th className="px-2 py-3">Latest</th><th className="px-4 py-3 text-right">Verified XP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-xs text-muted">No enrolments yet.</td></tr>}
            {rows.map((r) => {
              const t = tasks[r.id] ?? { sub: 0, ok: 0, last: '—' }
              return (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                  <td className="px-4 py-3 font-semibold">
                    {r.profiles?.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.profiles?.name ?? '—'}
                    {r.catch_up && <Chip tone="warning" className="ml-1.5">catch-up</Chip>}
                  </td>
                  <td className="px-2 py-3 text-xs">{r.cohorts?.name ?? '—'}</td>
                  <td className="px-2 py-3"><Chip tone={STAGE[r.status] ?? 'default'}>{r.status}</Chip></td>
                  <td className="px-2 py-3"><Chip tone={ready[r.id] === 'approved' ? 'success' : ready[r.id] === 'submitted' ? 'warning' : 'default'}>{ready[r.id] ?? '—'}</Chip></td>
                  <td className="px-2 py-3 font-bold">{dayNow[r.cohort_id] ?? '—'}/30</td>
                  <td className="px-2 py-3">{t.ok} ✓ · {t.sub} ⏳</td>
                  <td className="px-2 py-3 text-xs text-muted">{t.last}</td>
                  <td className="px-4 py-3 text-right font-display font-extrabold text-accent">{xp[r.participant_id] ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="p-4 text-[11px] text-muted">Stages: invited → onboarding → ready → active → completed → graduated. Approvals stay human-only in the Coach Queue.</p>
      </Card>
    </>
  )
}

/* Income rules editor — full subsale engine constants, per country
   (ladder, agency max, OV rule, RGR tables, cap, properties) */
function IncomeRules({ country, onSaved }: { country: 'MY' | 'ID'; onSaved: (m: string) => void }) {
  const cfg = useIncomeCfg(country)
  const save = (patch: Partial<typeof cfg>) => {
    setIncomeCfg(country, { ...getIncomeCfg(country), ...patch })
    onSaved(`${country} income rules updated — live in every calculator`)
  }
  const num = 'w-16 rounded-lg border border-border bg-surface px-1.5 py-1.5 text-center text-xs font-bold outline-none focus:border-accent'
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
        {country === 'MY' ? '🇲🇾 Malaysia' : '🇮🇩 Indonesia'}
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-muted">
        <label>Agency max %
          <input type="number" step={0.5} defaultValue={cfg.agencyMax}
            onBlur={(e) => save({ agencyMax: Number(e.target.value) || cfg.agencyMax })} className={clsx(num, 'ml-1.5')} />
        </label>
        <label>{cfg.taxName} %
          <input type="number" step={1} defaultValue={Math.round(cfg.taxRate * 100)}
            onBlur={(e) => save({ taxRate: (Number(e.target.value) || 0) / 100 })} className={clsx(num, 'ml-1.5')} />
        </label>
        <label>Cap %
          <input type="number" step={1} defaultValue={Math.round(cfg.combinedCap * 100)}
            onBlur={(e) => save({ combinedCap: (Number(e.target.value) || 97) / 100 })} className={clsx(num, 'ml-1.5')} />
        </label>
      </div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
        RGR tiers % — standard (selling &lt; {Math.round(cfg.rgrHighMin * 100)}%) / high
      </p>
      <div className="mb-3 flex gap-1.5">
        {cfg.rgrStd.map((v, i) => (
          <input key={`s${i}`} type="number" step={1} defaultValue={Math.round(v * 100)} aria-label={`RGR std L${i + 1}`}
            onBlur={(e) => { const t = [...cfg.rgrStd]; t[i] = (Number(e.target.value) || 0) / 100; save({ rgrStd: t }) }} className={num} />
        ))}
        <span className="text-xs text-muted">/</span>
        {cfg.rgrHigh.map((v, i) => (
          <input key={`h${i}`} type="number" step={1} defaultValue={Math.round(v * 100)} aria-label={`RGR high L${i + 1}`}
            onBlur={(e) => { const t = [...cfg.rgrHigh]; t[i] = (Number(e.target.value) || 0) / 100; save({ rgrHigh: t }) }} className={num} />
        ))}
      </div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
        Rank ladder — name · acc. target · add-on % (total = base {Math.round(cfg.baseRate * 100)}% + add-on)
      </p>
      {cfg.ladder.map((l, i) => (
        <div key={i} className="mb-1 flex items-center gap-1.5 text-xs">
          <input defaultValue={l.name} onBlur={(e) => { const t = [...cfg.ladder]; t[i] = { ...l, name: e.target.value.toUpperCase() }; save({ ladder: t }) }}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 font-bold outline-none focus:border-accent" />
          <input type="number" defaultValue={l.target} aria-label="Accumulated target"
            onBlur={(e) => { const t = [...cfg.ladder]; t[i] = { ...l, target: Number(e.target.value) || 0 }; save({ ladder: t }) }}
            className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
          <input type="number" step={1} defaultValue={Math.round(l.addon * 100)} aria-label="Add-on %"
            onBlur={(e) => { const t = [...cfg.ladder]; t[i] = { ...l, addon: (Number(e.target.value) || 0) / 100 }; save({ ladder: t }) }}
            className={num} />
        </div>
      ))}
      <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider text-muted">Properties — name · price · agency % (comparison list)</p>
      {cfg.properties.map((pr, i) => (
        <div key={pr.id} className="mb-1 flex items-center gap-1.5 text-xs">
          <input defaultValue={pr.name} onBlur={(e) => { const ps = [...cfg.properties]; ps[i] = { ...pr, name: e.target.value }; save({ properties: ps }) }}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
          <input type="number" defaultValue={pr.price} aria-label="Price"
            onBlur={(e) => { const ps = [...cfg.properties]; ps[i] = { ...pr, price: Number(e.target.value) || 0 }; save({ properties: ps }) }}
            className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
          <input type="number" step={0.1} max={cfg.agencyMax} defaultValue={pr.agency} aria-label="Agency %"
            onBlur={(e) => { const ps = [...cfg.properties]; ps[i] = { ...pr, agency: Math.min(Number(e.target.value) || 0, cfg.agencyMax) }; save({ properties: ps }) }}
            className={num} />
        </div>
      ))}
      <button type="button" onClick={() => save({ properties: [...cfg.properties, { id: `p${Date.now()}`, name: 'New property', price: 500000, agency: Math.min(3, cfg.agencyMax) }] })}
        className="cursor-pointer text-xs font-bold text-accent">+ Add property</button>

      {country === 'MY' ? (
        <>
          <p className="mb-2 mt-3 rounded-lg border border-accent/40 bg-accent-soft/40 p-2 text-[10px] font-semibold">
            🔒 MY Primary rules LOCKED (spec §E) — you edit project values only.
          </p>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
            MY primary projects — name · price · REN% · 🎁 RGR bonus (selected projects, immediate recruiter, set period)
          </p>
          {(cfg.myPrimary ?? []).map((pr, i) => (
            <div key={pr.id} className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <input defaultValue={pr.name} onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, name: e.target.value }; save({ myPrimary: ps }) }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" defaultValue={pr.price} aria-label="Price"
                onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, price: Number(e.target.value) || 0 }; save({ myPrimary: ps }) }}
                className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" step={0.1} defaultValue={pr.ren} aria-label="REN %"
                onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, ren: Number(e.target.value) || 0 }; save({ myPrimary: ps }) }}
                className={num} />
              <button type="button" title="RGR bonus on/off"
                onClick={() => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrOn: !pr.rgrOn }; save({ myPrimary: ps }) }}
                className={clsx('cursor-pointer rounded-lg border px-2 py-1.5 font-bold', pr.rgrOn ? 'border-warning text-warning' : 'border-border text-muted opacity-50')}>🎁</button>
              {pr.rgrOn && (
                <>
                  <input type="number" step={0.5} defaultValue={pr.rgrPct} aria-label="RGR %" title="RGR % of price"
                    onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrPct: Number(e.target.value) || 0 }; save({ myPrimary: ps }) }}
                    className={clsx(num, 'border-warning/50')} />
                  <input defaultValue={pr.rgrFrom ?? ''} placeholder="from" aria-label="Valid from"
                    onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrFrom: e.target.value }; save({ myPrimary: ps }) }}
                    className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
                  <input defaultValue={pr.rgrTo ?? ''} placeholder="to" aria-label="Valid to"
                    onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrTo: e.target.value }; save({ myPrimary: ps }) }}
                    className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
                </>
              )}
            </div>
          ))}
          <button type="button" onClick={() => save({ myPrimary: [...(cfg.myPrimary ?? []), { id: `m${Date.now()}`, name: 'New project', price: 500000, ren: 2, vp: 0.73, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: false, rgrPct: 1, appear: ['income'] }] })}
            className="cursor-pointer text-xs font-bold text-accent">+ Add MY project</button>
        </>
      ) : (
        <>
          <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider text-muted">
            ID Primary — pool distribution % (of dev amount; must total 100)
          </p>
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {Object.entries(cfg.primarySlices).map(([k, v]) => (
              <label key={k} className="text-center">
                <span className="block truncate text-[8px] font-bold text-muted">{k}</span>
                <input type="number" step={0.5} defaultValue={v} aria-label={k}
                  onBlur={(e) => save({ primarySlices: { ...cfg.primarySlices, [k]: Number(e.target.value) || 0 } })}
                  className="w-full rounded-lg border border-border bg-surface px-1 py-1.5 text-center text-xs font-bold outline-none focus:border-accent" />
              </label>
            ))}
          </div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Primary projects — name · price · % from developer</p>
          {cfg.primaryProps.map((pr, i) => (
            <div key={pr.id} className="mb-1 flex items-center gap-1.5 text-xs">
              <input defaultValue={pr.name} onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, name: e.target.value }; save({ primaryProps: ps }) }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" defaultValue={pr.price} aria-label="Price"
                onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, price: Number(e.target.value) || 0 }; save({ primaryProps: ps }) }}
                className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" step={0.5} defaultValue={pr.devPct} aria-label="Dev %" title="% from developer"
                onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, devPct: Number(e.target.value) || 0 }; save({ primaryProps: ps }) }}
                className={num} />
              <input type="number" step={1} defaultValue={pr.agentPct ?? cfg.primarySlices.AGENT} aria-label="Agent %" title="Agent share % — others reduce pro-rata"
                onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, agentPct: Number(e.target.value) || cfg.primarySlices.AGENT }; save({ primaryProps: ps }) }}
                className={clsx(num, 'border-accent/50')} />
              {(['income', 'catalog', 'elite'] as const).map((zone) => {
                const on = (pr.appear ?? ['income']).includes(zone)
                return (
                  <button key={zone} type="button" title={`Show in ${zone}`}
                    onClick={() => {
                      const cur = pr.appear ?? ['income']
                      const ps = [...cfg.primaryProps]
                      ps[i] = { ...pr, appear: on ? cur.filter((z) => z !== zone) : [...cur, zone] }
                      save({ primaryProps: ps })
                    }}
                    className={clsx('cursor-pointer rounded-lg border px-1.5 py-1.5 text-[11px]', on ? 'border-accent text-accent' : 'border-border text-muted opacity-50')}>
                    {zone === 'income' ? '💰' : zone === 'catalog' ? '🏠' : '⚔'}
                  </button>
                )
              })}
            </div>
          ))}
          <button type="button" onClick={() => save({ primaryProps: [...cfg.primaryProps, { id: `pp${Date.now()}`, name: 'New project', price: 1000000000, devPct: 5 }] })}
            className="cursor-pointer text-xs font-bold text-accent">+ Add project</button>
        </>
      )}
    </div>
  )
}

/* One uploadable brand slot (logo / mascot). Prototype stores locally;
   real build: Supabase Storage + version history (v1, v2, v3…). */
function BrandSlotEditor({
  country,
  slot,
  label,
  hint,
  onSaved,
}: {
  country: BrandCountry
  slot: BrandSlot
  label: string
  hint?: string
  onSaved: (m: string) => void
}) {
  const current = useBrand(country, slot)
  const inputId = `up-${country}-${slot}`
  const onPick = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      setBrand(country, slot, String(r.result))
      onSaved(`${label} updated — live everywhere instantly`)
    }
    r.readAsDataURL(f)
  }
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface2">
        {current ? (
          <img src={current} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-[9px] font-bold text-muted">empty</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-[10px] text-muted">{hint}</p>}
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/webp,image/svg+xml,image/jpeg"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
      <label
        htmlFor={inputId}
        className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent transition-opacity hover:opacity-90"
      >
        Upload
      </label>
      <button
        type="button"
        onClick={() => {
          setBrand(country, slot, null)
          onSaved(`${label} reset to default`)
        }}
        className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-ink"
      >
        Reset
      </button>
    </div>
  )
}

type Section =
  | 'dashboard' | 'people' | 'sales' | 'activity' | 'elite' | 'booths'
  | 'caller' | 'content' | 'rewards' | 'settings' | 'challenge'
type CallerTab =
  | 'overview' | 'leads' | 'pipelines' | 'projects' | 'fields'
  | 'import' | 'quotes' | 'bop' | 'reports' | 'audit'
type Team = 'ALL' | 'MY' | 'ID'

const NAV: { group: string; items: { key: Section; icon: typeof Users; label: string; badge?: number }[] }[] = [
  { group: 'Overview', items: [{ key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' }] },
  {
    group: 'Business',
    items: [
      { key: 'people', icon: Users, label: 'People & Roles', badge: 2 },
      { key: 'sales', icon: TrendingUp, label: 'Sales Oversight' },
      { key: 'activity', icon: Activity, label: 'Activity Monitor' },
    ],
  },
  {
    group: 'Team',
    items: [
      { key: 'elite', icon: Swords, label: 'Elite & Captains' },
      { key: 'booths', icon: Tent, label: 'Booths' },
    ],
  },
  {
    group: 'Functions',
    items: [
      { key: 'challenge', icon: Rocket, label: '30-Day Challenge' },
      { key: 'caller', icon: PhoneCall, label: 'Caller · M4U', badge: 3 },
      { key: 'content', icon: FolderCog, label: 'App Content' },
      { key: 'rewards', icon: Gift, label: 'Rewards' },
    ],
  },
  { group: 'System', items: [{ key: 'settings', icon: Globe2, label: 'Country Settings' }] },
]

/* ---------------- mock data ---------------- */
interface AgentRow {
  id: string; name: string; phone: string; email: string; team: 'MY' | 'ID'
  status: 'pending' | 'active' | 'paused'; role: string; rank: string; elite?: boolean; projects: string[]
}
const SEED_AGENTS: AgentRow[] = [
  { id: 'a1', name: 'Aisyah Rahman', phone: '+60 13-888 2020', email: 'aisyah@iqi.my', team: 'MY', status: 'active', role: 'leader', rank: 'HOT', elite: true, projects: ['EXSIM Residensi', 'Erinaz Suites'] },
  { id: 'a2', name: 'Faizal Hassan', phone: '+60 17-220 4455', email: 'faizal@iqi.my', team: 'MY', status: 'active', role: 'agent', rank: 'TL', elite: true, projects: ['EXSIM Residensi'] },
  { id: 'a3', name: 'Budi Santoso', phone: '+62 812-3456-789', email: 'budi@iqi.id', team: 'ID', status: 'paused', role: 'agent', rank: 'L', projects: ['Vividz Grand'] },
  { id: 'a4', name: 'Dewi Anggraini', phone: '+62 813-9988-776', email: 'dewi@iqi.id', team: 'ID', status: 'active', role: 'leader', rank: 'TL', projects: ['Vividz Grand', 'Podomoro Park'] },
  { id: 'a5', name: 'Mei Ling Wong', phone: '+60 12-334 5566', email: 'meiling@iqi.my', team: 'MY', status: 'pending', role: 'agent', rank: 'REN', projects: [] },
  { id: 'a6', name: 'Rizky Pratama', phone: '+62 821-1122-334', email: 'rizky@iqi.id', team: 'ID', status: 'pending', role: 'agent', rank: 'REN', projects: [] },
]
interface Deal {
  id: string; client: string; project: string; price: string; comm: string
  stage: string; agent: string; team: 'MY' | 'ID'
}
const SEED_DEALS: Deal[] = [
  { id: 'd1', client: 'Hafiz Omar', project: 'EXSIM Residensi', price: 'RM 620,000', comm: 'RM 15,500', stage: 'Booking', agent: 'Aisyah', team: 'MY' },
  { id: 'd2', client: 'Sarah Lim', project: 'EXSIM Residensi', price: 'RM 585,000', comm: 'RM 14,625', stage: 'Closed', agent: 'Aisyah', team: 'MY' },
  { id: 'd3', client: 'Encik Rahman', project: 'Erinaz Suites', price: 'RM 350,000', comm: 'RM 7,000', stage: 'Loan Approval', agent: 'Faizal', team: 'MY' },
  { id: 'd4', client: 'Sari Wulandari', project: 'Vividz Grand', price: 'Rp 2.4 M', comm: 'Rp 48 jt', stage: 'Appointment', agent: 'Dewi', team: 'ID' },
  { id: 'd5', client: 'Pak Agus', project: 'Podomoro Park', price: 'Rp 1.8 M', comm: 'Rp 36 jt', stage: 'Follow-Up', agent: 'Dewi', team: 'ID' },
  { id: 'd6', client: 'Michelle Yeo', project: 'Erinaz Suites', price: 'RM 410,000', comm: 'RM 8,200', stage: 'Calling', agent: 'Faizal', team: 'MY' },
]
const STAGES = ['Calling', 'Follow-Up', 'Appointment', 'Booking', 'Loan Approval', 'Closed']
const STAGE_COUNTS = [24, 18, 12, 9, 6, 38]
const ACTIVITY = [
  { name: 'Aisyah Rahman', team: 'MY' as const, pct: 88, done: 7, total: 8, points: 120 },
  { name: 'Faizal Hassan', team: 'MY' as const, pct: 75, done: 6, total: 8, points: 95 },
  { name: 'Dewi Anggraini', team: 'ID' as const, pct: 63, done: 5, total: 8, points: 80 },
  { name: 'Budi Santoso', team: 'ID' as const, pct: 25, done: 2, total: 8, points: 20 },
  { name: 'Mei Ling Wong', team: 'MY' as const, pct: 0, done: 0, total: 6, points: 0 },
]
const PODS = [
  { name: 'ALPHA', captain: 'Aisyah', team: 'MY' as const, members: 5, closings: 8, poolIn: 'RM 9,300' },
  { name: 'BRAVO', captain: 'Faizal', team: 'MY' as const, members: 4, closings: 5, poolIn: 'RM 5,810' },
  { name: 'ZULU', captain: 'Rahim', team: 'MY' as const, members: 6, closings: 3, poolIn: 'RM 3,350' },
  { name: 'GARUDA', captain: 'Dewi', team: 'ID' as const, members: 5, closings: 4, poolIn: 'Rp 96 jt' },
]
interface LeadRow {
  id: string; name: string; phone: string; project: string; team: 'MY' | 'ID'
  label: string; status: 'pool' | 'assigned' | 'locked' | 'dead'; cb: number; holder?: string; updated: string
}
const SEED_LEADS: LeadRow[] = [
  { id: 'l1', name: 'Hafiz Omar', phone: '+60127001122', project: 'EXSIM Residensi', team: 'MY', label: 'Booked', status: 'locked', cb: 1, holder: '🏆 Aisyah', updated: '5m ago' },
  { id: 'l2', name: 'Michelle Yeo', phone: '+60162334455', project: 'Erinaz Suites', team: 'MY', label: 'No Answer', status: 'pool', cb: 4, updated: '12m ago' },
  { id: 'l3', name: 'Zul Ariffin', phone: '+60198887766', project: 'EXSIM Residensi', team: 'MY', label: 'Callback', status: 'pool', cb: 1, holder: '🔒 Faizal', updated: '1h ago' },
  { id: 'l4', name: 'Sari Wulandari', phone: '+628123334444', project: 'Vividz Grand', team: 'ID', label: 'New', status: 'pool', cb: 0, updated: '2m ago' },
  { id: 'l5', name: 'Agus Salim', phone: '+628567778888', project: 'Unassigned (triage)', team: 'ID', label: 'New', status: 'pool', cb: 0, updated: '8m ago' },
  { id: 'l6', name: 'Tan Ah Beng', phone: '+60129990000', project: 'Erinaz Suites', team: 'MY', label: 'Unreachable', status: 'dead', cb: 10, updated: '2d ago' },
]
const PIVOT_AGENTS = ['Aisyah', 'Faizal', 'Dewi', 'Budi']
const PIVOT: Record<string, number[]> = {
  Booked: [7, 5, 4, 2],
  'No Answer': [31, 44, 28, 19],
  Callback: [9, 6, 11, 4],
  'Not Interested': [12, 9, 14, 6],
  'Wrong Number': [2, 4, 1, 3],
}
const REWARDS = [
  { title: 'Sabah Trip 2026', tier: 'Gold', team: 'MY' as const, active: true, target: 'RM 3.0M by 31 Dec' },
  { title: 'Cash & Car Challenge', tier: 'Platinum', team: 'MY' as const, active: true, target: 'RM 5.0M by 31 Dec' },
  { title: 'Bali Trip Warriors', tier: 'Gold', team: 'ID' as const, active: false, target: 'Rp 10 M by 31 Dec' },
]

export default function Admin() {
  const nav = useNavigate()
  const { user } = useApp()
  const [section, setSection] = useState<Section>('dashboard')
  const [callerTab, setCallerTab] = useState<CallerTab>('overview')
  const [team, setTeam] = useState<Team>('ALL')
  const [agents, setAgents] = useState(SEED_AGENTS)
  const [leads, setLeads] = useState(SEED_LEADS)
  const [toast, setToast] = useState('')

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2800)
  }
  const inTeam = <T extends { team: 'MY' | 'ID' }>(rows: T[]) =>
    team === 'ALL' ? rows : rows.filter((r) => r.team === team)

  const fAgents = inTeam(agents)
  const fLeads = inTeam(leads)
  const fDeals = inTeam(SEED_DEALS)
  const fActivity = inTeam(ACTIVITY)
  const fPods = inTeam(PODS)
  const pending = fAgents.filter((a) => a.status === 'pending')

  const kpi = useMemo(() => ({
    agents: fAgents.length,
    my: agents.filter((a) => a.team === 'MY').length,
    id: agents.filter((a) => a.team === 'ID').length,
    activeToday: fActivity.filter((a) => a.pct > 0).length,
    closings: fDeals.filter((d) => d.stage === 'Closed').length,
    pipeline: fDeals.filter((d) => d.stage !== 'Closed').length,
    queue: fLeads.filter((l) => l.status === 'pool').length,
    pods: fPods.length,
  }), [fAgents, fActivity, fDeals, fLeads, fPods, agents])

  if (!user) return null

  const setAgentStatus = (id: string, status: AgentRow['status'], msg: string) => {
    setAgents((as) => as.map((a) => (a.id === id ? { ...a, status } : a)))
    say(msg)
  }
  const leadAction = (id: string, patch: Partial<LeadRow>, msg: string) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    say(msg)
  }

  return (
    <div className="fixed inset-0 z-[90] flex bg-bg text-ink">
      {/* ---------------- sidebar ---------------- */}
      <aside className="adm-side flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="adm-crest flex h-10 w-10 items-center justify-center rounded-xl text-[#1a1407]">
            <Shield size={19} />
          </div>
          <div className="min-w-0">
            <p className="font-display text-sm font-extrabold leading-tight">Command HQ</p>
            <p className="text-[10px] tracking-wide text-muted">AG WARRIORS · ADMIN</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((g) => (
            <div key={g.group} className="mb-3">
              <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">{g.group}</p>
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setSection(it.key)}
                  className={clsx(
                    'adm-nav-item mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold',
                    section === it.key ? 'on' : 'text-muted hover:bg-surface2 hover:text-ink',
                  )}
                >
                  <it.icon size={15} className="shrink-0" />
                  <span className="flex-1">{it.label}</span>
                  {!!it.badge && (
                    <span className="adm-pulse flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white">{it.badge}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => nav('/')}
          className="m-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-bold text-muted transition-colors duration-200 hover:text-ink"
        >
          <X size={13} /> Exit console
        </button>
      </aside>

      {/* ---------------- main ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3.5">
          <h1 className="font-display text-lg font-extrabold tracking-tight">
            {NAV.flatMap((g) => g.items).find((i) => i.key === section)?.label}
          </h1>
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border p-1">
            {(['ALL', 'MY', 'ID'] as Team[]).map((tm) => (
              <button
                key={tm}
                type="button"
                onClick={() => setTeam(tm)}
                className={clsx(
                  'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-colors duration-150',
                  team === tm ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink',
                )}
              >
                {tm === 'ALL' ? '🌐 All' : tm === 'MY' ? '🇲🇾 MY' : '🇮🇩 ID'}
              </button>
            ))}
          </div>
          <Avatar name={user.name} color="var(--accent)" size={34} />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* ============ DASHBOARD — WHOLE APP ============ */}
          {section === 'dashboard' && (
            <>
              {/* hero */}
              <div className="adm-hero mb-5 p-6">
                <img src="/brand/ag-shield.png" alt="" className="adm-hero-shield" />
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c9c2a8]">
                  Command HQ · {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <h2 className="mt-1 font-display text-2xl font-extrabold leading-tight">
                  Salam, {user.name.split(' ')[0]} 👋
                </h2>
                <p className="mt-1 text-xs text-[#c9c2a8]">
                  {kpi.agents} warriors across 🇲🇾 {kpi.my} + 🇮🇩 {kpi.id} · pipeline moving
                </p>
                <div className="relative mt-4 flex flex-wrap gap-6">
                  <div>
                    <p className="adm-gold font-display text-3xl font-extrabold">RM 12.4M</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#c9c2a8]">Pipeline value</p>
                  </div>
                  <div>
                    <p className="adm-gold font-display text-3xl font-extrabold">RM 894k</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#c9c2a8]">Commission this month</p>
                  </div>
                  <div>
                    <p className="font-display text-3xl font-extrabold text-white">{kpi.closings + 37}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#c9c2a8]">Closings this month</p>
                  </div>
                </div>
              </div>

              {/* KPI cards with icon chips */}
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { v: kpi.agents, l: 'Warriors', sub: `🇲🇾 ${kpi.my} · 🇮🇩 ${kpi.id}`, icon: Users, tint: '#d4ac4a' },
                  { v: kpi.activeToday, l: 'Active today', icon: Zap, tint: '#22c55e' },
                  { v: kpi.queue, l: 'Caller queue', icon: PhoneCall, tint: '#3b82f6' },
                  { v: kpi.pods, l: 'Elite pods', icon: Swords, tint: '#8b5cf6' },
                  { v: 18, l: 'Booked (mo)', icon: Handshake, tint: '#10b981' },
                  { v: pending.length, l: 'Pending regs', icon: UserPlus, tint: '#f59e0b', warn: pending.length > 0 },
                ].map((k) => (
                  <div key={k.l} className={clsx('adm-kpi p-4', k.warn && 'border-warning/50')}>
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="adm-kpi-icon" style={{ background: `${k.tint}1f`, color: k.tint }}>
                        <k.icon size={17} />
                      </span>
                      {k.warn && <AlertTriangle size={14} className="text-warning" />}
                    </div>
                    <p className="font-display text-2xl font-extrabold">{k.v}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{k.l}</p>
                    {'sub' in k && k.sub && <p className="text-[10px] text-muted">{k.sub}</p>}
                  </div>
                ))}
              </div>

              {/* needs-attention strip */}
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { l: 'Pending registrations', v: pending.length, s: 'people' as Section, icon: UserPlus, tint: '#f59e0b' },
                  { l: 'Deals stuck > 7 days', v: 5, s: 'sales' as Section, icon: Timer, tint: '#ef4444' },
                  { l: 'Agents inactive 3d+', v: 4, s: 'activity' as Section, icon: Flame, tint: '#f97316' },
                  { l: 'Caller: triage leads', v: 1, s: 'caller' as Section, icon: PhoneCall, tint: '#3b82f6' },
                  { l: 'Caller: GHL sync', v: 2, s: 'caller' as Section, icon: BellRing, tint: '#8b5cf6' },
                  { l: 'Reward requests', v: 3, s: 'rewards' as Section, icon: Gift, tint: '#ec4899' },
                ].map((a) => (
                  <button
                    key={a.l}
                    type="button"
                    onClick={() => setSection(a.s)}
                    className="adm-alert p-3"
                    style={{ borderColor: `${a.tint}55`, background: `${a.tint}12` }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="adm-kpi-icon" style={{ background: `${a.tint}22`, color: a.tint, width: 30, height: 30 }}>
                        <a.icon size={15} />
                      </span>
                      <div>
                        <p className="font-display text-lg font-extrabold leading-none" style={{ color: a.tint }}>{a.v}</p>
                        <p className="mt-0.5 text-[9px] font-semibold text-muted">{a.l}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {/* Sales funnel — stepped */}
                <Card className="p-5">
                  <p className="mb-4 font-display text-sm font-extrabold">Sales funnel — AG Playbook</p>
                  {STAGES.map((s, i) => {
                    const max = Math.max(...STAGE_COUNTS)
                    const width = 55 + (STAGE_COUNTS[i] / max) * 45
                    const hues = ['#3b82f6', '#6366f1', '#8b5cf6', '#d4ac4a', '#f59e0b', '#22c55e']
                    return (
                      <div
                        key={s}
                        className="adm-funnel-step"
                        style={{ width: `${width}%`, background: `linear-gradient(90deg, ${hues[i]}cc, ${hues[i]})` }}
                      >
                        <span>{s}</span>
                        <span>{STAGE_COUNTS[i]}</span>
                      </div>
                    )
                  })}
                  <p className="mt-3 text-center text-[11px] text-muted">Calling → Closing · conversion 26%</p>
                </Card>
                {/* Team activity */}
                <Card className="p-5">
                  <p className="mb-4 font-display text-sm font-extrabold">Team activity today</p>
                  {fActivity.slice(0, 5).map((a) => (
                    <div key={a.name} className="mb-3.5">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold">{a.team === 'MY' ? '🇲🇾' : '🇮🇩'} {a.name}</span>
                        <span className="text-muted">{a.pct}% · ⭐{a.points}</span>
                      </div>
                      <div className="adm-track">
                        <div
                          className={clsx('adm-fill', a.pct >= 60 ? 'adm-fill--green' : a.pct > 0 ? '' : 'adm-fill--red')}
                          style={{ width: `${Math.max(a.pct, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => setSection('activity')} className="mt-1 cursor-pointer text-xs font-bold text-accent">View all →</button>
                </Card>
                {/* Caller snapshot with donut */}
                <Card className="p-5">
                  <p className="mb-4 font-display text-sm font-extrabold">📞 Caller today</p>
                  <div className="mb-4 flex items-center gap-5">
                    <div
                      className="adm-donut h-28 w-28 shrink-0"
                      style={{ background: 'conic-gradient(#22c55e 0 9%, #3b82f6 9% 51%, #d4ac4a 51% 64%, #ef4444 64% 84%, #6b7488 84% 100%)' }}
                    >
                      <div className="adm-donut-label">
                        <span className="font-display text-lg font-extrabold">214</span>
                        <span className="text-[9px] font-semibold uppercase text-muted">calls</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-[11px]">
                      {([['#22c55e', 'Booked · 18'], ['#3b82f6', 'No Answer · 90'], ['#d4ac4a', 'Callback · 28'], ['#ef4444', 'Not Int. · 43'], ['#6b7488', 'Other · 35']] as [string, string][]).map(([c, l]) => (
                        <p key={l} className="flex items-center gap-2 font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l}</p>
                      ))}
                    </div>
                  </div>
                  <button type="button" onClick={() => setSection('caller')} className="w-full cursor-pointer rounded-xl bg-accent py-2.5 text-xs font-bold text-on-accent transition-opacity hover:opacity-90">Open Caller admin →</button>
                </Card>
              </div>
            </>
          )}

          {/* ============ PEOPLE & ROLES ============ */}
          {section === 'people' && (
            <>
              {pending.length > 0 && (
                <Card className="mb-5 border-warning/50 p-5">
                  <p className="mb-3 font-display text-sm font-extrabold text-warning">Pending registrations ({pending.length})</p>
                  {pending.map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0">
                      <Avatar name={a.name} color="var(--warning)" size={38} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{a.name} <span className="ml-1 text-xs font-normal text-muted">{a.team === 'MY' ? '🇲🇾' : '🇮🇩'} {a.phone} · {a.email}</span></p>
                      </div>
                      <button type="button" onClick={() => setAgentStatus(a.id, 'active', `${a.name} approved`)} className="flex cursor-pointer items-center gap-1 rounded-lg bg-success px-3.5 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"><Check size={13} /> Approve</button>
                      <button type="button" onClick={() => { setAgents((as) => as.filter((x) => x.id !== a.id)); say(`${a.name} rejected`) }} className="flex cursor-pointer items-center gap-1 rounded-lg border border-danger/50 px-3.5 py-2 text-xs font-bold text-danger transition-colors hover:bg-danger/10"><Ban size={13} /> Reject</button>
                    </div>
                  ))}
                </Card>
              )}
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                      <th className="px-4 py-3">Person</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fAgents.filter((a) => a.status !== 'pending').map((a) => (
                      <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={a.name} color="var(--accent)" size={32} />
                            <div>
                              <p className="font-semibold">{a.elite ? `Captain ${a.name.split(' ')[0]}` : a.name} {a.elite && <Crown size={12} className="inline text-accent" />}</p>
                              <p className="text-[11px] text-muted">{a.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">{a.team === 'MY' ? '🇲🇾 MY' : '🇮🇩 ID'}</td>
                        <td className="px-4 py-3"><Chip tone={a.role === 'leader' ? 'accent' : 'default'}>{a.role}</Chip></td>
                        <td className="px-4 py-3"><Chip>{a.rank}</Chip></td>
                        <td className="px-4 py-3"><Chip tone={a.status === 'active' ? 'success' : 'warning'}>{a.status}</Chip></td>
                        <td className="px-4 py-3 text-right">
                          {a.status === 'active' ? (
                            <button type="button" onClick={() => setAgentStatus(a.id, 'paused', `${a.name} paused`)} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-warning"><Pause size={12} className="mr-1 inline" />Pause</button>
                          ) : (
                            <button type="button" onClick={() => setAgentStatus(a.id, 'active', `${a.name} reactivated`)} className="cursor-pointer rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white"><Play size={12} className="mr-1 inline" />Reactivate</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="p-4 text-[11px] text-muted">Roles are delegable — e.g. assign a <b>Caller Admin</b> for one country without full admin access. Country is editable per person (admin override).</p>
              </Card>
            </>
          )}

          {/* ============ SALES OVERSIGHT ============ */}
          {section === 'sales' && (
            <>
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
                {STAGES.map((s, i) => {
                  const hues = ['#3b82f6', '#6366f1', '#8b5cf6', '#d4ac4a', '#f59e0b', '#22c55e']
                  return (
                    <div
                      key={s}
                      className="adm-kpi p-3 text-center"
                      style={{ borderColor: `${hues[i]}44` }}
                    >
                      <p className="font-display text-xl font-extrabold" style={{ color: hues[i] }}>{STAGE_COUNTS[i]}</p>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">{s}</p>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface2">
                        <div className="h-full rounded-full" style={{ width: `${(STAGE_COUNTS[i] / 40) * 100}%`, background: hues[i] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                      <th className="px-4 py-3">Client</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Agent</th><th className="px-4 py-3">Country</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fDeals.map((d) => (
                      <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                        <td className="px-4 py-3 font-semibold">{d.client}</td>
                        <td className="px-4 py-3">{d.project}</td>
                        <td className="px-4 py-3">{d.price}</td>
                        <td className="px-4 py-3 font-semibold text-accent">{d.comm}</td>
                        <td className="px-4 py-3"><Chip tone={d.stage === 'Closed' ? 'success' : d.stage === 'Calling' ? 'info' : 'warning'}>{d.stage}</Chip></td>
                        <td className="px-4 py-3">{d.agent}</td>
                        <td className="px-4 py-3">{d.team === 'MY' ? '🇲🇾' : '🇮🇩'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {/* ============ ACTIVITY MONITOR ============ */}
          {section === 'activity' && (
            <Card className="p-5">
              <p className="mb-1 font-display text-sm font-extrabold">Daily time-boxing — live</p>
              <p className="mb-4 text-xs text-muted">Every agent's plan & completion today (from My Day)</p>
              {fActivity.map((a) => (
                <div key={a.name} className="mb-4 rounded-xl border border-border p-3.5">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <Avatar name={a.name} color={a.pct >= 60 ? 'var(--success)' : a.pct > 0 ? 'var(--warning)' : 'var(--danger)'} size={32} />
                    <p className="flex-1 text-sm font-semibold">{a.team === 'MY' ? '🇲🇾' : '🇮🇩'} {a.name}</p>
                    <p className="text-xs text-muted">{a.done}/{a.total} tasks · ⭐{a.points}</p>
                    <span className="font-display text-sm font-extrabold">{a.pct}%</span>
                  </div>
                  <Bar pct={a.pct} />
                  {a.pct === 0 && <p className="mt-1.5 text-[11px] font-semibold text-danger">No plan today — nudge?</p>}
                </div>
              ))}
            </Card>
          )}

          {/* ============ ELITE & CAPTAINS ============ */}
          {section === 'elite' && (
            <>
              {/* army command banner */}
              <div
                className="mb-5 flex items-center gap-4 rounded-2xl border p-4"
                style={{
                  borderColor: '#3a3f1f',
                  background:
                    'repeating-linear-gradient(45deg, rgba(109,112,40,.16) 0 12px, rgba(73,74,23,.16) 12px 24px), linear-gradient(180deg, #22260f, #11130d)',
                  color: '#e9e2cc',
                }}
              >
                <img src="/brand/tim-elit-logo.png" alt="" className="h-14 w-14 rounded-xl border-2 object-contain p-1" style={{ borderColor: '#6d7028', background: '#14180a' }} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-extrabold uppercase tracking-[0.12em]" style={{ color: '#d8b25a' }}>
                    Elite Team Command — Admin
                  </p>
                  <p className="text-[11px]" style={{ color: '#c9c2a8' }}>
                    {fPods.length} pods · {fPods.reduce((s, p) => s + p.members, 0)} warriors · unified MY model 60/10/15/15
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1.5 font-display text-[10px] font-extrabold uppercase tracking-widest"
                  style={{ background: 'linear-gradient(180deg,#d8b25a,#b08a3a)', color: '#1a1407' }}
                >
                  Warrior Force
                </span>
              </div>
              <div className="mb-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => say('Manage Elite Team: appoint / rank REN-L-TL-HOT / demote — requires admin password re-entry')} className="cursor-pointer rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-on-accent">🎖️ Manage Elite Team</button>
                <button type="button" onClick={() => say('Create Pod: name + 👑 Captain (must be Elite) + members')} className="cursor-pointer rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted hover:text-ink">➕ Create Pod</button>
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                      <th className="px-4 py-3">Pod</th><th className="px-4 py-3">Captain</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Closings</th><th className="px-4 py-3">Pool in</th><th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fPods.map((p) => (
                      <tr key={p.name} className="border-b border-border last:border-0 hover:bg-surface2/50">
                        <td className="px-4 py-3 font-display font-extrabold">{p.name}</td>
                        <td className="px-4 py-3">👑 Captain {p.captain}</td>
                        <td className="px-4 py-3">{p.team === 'MY' ? '🇲🇾' : '🇮🇩'}</td>
                        <td className="px-4 py-3">{p.members}</td>
                        <td className="px-4 py-3">{p.closings}</td>
                        <td className="px-4 py-3 font-semibold text-accent">{p.poolIn}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => say(`${p.name}: board, leads, manage members`)} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="p-4 text-[11px] text-muted">Unified Malaysian model: closer 60% · Ads & Content 10% · funder 15% · Elite Pool 15% · RGR on top. "Captain" is a position (pod leader), not a rank.</p>
              </Card>
            </>
          )}

          {/* ============ BOOTHS ============ */}
          {section === 'booths' && (
            <Card className="max-w-2xl p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-display text-sm font-extrabold">Booth / roadshow events</p>
                <button type="button" onClick={() => say('Create booth: days, AM/PM shifts, headcount, poster')} className="cursor-pointer rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-on-accent">+ Create booth</button>
              </div>
              {[
                { t: 'MidValley Megamall', when: 'Sat–Sun 9–10 Aug', team: 'MY' as const, reg: 12, leads: 34 },
                { t: 'Pavilion Bukit Jalil', when: 'Sat 16 Aug', team: 'MY' as const, reg: 6, leads: 0 },
                { t: 'Kota Kasablanka JKT', when: 'Sun 17 Aug', team: 'ID' as const, reg: 8, leads: 0 },
              ].filter((b) => team === 'ALL' || b.team === team).map((b) => (
                <div key={b.t} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                  <span className="text-xl">⛺</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{b.team === 'MY' ? '🇲🇾' : '🇮🇩'} {b.t}</p>
                    <p className="text-[11px] text-muted">{b.when} · {b.reg} registered · {b.leads} leads</p>
                  </div>
                  <button type="button" onClick={() => say('Roster + CSV/PDF export + leaderboard')} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">Roster</button>
                </div>
              ))}
            </Card>
          )}

          {/* ============ CALLER · M4U (one function, own sub-tabs) ============ */}
          {section === 'caller' && (
            <>
              <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto">
                {(['overview', 'leads', 'pipelines', 'projects', 'fields', 'import', 'quotes', 'bop', 'reports', 'audit'] as CallerTab[]).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setCallerTab(ct)}
                    className={clsx(
                      'shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold capitalize transition-colors duration-150',
                      callerTab === ct ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink',
                    )}
                  >
                    {ct === 'bop' ? 'BOP' : ct}
                  </button>
                ))}
              </div>

              {callerTab === 'overview' && (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                    {([
                      ['Pool', 4], ['Assigned', 0], ['Locked', 1], ['Dead', 1],
                      ['Calls today', 214], ['Webhooks', 37], ['GHL retry', 2],
                    ] as [string, number][]).map(([l, v]) => (
                      <Card key={l} className="p-3.5 text-center">
                        <p className="font-display text-xl font-extrabold">{v}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">{l}</p>
                      </Card>
                    ))}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Queue by label</p>
                      {([['New', 42], ['No Answer', 31], ['Callback', 12], ['Warm', 9], ['Not Interested', 17], ['Wrong Number', 5]] as [string, number][]).map(([l, v]) => (
                        <div key={l} className="mb-2.5">
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="font-semibold">{l}</span>
                            <span className="text-muted">{v} · {Math.round(v / 1.16)}%</span>
                          </div>
                          <Bar pct={v / 0.42} />
                        </div>
                      ))}
                    </Card>
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Dead / Unreachable — revive</p>
                      {fLeads.filter((l) => l.status === 'dead').map((l) => (
                        <div key={l.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                          <Avatar name={l.name} color="var(--danger)" size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{l.name}</p>
                            <p className="text-[11px] text-muted">{l.project} · {l.label} · ↻{l.cb}</p>
                          </div>
                          <button type="button" onClick={() => leadAction(l.id, { status: 'pool', label: 'New', cb: 0 }, `Revived ${l.name}`)} className="flex cursor-pointer items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent"><RotateCcw size={12} /> Revive</button>
                        </div>
                      ))}
                      {fLeads.filter((l) => l.status === 'dead').length === 0 && <p className="py-6 text-center text-sm text-muted">No dead leads 🎉</p>}
                    </Card>
                  </div>
                </>
              )}

              {callerTab === 'leads' && (
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-3">Lead</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Label</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">CB</th><th className="px-4 py-3">Holder</th><th className="px-4 py-3 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fLeads.map((l) => (
                        <tr key={l.id} className={clsx('border-b border-border last:border-0 hover:bg-surface2/50', l.project.includes('triage') && 'bg-warning/10')}>
                          <td className="px-4 py-3"><p className="font-semibold">{l.name}</p><p className="text-[11px] text-muted">{l.phone}</p></td>
                          <td className="px-4 py-3">{l.project.includes('triage') ? <Chip tone="warning">⚠ {l.project}</Chip> : l.project}</td>
                          <td className="px-4 py-3"><Chip tone={l.label === 'Booked' ? 'success' : l.label === 'New' ? 'info' : l.status === 'dead' ? 'danger' : 'default'}>{l.label}</Chip></td>
                          <td className="px-4 py-3"><Chip tone={l.status === 'locked' ? 'accent' : l.status === 'dead' ? 'danger' : 'default'}>{l.status}</Chip></td>
                          <td className="px-4 py-3">{l.cb}</td>
                          <td className="px-4 py-3 text-xs">{l.holder ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              {l.status === 'dead' && <button type="button" onClick={() => leadAction(l.id, { status: 'pool', label: 'New', cb: 0 }, 'Revived — full fresh life')} className="cursor-pointer rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-bold text-on-accent">Revive</button>}
                              {l.status === 'locked' && <button type="button" onClick={() => leadAction(l.id, { status: 'pool', label: 'New', holder: undefined }, 'Ownership released')} className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted">Release</button>}
                              {l.status === 'pool' && (
                                <select defaultValue="" onChange={(e) => { if (e.target.value) leadAction(l.id, { holder: `🔒 ${e.target.value}` }, `Reserved for ${e.target.value} · 24 h`) }} className="cursor-pointer rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-bold outline-none" aria-label="Reassign">
                                  <option value="">Reassign…</option>
                                  {fAgents.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.name.split(' ')[0]}>{a.name}</option>)}
                                </select>
                              )}
                              {l.project.includes('triage') && <button type="button" onClick={() => leadAction(l.id, { project: 'Vividz Grand' }, 'Project set — out of triage')} className="cursor-pointer rounded-lg bg-warning px-2.5 py-1.5 text-[11px] font-bold text-white">Set project</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {callerTab === 'pipelines' && (
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-display text-sm font-extrabold">GHL pipeline → project mapping</p>
                    <button type="button" onClick={() => say('Pulled 4 pipelines from GHL')} className="cursor-pointer rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-on-accent">Fetch from GHL</button>
                  </div>
                  {[
                    { name: 'VIVIDZ FB Campaign', id: 'pip_9f2k', mapped: '', warn: true },
                    { name: 'EXSIM Residensi', id: 'pip_2a8c', mapped: 'EXSIM Residensi', warn: false },
                    { name: 'ERINAZ KELANTAN', id: 'pip_7x1d', mapped: 'Erinaz Suites', warn: false },
                    { name: 'AG Recruitment', id: 'pip_5m3q', mapped: 'AG Recruitment Drive', warn: false },
                  ].map((p) => (
                    <div key={p.id} className={clsx('flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0', p.warn && 'bg-warning/10')}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{p.name} {p.warn && <Chip tone="warning">triage</Chip>}</p>
                        <p className="text-[11px] text-muted">{p.id}</p>
                      </div>
                      <select defaultValue={p.mapped} onChange={() => say(`Mapped ${p.name}`)} className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold outline-none" aria-label={`Map ${p.name}`}>
                        <option value="">— map to project —</option>
                        {['EXSIM Residensi', 'Erinaz Suites', 'AG Recruitment Drive', 'Vividz Grand', 'Podomoro Park'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                  ))}
                </Card>
              )}

              {callerTab === 'projects' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {[
                    { name: 'EXSIM Residensi', team: 'MY', type: 'property', leads: 84, agents: 5 },
                    { name: 'Erinaz Suites', team: 'MY', type: 'property', leads: 46, agents: 3 },
                    { name: 'AG Recruitment Drive', team: 'MY', type: 'recruitment', leads: 31, agents: 4 },
                    { name: 'Vividz Grand', team: 'ID', type: 'property', leads: 112, agents: 7 },
                    { name: 'Podomoro Park', team: 'ID', type: 'property', leads: 58, agents: 4 },
                  ].filter((p) => team === 'ALL' || p.team === team).map((p) => (
                    <Card key={p.name} className="flex items-center gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{p.name} <span className="ml-1">{p.team === 'MY' ? '🇲🇾' : '🇮🇩'}</span> {p.type === 'recruitment' && <Chip tone="accent">recruitment</Chip>}</p>
                        <p className="text-[11px] text-muted">{p.leads} leads · {p.agents} agents</p>
                      </div>
                      <button type="button" onClick={() => say(`Edit ${p.name}`)} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">Edit</button>
                    </Card>
                  ))}
                </div>
              )}

              {callerTab === 'fields' && (
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-4 py-3">Key</th><th className="px-4 py-3">Label</th><th className="px-4 py-3">Aliases</th><th className="px-4 py-3">Agent sees</th></tr></thead>
                    <tbody>
                      {([
                        ['usia', 'Usia', 'umur, age', false],
                        ['trigger_beli', 'Pemicu beli', 'pemicu_beli, trigger, alasan_beli', true],
                        ['rencana_bayar', 'Pembayaran', 'rencana_pembayaran, payment, bayar', true],
                        ['budget_cicilan', 'Budget/bln', 'budget, cicilan, installment', true],
                        ['domisili', 'Domisili', 'lokasi, kota, alamat', true],
                        ['waktu_survey', 'Bisa survey', 'jadwal_survey, site_visit', true],
                      ] as [string, string, string, boolean][]).map(([k, l, a, vis]) => (
                        <tr key={k} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-mono text-xs">{k}</td>
                          <td className="px-4 py-3 font-semibold">{l}</td>
                          <td className="px-4 py-3 text-xs text-muted">{a}</td>
                          <td className="px-4 py-3"><Chip tone={vis ? 'success' : 'default'}>{vis ? 'Yes' : 'Admin only'}</Chip></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {callerTab === 'import' && (
                <Card className="max-w-xl p-6">
                  <p className="mb-1 font-display text-sm font-extrabold">Import leads — Excel / CSV</p>
                  <p className="mb-4 text-xs text-muted">Max 5,000 rows · dedupes exactly like webhook leads.</p>
                  <div className="mb-4 flex h-28 items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-muted">Drop .xlsx / .csv here</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => say('Imported: 214 inserted · 12 multi-interest · 3 revived · 41 duplicates')} className="flex-1 cursor-pointer rounded-xl bg-accent py-3 text-sm font-bold text-on-accent">Import</button>
                    <button type="button" onClick={() => say('Template downloaded')} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-4 text-xs font-bold text-muted"><Download size={14} /> Template</button>
                  </div>
                </Card>
              )}

              {callerTab === 'quotes' && (
                <Card className="max-w-2xl p-5">
                  <p className="mb-3 font-display text-sm font-extrabold">Motivational quotes</p>
                  {[
                    { body: 'Trust is the currency of AG.', author: 'Kamal AG', team: 'MY' as const },
                    { body: 'Speed to lead wins the deal — 5 minutes or it cools.', author: 'Hukum 5 Minit', team: 'MY' as const },
                    { body: 'Satu telepon lagi. Satu peluang lagi.', author: 'AG Indonesia', team: 'ID' as const },
                  ].filter((q) => team === 'ALL' || q.team === team).map((q) => (
                    <p key={q.body} className="border-b border-border py-3 text-sm italic last:border-0">"{q.body}" <span className="text-xs not-italic text-muted">— {q.author} · {q.team === 'MY' ? '🇲🇾' : '🇮🇩'}</span></p>
                  ))}
                </Card>
              )}

              {callerTab === 'bop' && (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {([['Called', 128], ['Booked', 43], ['Attended', 27], ['Show rate', '66%'], ['JOINED 🎉', 11]] as [string, number | string][]).map(([l, v]) => (
                      <Card key={l} className="p-4 text-center">
                        <p className="font-display text-xl font-extrabold">{v}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</p>
                      </Card>
                    ))}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Recruitment funnel</p>
                      {([['Dihubungi', 128], ['Ditempah', 43], ['Hadir', 27], ['Sertai', 11]] as [string, number][]).map(([l, v]) => (
                        <div key={l} className="mb-3">
                          <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{l}</span><span className="text-muted">{v}</span></div>
                          <Bar pct={v / 1.28} />
                        </div>
                      ))}
                    </Card>
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Upcoming sessions</p>
                      {[
                        { t: 'BOP Online — Wednesday Night', when: 'Wed 6 Aug · 8:30 PM', booked: 9, type: '🎥' },
                        { t: 'BOP HQ Kuala Lumpur', when: 'Sat 9 Aug · 10:00 AM', booked: 3, type: '🏢' },
                      ].map((s) => (
                        <div key={s.t} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                          <span className="text-xl">{s.type}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{s.t}</p>
                            <p className="text-[11px] text-muted">{s.when} · {s.booked} booked {s.booked < 5 && <span className="text-warning">· fill seats!</span>}</p>
                          </div>
                          <button type="button" onClick={() => say('Roster: attended / no-show / JOINED + CSV')} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">Roster</button>
                        </div>
                      ))}
                    </Card>
                  </div>
                </>
              )}

              {callerTab === 'reports' && (
                <>
                  <div className="mb-5 grid grid-cols-3 gap-3 md:max-w-lg">
                    {([['Calls', 486], ['Bookings', 18], ['Conversion', '3.7%']] as [string, number | string][]).map(([l, v]) => (
                      <Card key={l} className="p-4 text-center">
                        <p className="font-display text-xl font-extrabold">{v}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</p>
                      </Card>
                    ))}
                  </div>
                  <Card className="overflow-x-auto">
                    <p className="p-4 pb-0 font-display text-sm font-extrabold">Agent × outcome pivot <span className="text-xs font-normal text-muted">— click any number to audit</span></p>
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-4 py-3">Agent</th>{Object.keys(PIVOT).map((k) => <th key={k} className="px-3 py-3 text-right">{k}</th>)}</tr></thead>
                      <tbody>
                        {PIVOT_AGENTS.map((a, i) => (
                          <tr key={a} className="border-b border-border last:border-0 hover:bg-surface2/50">
                            <td className="px-4 py-2.5 font-semibold">{a}</td>
                            {Object.keys(PIVOT).map((k) => (
                              <td key={k} className="px-3 py-2.5 text-right">
                                <button type="button" onClick={() => { setCallerTab('audit'); say(`Audit: ${a} × ${k}`) }} className={clsx('cursor-pointer rounded px-1.5 py-0.5 font-semibold transition-colors hover:bg-accent-soft hover:text-accent', k === 'Booked' && 'text-accent')}>{PIVOT[k][i]}</button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </>
              )}

              {callerTab === 'audit' && (
                <Card className="p-5">
                  <p className="mb-1 font-display text-sm font-extrabold">Audit — Aisyah × No Answer (last 30 days)</p>
                  <p className="mb-4 text-xs text-muted">Cross-check numbers · ask questions · rework leads</p>
                  {[
                    { lead: 'Michelle Yeo', note: 'busy tone', ago: '2h ago', status: 'pool' },
                    { lead: 'Ravi Kumar', note: '', ago: '5h ago', status: 'pool' },
                    { lead: 'Lim Wei Jie', note: 'rang out twice', ago: '1d ago', status: 'assigned' },
                  ].map((r) => (
                    <div key={r.lead} className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{r.lead} <Chip>No Answer</Chip></p>
                        <p className="text-[11px] text-muted">{r.note ? `"${r.note}" · ` : ''}{r.ago} · now {r.status}</p>
                      </div>
                      <button type="button" onClick={() => say('Lead recalled to pool')} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">Recall</button>
                      <button type="button" onClick={() => say('Question sent — requires response')} className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent">💬 Ask agent</button>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}

          {/* ============ 30-DAY CHALLENGE PROGRESS ============ */}
          {section === 'challenge' && (
            <ChallengeProgress realId={supabaseReady && user.id.includes('-')} />
          )}

          {/* ============ APP CONTENT ============ */}
          {section === 'content' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {([
                ['Announcements', 'Post to MY, ID or both'],
                ['Academy / ATLAS', 'Courses, playbook, 30-Day Challenge'],
                ['Projects & EXSIM docs', 'Commission %, doc templates'],
                ['Directory', 'Leadership, hotlines, PICs'],
                ['Win Poster brands', 'Logos & templates per country'],
                ['Quotes & mascots', 'Home-screen motivation'],
              ] as [string, string][]).map(([t2, d]) => (
                <Card key={t2} className="p-4" onClick={() => say(`${t2} manager (full build phase)`)}>
                  <p className="text-sm font-bold">{t2}</p>
                  <p className="mt-1 text-[11px] text-muted">{d}</p>
                </Card>
              ))}
            </div>
          )}

          {/* ============ REWARDS ============ */}
          {section === 'rewards' && (
            <Card className="max-w-3xl overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Status</th></tr></thead>
                <tbody>
                  {REWARDS.filter((r) => team === 'ALL' || r.team === team).map((r) => (
                    <tr key={r.title} className="border-b border-border last:border-0 hover:bg-surface2/50">
                      <td className="px-4 py-3 font-semibold">{r.title}</td>
                      <td className="px-4 py-3"><Chip tone="accent">{r.tier}</Chip></td>
                      <td className="px-4 py-3">{r.team === 'MY' ? '🇲🇾' : '🇮🇩'}</td>
                      <td className="px-4 py-3 text-xs">{r.target}</td>
                      <td className="px-4 py-3"><Chip tone={r.active ? 'success' : 'default'}>{r.active ? 'active' : 'draft'}</Chip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="p-4 text-[11px] text-muted">Rewards are country-scoped — Indonesia gets its own campaigns here (replacing the copied MY test data).</p>
            </Card>
          )}

          {/* ============ COUNTRY SETTINGS ============ */}
          {section === 'settings' && (
            <>
            {/* Brand Studio — uploadable logos & mascots */}
            <Card className="mb-5 p-5">
              <div className="mb-1 flex items-center gap-2">
                <p className="font-display text-sm font-extrabold">🎨 Brand Studio</p>
                <Chip tone="accent">change anytime — no developer needed</Chip>
              </div>
              <p className="mb-4 text-[11px] leading-relaxed text-muted">
                Upload transparent PNG/WebP for best results (backgrounds can be auto-removed on upload in the full build).
                Every change keeps version history — swap to 3D or festive styles any time and roll back if needed.
              </p>
              <div className="grid gap-x-8 gap-y-2 xl:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">🇲🇾 Malaysia — 2 logos + mascots</p>
                  <BrandSlotEditor country="MY" slot="logo_iqi" label="Logo 1 · IQI" hint="Header + poster left mark" onSaved={say} />
                  <BrandSlotEditor country="MY" slot="logo_ag" label="Logo 2 · AG" hint="Header + poster right mark" onSaved={say} />
                  <BrandSlotEditor country="MY" slot="mascot_home" label="Mascot · Home" hint="My Day hero corner" onSaved={say} />
                  <BrandSlotEditor country="MY" slot="mascot_login" label="Mascot · Login" hint="Optional — hidden when empty" onSaved={say} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">🇮🇩 Indonesia — 2 logos + mascots</p>
                  <BrandSlotEditor country="ID" slot="logo_iqi" label="Logo 1 · IQI" hint="Header + poster left mark" onSaved={say} />
                  <BrandSlotEditor country="ID" slot="logo_ag" label="Logo 2 · AG" hint="Header + poster right mark" onSaved={say} />
                  <BrandSlotEditor country="ID" slot="mascot_home" label="Mascot · Home" hint="My Day hero corner" onSaved={say} />
                  <BrandSlotEditor country="ID" slot="mascot_login" label="Mascot · Login" hint="Optional — hidden when empty" onSaved={say} />
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-1">
                <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wider text-muted">🌐 Global</p>
                <BrandSlotEditor country="GLOBAL" slot="shield" label="AG Shield" hint="Login splash + admin hero watermark" onSaved={say} />
              </div>
            </Card>

            {/* Income rules — comm added by admin for BOTH countries */}
            <Card className="mb-5 p-5">
              <div className="mb-1 flex items-center gap-2">
                <p className="font-display text-sm font-extrabold">💰 Income rules</p>
                <Chip tone="accent">REN · L · TL · HOT · VP · GVP</Chip>
              </div>
              <p className="mb-4 text-[11px] text-muted">
                Set OV % per rank and every property's price/comm/RGR. Users see OV for their level & below only. Edits go live instantly.
              </p>
              <div className="grid gap-x-8 gap-y-5 xl:grid-cols-2">
                <IncomeRules country="MY" onSaved={say} />
                <IncomeRules country="ID" onSaved={say} />
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              {(['MY', 'ID'] as const).map((c) => (
                <Card key={c} className="p-5">
                  <p className="mb-4 font-display text-sm font-extrabold">{c === 'MY' ? '🇲🇾 Malaysia' : '🇮🇩 Indonesia'}</p>
                  {([
                    ['Currency', c === 'MY' ? 'RM (MYR)' : 'Rp (IDR)'],
                    ['Tax', c === 'MY' ? 'SST 8%' : 'PPN 11%'],
                    ['Default language', c === 'MY' ? 'English (BM optional)' : 'Bahasa Indonesia'],
                    ['Phone prefix', c === 'MY' ? '+60' : '+62'],
                    ['Timezone', c === 'MY' ? 'Asia/Kuala_Lumpur' : 'Asia/Jakarta'],
                    ['GHL account', c === 'MY' ? 'Location ····8842 · connected' : 'Location ····3317 · connected'],
                    ['M4U webhook', 'active · secret set'],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
                      <span className="text-muted">{k}</span>
                      <span className="font-semibold">{v}</span>
                    </div>
                  ))}
                  <button type="button" onClick={() => say(`${c} settings editor (full build phase — fixes the ID currency bug permanently)`)} className="mt-4 w-full cursor-pointer rounded-xl border border-border py-2.5 text-xs font-bold text-muted transition-colors hover:border-accent/60 hover:text-ink">Edit {c} settings</button>
                </Card>
              ))}
            </div>
            </>
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
