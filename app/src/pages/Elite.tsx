/* TIM ELIT — ELITE TEAM COMMAND center, on LIVE data (audit fix #1).
   Army theme preserved; the data layer is real: pods/pod_members (040),
   pod_leads + kpi_checks (RLS in 060), member stats via pod_board(), and the
   production rule — a lead that is done with the elite flow is FORWARDED to
   Marketing4U through the worker (same m4u_intake as GHL, source 'tim_elit').
   Booking split 60/10/15/15 is stored on the lead row. Projects come from the
   admin-set MY-primary catalogue (income rules), never invented. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { useIncomeCfg, type IncomeCfg } from '../lib/income'
import './elite.css'

type Project = NonNullable<IncomeCfg['myPrimary']>[number]

interface EliteLead {
  id: string
  name: string | null
  phone: string | null
  note: string | null
  status: 'new' | 'called' | 'booked' | 'callback' | 'noanswer' | 'notinterested' | 'pool'
  assigned_to: string | null
  callback_until: string | null
  forwarded_to_m4u: boolean
  created_at: string
  booking: { projectId?: string; price?: number; closerRM?: number } | null
}
interface Member {
  id: string; name: string; rank: string | null; is_captain: boolean
  segment: '' | 'hijau' | 'kuning' | 'merah'
  planned: number; done: number; calls_today: number; points: number
}
interface PodInfo { id: string; name: string; captain_id: string; captainName: string }

const KPI_ITEMS: Record<string, string[]> = {
  Daily: ['Answer every lead < 5 min', 'Call inactive agents', 'Update the scoreboard'],
  Weekly: ['1:1 with every member', 'Pod closing ≥ 1 unit', 'Review Green/Yellow/Red segments', 'Recruit new prospects'],
  Monthly: ['Pod target ~32 units', 'Recruit new members', 'Review the Pool / Balang', 'Coach Yellow members'],
  Quarterly: ['Climb the pod ranking', 'Full team audit', 'Set next quarter targets'],
  'Half-year': ['Review the pod structure', 'Plan replication to a new city', 'Promote top performers'],
  Yearly: ['Annual pod target', 'Build the next line of Captains', 'Full-year review'],
}

/* period keys so a Daily tick belongs to TODAY and a Weekly tick to THIS week */
const periodKey = (period: string): string => {
  const d = new Date()
  const y = d.getFullYear()
  if (period === 'Daily') return d.toISOString().slice(0, 10)
  if (period === 'Weekly') {
    const t = new Date(Date.UTC(y, d.getMonth(), d.getDate()))
    const day = t.getUTCDay() || 7
    t.setUTCDate(t.getUTCDate() + 4 - day)
    const week = Math.ceil((((+t - +new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 864e5) + 1) / 7)
    return `${t.getUTCFullYear()}-W${week}`
  }
  if (period === 'Monthly') return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`
  if (period === 'Quarterly') return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`
  if (period === 'Half-year') return `${y}-H${d.getMonth() < 6 ? 1 : 2}`
  return String(y)
}

const fmtRM = (n: number) => 'RM ' + Math.round(n).toLocaleString('en-MY')
const ageMins = (iso: string) => Math.max(0, Math.round((Date.now() - +new Date(iso)) / 60000))
const ageText = (mins: number) =>
  mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
const cbLeftH = (iso: string | null) =>
  iso ? Math.max(0, (+new Date(iso) - Date.now()) / 36e5) : null

type View = null | 'myday' | 'leads' | 'board' | 'pod' | 'balang' | 'kpi' | 'income' | 'addlead'

export default function Elite() {
  const nav = useNavigate()
  const { user } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const cfg = useIncomeCfg(user?.country ?? 'MY')
  const projects: Project[] = cfg.myPrimary ?? []
  const [view, setView] = useState<View>(null)
  const [pod, setPod] = useState<PodInfo | null | undefined>(undefined)   // undefined = loading
  const [members, setMembers] = useState<Member[]>([])
  const [leads, setLeads] = useState<EliteLead[]>([])
  const [toast, setToast] = useState('')
  const [bookingLead, setBookingLead] = useState<EliteLead | null>(null)
  const [cbLead, setCbLead] = useState<EliteLead | null>(null)
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const isAdmin = user?.role === 'master_admin' || user?.role === 'country_admin'
  const iamCaptain = !!pod && !!user && pod.captain_id === user.id

  /* ---------- my pod: captain first, then member, then admin preview ---------- */
  const loadPod = useCallback(async () => {
    if (!isReal || !supabase || !user) { setPod(null); return }
    type PodRow = { id: string; name: string; captain_id: string }
    let row: PodRow | null = null
    const { data: cap } = await supabase.from('pods').select('id,name,captain_id')
      .eq('captain_id', user.id).limit(1)
    row = (cap?.[0] as PodRow | undefined) ?? null
    if (!row) {
      const { data: mem } = await supabase.from('pod_members').select('pod_id').eq('agent_id', user.id).limit(1)
      if (mem?.[0]) {
        const { data: p } = await supabase.from('pods').select('id,name,captain_id')
          .eq('id', (mem[0] as { pod_id: string }).pod_id).limit(1)
        row = (p?.[0] as PodRow | undefined) ?? null
      }
    }
    if (!row && isAdmin) {
      const { data: p } = await supabase.from('pods').select('id,name,captain_id')
        .eq('country', user.country).order('name').limit(1)
      row = (p?.[0] as PodRow | undefined) ?? null
    }
    if (!row) { setPod(null); return }
    const { data: who } = await supabase.from('profiles').select('name').eq('id', row.captain_id).single()
    setPod({ ...row, captainName: (who as { name: string } | null)?.name ?? 'Captain' })
  }, [isReal, user, isAdmin])

  const loadBoard = useCallback(async () => {
    if (!supabase || !pod) return
    const { data } = await supabase.rpc('pod_board', { p_pod: pod.id })
    setMembers((data as Member[]) ?? [])
  }, [pod])

  const loadLeads = useCallback(async () => {
    if (!supabase || !pod) return
    const { data } = await supabase.from('pod_leads').select('*')
      .eq('pod_id', pod.id).eq('forwarded_to_m4u', false)
      .order('created_at', { ascending: false }).limit(200)
    setLeads((data as EliteLead[]) ?? [])
  }, [pod])

  useEffect(() => { loadPod() }, [loadPod])
  useEffect(() => { if (pod) { loadBoard(); loadLeads() } }, [pod, loadBoard, loadLeads])

  if (!user) return null

  const rankLine =
    user.role === 'master_admin'
      ? 'ELITE TEAM • WARRIOR FORCE · 👑 COMMANDER'
      : user.isElite
        ? 'ELITE TEAM • WARRIOR FORCE · 🎖 CAPTAIN'
        : 'Admin preview'

  const visible = leads.filter((l) => l.status !== 'notinterested' && l.status !== 'pool')
  const openLeads = visible.filter((l) => l.status !== 'booked').length
  const cbDue = visible.filter((l) => l.status === 'callback').length
  const newDue = visible.filter((l) => l.status === 'new').length

  /* ---------- persistence: every action writes to pod_leads ---------- */
  const update = async (id: string, patch: Record<string, unknown>) => {
    if (!supabase) return
    const { error } = await supabase.from('pod_leads')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) say('⚠ ' + error.message)
    loadLeads()
  }

  const forward = async (lead: EliteLead, status: EliteLead['status']) => {
    if (!supabase) return
    const { data: s } = await supabase.auth.getSession()
    await update(lead.id, { status })
    try {
      const res = await fetch('https://m4u-api.iqiaggroup.workers.dev/elite/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ lead_id: lead.id }),
      })
      if (res.ok) say('📤 Forwarded to Marketing4U')
      else say('⚠ Saved here, but M4U forward failed — try again from My Leads')
    } catch { say('⚠ Saved here, but M4U forward failed') }
    loadLeads()
  }

  /* production rule: anything except new/called/booked/callback leaves the elite flow */
  const setStatus = (lead: EliteLead, status: EliteLead['status']) => {
    if (status === 'booked') return setBookingLead(lead)
    if (status === 'callback') return setCbLead(lead)
    if (status === 'noanswer' || status === 'notinterested') {
      const ok = window.confirm(
        "This lead will be forwarded to Marketing4U and removed from your list (only 'Booked' stays with you). Continue?")
      if (!ok) return
      forward(lead, status)
      return
    }
    update(lead.id, { status })
  }

  const confirmBooking = (projectId: string, price: number) => {
    const p = projects.find((x) => x.id === projectId)
    const renPct = p?.ren ?? 3
    const gross = (price * renPct) / 100
    update(bookingLead!.id, {
      status: 'booked',
      booking: { projectId, price, renPct, commGross: gross,
        closerRM: gross * 0.6, adsFund: gross * 0.1, funderRM: gross * 0.15, poolIn: gross * 0.15 },
    })
    setBookingLead(null)
    say(`✅ Booked — closer keeps ${fmtRM(gross * 0.6)} (60%)`)
  }

  const confirmCallback = (hours: number) => {
    update(cbLead!.id, { status: 'callback',
      callback_until: new Date(Date.now() + hours * 36e5).toISOString(), reminded: false })
    setCbLead(null)
    say(`⏳ Callback set — safe with you for ${hours}h`)
  }

  const setSegment = async (agentId: string, seg: Member['segment']) => {
    if (!supabase || !pod) return
    const { error } = await supabase.from('pod_members').update({ segment: seg || null })
      .eq('pod_id', pod.id).eq('agent_id', agentId)
    if (error) say('⚠ ' + error.message); else { say('Saved'); loadBoard() }
  }

  const deleteLead = async (lead: EliteLead) => {
    if (!supabase || !window.confirm('Delete this lead?')) return
    const { error } = await supabase.from('pod_leads').delete().eq('id', lead.id)
    if (error) say('⚠ ' + error.message)
    loadLeads()
  }

  /* round-robin: new lead goes to the member with the fewest open leads */
  const addLead = async (name: string, phone: string, note: string) => {
    if (!supabase || !pod) return
    const openBy: Record<string, number> = {}
    members.forEach((m) => { openBy[m.id] = 0 })
    leads.filter((l) => l.status === 'new' || l.status === 'called' || l.status === 'callback')
      .forEach((l) => { if (l.assigned_to && l.assigned_to in openBy) openBy[l.assigned_to]++ })
    const target = Object.entries(openBy).sort((a, b) => a[1] - b[1])[0]?.[0] ?? user.id
    const { error } = await supabase.from('pod_leads').insert({
      pod_id: pod.id, country: user.country, name: name || null, phone: phone || null,
      note: note || null, assigned_to: target, status: 'new', funded_by: 'commander',
    })
    if (error) { say('⚠ ' + error.message); return }
    const who = members.find((m) => m.id === target)
    say(`➕ Lead assigned to ${who?.name.split(' ')[0] ?? 'member'} (least loaded)`)
    setView(null); loadLeads()
  }

  const cards: { key: View | 'comms'; icon: string; label: string; sub: string; live: boolean; badge?: number }[] = [
    { key: 'myday', icon: '📅', label: 'My Day', sub: cbDue || newDue ? `${cbDue} 📞 · ${newDue} 🆕` : "Today's call queue", live: true, badge: cbDue },
    { key: 'board', icon: '🗺️', label: 'Pod Command Board', sub: 'Monitor your pod', live: iamCaptain || isAdmin },
    { key: 'leads', icon: '📇', label: 'My Leads', sub: `${openLeads} leads`, live: true },
    { key: 'income', icon: '🎯', label: 'Income Target', sub: 'Captain income + Elite Pool', live: projects.length > 0 },
    { key: 'pod', icon: '🛡️', label: 'My Pod', sub: pod ? `👑 ${pod.captainName.split(' ')[0]} · ${members.length} members` : 'No pod yet', live: !!pod },
    { key: 'balang', icon: '💰', label: 'Pool / Balang', sub: 'Commander 15% pool split', live: true },
    { key: 'kpi', icon: '🎖️', label: 'KPI / Checklist', sub: 'Captain periodic checklist', live: true },
    { key: 'comms', icon: '📡', label: 'Command Radio', sub: 'Coming soon', live: false },
  ]

  return (
    <div className="elite-zone animate-rise" style={{ margin: '0 -1rem', padding: '1.25rem 1rem 2rem' }}>
      <div className="ez-crest mb-4 flex items-center gap-3 rounded-2xl p-4">
        <div className="ez-badge-box">
          <img src="/brand/tim-elit-logo.png" alt="" className="h-full w-full object-contain p-1" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="ez-osw text-lg font-bold uppercase tracking-[0.14em]" style={{ color: '#d8b25a' }}>
            {pod ? `Pod ${pod.name}` : 'Elite Team Command'}
          </p>
          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: '#c9c2a8' }}>{rankLine}</p>
        </div>
        <button type="button" onClick={() => nav('/team')} className="ez-ghost-btn px-3 py-2 text-xs font-bold">← Exit</button>
      </div>

      {pod === null && (
        <div className="ez-camo mb-4 rounded-xl p-5 text-center">
          <p className="ez-osw text-base font-bold" style={{ color: '#d8b25a' }}>No pod yet</p>
          <p className="mx-auto mt-1 max-w-xs text-[11px]" style={{ color: '#c9c2a8' }}>
            Pods and Captains are appointed in Command HQ → Elite & Captains. Once you belong to one, this command centre goes live.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <button key={c.label} type="button" disabled={!c.live}
            onClick={() => c.live && c.key !== 'comms' && setView(c.key as View)}
            className={`ez-card ${c.live ? 'ez-card--live' : ''}`}>
            {!c.live && <span className="ez-soon">{c.key === 'comms' ? 'Coming soon' : '—'}</span>}
            {c.live && !!c.badge && <span className="ez-count">{c.badge}</span>}
            <span className="mb-2 block text-2xl">{c.icon}</span>
            <span className="ez-osw block text-sm font-bold uppercase tracking-[0.06em]">{c.label}</span>
            <span className="mt-1 block text-[11px]" style={{ color: '#c9c2a8' }}>{c.sub}</span>
          </button>
        ))}
      </div>

      {isAdmin && (
        <button type="button" className="ez-gold-btn mt-4 w-full px-4 py-3 text-sm" onClick={() => nav('/admin')}>
          🛡️ ADMIN CONSOLE
        </button>
      )}

      {/* -------- sheets -------- */}
      {view === 'myday' && (
        <Sheet title="📅 My Day" onClose={() => setView(null)}>
          <QueueSection title={`📞 Callbacks due (${cbDue})`} rows={visible.filter((l) => l.status === 'callback')} onAction={setStatus} />
          <QueueSection title={`🆕 New leads — 5-Minute Rule (${newDue})`} rows={visible.filter((l) => l.status === 'new')} showAge onAction={setStatus} />
          <QueueSection title={`🔄 In progress (${visible.filter((l) => l.status === 'called').length})`} rows={visible.filter((l) => l.status === 'called')} onAction={setStatus} />
          {openLeads === 0 && <p className="py-6 text-center text-sm" style={{ color: '#9a9374' }}>All clear — no calls waiting. 🎉</p>}
        </Sheet>
      )}

      {view === 'leads' && (
        <Sheet title={`📇 My Leads (${visible.length})`} onClose={() => setView(null)}>
          {(iamCaptain || isAdmin) && (
            <button type="button" className="ez-gold-btn mb-3 w-full px-3 py-2.5 text-xs" onClick={() => setView('addlead')}>
              ➕ Add lead — auto-assigned to the least-loaded member
            </button>
          )}
          {visible.length === 0 && <p className="py-6 text-center text-sm" style={{ color: '#9a9374' }}>No leads yet.</p>}
          {visible.map((l) => (
            <LeadRow key={l.id} lead={l} who={members.find((m) => m.id === l.assigned_to)?.name}
              onStatus={setStatus} onDelete={() => deleteLead(l)} canDelete={iamCaptain || isAdmin} />
          ))}
        </Sheet>
      )}

      {view === 'addlead' && pod && (
        <AddLeadSheet onClose={() => setView('leads')} onSave={addLead} />
      )}

      {view === 'board' && pod && (
        <Sheet title={`🗺️ Pod ${pod.name} — Command Board`} onClose={() => setView(null)}>
          <p className="mb-1 text-[11px]" style={{ color: '#9a9374' }}>Today's activity — live</p>
          <div className="mb-3 flex gap-3 text-[10px]" style={{ color: '#c9c2a8' }}>
            <span><span className="ez-dot ez-dot--hijau mr-1 inline-block" />Active & productive</span>
            <span><span className="ez-dot ez-dot--kuning mr-1 inline-block" />Not producing</span>
            <span><span className="ez-dot ez-dot--merah mr-1 inline-block" />Lost</span>
          </div>
          {members.length === 0 && <p className="py-4 text-center text-sm" style={{ color: '#9a9374' }}>No members yet — assigned in Command HQ.</p>}
          {members.map((m) => {
            const pct = m.planned > 0 ? Math.round((m.done / m.planned) * 100) : 0
            return (
              <div key={m.id} className="mb-3 rounded-xl border p-3" style={{ borderColor: '#3a3f1f' }}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className={`ez-dot ez-dot--${m.segment || 'none'}`} />
                  <span className="text-sm font-bold">{m.is_captain ? '👑 ' : ''}{m.name}</span>
                  <span className="ez-pill ml-auto">{m.rank ?? 'REN'}</span>
                </div>
                <div className="ez-bar-track mb-1"><div className="ez-bar-fill" style={{ width: `${pct}%` }} /></div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px]" style={{ color: '#c9c2a8' }}>
                    {pct}% · {m.done}/{m.planned} tasks · 📞{m.calls_today} · ⭐{m.points}
                  </p>
                  {(iamCaptain || isAdmin) && (
                    <div className="flex gap-1">
                      {(['hijau', 'kuning', 'merah'] as const).map((s) => (
                        <button key={s} type="button" onClick={() => setSegment(m.id, m.segment === s ? '' : s)}
                          className={`ez-seg ez-seg--${s} ${m.segment === s ? 'on' : ''}`}>
                          {s === 'hijau' ? 'H' : s === 'kuning' ? 'K' : 'M'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <p className="mt-1 text-[10px]" style={{ color: '#9a9374' }}>
            👥 Members are added or moved in Command HQ → Elite & Captains.
          </p>
        </Sheet>
      )}

      {view === 'pod' && pod && (
        <Sheet title={`🛡️ Pod ${pod.name}`} onClose={() => setView(null)}>
          {iamCaptain && <p className="mb-2 text-xs font-bold" style={{ color: '#d8b25a' }}>You lead this pod.</p>}
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 border-b py-2.5" style={{ borderColor: 'rgba(58,63,31,.5)' }}>
              <span className="text-sm font-semibold">{m.is_captain ? '👑 ' : ''}{m.name}</span>
              <span className="ez-pill ml-auto">{m.rank ?? 'REN'}</span>
            </div>
          ))}
        </Sheet>
      )}

      {view === 'balang' && <BalangSheet onClose={() => setView(null)} />}
      {view === 'kpi' && <KpiSheet onClose={() => setView(null)} userId={user.id} />}
      {view === 'income' && projects.length > 0 && (
        <PoolCalcSheet onClose={() => setView(null)} rank={user.careerRank} projects={projects} />
      )}

      {bookingLead && (
        <BookingSheet lead={bookingLead} projects={projects}
          onClose={() => setBookingLead(null)} onSave={confirmBooking} />
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

function QueueSection({ title, rows, showAge, onAction }: {
  title: string; rows: EliteLead[]; showAge?: boolean
  onAction: (l: EliteLead, s: EliteLead['status']) => void
}) {
  if (!rows.length) return null
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: '#c9c2a8' }}>{title}</p>
      {rows.map((l) => (
        <LeadRow key={l.id} lead={l} showAge={showAge} onStatus={onAction} onDelete={() => {}} canDelete={false} />
      ))}
    </div>
  )
}

function LeadRow({ lead, who, onStatus, onDelete, showAge, canDelete }: {
  lead: EliteLead; who?: string
  onStatus: (l: EliteLead, s: EliteLead['status']) => void
  onDelete: () => void; showAge?: boolean; canDelete: boolean
}) {
  const left = cbLeftH(lead.callback_until)
  const phoneDigits = (lead.phone ?? '').replace(/\D/g, '')
  return (
    <div className="mb-2.5 rounded-xl border p-3" style={{ borderColor: '#3a3f1f', background: 'linear-gradient(180deg,#181c0c,#14180a)' }}>
      <div className="mb-1 flex items-center gap-2">
        {showAge && <span className="text-[10px]" style={{ color: '#9a9374' }}>⏱ {ageText(ageMins(lead.created_at))}</span>}
        <span className="text-sm font-bold">{lead.name ?? 'Unnamed'}</span>
        <span className={`ez-lead ez-lead--${lead.status} ml-auto`}>{lead.status}</span>
      </div>
      <p className="mb-1.5 text-[11px]" style={{ color: '#9a9374' }}>
        {lead.phone ?? '—'}{lead.note ? ` · ${lead.note}` : ''}{who ? ` · 🎖 ${who.split(' ')[0]}` : ''}
      </p>
      {lead.status === 'callback' && left != null && (
        <p className="mb-1.5 text-[11px] font-bold" style={{ color: '#ffd679' }}>
          ⏳ {Math.floor(left)}h {Math.round((left % 1) * 60)}m left
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <a href={lead.phone ? `tel:${lead.phone}` : '#'} className="ez-ghost-btn px-2.5 py-1.5 text-xs no-underline" style={{ color: '#e9e2cc' }}>📞</a>
        <a href={phoneDigits ? `https://wa.me/${phoneDigits}` : '#'} target="_blank" rel="noreferrer" className="ez-ghost-btn px-2.5 py-1.5 text-xs no-underline" style={{ color: '#e9e2cc' }}>🟢</a>
        <select value={lead.status} onChange={(e) => onStatus(lead, e.target.value as EliteLead['status'])}
          className="ez-input flex-1 py-1.5 text-xs" aria-label="Lead status">
          {['new', 'called', 'booked', 'callback', 'noanswer', 'notinterested'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {canDelete && (
          <button type="button" onClick={onDelete} className="ez-ghost-btn px-2.5 py-1.5 text-xs" aria-label="Delete lead">🗑️</button>
        )}
      </div>
    </div>
  )
}

/* ---------------- add lead ---------------- */
function AddLeadSheet({ onClose, onSave }: { onClose: () => void; onSave: (n: string, p: string, note: string) => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  return (
    <Sheet title="➕ Add Lead" onClose={onClose}>
      <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Name</label>
      <input className="ez-input mb-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead name" />
      <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Phone</label>
      <input className="ez-input mb-3" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60…" />
      <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Note / source</label>
      <input className="ez-input mb-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="FB ad · booth · referral…" />
      <button type="button" className="ez-gold-btn w-full py-3 text-sm" disabled={!phone.trim() && !name.trim()}
        onClick={() => onSave(name.trim(), phone.trim(), note.trim())}>
        Assign to least-loaded member
      </button>
    </Sheet>
  )
}

/* ---------------- booking (60/10/15/15) ---------------- */
function BookingSheet({ lead, projects, onClose, onSave }: {
  lead: EliteLead; projects: Project[]; onClose: () => void
  onSave: (projectId: string, price: number) => void
}) {
  const [pid, setPid] = useState(projects[0]?.id ?? '')
  const [price, setPrice] = useState(projects[0]?.price ?? 0)
  const p = projects.find((x) => x.id === pid)
  const gross = (price * (p?.ren ?? 3)) / 100
  return (
    <Sheet title="✅ Confirm Booking" onClose={onClose}>
      <p className="mb-3 text-xs" style={{ color: '#c9c2a8' }}>Lead: <b>{lead.name ?? lead.phone}</b></p>
      {projects.length > 0 ? (
        <>
          <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Project (admin catalogue)</label>
          <select className="ez-input mb-3" value={pid}
            onChange={(e) => { setPid(e.target.value); const np = projects.find((x) => x.id === e.target.value); if (np) setPrice(np.price) }}>
            {projects.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.ren}%</option>)}
          </select>
        </>
      ) : (
        <p className="mb-3 text-[11px]" style={{ color: '#9a9374' }}>No projects in the admin catalogue yet — enter the price manually (3% assumed).</p>
      )}
      <label className="mb-1 block text-xs font-bold" style={{ color: '#c9c2a8' }}>Unit price (RM)</label>
      <input type="number" className="ez-input mb-3" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} />
      <div className="mb-3 rounded-xl border p-3 text-[11px] leading-relaxed" style={{ borderColor: '#3a3f1f', color: '#c9c2a8' }}>
        Gross commission: <b style={{ color: '#d8b25a' }}>{fmtRM(gross)}</b><br />
        Commander-funded: closer 60% <b style={{ color: '#7fe0a3' }}>{fmtRM(gross * 0.6)}</b> · Ads & Content 10% {fmtRM(gross * 0.1)} · funder 15% {fmtRM(gross * 0.15)} · Elite Pool 15% {fmtRM(gross * 0.15)}
      </div>
      <button type="button" className="ez-gold-btn w-full py-3 text-sm" disabled={price <= 0} onClick={() => onSave(pid, price)}>Confirm Booking</button>
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
        The lead stays SAFE with you until the window ends.
      </p>
      <button type="button" className="ez-gold-btn w-full py-3 text-sm" onClick={() => onSave(h)}>Set callback ({h}h)</button>
    </Sheet>
  )
}

/* ---------------- Pool / Balang — live pods + funded closings ---------------- */
function BalangSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<{ pod: string; captain: string; members: number; poolIn: number }[] | null>(null)
  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const [{ data: p }, { data: m }, { data: pl }] = await Promise.all([
        supabase.from('pods').select('id,name,captain_id').order('name'),
        supabase.from('pod_members').select('pod_id'),
        supabase.from('pod_leads').select('pod_id,booking').eq('status', 'booked'),
      ])
      const caps = [...new Set(((p ?? []) as { captain_id: string }[]).map((x) => x.captain_id))]
      const { data: who } = caps.length
        ? await supabase.from('profiles').select('id,name').in('id', caps)
        : { data: [] as { id: string; name: string }[] }
      const nameOf = Object.fromEntries(((who ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]))
      setRows(((p ?? []) as { id: string; name: string; captain_id: string }[]).map((x) => ({
        pod: x.name,
        captain: nameOf[x.captain_id] ?? 'Unassigned',
        members: ((m ?? []) as { pod_id: string }[]).filter((y) => y.pod_id === x.id).length,
        poolIn: ((pl ?? []) as { pod_id: string; booking: { poolIn?: number } | null }[])
          .filter((y) => y.pod_id === x.id)
          .reduce((t, y) => t + (y.booking?.poolIn ?? 0), 0),
      })))
    })()
  }, [])

  const balang = (rows ?? []).reduce((t, r) => t + r.poolIn, 0)
  const nCap = (rows ?? []).length
  return (
    <Sheet title="💰 Pool / Balang" onClose={onClose}>
      {rows === null ? (
        <p className="py-6 text-center text-xs" style={{ color: '#c9c2a8' }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center">
          <p className="ez-osw text-base font-bold" style={{ color: '#d8b25a' }}>No pods yet</p>
          <p className="mx-auto mt-1 max-w-xs text-[11px]" style={{ color: '#c9c2a8' }}>
            Create pods and assign Captains in Command HQ, and the board fills in here.
          </p>
        </div>
      ) : (
        <>
          <div className="ez-camo mb-3 rounded-xl p-3.5">
            <p className="ez-osw text-lg font-bold" style={{ color: '#d8b25a' }}>Balang {fmtRM(balang)}</p>
            <p className="text-[11px]" style={{ color: '#c9c2a8' }}>
              {rows.reduce((t, r) => t + r.members, 0)} members · {nCap} pods · from booked Elite deals (15% pool-in)
            </p>
          </div>
          <table className="ez-table mb-3">
            <thead><tr><th>Pod</th><th>Members</th><th>Pool In</th><th>70%</th><th>30%</th><th>Total</th></tr></thead>
            <tbody>
              {[...rows].sort((a, b) => b.poolIn - a.poolIn).map((r) => {
                const perf = balang > 0 ? balang * 0.7 * (r.poolIn / balang) : 0
                const flat = nCap > 0 ? (balang * 0.3) / nCap : 0
                return (
                  <tr key={r.pod}>
                    <td><b>{r.pod}</b><br /><span style={{ color: '#9a9374', fontSize: '0.62rem' }}>👑 {r.captain}</span></td>
                    <td>{r.members}</td>
                    <td>{fmtRM(r.poolIn)}</td>
                    <td>{fmtRM(perf)}</td>
                    <td>{fmtRM(flat)}</td>
                    <td style={{ color: '#d8b25a', fontWeight: 700 }}>{fmtRM(perf + flat)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[10px] leading-relaxed" style={{ color: '#9a9374' }}>
            Funded deal split: closer 60% · Ads & Content Fund 10% · funder 15% · Elite Pool 15%.
            Pool: 70% by each pod's contribution + 30% flat across all pods. Figures come from
            booked Elite deals recorded in this app.
          </p>
        </>
      )}
    </Sheet>
  )
}

/* ---------------- KPI / Checklist — persisted per period ---------------- */
function KpiSheet({ onClose, userId }: { onClose: () => void; userId: string }) {
  const periods = Object.keys(KPI_ITEMS)
  const [period, setPeriod] = useState('Daily')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const pkey = periodKey(period)

  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data } = await supabase.from('kpi_checks').select('key')
        .eq('agent_id', userId).like('key', `${period}:${pkey}:%`)
      const on: Record<string, boolean> = {}
      ;((data ?? []) as { key: string }[]).forEach((r) => { on[r.key] = true })
      setChecks(on)
    })()
  }, [period, pkey, userId])

  const toggle = async (idx: number, on: boolean) => {
    if (!supabase) return
    const key = `${period}:${pkey}:${idx}`
    setChecks((c) => ({ ...c, [key]: on }))
    if (on) {
      await supabase.from('kpi_checks').upsert({ agent_id: userId, key, done: true })
    } else {
      await supabase.from('kpi_checks').delete().eq('agent_id', userId).eq('key', key)
    }
  }

  const items = KPI_ITEMS[period]
  const done = items.filter((_, i) => checks[`${period}:${pkey}:${i}`]).length
  const pct = Math.round((done / items.length) * 100)
  return (
    <Sheet title="🎖️ KPI / Checklist" onClose={onClose}>
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
        {periods.map((p) => (
          <button key={p} type="button" onClick={() => setPeriod(p)} className={`ez-tab ${period === p ? 'on' : ''}`}>{p}</button>
        ))}
      </div>
      <p className="mb-1.5 text-xs font-bold" style={{ color: '#c9c2a8' }}>{done}/{items.length} · {pct}% · {pkey}</p>
      <div className="ez-bar-track mb-3"><div className="ez-kpi-fill" style={{ width: `${pct}%` }} /></div>
      {items.map((txt, i) => {
        const k = `${period}:${pkey}:${i}`
        const on = !!checks[k]
        return (
          <label key={k} className="mb-2 flex cursor-pointer items-center gap-2.5 rounded-xl border p-3" style={{ borderColor: '#3a3f1f' }}>
            <input type="checkbox" checked={on} onChange={(e) => toggle(i, e.target.checked)} className="h-4 w-4" style={{ accentColor: '#b08a3a' }} />
            <span className={`text-sm ${on ? 'line-through' : ''}`} style={{ color: on ? '#9a9374' : '#e9e2cc' }}>{txt}</span>
          </label>
        )
      })}
    </Sheet>
  )
}

/* ---------------- Captain Pool calculator — admin catalogue projects ---------------- */
function PoolCalcSheet({ onClose, rank, projects }: { onClose: () => void; rank: string; projects: Project[] }) {
  const [pid, setPid] = useState(projects[0].id)
  const [role, setRole] = useState(['REN', 'L', 'TL', 'HOT'].includes(rank) ? rank : 'HOT')
  const [leadMode, setLeadMode] = useState<'cmdr' | 'own'>('cmdr')
  const [units, setUnits] = useState(4)
  const [self, setSelf] = useState(2)
  const [rgru, setRgru] = useState(0)
  const [allU, setAllU] = useState(32)
  const [nCap, setNCap] = useState(8)
  const p = projects.find((x) => x.id === pid) ?? projects[0]

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
        {projects.map((x) => (
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
