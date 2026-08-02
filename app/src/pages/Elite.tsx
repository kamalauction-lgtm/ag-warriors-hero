/* TIM ELIT — ELITE TEAM COMMAND center.
   Army theme + functions ported from production elite.js / captainpool.js:
   - 8-card command grid (My Day, Board, Leads, Income, Pod, Balang, KPI, Radio)
   - lead dispositions incl. booking (60/10/15/15) and callback windows
   - Pool/Balang 70/30 distribution, RGR, Captain Pool calculator, KPI periods */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import './elite.css'

/* ---------------- mock data (shape = production stores) ---------------- */
interface EliteLead {
  id: string
  name: string
  phone: string
  note: string
  status: 'new' | 'called' | 'booked' | 'callback' | 'noanswer' | 'notinterested'
  createdAt: number // minutes ago
  callbackLeft?: number // hours left
  fundedBy: 'commander' | 'own'
}
interface Project {
  id: string
  name: string
  price: number
  ren: number
  hot: number
  hotOn: boolean
  tlOn: boolean
  lOn: boolean
  rgrOn: boolean
  rgrPct: number
}
const PROJECTS: Project[] = [
  { id: 'p1', name: 'Erinaz Suites', price: 350000, ren: 2, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: true, rgrPct: 1 },
  { id: 'p2', name: 'EXSIM Residensi', price: 620000, ren: 2.5, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: true, rgrPct: 1 },
  { id: 'p3', name: 'The Fifth', price: 750000, ren: 3, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: false, rgrPct: 0 },
]
const SEED_LEADS: EliteLead[] = [
  { id: 'el1', name: 'Hafiz Omar', phone: '60127001122', note: 'ERINAZ KELANTAN', status: 'new', createdAt: 3, fundedBy: 'commander' },
  { id: 'el2', name: 'Michelle Yeo', phone: '60162334455', note: 'FB ad — EXSIM', status: 'new', createdAt: 18, fundedBy: 'commander' },
  { id: 'el3', name: 'Zul Ariffin', phone: '60198887766', note: 'Booth MidValley', status: 'callback', createdAt: 240, callbackLeft: 2.25, fundedBy: 'commander' },
  { id: 'el4', name: 'Priya Nair', phone: '60112345678', note: 'IG DM', status: 'called', createdAt: 300, fundedBy: 'own' },
  { id: 'el5', name: 'Tan Ah Beng', phone: '60129990000', note: 'Masterlist', status: 'called', createdAt: 1440, fundedBy: 'commander' },
]
interface PodMember {
  id: string
  name: string
  rank: string
  isCaptain?: boolean
  segment: '' | 'hijau' | 'kuning' | 'merah'
  recruitedByMe?: boolean
  pct: number
  done: number
  total: number
  points: number
}
const SEED_POD: PodMember[] = [
  { id: 'm1', name: 'Aisyah Rahman', rank: 'HOT', isCaptain: true, segment: 'hijau', pct: 88, done: 7, total: 8, points: 120 },
  { id: 'm2', name: 'Danish Iman', rank: 'REN', segment: 'hijau', recruitedByMe: true, pct: 75, done: 6, total: 8, points: 95 },
  { id: 'm3', name: 'Mei Ling', rank: 'L', segment: 'kuning', recruitedByMe: true, pct: 38, done: 3, total: 8, points: 40 },
  { id: 'm4', name: 'Syafiq Rosli', rank: 'REN', segment: 'merah', pct: 0, done: 0, total: 8, points: 0 },
]
/* balang rows: poolIn per pod (15% of gross commission on funded closings) */
const POD_POOL = [
  { pod: 'ALPHA', captain: 'Aisyah', closings: 8, poolIn: 9300 },
  { pod: 'BRAVO', captain: 'Faizal', closings: 5, poolIn: 5810 },
  { pod: 'ZULU', captain: 'Rahim', closings: 3, poolIn: 3350 },
  { pod: 'CHARLIE', captain: 'Melissa', closings: 0, poolIn: 0 },
]
const KPI_ITEMS: Record<string, string[]> = {
  Daily: ['Answer every lead < 5 min', 'Call inactive agents', 'Update the scoreboard'],
  Weekly: ['1:1 with every member', 'Pod closing ≥ 1 unit', 'Review Green/Yellow/Red segments', 'Recruit new prospects'],
  Monthly: ['Pod target ~32 units', 'Recruit new members', 'Review the Pool / Balang', 'Coach Yellow members'],
  Quarterly: ['Climb the pod ranking', 'Full team audit', 'Set next quarter targets'],
  'Half-year': ['Review the pod structure', 'Plan replication to a new city', 'Promote top performers'],
  Yearly: ['Annual pod target', 'Build the next line of Captains', 'Full-year review'],
}

