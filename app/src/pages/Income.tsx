/* IQI AG Income Calculator — SUBSALE (full production math, see SPEC-INCOME-SUBSALE.md)
   + property comparison picker. Every constant is admin-set per country. */
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Printer } from 'lucide-react'
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
  const { user, locale } = useApp()
  const cfg = useIncomeCfg('MY')
  const projects = (cfg.myPrimary ?? []).filter((p) => !p.appear || p.appear.includes('income'))
  const [pid, setPid] = useState(projects[0]?.id ?? '')
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
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
      // IQI (company) funds its equal share of the TL+L pool — a NEGATIVE line,
      // exactly as the original worksheet shows it, so the split balances.
      IQI: D + E2 > 0 ? -share : 0,
    } as Record<string, number>
  }
  const sel = projects.find((p) => p.id === pid) ?? projects[0]
  if (!sel) return <Card className="p-6 text-center text-sm text-muted">{L(
    'No projects set to appear here yet — admin adds them in Income rules.',
    'Belum ada projek dipaparkan di sini — admin tambah dalam peraturan Income.',
    'Belum ada proyek yang tampil di sini — admin menambahkannya di aturan Income.')}</Card>
  const myRate = rates(sel)[pos] ?? rates(sel).REN
  /* The rank chain, top-earner to front-line. A VP/GVP (and admins) can see the
     whole downline OV — what every level takes on the same unit — so the top can
     read the full split, not just their own line. A layer that is switched off
     for a project shows a dash, never a phantom number. */
  const CHAIN: { key: string; label: string }[] = [
    { key: 'VP', label: 'VP' }, { key: 'HOT', label: 'HOT' },
    { key: 'TL', label: 'TL' }, { key: 'L', label: 'L' }, { key: 'REN', label: 'REN' },
    { key: 'IQI', label: 'IQI ⓒ' },
  ]
  const layerOn = (p: NonNullable<IncomeCfg['myPrimary']>[number], rank: string) =>
    rank === 'REN' || rank === 'VP' ? true
    : rank === 'HOT' ? !!p.hotOn : rank === 'TL' ? !!p.tlOn : rank === 'L' ? !!p.lOn
    : rank === 'IQI' ? ((p.tlOn ? 1 : 0) + (p.lOn ? 1 : 0)) > 0 : false
  const takeHome = (p: NonNullable<IncomeCfg['myPrimary']>[number], rank: string) =>
    layerOn(p, rank) ? sst((p.price * (rates(p)[rank] ?? 0)) / 100) : null
  return (
    <>
      {/* role banner — like the original */}
      <div className="mb-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-xs font-bold">
        {privileged
          ? L('VP — full view. You set all projects & commission.',
              'VP — paparan penuh. Anda tetapkan semua projek & komisen.',
              'VP — tampilan penuh. Anda mengatur semua proyek & komisi.')
          : `${pos} — ${L('you see your part only. Rates set by admin.',
              'anda nampak bahagian anda sahaja. Kadar ditetapkan admin.',
              'kamu hanya lihat bagianmu. Tarif diatur admin.')}`}
      </div>
      <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs font-bold">
        🔥 {privileged
          ? L('Top of the ladder. Lead your network of managers and grow the whole team.',
              'Puncak tangga. Pimpin rangkaian manager anda dan besarkan seluruh pasukan.',
              'Puncak tangga. Pimpin jaringan manajermu dan besarkan seluruh tim.')
          : L('Every unit closed moves you up — pick a project and go.',
              'Setiap unit closing bawa anda naik — pilih projek dan gerak.',
              'Setiap unit closing membawamu naik — pilih proyek dan gas.')}
      </div>

      {/* Projects — radio list */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="border-l-2 border-accent pl-2 font-display text-sm font-extrabold">{L('Projects', 'Projek', 'Proyek')}</p>
          {privileged && (
            <span className="text-[10px] font-bold text-muted">{L('＋ Add / ✏ edit in Admin → Income rules', '＋ Tambah / ✏ edit di Admin → peraturan Income', '＋ Tambah / ✏ edit di Admin → aturan Income')}</span>
          )}
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          {L('Each project has its own % (VP / HOT / REN). The rules are the same — TL% = 50% × HOT%, L% = 30% × HOT%. Compare your income across all of them below.',
             'Setiap projek ada % sendiri (VP / HOT / REN). Peraturannya sama — TL% = 50% × HOT%, L% = 30% × HOT%. Banding pendapatan anda merentas semuanya di bawah.',
             'Setiap proyek punya % sendiri (VP / HOT / REN). Aturannya sama — TL% = 50% × HOT%, L% = 30% × HOT%. Bandingkan penghasilanmu di semua proyek di bawah.')}
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
          {pos} {L('take-home / unit', 'bawa pulang / unit', 'diterima / unit')} · {sel.name}
        </p>
        <p className="gold-text font-display text-4xl font-extrabold">{fmt(sst((sel.price * myRate) / 100))}</p>
        <p className="mt-1 text-[11px] text-[#c9c2a8]">{myRate.toFixed(2)}% {L('of', 'daripada', 'dari')} RM {sel.price.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</p>
      </div>

      {/* RGR bonus card */}
      {sel.rgrOn && (
        <Card className="mb-4 border-warning/40 p-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="border-l-2 border-warning pl-2 font-display text-sm font-extrabold">🎁 {L('RGR bonus available', 'Bonus RGR tersedia', 'Bonus RGR tersedia')}</p>
            <Chip tone="success">● {L('Active', 'Aktif', 'Aktif')}</Chip>
          </div>
          <p className="mt-2 text-sm font-extrabold">{sel.name}</p>
          <p className="font-display text-xl font-extrabold text-warning">
            {sel.rgrPct}% = {fmt(sst((sel.price * sel.rgrPct) / 100))} <span className="text-[10px] font-semibold text-muted">{L('(after SST)', '(selepas SST)', '(setelah SST)')}</span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {L('To the direct leader (L1) who recruited the selling REN — any rank can earn it (on top of their commission).',
               'Untuk ketua langsung (L1) yang merekrut REN penjual — mana-mana pangkat boleh dapat (atas komisen mereka).',
               'Untuk leader langsung (L1) yang merekrut REN penjual — semua peringkat bisa dapat (di atas komisi mereka).')}
          </p>
          {sel.rgrFrom && <p className="mt-1 text-[11px] font-semibold">{L('Valid:', 'Sah:', 'Berlaku:')} {sel.rgrFrom} – {sel.rgrTo}</p>}
          {sel.tnc && <p className="mt-1 text-[10px] italic text-muted">{sel.tnc}</p>}
        </Card>
      )}

      {/* full downline chain for the selected unit — top ranks only */}
      {privileged && (
        <Card className="mb-4 p-4">
          <p className="mb-1 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">
            {L('Full chain — this unit', 'Rantaian penuh — unit ini', 'Rantai penuh — unit ini')}
          </p>
          <p className="mb-3 text-[11px] text-muted">{sel.name} · RM {sel.price.toLocaleString('en-MY', { minimumFractionDigits: 2 })} · {L('per unit, after SST', 'seunit, selepas SST', 'per unit, setelah SST')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CHAIN.map(({ key, label }) => {
              const th = takeHome(sel, key)
              return (
                <div key={key} className={clsx('rounded-xl border p-2.5 text-center',
                  key === 'VP' ? 'border-accent/50 bg-accent-soft/40' : 'border-border')}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
                  <p className={clsx('font-display text-sm font-extrabold', th == null && 'text-muted')}>
                    {th == null ? '—' : fmt(th)}
                  </p>
                  <p className="text-[9px] text-muted">{th == null ? L('layer off', 'lapisan tutup', 'lapisan mati') : `${(rates(sel)[key] ?? 0).toFixed(2)}%`}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[10px] text-muted">
            {L('This is the whole downline split on one unit — VP down to REN. Layers switched off for this project show a dash.',
               'Ini pecahan seluruh downline untuk satu unit — VP hingga REN. Lapisan yang ditutup untuk projek ini dipapar dengan sengkang.',
               'Ini pembagian seluruh downline untuk satu unit — VP hingga REN. Lapisan yang dimatikan untuk proyek ini ditampilkan dengan tanda hubung.')}
          </p>
        </Card>
      )}

      {/* income comparison */}
      <Card className="mb-4 overflow-x-auto">
        <div className="flex items-center justify-between p-4 pb-2">
          <p className="border-l-2 border-accent pl-2 font-display text-sm font-extrabold">{L('Income comparison', 'Perbandingan pendapatan', 'Perbandingan penghasilan')}</p>
          <button type="button" onClick={() => window.print()} className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-on-accent">🖶 {L('Save / Print', 'Simpan / Cetak', 'Simpan / Cetak')}</button>
        </div>
        {privileged ? (
          /* the top sees every level's take-home per project */
          <table className="w-full min-w-[680px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[9px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2">{L('Project', 'Projek', 'Proyek')}</th>
                <th className="px-2 py-2 text-right">{L('Unit price', 'Harga unit', 'Harga unit')}</th>
                {CHAIN.map((c) => <th key={c.key} className="px-2 py-2 text-right">{c.label}</th>)}
                <th className="px-4 py-2 text-right">RGR</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={clsx('border-b border-border last:border-0', p.id === sel.id && 'bg-accent-soft/30')}>
                  <td className="px-4 py-2.5"><p className="font-extrabold">{p.name} {p.rgrOn && '🎁'}</p></td>
                  <td className="px-2 py-2.5 text-right">RM {p.price.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td>
                  {CHAIN.map((c) => {
                    const th = takeHome(p, c.key)
                    return (
                      <td key={c.key} className={clsx('px-2 py-2.5 text-right tabular-nums',
                        c.key === 'VP' ? 'font-extrabold text-accent' : th == null ? 'text-muted' : '')}>
                        {th == null ? '—' : fmt(th)}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-right font-bold text-warning">{p.rgrOn ? `🎁 ${fmt(sst((p.price * p.rgrPct) / 100))}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* a front-line agent sees their own line plus REN and RGR */
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[9px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2">{L('Project', 'Projek', 'Proyek')}</th><th className="px-2 py-2 text-right">{L('Unit price', 'Harga unit', 'Harga unit')}</th>
                <th className="px-2 py-2 text-right">REN</th><th className="px-2 py-2 text-right">RGR</th>
                <th className="px-4 py-2 text-right">{pos}</th>
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
                    <td className="px-4 py-2.5 text-right font-extrabold text-accent">{fmt(sst((p.price * mine2) / 100))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
      <p className="pb-4 text-center text-[10px] text-muted">{L(
        'Net after 8% SST (always absorbed for Primary) · MY rules locked (spec §E)',
        'Bersih selepas 8% SST (sentiasa diserap untuk Primary) · peraturan MY dikunci (spec §E)',
        'Bersih setelah 8% SST (selalu diserap untuk Primary) · aturan MY terkunci (spec §E)')}</p>
    </>
  )
}

/* ---------- ID PRIMARY — pool model (% of amount received from developer) ---------- */
function PrimaryID() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
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
      <label className="mb-1.5 block text-xs font-semibold text-muted">🏗 {L('Project (admin sets only the dev %)', 'Projek (admin tetapkan % developer sahaja)', 'Proyek (admin hanya atur % developer)')}</label>
      <select value={pid} onChange={(e) => pick(e.target.value)}
        className="mb-3 h-12 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name} — {p.devPct}% {L('from developer', 'daripada developer', 'dari developer')}</option>
        ))}
      </select>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted">{L('House price (IDR)', 'Harga rumah (IDR)', 'Harga rumah (IDR)')}</label>
          <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted">{L('% from developer', '% daripada developer', '% dari developer')}</label>
          <input type="number" step={0.5} value={devPct} onChange={(e) => setDevPct(Number(e.target.value) || 0)}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
        </div>
      </div>

      <div className="hero-user mb-4 p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">{L('Received from developer', 'Diterima daripada developer', 'Diterima dari developer')} · {devPct}%</p>
        <p className="gold-text font-display text-3xl font-extrabold">{fmt(r.received)}</p>
        <p className="mt-1 text-[11px] text-[#c9c2a8]">
          {L(`Agent ${agentPct}% flat`, `Ejen ${agentPct}% rata`, `Agen ${agentPct}% flat`)} — {fmt((r.received * agentPct) / 100)} {L('(no add-on, no OV)', '(tiada tambahan, tiada OV)', '(tanpa tambahan, tanpa OV)')}
        </p>
        {agentPct !== cfg.primarySlices.AGENT && (
          <p className="mt-1.5 rounded-lg border border-dashed border-warning/60 bg-warning/10 p-2 text-[10px] font-bold text-warning">
            ⚖ {L(`Special deal: agent ${agentPct}% (admin-set) — all other shares reduced fairly to ×${r.scale.toFixed(3)}`,
                 `Deal khas: ejen ${agentPct}% (ditetapkan admin) — semua bahagian lain dikurangkan secara adil ke ×${r.scale.toFixed(3)}`,
                 `Deal khusus: agen ${agentPct}% (diatur admin) — semua bagian lain dikurangi secara adil ke ×${r.scale.toFixed(3)}`)}
          </p>
        )}
      </div>

      <Card className="mb-4 p-4">
        <p className="mb-1 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">{L(
          'Positions filled (unfilled rolls UP · GVP last)',
          'Posisi terisi (yang kosong naik ke ATAS · GVP terakhir)',
          'Posisi terisi (yang kosong naik ke ATAS · GVP terakhir)')}</p>
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
        <p className="text-[10px] text-muted">{L(
          'GVP is the last resort — always receives the leftovers.',
          'GVP ialah pilihan terakhir — sentiasa terima baki.',
          'GVP adalah penampung terakhir — selalu menerima sisa.')}</p>
      </Card>

      <Card className="mb-4 overflow-x-auto">
        <p className="border-l-2 border-accent p-4 pb-2 pl-4 font-display text-sm font-extrabold">{L('Distribution — 100% of the pool', 'Agihan — 100% pool', 'Distribusi — 100% pool')}</p>
        <table className="w-full min-w-[440px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[9px] uppercase tracking-wider text-muted">
              <th className="px-4 py-2">{L('Party', 'Pihak', 'Pihak')}</th><th className="px-2 py-2 text-right">%</th><th className="px-4 py-2 text-right">IDR</th>
            </tr>
          </thead>
          <tbody>
            {visRows.map((row) => (
              <tr key={row.key} className={clsx('border-b border-border last:border-0',
                row.key === 'AGENT' && 'bg-accent-soft/40 font-extrabold',
                row.key === myPos && 'font-extrabold text-accent')}>
                <td className="px-4 py-2.5">
                  {row.label}{row.key === myPos ? L(' · you', ' · anda', ' · kamu') : ''}
                  {row.rolledFrom && <Chip tone="warning" className="ml-1.5">↑ +{row.rolledFrom.join('+')}</Chip>}
                </td>
                <td className="px-2 py-2.5 text-right">{row.pct}%</td>
                <td className="px-4 py-2.5 text-right">{fmt(row.amt)}</td>
              </tr>
            ))}
            {privileged && (
              <tr className="font-extrabold">
                <td className="px-4 py-2.5">{L('Total', 'Jumlah', 'Total')}</td>
                <td className="px-2 py-2.5 text-right">{Math.round(r.total * 100) / 100}%</td>
                <td className="px-4 py-2.5 text-right">{fmt(r.received)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="p-4 pt-2 text-[10px] text-muted">
          {privileged
            ? L('👁 Full table — admin/leader view. Agents see only their own line. Rates set by admin only.',
                '👁 Jadual penuh — paparan admin/leader. Ejen nampak baris sendiri sahaja. Kadar ditetapkan admin sahaja.',
                '👁 Tabel lengkap — tampilan admin/leader. Agen hanya lihat baris sendiri. Tarif hanya diatur admin.')
            : L('👁 You see your part only — rates are set by admin.',
                '👁 Anda nampak bahagian anda sahaja — kadar ditetapkan admin.',
                '👁 Kamu hanya lihat bagianmu — tarif diatur admin.')}
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

/* pool-split segment colors: gold = the agent, cool tones = the chain, grey = house */
const CHAIN_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#64748b']

/* collapsible section — the technical detail stays one tap away, not in the face */
function Fold({ title, sub, open, onToggle, children }: {
  title: string; sub?: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <Card className="mb-3 overflow-hidden">
      <button type="button" onClick={onToggle}
        className="flex w-full cursor-pointer items-center gap-2 p-4 text-left">
        <p className="min-w-0 flex-1 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">{title}</p>
        {sub && <span className="shrink-0 text-[10px] font-semibold text-muted">{sub}</span>}
        <ChevronDown size={15}
          className={clsx('shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <div className="animate-rise px-4 pb-4">{children}</div>}
    </Card>
  )
}

export default function Income() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const country = user?.country ?? 'MY'
  const cfg = useIncomeCfg(country)
  const [mode, setMode] = useState<'subsale' | 'primary'>('subsale')
  const CUSTOM = '__custom'
  const [propId, setPropId] = useState(cfg.properties[0]?.id ?? CUSTOM)
  const [price, setPrice] = useState(cfg.properties[0]?.price ?? 500000)
  const [agency, setAgency] = useState(cfg.properties[0]?.agency ?? cfg.agencyDefault)
  const [rankName, setRankName] = useState('VALIANT')
  const [customPct, setCustomPct] = useState('')
  const [clientPaid, setClientPaid] = useState(false)
  const [chain, setChain] = useState(() => CHAIN_DEFAULTS.map((c, i) => ({
    ...c,
    name: i === 0
      ? L('Direct leader', 'Ketua langsung', 'Leader langsung')
      : L(`Leader ${i + 1}`, `Ketua ${i + 1}`, `Leader ${i + 1}`),
  })))
  const [showChain, setShowChain] = useState(true)
  const [showTable, setShowTable] = useState(false)
  const [showLadder, setShowLadder] = useState(false)
  const pickProperty = (id: string) => {
    setPropId(id)
    // custom mode keeps whatever price the agent typed — nothing overwrites it
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
  /* The signed-out guard lives BELOW every hook. It used to sit between the
     useState block and this useMemo, so logging out skipped a hook and crashed
     React with a hook-order violation (the twice-deferred Income.tsx:375 bug). */
  if (!user) return null
  /* production shows 2 decimals (RM 9,027.78) */
  const fmt = (v: number) =>
    `${cfg.currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const pc = (v: number) => `${Math.round(v * 1000) / 10}%`
  const schemeLabel = r.scheme.map((x) => Math.round(x * 100)).join(' / ')

  /* pool split for the visual bar: the agent in gold, each paid leader in a cool
     tone, everything unclaimed in grey — always sums to the gross pool */
  const segs = (() => {
    const g = r.grossComm
    if (g <= 0) return [] as { label: string; amt: number; color: string; w: number }[]
    const list = [{ label: L('Selling REN (you)', 'REN penjual (anda)', 'REN penjual (kamu)'), amt: r.selling, color: 'var(--accent)' }]
    r.rows.forEach((rw, i) => {
      if (!rw.toCompany && rw.take > 0)
        list.push({ label: layers[i].name || `L${i + 1}`, amt: rw.take, color: CHAIN_COLORS[i] })
    })
    const paid = list.reduce((s, x) => s + x.amt, 0)
    if (g - paid > 1e-9) list.push({ label: L('IQI & Company', 'IQI & Syarikat', 'IQI & Perusahaan'), amt: g - paid, color: '#57534e' })
    return list.map((x) => ({ ...x, w: (x.amt / g) * 100 }))
  })()

  return (
    <div className="animate-rise px-4 pt-5 print:px-0">
      <header className="mb-4 flex items-center gap-3 print:hidden">
        <Link to="/sales" aria-label={L('Back', 'Kembali', 'Kembali')} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">
            IQI <span className="gold-text">AG</span> {L('Income Calculator', 'Kalkulator Pendapatan', 'Kalkulator Penghasilan')}
          </h1>
          <p className="text-xs text-muted">
            {country === 'MY'
              ? `🇲🇾 ${L('agency max 3%', 'agensi maks 3%', 'agensi maks 3%')}`
              : `🇮🇩 ${L('agency max 6%', 'agensi maks 6%', 'agensi maks 6%')}`} · {L('rules set by admin', 'peraturan ditetapkan admin', 'aturan diatur admin')}
          </p>
        </div>
        <button type="button" onClick={() => window.print()} aria-label={L('Save / Print', 'Simpan / Cetak', 'Simpan / Cetak')} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
          <Printer size={15} />
        </button>
      </header>

      {/* mode tabs — segmented control, same language as My Day's day/week/month */}
      <div className="mb-4 flex rounded-xl border border-border bg-surface p-1 print:hidden">
        {(['subsale', 'primary'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={clsx('flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors duration-200',
              mode === m ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink')}>
            {m}
          </button>
        ))}
      </div>

      {mode === 'primary' ? (
        country === 'MY' ? <PrimaryMYNew /> : <PrimaryID />
      ) : (
        <>
          {/* ---- result hero: sticky, the money stays in sight while inputs scroll ---- */}
          {/* inline position beats .hero-user's position:relative */}
          <div className="hero-user top-2 z-30 mb-4 p-4 shadow-xl shadow-black/40 print:static"
            style={{ position: 'sticky' }}>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">{L('My commission', 'Komisen saya', 'Komisi saya')} · {pc(r.sellingRate)}</p>
                <p className="gold-text font-display text-3xl font-extrabold leading-tight">{fmt(r.sellingSst)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">{L('OV · L1 leader', 'OV · Ketua L1', 'OV · Leader L1')}</p>
                <p className="gold-text font-display text-xl font-extrabold">{fmt(r.rows[0]?.ovSst ?? 0)}</p>
              </div>
            </div>
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-black/40">
              {segs.map((s) => (
                <span key={s.label} className="transition-all duration-300" style={{ width: `${s.w}%`, background: s.color }} />
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#c9c2a8]">
              <span>Pool {fmt(r.grossComm)} · {clientPaid
                ? L('client pays tax', 'klien bayar cukai', 'klien bayar pajak')
                : `${L('net after', 'bersih selepas', 'bersih setelah')} ${cfg.taxName}`}</span>
              <span>RGR {schemeLabel}</span>
            </div>
            {r.trimmed > 0 && (
              <p className="mt-2 rounded-lg bg-warning/15 p-2 text-[11px] font-bold text-warning">
                ⚠ {L(`Combined cap ${pc(cfg.combinedCap)} applied — ${pc(r.trimmed)} trimmed from L1 OV`,
                     `Had gabungan ${pc(cfg.combinedCap)} dikenakan — ${pc(r.trimmed)} dipotong dari OV L1`,
                     `Batas gabungan ${pc(cfg.combinedCap)} diterapkan — ${pc(r.trimmed)} dipotong dari OV L1`)}
              </p>
            )}
          </div>

          {/* ---- one deal card: property, price, rank, tax ---- */}
          <Card className="mb-3 p-4">
            <p className="mb-3 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">{L('Deal & selling REN', 'Deal & REN penjual', 'Deal & REN penjual')}</p>

            <label className="mb-1 block text-[11px] font-semibold text-muted">{L(
              'Property — pick one or set your own price',
              'Hartanah — pilih satu atau tetapkan harga sendiri',
              'Properti — pilih satu atau atur harga sendiri')}</label>
            <select value={propId} onChange={(e) => pickProperty(e.target.value)}
              className="mb-2 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent">
              <option value={CUSTOM}>{L(`✏️ Custom — my own price (${fmt(price)})`, `✏️ Custom — harga saya sendiri (${fmt(price)})`, `✏️ Custom — harga saya sendiri (${fmt(price)})`)}</option>
              {cfg.properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {fmt(p.price)} · {p.agency}%</option>
              ))}
            </select>

            {propId === CUSTOM && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {(country === 'ID'
                  ? [500e6, 1e9, 2e9, 5e9]
                  : [300000, 500000, 750000, 1000000, 2000000]).map((v) => (
                  <button key={v} type="button" onClick={() => setPrice(v)}
                    className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200',
                      price === v ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
                    {country === 'ID'
                      ? `Rp ${v >= 1e9 ? `${v / 1e9} M` : `${v / 1e6} jt`}`
                      : `RM ${v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}k`}`}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">{L('Property price', 'Harga hartanah', 'Harga properti')} ({cfg.currency})</label>
                {/* typing a price = the agent's own deal, so switch to custom mode */}
                <input type="number" value={price}
                  onChange={(e) => { setPrice(Number(e.target.value) || 0); setPropId(CUSTOM) }}
                  className={clsx('h-11 w-full rounded-xl border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent',
                    propId === CUSTOM ? 'border-accent/60' : 'border-border')} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">{L(`Agency rate % (max ${cfg.agencyMax})`, `Kadar agensi % (maks ${cfg.agencyMax})`, `Tarif agensi % (maks ${cfg.agencyMax})`)}</label>
                <input type="number" min={0} max={cfg.agencyMax} step={0.1} value={agency}
                  onChange={(e) => setAgency(Math.min(Number(e.target.value) || 0, cfg.agencyMax))}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">{L('Selling REN rank', 'Pangkat REN penjual', 'Peringkat REN penjual')}</label>
                <select value={rankName} onChange={(e) => { setRankName(e.target.value); setCustomPct('') }}
                  className="h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-2 text-sm font-semibold outline-none focus:border-accent">
                  {cfg.ladder.map((l) => (
                    <option key={l.name} value={l.name}>{l.name} — {pc(totalRate(cfg, l))}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted">{L('…or custom % (overrides rank)', '…atau % sendiri (ganti pangkat)', '…atau % sendiri (ganti peringkat)')}</label>
                <input type="number" placeholder={L('e.g. 85', 'cth. 85', 'mis. 85')} value={customPct} onChange={(e) => setCustomPct(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-accent" />
              </div>
            </div>
            <p className="mb-3 rounded-lg border border-dashed border-accent/50 p-2 text-[11px] text-muted">
              {L('Selling REN payout = ', 'Bayaran REN penjual = ', 'Pembayaran REN penjual = ')}<b className="text-accent">{customPct
                ? `${L('custom', 'sendiri', 'kustom')} · ${pc(sellingRate)}`
                : `${row.name} · ${pc(sellingRate)} (${L('base', 'asas', 'dasar')} ${pc(cfg.baseRate)} + ${L('add-on', 'tambahan', 'tambahan')} ${pc(row.addon)})`}</b>
            </p>

            {/* tax switch lives with the other deal facts */}
            <button type="button" onClick={() => setClientPaid((v) => !v)}
              className={clsx('flex w-full cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-left text-[13px] font-bold transition-colors duration-200',
                clientPaid ? 'border-accent bg-accent-soft' : 'border-border')}>
              <span className={clsx('flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px]', clientPaid ? 'border-accent bg-accent text-on-accent' : 'border-border')}>
                {clientPaid ? '✓' : ''}
              </span>
              {L(`${cfg.taxName} paid by client (${Math.round(cfg.taxRate * 100)}% added on top)`,
                 `${cfg.taxName} dibayar klien (${Math.round(cfg.taxRate * 100)}% ditambah di atas)`,
                 `${cfg.taxName} dibayar klien (${Math.round(cfg.taxRate * 100)}% ditambahkan di atas)`)}
            </button>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
              {clientPaid
                ? L(`Client pays the ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} — you keep the full commission.`,
                    `Klien bayar ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} — anda simpan komisen penuh.`,
                    `Klien bayar ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} — komisimu tetap utuh.`)
                : L(`${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} absorbed from the commission (net = amount ÷ ${(1 + cfg.taxRate).toFixed(2)}).`,
                    `${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} diserap dari komisen (bersih = jumlah ÷ ${(1 + cfg.taxRate).toFixed(2)}).`,
                    `${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} dipotong dari komisi (bersih = jumlah ÷ ${(1 + cfg.taxRate).toFixed(2)}).`)}
            </p>
          </Card>

          {/* ---- where the pool goes: the split, visually ---- */}
          <Card className="mb-3 p-4">
            <p className="mb-3 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">{L('Where the pool goes', 'Ke mana pool pergi', 'Ke mana pool mengalir')}</p>
            <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-surface2">
              {segs.map((s) => (
                <span key={s.label} className="transition-all duration-300" style={{ width: `${s.w}%`, background: s.color }} />
              ))}
            </div>
            {segs.map((s) => (
              <div key={s.label} className="flex items-center gap-2 border-b border-border py-2 text-xs last:border-0">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate font-semibold">{s.label}</span>
                <span className="shrink-0 text-muted">{Math.round(s.w * 10) / 10}%</span>
                <b className="w-28 shrink-0 text-right">{fmt(s.amt)}</b>
              </div>
            ))}
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {clientPaid
                ? L('Gross pool figures — your take-home above is gross (client pays the tax).',
                    'Angka pool kasar — bawa pulang anda di atas ialah kasar (klien bayar cukai).',
                    'Angka pool kotor — take-home kamu di atas adalah kotor (klien bayar pajak).')
                : L(`Gross pool figures — your take-home above is net after ${cfg.taxName}.`,
                    `Angka pool kasar — bawa pulang anda di atas ialah bersih selepas ${cfg.taxName}.`,
                    `Angka pool kotor — take-home kamu di atas adalah bersih setelah ${cfg.taxName}.`)}
            </p>
          </Card>

          {/* override chain L1–L4 */}
          <Fold title={L('Override chain — OV & RGR', 'Rantaian override — OV & RGR', 'Rantai override — OV & RGR')}
            sub={layers[0].exists
              ? L(`L1 gets ${fmt(r.rows[0]?.takeSst ?? 0)}`, `L1 dapat ${fmt(r.rows[0]?.takeSst ?? 0)}`, `L1 dapat ${fmt(r.rows[0]?.takeSst ?? 0)}`)
              : L('no L1', 'tiada L1', 'tanpa L1')}
            open={showChain} onToggle={() => setShowChain((v) => !v)}>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              {L(`OV goes only to L1 (direct leader, needs ≥${pc(cfg.ovMinRate)}). RGR paid for all 4 tiers — empty layer's RGR goes to Company. Selling REN earns commission only.`,
                 `OV hanya untuk L1 (ketua langsung, perlu ≥${pc(cfg.ovMinRate)}). RGR dibayar untuk semua 4 peringkat — RGR lapisan kosong pergi ke Syarikat. REN penjual dapat komisen sahaja.`,
                 `OV hanya untuk L1 (leader langsung, butuh ≥${pc(cfg.ovMinRate)}). RGR dibayar untuk semua 4 tingkat — RGR lapisan kosong masuk ke Perusahaan. REN penjual hanya dapat komisi.`)}
            </p>
            {chain.map((l, i) => {
              const res = r.rows[i]
              return (
                <div key={i} className={clsx('mb-2.5 rounded-xl border p-3', l.on ? 'border-accent/40' : 'border-border opacity-80')}>
                  <div className="mb-2 flex items-center gap-2">
                    <button type="button" aria-label={L(`Toggle L${i + 1}`, `Togol L${i + 1}`, `Aktif/nonaktif L${i + 1}`)}
                      onClick={() => setChain((c) => c.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                      className={clsx('flex h-5 w-5 cursor-pointer items-center justify-center rounded border text-[11px]', l.on ? 'border-accent bg-accent text-on-accent' : 'border-border')}>
                      {l.on ? '✓' : ''}
                    </button>
                    <span className="text-xs font-extrabold">L{i + 1}</span>
                    <span className="ml-auto text-[11px] font-bold text-muted">
                      {l.on ? pc(layers[i].rate) : L('no agent', 'tiada ejen', 'tanpa agen')}
                    </span>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input value={l.name} disabled={!l.on} placeholder={L(`Leader ${i + 1}`, `Ketua ${i + 1}`, `Leader ${i + 1}`)}
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
                      <p className="text-xs font-extrabold">{i === 0 ? fmt(res.ovSst) : `${cfg.currency} 0 ${L('(L1 only)', '(L1 sahaja)', '(hanya L1)')}`}</p>
                    </div>
                    <div className="rounded-lg bg-surface2 p-2">
                      <p className="text-[9px] font-bold uppercase text-muted">RGR {pc(res.rgr)}</p>
                      <p className="text-xs font-extrabold">{fmt(res.rgrSst)}</p>
                    </div>
                    <div className={clsx('rounded-lg p-2', l.on ? 'bg-accent-soft' : 'bg-surface2')}>
                      <p className="text-[9px] font-bold uppercase text-muted">{l.on ? L('take-home', 'bawa pulang', 'diterima') : L('RGR goes to', 'RGR pergi ke', 'RGR masuk ke')}</p>
                      <p className={clsx('text-xs font-extrabold', l.on && 'text-accent')}>{l.on ? fmt(res.takeSst) : L('Company', 'Syarikat', 'Perusahaan')}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </Fold>

          {/* full breakdown */}
          <Fold title={L('Full breakdown', 'Pecahan penuh', 'Rincian lengkap')} sub={L('every % · every amount', 'setiap % · setiap jumlah', 'setiap % · setiap jumlah')}
            open={showTable} onToggle={() => setShowTable((v) => !v)}>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[9px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2">{L('Party', 'Pihak', 'Pihak')}</th><th className="px-2 py-2 text-right">{L('Rate', 'Kadar', 'Tarif')}</th>
                  <th className="px-2 py-2 text-right">OV</th><th className="px-2 py-2 text-right">RGR</th>
                  <th className="px-2 py-2 text-right">{cfg.currency} {L('(gross)', '(kasar)', '(kotor)')}</th>
                  <th className="px-4 py-2 text-right">{cfg.currency} {L(`(after ${cfg.taxName})`, `(selepas ${cfg.taxName})`, `(setelah ${cfg.taxName})`)}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border bg-accent-soft/40 font-extrabold">
                  <td className="px-4 py-2.5">{L('Selling REN', 'REN penjual', 'REN penjual')}</td>
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
                    <td className="px-4 py-2.5">{L('Company (forfeited RGR)', 'Syarikat (RGR terlucut)', 'Perusahaan (RGR hangus)')}</td>
                    <td className="px-2 py-2.5 text-right">—</td><td className="px-2 py-2.5 text-right">—</td><td className="px-2 py-2.5 text-right">—</td>
                    <td className="px-2 py-2.5 text-right">{fmt(r.companyGross)}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(r.companySst)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </Fold>

          {/* rank ladder */}
          <Fold title={L('Rank ladder — level up', 'Tangga pangkat — naik taraf', 'Tangga peringkat — naik tingkat')}
            sub={customPct ? undefined : `${L('you', 'anda', 'kamu')}: ${row.name} · ${pc(sellingRate)}`}
            open={showLadder} onToggle={() => setShowLadder((v) => !v)}>
            <p className="mb-3 text-[11px] text-muted">{L(
              'Hit each accumulated-sales target to move up and earn a higher payout %.',
              'Capai setiap sasaran jualan terkumpul untuk naik pangkat dan dapat % bayaran lebih tinggi.',
              'Capai setiap target akumulasi penjualan untuk naik tingkat dan dapat % pembayaran lebih tinggi.')}</p>
            {[...cfg.ladder].reverse().map((l, i) => (
              <div key={l.name} className={clsx('flex items-center gap-3 border-b border-border py-2 text-sm last:border-0', l.name === rankName && !customPct && 'font-extrabold text-accent')}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface2 text-[10px] font-extrabold">{cfg.ladder.length - i}</span>
                <span className="flex-1">{l.name}</span>
                <span className="text-[11px] text-muted">{L('Acc.', 'Terkumpul', 'Akum.')} {fmt(l.target)}</span>
                <Chip tone="accent">{pc(totalRate(cfg, l))}</Chip>
              </div>
            ))}
          </Fold>

          <p className="pb-4 text-center text-[10px] text-muted print:hidden">
            {clientPaid
              ? L(`OV = Overriding (L1 only) · RGR = REN GET REN · figures gross (client pays tax) · sanity: ${fmt(applySst(r.grossComm, clientPaid, cfg.taxRate))} pool net`,
                  `OV = Overriding (L1 sahaja) · RGR = REN GET REN · angka kasar (klien bayar cukai) · semakan: ${fmt(applySst(r.grossComm, clientPaid, cfg.taxRate))} pool bersih`,
                  `OV = Overriding (hanya L1) · RGR = REN GET REN · angka kotor (klien bayar pajak) · cek: ${fmt(applySst(r.grossComm, clientPaid, cfg.taxRate))} pool bersih`)
              : L(`OV = Overriding (L1 only) · RGR = REN GET REN · net figures after ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} · sanity: ${fmt(applySst(r.grossComm, clientPaid, cfg.taxRate))} pool net`,
                  `OV = Overriding (L1 sahaja) · RGR = REN GET REN · angka bersih selepas ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} · semakan: ${fmt(applySst(r.grossComm, clientPaid, cfg.taxRate))} pool bersih`,
                  `OV = Overriding (hanya L1) · RGR = REN GET REN · angka bersih setelah ${Math.round(cfg.taxRate * 100)}% ${cfg.taxName} · cek: ${fmt(applySst(r.grossComm, clientPaid, cfg.taxRate))} pool bersih`)}
          </p>
        </>
      )}
    </div>
  )
}
