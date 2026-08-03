/* IQI AG Income Calculator — SUBSALE (full production math, see SPEC-INCOME-SUBSALE.md)
   + property comparison picker. Every constant is admin-set per country. */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { Card, Chip } from '../components/ui'
import {
  applySst,
  calcPrimaryID,
  calcSubsale,
  ID_CHAIN,
  totalRate,
  useIncomeCfg,
  type ChainLayer,
  type IncomeCfg,
} from '../lib/income'

/* ---------- MY PRIMARY — original M11 style: project list · take-home hero ·
   RGR bonus card · income comparison. Projects = admin list w/ appear placement. */
function PrimaryMYNew() {
  const { user } = useApp()
  const cfg = useIncomeCfg('MY')
  const projects = (cfg.myPrimary ?? []).filter((p) => !p.appear || p.appear.includes('income'))
  const [pid, setPid] = useState(projects[0]?.id ?? '')
  if (!user) return null
  const pos = user.careerRank
  const privileged = user.role === 'master_admin' || user.role === 'country_admin' || pos === 'VP' || pos === 'GVP'
  const sst = (v: number) => v / 1.08
  const fmt = (v: number) => `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  /* §E per project: TL=50%×HOT, L=30%×HOT, share=(TL+L)÷funders, VP=(A−B)−share */
  const rates = (p: NonNullable<IncomeCfg['myPrimary']>[number]) => {
    const D = p.tlOn ? 0.5 * p.hot : 0
    const E2 = p.lOn ? 0.3 * p.hot : 0
    const share = D + E2 > 0 ? (D + E2) / (2 + (p.hotOn ? 1 : 0)) : 0
    return {
      REN: p.ren, L: E2, TL: D,
      HOT: p.hotOn ? p.hot - share : 0,
      TM: 0,
      VP: (p.hotOn ? p.vp - p.hot : p.vp) - share,
      GVP: (p.hotOn ? p.vp - p.hot : p.vp) - share,
    } as Record<string, number>
  }
  const sel = projects.find((p) => p.id === pid) ?? projects[0]
  if (!sel) return <Card className="p-6 text-center text-sm text-muted">No projects set to appear here yet — admin adds them in Income rules.</Card>
  const myRate = rates(sel)[pos] ?? rates(sel).REN
  return (
    <>
      {/* role banner — like the original */}
      <div className="mb-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-xs font-bold">
        {privileged ? 'VP — full view. You set all projects & commission.' : `${pos} — you see your part only. Rates set by admin.`}
      </div>
      <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs font-bold">
        🔥 {privileged ? 'Top of the ladder. Lead your network of managers and grow the whole team.' : 'Every unit closed moves you up — pick a project and go.'}
      </div>

      {/* Projects — radio list */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="border-l-2 border-accent pl-2 font-display text-sm font-extrabold">Projects</p>
          {privileged && (
            <span className="text-[10px] font-bold text-muted">＋ Add / ✏ edit in Admin → Income rules</span>
          )}
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          Each project has its own % (VP / HOT / REN). The rules are the same — TL% = 50% × HOT%, L% = 30% × HOT%. Compare your income across all of them below.
        </p>
        {projects.map((p) => (
          <button key={p.id} type="button" onClick={() => setPid(p.id)}
            className={clsx('mb-2 flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-200',
              p.id === sel.id ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-accent/50')}>
            <span className={clsx('flex h-4.5 w-4.5 h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2', p.id === sel.id ? 'border-accent' : 'border-border')}>
              {p.id === sel.id && <span className="h-2 w-2 rounded-full bg-accent" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{p.name}</span>
            <span className="shrink-0 text-xs text-muted">RM {p.price.toLocaleString('en-MY')}</span>
            <span className="shrink-0 text-xs font-extrabold text-accent">REN {p.ren}%</span>
            {p.rgrOn && <span className="shrink-0">🎁</span>}
          </button>
        ))}
      </Card>

      {/* take-home hero */}
      <div className="hero-user mb-4 p-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c9c2a8]">
          {pos} take-home / unit · {sel.name}
        </p>
        <p className="gold-text font-display text-4xl font-extrabold">{fmt(sst((sel.price * myRate) / 100))}</p>
        <p className="mt-1 text-[11px] text-[#c9c2a8]">{myRate.toFixed(2)}% of RM {sel.price.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
      </div>

      {/* RGR bonus card */}
      {sel.rgrOn && (
        <Card className="mb-4 border-warning/40 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="border-l-2 border-warning pl-2 font-display text-sm font-extrabold">🎁 RGR bonus available</p>
            <Chip tone="success">● Active</Chip>
          </div>
          <p className="mt-2 text-sm font-extrabold">{sel.name}</p>
          <p className="font-display text-xl font-extrabold text-warning">
            {sel.rgrPct}% = {fmt(sst((sel.price * sel.rgrPct) / 100))} <span className="text-[10px] font-semibold text-muted">(after SST)</span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            To the direct leader (L1) who recruited the selling REN — any rank can earn it (on top of their commission).
          </p>
          {sel.rgrFrom && <p className="mt-1 text-[11px] font-semibold">Valid: {sel.rgrFrom} – {sel.rgrTo}</p>}
          {sel.tnc && <p className="mt-1 text-[10px] italic text-muted">{sel.tnc}</p>}
        </Card>
      )}

      {/* income comparison */}
      <Card className="mb-4 overflow-x-auto">
        <div className="flex items-center justify-between p-4 pb-2">
          <p className="border-l-2 border-accent pl-2 font-display text-sm font-extrabold">Income comparison</p>
          <button type="button" onClick={() => window.print()} className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-on-accent">🖶 Save / Print</button>
        </div>
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[9px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2">Project</th><th className="px-2 py-2 text-right">Unit price</th>
              <th className="px-2 py-2 text-right">REN</th><th className="px-2 py-2 text-right">RGR</th>
              <th className="px-4 py-2 text-right">{privileged ? 'VP' : pos}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => {
              const rt = rates(p)
              const mine2 = rt[pos] ?? rt.REN
              return (
                <tr key={p.id} className={clsx('border-b border-border last:border-0', p.id === sel.id && 'bg-accent-soft/30')}>
                  <td className="px-4 py-2.5">
                    <p className="font-extrabold">{p.name} {p.rgrOn && '🎁'}</p>
                    <p className="text-[9px] text-muted">HOT {p.hotOn ? '✓' : '✗'} · TL {p.tlOn ? '✓' : '✗'} · L {p.lOn ? '✓' : '✗'}</p>
                  </td>
                  <td className="px-2 py-2.5 text-right">RM {p.price.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-2.5 text-right">{fmt(sst((p.price * p.ren) / 100))}</td>
                  <td className="px-2 py-2.5 text-right font-bold text-warning">{p.rgrOn ? `🎁 ${fmt(sst((p.price * p.rgrPct) / 100))}` : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-extrabold text-accent">{fmt(sst((p.price * (privileged ? rt.VP : mine2)) / 100))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
      <p className="pb-4 text-center text-[10px] text-muted">Net after 8% SST (always absorbed for Primary) · MY rules locked (spec §E)</p>
    </>
  )
}

/* ---------- ID PRIMARY — pool model (% of amount received from developer) ---------- */
function PrimaryID() {
  const { user } = useApp()
  const cfg = useIncomeCfg('ID')
  /* only projects the admin allowed to appear in Income */
  const projects = cfg.primaryProps.filter((p) => !p.appear || p.appear.includes('income'))
  const [pid, setPid] = useState(projects[0]?.id ?? '')
  const [price, setPrice] = useState(cfg.primaryProps[0]?.price ?? 500000000)
  const [devPct, setDevPct] = useState(cfg.primaryProps[0]?.devPct ?? 6)
  const [agentPct, setAgentPct] = useState(projects[0]?.agentPct ?? cfg.primarySlices.AGENT)
  const [filled, setFilled] = useState<Record<string, boolean>>({ L: true, TL: true, HOT: true, TM: false, VP: true, GVP: true })
  const r = useMemo(() => calcPrimaryID(cfg, price, devPct, filled, agentPct), [cfg, price, devPct, filled, agentPct])
  const fmt = (v: number) => `Rp ${v.toLocaleString('id-ID', { maximumFractionDigits: 2 })}`
  const myPos = user?.careerRank ?? 'REN'
  /* only admin/leader see the FULL table; everyone else sees their part only */
  const privileged =
    user?.role === 'master_admin' || user?.role === 'country_admin' || user?.role === 'leader'
  const visRows = privileged ? r.rows : r.rows.filter((x) => x.key === 'AGENT' || x.key === myPos)
  const pick = (id: string) => {
    setPid(id)
    const p = cfg.primaryProps.find((x) => x.id === id)
    if (p) { setPrice(p.price); setDevPct(p.devPct); setAgentPct(p.agentPct ?? cfg.primarySlices.AGENT) }
  }
  return (
    <>
      <label className="mb-1.5 block text-xs font-semibold text-muted">🏗 Project (admin sets only the dev %)</label>
      <select value={pid} onChange={(e) => pick(e.target.value)}
        className="mb-3 h-12 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name} — {p.devPct}% from developer</option>
        ))}
      </select>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted">House price (IDR)</label>
          <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted">% from developer</label>
          <input type="number" step={0.5} value={devPct} onChange={(e) => setDevPct(Number(e.target.value) || 0)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
        </div>
      </div>

      <div className="hero-user mb-4 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">Received from developer · {devPct}%</p>
        <p className="gold-text font-display text-3xl font-extrabold">{fmt(r.received)}</p>
        <p className="mt-1 text-[11px] text-[#c9c2a8]">
          Agent {agentPct}% flat — {fmt((r.received * agentPct) / 100)} (no add-on, no OV)
        </p>
        {agentPct !== cfg.primarySlices.AGENT && (
          <p className="mt-1.5 rounded-lg border border-dashed border-warning/60 bg-warning/10 p-2 text-[10px] font-bold text-warning">
            ⚖ Special deal: agent {agentPct}% (admin-set) — all other shares reduced fairly to ×{r.scale.toFixed(3)}
          </p>
        )}
      </div>

      <Card className="mb-4 p-4">
        <p className="mb-1 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">Positions filled (unfilled rolls UP · GVP last)</p>
        <div className="mb-1 mt-2 flex flex-wrap gap-1.5">
          {ID_CHAIN.map((pos) => (
            <button key={pos} type="button"
              onClick={() => setFilled((f) => ({ ...f, [pos]: !f[pos] }))}
              className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors duration-200',
                filled[pos] || pos === 'GVP' ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted line-through')}>
              {pos}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted">GVP is the last resort — always receives the leftovers.</p>
      </Card>

      <Card className="mb-4 overflow-x-auto">
        <p className="border-l-2 border-accent p-4 pb-2 pl-4 font-display text-sm font-extrabold">Distribution — 100% of the pool</p>
        <table className="w-full min-w-[440px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[9px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2">Party</th><th className="px-2 py-2 text-right">%</th><th className="px-4 py-2 text-right">IDR</th>
            </tr>
          </thead>
          <tbody>
            {visRows.map((row) => (
              <tr key={row.key} className={clsx('border-b border-border last:border-0',
                row.key === 'AGENT' && 'bg-accent-soft/40 font-extrabold',
                row.key === myPos && 'font-extrabold text-accent')}>
                <td className="px-4 py-2.5">
                  {row.label}{row.key === myPos ? ' · you' : ''}
                  {row.rolledFrom && <Chip tone="warning" className="ml-1.5">↑ +{row.rolledFrom.join('+')}</Chip>}
                </td>
                <td className="px-2 py-2.5 text-right">{row.pct}%</td>
                <td className="px-4 py-2.5 text-right">{fmt(row.amt)}</td>
              </tr>
            ))}
            {privileged && (
              <tr className="font-extrabold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-2 py-2.5 text-right">{Math.round(r.total * 100) / 100}%</td>
                <td className="px-4 py-2.5 text-right">{fmt(r.received)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="p-4 pt-2 text-[10px] text-muted">
          {privileged
            ? '👁 Full table — admin/leader view. Agents see only their own line. Rates set by admin only.'
            : '👁 You see your part only — rates are set by admin.'}
        </p>
      </Card>
    </>
  )
}

const CHAIN_DEFAULTS = [
  { on: true, name: 'Direct leader', rank: 'SERGEANT' },
  { on: true, name: 'Leader 2', rank: 'GENERAL' },
  { on: false, name: 'Leader 3', rank: 'GENERAL' },
  { on: false, name: 'Leader 4', rank: 'GENERAL' },
]

export default function Income() {
  const { user } = useApp()
  const country = user?.country ?? 'MY'
  const cfg = useIncomeCfg(country)
  const [mode, setMode] = useState<'subsale' | 'primary'>('subsale')
  const [propId, setPropId] = useState(cfg.properties[0]?.id ?? '')
  const [price, setPrice] = useState(cfg.properties[0]?.price ?? 500000)
  const [agency, setAgency] = useState(cfg.properties[0]?.agency ?? cfg.agencyDefault)
  const [rankName, setRankName] = useState('VALIANT')
  const [customPct, setCustomPct] = useState('')
  const [clientPaid, setClientPaid] = useState(false)
  const [chain, setChain] = useState(CHAIN_DEFAULTS)
  if (!user) return null

  const pickProperty = (id: string) => {
    setPropId(id)
    const p = cfg.properties.find((x) => x.id === id)
    if (p) {
      setPrice(p.price)
      setAgency(Math.min(p.agency, cfg.agencyMax))
    }
  }

  const row = cfg.ladder.find((r) => r.name === rankName) ?? cfg.ladder[0]
  const sellingRate = customPct.trim() !== '' && Number(customPct) > 0
    ? Number(customPct) / 100
    : totalRate(cfg, row)

  const layers: ChainLayer[] = chain.map((l) => {
    const lr = cfg.ladder.find((r) => r.name === l.rank) ?? cfg.ladder[0]
    return { exists: l.on, name: l.name || l.rank, rate: totalRate(cfg, lr) }
  })

  const r = useMemo(
    () => calcSubsale(cfg, { price, agencyPct: agency, sellingRate, clientPaid, chain: layers }),
    [cfg, price, agency, sellingRate, clientPaid, layers],
  )
  /* production shows 2 decimals (RM 9,027.78) */
  const fmt = (v: number) =>
    `${cfg.currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const pc = (v: number) => `${Math.round(v * 1000) / 10}%`
  const schemeLabel = r.scheme.map((x) => Math.round(x * 100)).join(' / ')

  return (
    <div className="animate-rise px-4 pt-5 print:px-0">
      <header className="mb-4 flex items-center gap-3 print:hidden">
        <Link to="/sales" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">
            IQI <span className="gold-text">AG</span> Income Calculator
          </h1>
          <p className="text-xs text-muted">
            {country === 'MY' ? '🇲🇾 agency max 3%' : '🇮🇩 agency max 6%'} · rules set by admin
          </p>
        </div>
        <button type="button" onClick={() => window.print()} aria-label="Save / Print" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
          <Printer size={15} />
        </button>
      </header>

      {/* mode tabs */}
      <div className="mb-4 flex gap-2 print:hidden">
        {(['subsale', 'primary'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={clsx('flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-extrabold uppercase transition-colors duration-200',
              mode === m ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:text-ink')}>
            {m}
          </button>
        ))}
      </div>

      {mode === 'primary' ? (
        country === 'MY' ? <PrimaryMYNew /> : <PrimaryID />
      ) : (
        <>
          {/* property comparison picker */}
          <label className="mb-1.5 block text-xs font-semibold text-muted">
            🏠 Compare property (from admin Property section)
          </label>
          <select value={propId} onChange={(e) => pickProperty(e.target.value)}
            className="mb-3 h-12 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent">
            {cfg.properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} · {p.agency}%</option>
            ))}
          </select>

          {/* SST toggle */}
          <button type="button" onClick={() => setClientPaid((v) => !v)}
            className={clsx('mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-left text-sm font-bold transition-colors duration-200',
              clientPaid ? 'border-accent bg-accent-soft' : 'border-border')}>
            <span className={clsx('flex h-5 w-5 items-center justify-center rounded border text-[11px]', clientPaid ? 'border-accent bg-accent text-on-accent' : 'border-border')}>
              {clientPaid ? '✓' : ''}
            </span>
            {cfg.taxName} paid by client ({Math.round(cfg.taxRate * 100)}% added on top)
          </button>
          <p className="mb-4 text-[11px] text-muted">
            {clientPaid
              ? `Client pays the ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} — you keep the full commission.`
              : `${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} absorbed from the commission (net = amount ÷ ${(1 + cfg.taxRate).toFixed(2)}).`}
          </p>

          {/* deal inputs */}
          <Card className="mb-4 p-4">
            <p className="mb-3 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">Deal & selling REN</p>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">Property price ({cfg.currency})</label>
                <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">Agency rate % (max {cfg.agencyMax})</label>
                <input type="number" min={0} max={cfg.agencyMax} step={0.1} value={agency}
                  onChange={(e) => setAgency(Math.min(Number(e.target.value) || 0, cfg.agencyMax))}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">Selling REN rank</label>
                <select value={rankName} onChange={(e) => { setRankName(e.target.value); setCustomPct('') }}
                  className="h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-2 text-sm font-semibold outline-none focus:border-accent">
                  {cfg.ladder.map((l) => (
                    <option key={l.name} value={l.name}>{l.name} — {pc(totalRate(cfg, l))}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">…or custom % (overrides rank)</label>
                <input type="number" placeholder="e.g. 85" value={customPct} onChange={(e) => setCustomPct(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
              </div>
            </div>
            <p className="rounded-lg border border-dashed border-accent/50 p-2 text-[11px] text-muted">
              Selling REN payout = <b className="text-accent">{customPct ? `custom · ${pc(sellingRate)}` : `${row.name} · ${pc(sellingRate)} (base ${pc(cfg.baseRate)} + add-on ${pc(row.addon)})`}</b>
            </p>
          </Card>

          {/* hero result */}
          <div className="hero-user mb-4 p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">Selling REN · {pc(r.sellingRate)}</p>
                <p className="gold-text font-display text-3xl font-extrabold">{fmt(r.sellingSst)}</p>
                <p className="text-[11px] text-[#c9c2a8]">commission {clientPaid ? '(client pays tax)' : `after ${cfg.taxName}`}</p>
              </div>
              <div className="text-right text-[11px] text-[#c9c2a8]">
                <p>Gross pool {fmt(r.grossComm)}</p>
                <p>RGR scheme: {schemeLabel}</p>
              </div>
            </div>
            {r.trimmed > 0 && (
              <p className="mt-2 rounded-lg bg-warning/15 p-2 text-[11px] font-bold text-warning">
                ⚠ Combined cap {pc(cfg.combinedCap)} applied — {pc(r.trimmed)} trimmed from L1 OV
              </p>
            )}
          </div>

          {/* override chain L1–L4 */}
          <Card className="mb-4 p-4">
            <p className="mb-1 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">Override chain — OV & RGR</p>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              OV goes only to L1 (direct leader, needs ≥{pc(cfg.ovMinRate)}). RGR paid for all 4 tiers —
              empty layer's RGR goes to Company. Selling REN earns commission only.
            </p>
            {chain.map((l, i) => {
              const res = r.rows[i]
              return (
                <div key={i} className={clsx('mb-2.5 rounded-xl border p-3', l.on ? 'border-accent/40' : 'border-border opacity-80')}>
                  <div className="mb-2 flex items-center gap-2">
                    <button type="button" aria-label={`Toggle L${i + 1}`}
                      onClick={() => setChain((c) => c.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                      className={clsx('flex h-5 w-5 cursor-pointer items-center justify-center rounded border text-[11px]', l.on ? 'border-accent bg-accent text-on-accent' : 'border-border')}>
                      {l.on ? '✓' : ''}
                    </button>
                    <span className="text-xs font-extrabold">L{i + 1}</span>
                    <span className="ml-auto text-[11px] font-bold text-muted">
                      {l.on ? pc(layers[i].rate) : 'no agent'}
                    </span>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input value={l.name} disabled={!l.on} placeholder={`Leader ${i + 1}`}
                      onChange={(e) => setChain((c) => c.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      className="h-10 rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-accent disabled:opacity-50" />
                    <select value={l.rank} disabled={!l.on}
                      onChange={(e) => setChain((c) => c.map((x, j) => (j === i ? { ...x, rank: e.target.value } : x)))}
                      className="h-10 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs font-semibold outline-none focus:border-accent disabled:opacity-50">
                      {cfg.ladder.map((ld) => (
                        <option key={ld.name} value={ld.name}>{ld.name} — {pc(totalRate(cfg, ld))}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-surface2 p-2">
                      <p className="text-[9px] font-bold uppercase text-muted">OV {i === 0 ? pc(res.ov) : ''}</p>
                      <p className="text-xs font-extrabold">{i === 0 ? fmt(res.ovSst) : `${cfg.currency} 0 (L1 only)`}</p>
                    </div>
                    <div className="rounded-lg bg-surface2 p-2">
                      <p className="text-[9px] font-bold uppercase text-muted">RGR {pc(res.rgr)}</p>
                      <p className="text-xs font-extrabold">{fmt(res.rgrSst)}</p>
                    </div>
                    <div className={clsx('rounded-lg p-2', l.on ? 'bg-accent-soft' : 'bg-surface2')}>
                      <p className="text-[9px] font-bold uppercase text-muted">{l.on ? 'take-home' : 'RGR goes to'}</p>
                      <p className={clsx('text-xs font-extrabold', l.on && 'text-accent')}>{l.on ? fmt(res.takeSst) : 'Company'}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </Card>

          {/* full breakdown */}
          <Card className="mb-4 overflow-x-auto">
            <p className="border-l-2 border-accent p-4 pb-2 pl-4 font-display text-sm font-extrabold">Full breakdown</p>
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[9px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2">Party</th><th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">OV</th><th className="px-2 py-2 text-right">RGR</th>
                  <th className="px-2 py-2 text-right">{cfg.currency} (gross)</th>
                  <th className="px-4 py-2 text-right">{cfg.currency} (after {cfg.taxName})</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border bg-accent-soft/40 font-extrabold">
                  <td className="px-4 py-2.5">Selling REN</td>
                  <td className="px-2 py-2.5 text-right">{pc(r.sellingRate)}</td>
                  <td className="px-2 py-2.5 text-right">—</td><td className="px-2 py-2.5 text-right">—</td>
                  <td className="px-2 py-2.5 text-right">{fmt(r.selling)}</td>
                  <td className="px-4 py-2.5 text-right text-accent">{fmt(r.sellingSst)}</td>
                </tr>
                {r.rows.map((rw, i) => (
                  <tr key={i} className={clsx('border-b border-border', rw.toCompany && 'text-muted')}>
                    <td className="px-4 py-2.5">{rw.label}</td>
                    <td className="px-2 py-2.5 text-right">{rw.rate != null ? pc(rw.rate) : '—'}</td>
                    <td className="px-2 py-2.5 text-right">{pc(rw.ov)}</td>
                    <td className="px-2 py-2.5 text-right">{pc(rw.rgr)}</td>
                    <td className="px-2 py-2.5 text-right">{fmt(rw.toCompany ? rw.rgrAmt : rw.take)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(rw.toCompany ? rw.rgrSst : rw.takeSst)}</td>
                  </tr>
                ))}
                {r.companyGross > 0 && (
                  <tr className="text-muted">
                    <td className="px-4 py-2.5">Company (forfeited RGR)</td>
                    <td className="px-2 py-2.5 text-right">—</td><td className="px-2 py-2.5 text-right">—</td><td className="px-2 py-2.5 text-right">—</td>
                    <td className="px-2 py-2.5 text-right">{fmt(r.companyGross)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.companySst)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          {/* rank ladder */}
          <Card className="mb-4 p-4 print:hidden">
            <p className="mb-1 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">Rank ladder — accumulated sales to level up</p>
            <p className="mb-3 text-[11px] text-muted">Hit each accumulated-sales target to move up and earn a higher payout %.</p>
            {[...cfg.ladder].reverse().map((l, i) => (
              <div key={l.name} className={clsx('flex items-center gap-3 border-b border-border py-2 text-sm last:border-0', l.name === rankName && !customPct && 'font-extrabold text-accent')}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface2 text-[10px] font-extrabold">{cfg.ladder.length - i}</span>
                <span className="flex-1">{l.name}</span>
                <span className="text-[11px] text-muted">Acc. {fmt(l.target)}</span>
                <Chip tone="accent">{pc(totalRate(cfg, l))}</Chip>
              </div>
            ))}
          </Card>

          <p className="pb-4 text-center text-[10px] text-muted print:hidden">
            OV = Overriding (L1 only) · RGR = REN GET REN · net figures {clientPaid ? 'gross (client pays tax)' : `after ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName}`} · sanity: {fmt(applySst(r.grossComm, clientPaid, cfg.taxRate))} pool net
          </p>
        </>
      )}
    </div>
  )
}