const fmtRM = (n: number) => 'RM ' + Math.round(n).toLocaleString('en-MY')
const ageText = (mins: number) =>
  mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`

/* ---------------- component ---------------- */
type View =
  | null
  | 'myday'
  | 'leads'
  | 'board'
  | 'pod'
  | 'balang'
  | 'kpi'
  | 'income'
  | 'booking'
  | 'callback'

export default function Elite() {
  const nav = useNavigate()
  const { user } = useApp()
  const [view, setView] = useState<View>(null)
  const [leads, setLeads] = useState<EliteLead[]>(SEED_LEADS)
  const [pod, setPod] = useState<PodMember[]>(SEED_POD)
  const [toast, setToast] = useState('')
  const [bookingLead, setBookingLead] = useState<EliteLead | null>(null)
  const [cbLead, setCbLead] = useState<EliteLead | null>(null)
  if (!user) return null

  const isAdmin = user.role === 'master_admin' || user.role === 'country_admin'
  const iamCaptain = user.isElite
  /* Elit Tim titles: members = CAPTAIN · exactly ONE Commander = Kamal */
  const rankLine =
    user.role === 'master_admin'
      ? 'ELITE TEAM • WARRIOR FORCE · 👑 COMMANDER'
      : user.isElite
        ? 'ELITE TEAM • WARRIOR FORCE · 🎖 CAPTAIN'
        : 'Admin preview'

  const openLeads = leads.filter((l) => l.status !== 'booked' && l.status !== 'notinterested').length
  const cbDue = leads.filter((l) => l.status === 'callback').length
  const newDue = leads.filter((l) => l.status === 'new').length

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2600)
  }

  /* disposition — production rule: anything except new/booked/callback forwards to M4U */
  const setStatus = (lead: EliteLead, status: EliteLead['status']) => {
    if (status === 'booked') return setBookingLead(lead)
    if (status === 'callback') return setCbLead(lead)
    if (status !== 'new') {
      const ok = window.confirm(
        "This lead will be forwarded to Marketing4U and removed from your list (only 'Booked' stays with you). Continue?",
      )
      if (!ok) return
      setLeads((ls) => ls.filter((x) => x.id !== lead.id))
      say('📤 Forwarded to Marketing4U')
      return
    }
    setLeads((ls) => ls.map((x) => (x.id === lead.id ? { ...x, status } : x)))
  }

  const confirmBooking = (projectId: string, price: number) => {
    const p = PROJECTS.find((x) => x.id === projectId)
    if (!p && price <= 0) return
    const gross = ((p ? price || p.price : price) * (p ? p.ren : 3)) / 100
    setLeads((ls) => ls.map((x) => (x.id === bookingLead!.id ? { ...x, status: 'booked' } : x)))
    setBookingLead(null)
    say(`✅ Booked — closer keeps ${fmtRM(gross * 0.6)} (60%)`)
  }

  const confirmCallback = (hours: number) => {
    setLeads((ls) =>
      ls.map((x) =>
        x.id === cbLead!.id ? { ...x, status: 'callback', callbackLeft: hours } : x,
      ),
    )
    setCbLead(null)
    say(`⏳ Callback set — safe with you for ${hours}h`)
  }

  const setSegment = (id: string, seg: PodMember['segment']) => {
    setPod((ps) => ps.map((m) => (m.id === id ? { ...m, segment: seg } : m)))
    say('Saved')
  }

  const cards: {
    key: View | 'comms'
    icon: string
    label: string
    sub: string
    live: boolean
    badge?: number
  }[] = [
    { key: 'myday', icon: '📅', label: 'My Day', sub: cbDue || newDue ? `${cbDue} 📞 · ${newDue} 🆕` : "Today's call queue", live: true, badge: cbDue },
    { key: 'board', icon: '🗺️', label: 'Pod Command Board', sub: 'Monitor your pod', live: iamCaptain || isAdmin },
    { key: 'leads', icon: '📇', label: 'My Leads', sub: `${openLeads} leads`, live: true },
    { key: 'income', icon: '🎯', label: 'Income Target', sub: 'Captain income + Elite Pool', live: true },
    { key: 'pod', icon: '🛡️', label: 'My Pod', sub: `👑 Captain Aisyah · ${pod.length} members`, live: true },
    { key: 'balang', icon: '💰', label: 'Pool / Balang', sub: 'Commander 15% pool split', live: true },
    { key: 'kpi', icon: '🎖️', label: 'KPI / Checklist', sub: 'Captain periodic checklist', live: true },
    { key: 'comms', icon: '📡', label: 'Command Radio', sub: 'Coming soon', live: false },
  ]

  return (
    <div className="elite-zone animate-rise" style={{ margin: '0 -1rem', padding: '1.25rem 1rem 2rem' }}>
      {/* crest */}
      <div className="ez-crest mb-4 flex items-center gap-3 rounded-2xl p-4">
        <div className="ez-badge-box">
          <img src="/brand/tim-elit-logo.png" alt="" className="h-full w-full object-contain p-1" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="ez-osw text-lg font-bold uppercase tracking-[0.14em]" style={{ color: '#d8b25a' }}>
            Elite Team Command
          </p>
          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: '#c9c2a8' }}>
            {rankLine}
          </p>
        </div>
        <button
          type="button"
          onClick={() => nav('/team')}
          className="ez-ghost-btn px-3 py-2 text-xs font-bold"
        >
          ← Exit
        </button>
      </div>

      {/* command grid */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            disabled={!c.live}
            onClick={() => c.live && c.key !== 'comms' && setView(c.key as View)}
            className={`ez-card ${c.live ? 'ez-card--live' : ''}`}
          >
            {!c.live && <span className="ez-soon">Coming soon</span>}
            {c.live && !!c.badge && <span className="ez-count">{c.badge}</span>}
            <span className="mb-2 block text-2xl">{c.icon}</span>
            <span className="ez-osw block text-sm font-bold uppercase tracking-[0.06em]">
              {c.label}
            </span>
            <span className="mt-1 block text-[11px]" style={{ color: '#c9c2a8' }}>
              {c.sub}
            </span>
          </button>
        ))}
      </div>

      {isAdmin && (
        <button type="button" className="ez-gold-btn mt-4 w-full px-4 py-3 text-sm" onClick={() => say('Admin console — pods, elite ranks, GHL (full build phase)')}>
          🛡️ ADMIN CONSOLE
        </button>
      )}

      {/* -------- modals -------- */}
      {view === 'myday' && (
        <Sheet title="📅 My Day" onClose={() => setView(null)}>
          <QueueSection title={`📞 Callbacks due (${cbDue})`} rows={leads.filter((l) => l.status === 'callback')} leads onAction={setStatus} />
          <QueueSection title={`🆕 New leads — 5-Minute Rule (${newDue})`} rows={leads.filter((l) => l.status === 'new')} leads showAge onAction={setStatus} />
          <QueueSection title={`🔄 In progress (${leads.filter((l) => l.status === 'called').length})`} rows={leads.filter((l) => l.status === 'called')} leads onAction={setStatus} />
          {openLeads === 0 && <p className="py-6 text-center text-sm" style={{ color: '#9a9374' }}>All clear — no calls waiting. 🎉</p>}
        </Sheet>
      )}

      {view === 'leads' && (
        <Sheet title="📇 My Leads" onClose={() => setView(null)}>
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} onStatus={setStatus} onDelete={() => {
              if (window.confirm('Delete this lead?')) {
                setLeads((ls) => ls.filter((x) => x.id !== l.id))
              }
            }} />
          ))}
        </Sheet>
      )}

      {view === 'board' && (
        <Sheet title="🗺️ Pod ALPHA — Command Board" onClose={() => setView(null)}>
          <p className="mb-1 text-[11px]" style={{ color: '#9a9374' }}>Today's activity</p>
          <div className="mb-3 flex gap-3 text-[10px]" style={{ color: '#c9c2a8' }}>
            <span><span className="ez-dot ez-dot--hijau mr-1 inline-block" />Active & productive</span>
            <span><span className="ez-dot ez-dot--kuning mr-1 inline-block" />Not producing</span>
            <span><span className="ez-dot ez-dot--merah mr-1 inline-block" />Lost</span>
          </div>
          {pod.map((m) => (
            <div key={m.id} className="mb-3 rounded-xl border p-3" style={{ borderColor: '#3a3f1f' }}>
              <div className="mb-1.5 flex items-center gap-2">
                {m.recruitedByMe && <span title="My recruit">🎁</span>}
                <span className={`ez-dot ez-dot--${m.segment || 'none'}`} />
                <span className="text-sm font-bold">
                  {m.isCaptain ? '👑 ' : ''}{m.name}
                </span>
                <span className="ez-pill ml-auto">{m.rank}</span>
              </div>
              <div className="ez-bar-track mb-1"><div className="ez-bar-fill" style={{ width: `${m.pct}%` }} /></div>
              <div className="flex items-center justify-between">
                <p className="text-[11px]" style={{ color: '#c9c2a8' }}>{m.pct}% · {m.done}/{m.total} tasks · ⭐{m.points}</p>
                <div className="flex gap-1">
                  {(['hijau', 'kuning', 'merah'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setSegment(m.id, m.segment === s ? '' : s)} className={`ez-seg ez-seg--${s} ${m.segment === s ? 'on' : ''}`}>
                      {s === 'hijau' ? 'H' : s === 'kuning' ? 'K' : 'M'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <button type="button" className="ez-gold-btn flex-1 px-3 py-2.5 text-xs" onClick={() => say('➕ Add lead — auto-distributed round-robin to the least-loaded member')}>➕ Add lead</button>
            <button type="button" className="ez-ghost-btn flex-1 px-3 py-2.5 text-xs font-bold" onClick={() => say('👥 Manage: add/create members, 🎁 RGR claims, broadcast')}>👥 Manage members</button>
          </div>
        </Sheet>
      )}

      {view === 'pod' && (
        <Sheet title="🛡️ Pod ALPHA" onClose={() => setView(null)}>
          {iamCaptain && <p className="mb-2 text-xs font-bold" style={{ color: '#d8b25a' }}>You lead this pod.</p>}
          {pod.map((m) => (
            <div key={m.id} className="flex items-center gap-2 border-b py-2.5" style={{ borderColor: 'rgba(58,63,31,.5)' }}>
              <span className="text-sm font-semibold">{m.isCaptain ? '👑 ' : ''}{m.name}</span>
              <span className="ez-pill ml-auto">{m.rank}</span>
            </div>
          ))}
        </Sheet>
      )}

      {view === 'balang' && <BalangSheet onClose={() => setView(null)} />}
      {view === 'kpi' && <KpiSheet onClose={() => setView(null)} />}
      {view === 'income' && <PoolCalcSheet onClose={() => setView(null)} rank={user.careerRank} />}

      {bookingLead && (
        <BookingSheet lead={bookingLead} onClose={() => setBookingLead(null)} onSave={confirmBooking} />
      )}
      {cbLead && <CallbackSheet onClose={() => setCbLead(null)} onSave={confirmCallback} />}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 rounded-full px-4 py-2 text-xs font-bold" style={{ background: '#d8b25a', color: '#1a1407' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

/* ---------------- shared sheet ---------------- */
function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="ez-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ez-modal__card elite-zone">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="ez-osw text-base font-bold uppercase tracking-[0.08em]" style={{ color: '#d8b25a' }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="ez-ghost-btn h-8 w-8 text-sm">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function QueueSection({ title, rows, showAge, onAction }: { title: string; rows: EliteLead[]; leads?: boolean; showAge?: boolean; onAction: (l: EliteLead, s: EliteLead['status']) => void }) {
  if (!rows.length) return null
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: '#c9c2a8' }}>{title}</p>
      {rows.map((l) => (
        <LeadRow key={l.id} lead={l} showAge={showAge} onStatus={onAction} onDelete={() => {}} hideDelete />
      ))}
    </div>
  )
}

function LeadRow({ lead, onStatus, onDelete, showAge, hideDelete }: { lead: EliteLead; onStatus: (l: EliteLead, s: EliteLead['status']) => void; onDelete: () => void; showAge?: boolean; hideDelete?: boolean }) {
  return (
    <div className="mb-2.5 rounded-xl border p-3" style={{ borderColor: '#3a3f1f', background: 'linear-gradient(180deg,#181c0c,#14180a)' }}>
      <div className="mb-1 flex items-center gap-2">
        {showAge && <span className="text-[10px]" style={{ color: '#9a9374' }}>⏱ {ageText(lead.createdAt)}</span>}
        <span className="text-sm font-bold">{lead.name}</span>
        <span className={`ez-lead ez-lead--${lead.status} ml-auto`}>{lead.status}</span>
      </div>
      <p className="mb-1.5 text-[11px]" style={{ color: '#9a9374' }}>{lead.phone} · {lead.note}</p>
      {lead.status === 'callback' && lead.callbackLeft != null && (
        <p className="mb-1.5 text-[11px] font-bold" style={{ color: '#ffd679' }}>
          ⏳ {Math.floor(lead.callbackLeft)}h {Math.round((lead.callbackLeft % 1) * 60)}m left
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <a href={`tel:${lead.phone}`} className="ez-ghost-btn px-2.5 py-1.5 text-xs no-underline" style={{ color: '#e9e2cc' }}>📞</a>
        <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="ez-ghost-btn px-2.5 py-1.5 text-xs no-underline" style={{ color: '#e9e2cc' }}>🟢</a>
        <select
          value={lead.status}
          onChange={(e) => onStatus(lead, e.target.value as EliteLead['status'])}
          className="ez-input flex-1 py-1.5 text-xs"
          aria-label="Lead status"
        >
          {['new', 'called', 'booked', 'callback', 'noanswer', 'notinterested'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {!hideDelete && (
          <button type="button" onClick={onDelete} className="ez-ghost-btn px-2.5 py-1.5 text-xs" aria-label="Delete lead">🗑️</button>
        )}
      </div>
    </div>
  )
}

/* ---------------- booking (60/10/15/15) ---------------- */
function BookingSheet({ lead, onClose, onSave }: { lead: EliteLead; onClose: () => void; onSave: (projectId: string, price: number) => void }) {
  const [pid, setPid] = useState(PROJECTS[0].id)
  const [price, setPrice] = useState(PROJECTS[0].price)
  const p = PROJECTS.find((x) => x.id === pid)!
  const gross = (price * p.ren) / 100
  return (
    <Sheet title="✅ Confirm Booking" onClose={onClose}>
      <p className="mb-3 text-xs" style={{ color: '#c9c2a8' }}>Lead: <b>{lead.name}</b></p>
      <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Project</label>
      <select className="ez-input mb-3" value={pid} onChange={(e) => { setPid(e.target.value); const np = PROJECTS.find((x) => x.id === e.target.value); if (np) setPrice(np.price) }}>
        {PROJECTS.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.ren}%</option>)}
      </select>
      <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Unit price (RM)</label>
      <input type="number" className="ez-input mb-3" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} />
      <div className="mb-3 rounded-xl border p-3 text-[11px] leading-relaxed" style={{ borderColor: '#3a3f1f', color: '#c9c2a8' }}>
        Gross commission: <b style={{ color: '#d8b25a' }}>{fmtRM(gross)}</b><br />
        Commander-funded: closer 60% <b style={{ color: '#7fe0a3' }}>{fmtRM(gross * 0.6)}</b> · Ads & Content 10% {fmtRM(gross * 0.1)} · funder 15% {fmtRM(gross * 0.15)} · Elite Pool 15% {fmtRM(gross * 0.15)}
      </div>
      <button type="button" className="ez-gold-btn w-full py-3 text-sm" onClick={() => onSave(pid, price)}>Confirm Booking</button>
    </Sheet>
  )
}

/* ---------------- callback picker ---------------- */
function CallbackSheet({ onClose, onSave }: { onClose: () => void; onSave: (h: number) => void }) {
  const [seg, setSeg] = useState(5)
  const [custom, setCustom] = useState('')
  const h = Number(custom) > 0 ? Math.min(Number(custom), 24) : seg
  return (
    <Sheet title="📞 Call back in…" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        {[1, 3, 5].map((x) => (
          <button key={x} type="button" onClick={() => { setSeg(x); setCustom('') }} className={`ez-tab flex-1 ${seg === x && !custom ? 'on' : ''}`}>{x}h</button>
        ))}
      </div>
      <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Custom (hours, max 24)</label>
      <input type="number" min={1} max={24} step={0.5} className="ez-input mb-3" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. 2" />
      <p className="mb-3 text-[11px] leading-relaxed" style={{ color: '#9a9374' }}>
        The lead stays SAFE with you until the window ends — reminders at 3h, 2h, 1h and a last warning 30 min before it is released to the pool.
      </p>
      <button type="button" className="ez-gold-btn w-full py-3 text-sm" onClick={() => onSave(h)}>Set callback ({h}h)</button>
    </Sheet>
  )
}

/* ---------------- Pool / Balang — 70/30 ---------------- */
function BalangSheet({ onClose }: { onClose: () => void }) {
  const balang = POD_POOL.reduce((s, r) => s + r.poolIn, 0)
  const nCap = POD_POOL.length
  const totalClosings = POD_POOL.reduce((s, r) => s + r.closings, 0)
  const rows = [...POD_POOL].sort((a, b) => b.poolIn - a.poolIn).map((r) => {
    const perf = balang > 0 ? balang * 0.7 * (r.poolIn / balang) : 0
    const flat = nCap > 0 ? (balang * 0.3) / nCap : 0
    return { ...r, perf, flat, total: perf + flat }
  })
  return (
    <Sheet title="💰 Pool / Balang" onClose={onClose}>
      <div className="ez-camo mb-3 rounded-xl p-3.5">
        <p className="ez-osw text-lg font-bold" style={{ color: '#d8b25a' }}>Balang {fmtRM(balang)}</p>
        <p className="text-[11px]" style={{ color: '#c9c2a8' }}>{totalClosings} units · {nCap} Captain</p>
      </div>
      <p className="mb-1 text-xs" style={{ color: '#c9c2a8' }}>📣 Ads & Content Fund (10%): <b>{fmtRM(balang / 1.5 * 1)}</b></p>
      <p className="mb-3 text-xs font-bold" style={{ color: '#d8b25a' }}>🎁 My RGR from recruits: {fmtRM(1800)}</p>
      <table className="ez-table mb-3">
        <thead><tr><th>Pod</th><th>Closing</th><th>Pool In</th><th>70%</th><th>30%</th><th>Total</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pod}>
              <td><b>{r.pod}</b><br /><span style={{ color: '#9a9374', fontSize: '0.62rem' }}>👑 {r.captain}</span></td>
              <td>{r.closings}</td>
              <td>{fmtRM(r.poolIn)}</td>
              <td>{fmtRM(r.perf)}</td>
              <td>{fmtRM(r.flat)}</td>
              <td style={{ color: '#d8b25a', fontWeight: 700 }}>{fmtRM(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] leading-relaxed" style={{ color: '#9a9374' }}>
        Funded deal split: closer 60% · Ads & Content Fund 10% · funder 15% · Elite Pool 15%. Pool: 70% by each pod's contribution + 30% flat across all Captains.
      </p>
    </Sheet>
  )
}

/* ---------------- KPI / Checklist ---------------- */
function KpiSheet({ onClose }: { onClose: () => void }) {
  const periods = Object.keys(KPI_ITEMS)
  const [period, setPeriod] = useState('Daily')
  const [checks, setChecks] = useState<Record<string, boolean>>({ 'Daily:0': true, 'Daily:2': true })
  const items = KPI_ITEMS[period]
  const done = items.filter((_, i) => checks[`${period}:${i}`]).length
  const pct = Math.round((done / items.length) * 100)
  return (
    <Sheet title="🎖️ KPI / Checklist" onClose={onClose}>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
        {periods.map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`ez-tab ${period === p ? 'on' : ''}`}>{p}</button>
        ))}
      </div>
      <p className="mb-1.5 text-xs font-bold" style={{ color: '#c9c2a8' }}>{done}/{items.length} · {pct}%</p>
      <div className="ez-bar-track mb-3"><div className="ez-kpi-fill" style={{ width: `${pct}%` }} /></div>
      {items.map((txt, i) => {
        const k = `${period}:${i}`
        const on = !!checks[k]
        return (
          <label key={k} className="mb-2 flex cursor-pointer items-center gap-2.5 rounded-xl border p-3" style={{ borderColor: '#3a3f1f' }}>
            <input type="checkbox" checked={on} onChange={(e) => setChecks((c) => ({ ...c, [k]: e.target.checked }))} className="h-4 w-4" style={{ accentColor: '#b08a3a' }} />
            <span className={`text-sm ${on ? 'line-through' : ''}`} style={{ color: on ? '#9a9374' : '#e9e2cc' }}>{txt}</span>
          </label>
        )
      })}
    </Sheet>
  )
}

/* ---------------- Captain Pool calculator (production compute()) ---------------- */
function PoolCalcSheet({ onClose, rank }: { onClose: () => void; rank: string }) {
  const [pid, setPid] = useState(PROJECTS[0].id)
  const [role, setRole] = useState(['REN', 'L', 'TL', 'HOT'].includes(rank) ? rank : 'HOT')
  const [leadMode, setLeadMode] = useState<'cmdr' | 'own'>('cmdr')
  const [units, setUnits] = useState(4)
  const [self, setSelf] = useState(2)
  const [rgru, setRgru] = useState(0)
  const [allU, setAllU] = useState(32)
  const [nCap, setNCap] = useState(8)
  const p = PROJECTS.find((x) => x.id === pid)!

  const r = useMemo(() => {
    const price = p.price
    const renPct = p.ren
    const comm = (price * renPct) / 100
    const keep = leadMode === 'cmdr' ? 0.6 : 1.0
    const selfClamped = Math.min(self, units > 0 ? units : 99)
    const selfRM = comm * keep * selfClamped
    const B = p.hot
    const tlPct = p.tlOn ? 0.5 * B : 0
    const lPct = p.lOn ? 0.3 * B : 0
    const cost = tlPct + lPct
    const funders = 2 + (p.hotOn ? 1 : 0)
    const share = cost > 0 ? cost / funders : 0
    const rolePct = role === 'HOT' ? (p.hotOn ? B - share : 0) : role === 'TL' ? tlPct : role === 'L' ? lPct : 0
    const ovRM = ((price * rolePct) / 100) * units
    const rgrActive = p.rgrOn && p.rgrPct > 0
    const rgrRM = rgrActive ? price * (p.rgrPct / 100) * rgru : 0
    const myFunded = leadMode === 'cmdr' ? units : 0
    const effAll = Math.max(allU, units)
    const poolTotal = comm * 0.15 * effAll
    const poolRM = effAll > 0 ? (poolTotal * 0.7 * myFunded) / effAll + (poolTotal * 0.3) / Math.max(nCap, 1) : 0
    return { selfRM, ovRM, rgrRM, poolRM, total: selfRM + ovRM + rgrRM + poolRM, rgrActive }
  }, [p, role, leadMode, units, self, rgru, allU, nCap])

  const Slider = ({ label, v, set, min, max, step = 1 }: { label: string; v: number; set: (n: number) => void; min: number; max: number; step?: number }) => (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-[11px]" style={{ color: '#c9c2a8' }}>
        <span>{label}</span><b style={{ color: '#d8b25a' }}>{v}</b>
      </div>
      <input type="range" className="ez-slider" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
    </div>
  )

  return (
    <Sheet title="🎯 Income Target — Captain Pool" onClose={onClose}>
      <select className="ez-input mb-3" value={pid} onChange={(e) => setPid(e.target.value)}>
        {PROJECTS.map((x) => (
          <option key={x.id} value={x.id}>{x.name} — RM {x.price.toLocaleString()} · {x.ren}%{x.rgrOn ? ' 🎁' : ''}</option>
        ))}
      </select>
      <div className="mb-3 flex gap-1.5">
        {['REN', 'L', 'TL', 'HOT'].map((x) => (
          <button key={x} type="button" onClick={() => setRole(x)} className={`ez-tab flex-1 ${role === x ? 'on' : ''}`}>{x}</button>
        ))}
      </div>
      <div className="mb-4 flex gap-1.5">
        <button type="button" onClick={() => setLeadMode('cmdr')} className={`ez-tab flex-1 ${leadMode === 'cmdr' ? 'on' : ''}`}>Commander Lead</button>
        <button type="button" onClick={() => setLeadMode('own')} className={`ez-tab flex-1 ${leadMode === 'own' ? 'on' : ''}`}>Own Lead</button>
      </div>
      <Slider label="Pod Units / Month" v={units} set={setUnits} min={0} max={30} />
      <Slider label="Own Sales" v={self} set={setSelf} min={0} max={20} />
      {r.rgrActive && <Slider label="Units closed by my direct recruits 🎁" v={rgru} set={setRgru} min={0} max={30} />}
      <Slider label="Funded closings — all pods / month" v={allU} set={setAllU} min={0} max={200} />
      <Slider label="Active Captains" v={nCap} set={setNCap} min={1} max={12} />

      <div className="ez-camo mt-2 rounded-xl p-4">
        <p className="text-[10px] uppercase tracking-widest" style={{ color: '#c9c2a8' }}>Estimated income / month</p>
        <p className="ez-osw text-2xl font-bold" style={{ color: '#d8b25a' }}>{fmtRM(r.total)}</p>
        <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]" style={{ color: '#c9c2a8' }}>
          <span>Own sales: <b>{fmtRM(r.selfRM)}</b></span>
          <span>Override: <b>{fmtRM(r.ovRM)}</b></span>
          {r.rgrActive && <span>🎁 RGR: <b>{fmtRM(r.rgrRM)}</b></span>}
          <span>Elite Pool: <b>{fmtRM(r.poolRM)}</b></span>
        </div>
        {r.rgrActive && (
          <p className="mt-2 text-[10px]" style={{ color: '#9a9374' }}>
            🎁 RGR {p.rgrPct}% active — {fmtRM((p.price * p.rgrPct) / 100)} per unit closed by a REN you recruited (layer 1). Paid by IQI, on top of your split.
          </p>
        )}
      </div>
    </Sheet>
  )
}
