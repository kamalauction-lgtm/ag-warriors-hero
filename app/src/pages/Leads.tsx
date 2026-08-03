/* Leads zone = the Marketing4U Call Manager, integrated (one login, country-aware).
   Flows ported from SPEC-CALLER-M4U.md:
   - Home: quote, stats, Get Next Lead (one-at-a-time · 25-min hold)
   - Lead card: countdown, label pill, custom fields, HOT/Nurture badges,
     call/WA, last-3 history, disposition sets by project type, BOP picker,
     Booked lock-forever confirm, note
   - Tabs: Follow-ups (my reservations) · Booked (mine forever) · Projects
     (self-select w/ approval badges) · Messages (admin Q&A, reply resolves) */
import { useEffect, useMemo, useState } from 'react'
import {
  Phone,
  MessageCircle,
  Home as HomeIcon,
  Clock,
  Trophy,
  FolderOpen,
  MessagesSquare,
  ChevronRight,
  Quote,
  AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabaseReady } from '../lib/supabase'
import Caller from '../modules/caller/Caller'
import { Avatar, Card, Chip, SectionTitle } from '../components/ui'

/* ---------------- types & mock data (shapes = production DB) ---------------- */
type Grant = 'active' | 'pending' | 'inactive' | 'none'
interface Project {
  id: string
  name: string
  type: 'property' | 'recruitment'
  desc?: string
  grant: Grant
}
interface CallAttempt {
  by: string
  dispo: string
  note?: string
  ago: string
  no: number
}
interface M4ULead {
  id: string
  name: string
  phone: string
  projectId: string
  label: string
  attempts: number
  custom: Record<string, string>
  history: CallAttempt[]
}
interface Reserved extends M4ULead {
  until: string
}

const PROJECTS: Project[] = [
  { id: 'pr1', name: 'EXSIM Residensi', type: 'property', desc: 'Freehold serviced residence, KL city fringe. From RM 620k.', grant: 'active' },
  { id: 'pr2', name: 'Erinaz Suites', type: 'property', desc: 'Kelantan boutique suites near hospital belt. From RM 350k.', grant: 'active' },
  { id: 'pr3', name: 'AG Recruitment Drive', type: 'recruitment', desc: 'Recruit new REN warriors — book them into a BOP session.', grant: 'active' },
  { id: 'pr4', name: 'The Fifth', type: 'property', grant: 'pending' },
  { id: 'pr5', name: 'Asteriaz', type: 'property', grant: 'inactive' },
]
const BOP_SESSIONS = [
  { id: 'b1', type: 'online', title: 'BOP Online — Wednesday Night', when: 'Wed 6 Aug · 8:30 PM' },
  { id: 'b2', type: 'physical', title: 'BOP HQ Kuala Lumpur', when: 'Sat 9 Aug · 10:00 AM' },
]
/* field_settings: visible_to_agent only (usia stays hidden) */
const FIELD_LABELS: [string, string][] = [
  ['trigger_beli', 'Pemicu beli'],
  ['rencana_bayar', 'Pembayaran'],
  ['budget_cicilan', 'Budget/bln'],
  ['domisili', 'Domisili'],
  ['waktu_survey', 'Bisa survey'],
]
const SEED_QUEUE: M4ULead[] = [
  {
    id: 'q1', name: 'Hafiz Omar', phone: '+60127001122', projectId: 'pr1', label: 'New', attempts: 0,
    custom: { trigger_beli: 'Nak naik rumah baru', rencana_bayar: 'Loan penuh', budget_cicilan: 'RM 2,500/bln', domisili: 'Shah Alam', waktu_survey: 'minggu ini boleh' },
    history: [],
  },
  {
    id: 'q2', name: 'Michelle Yeo', phone: '+60162334455', projectId: 'pr2', label: 'No Answer', attempts: 3,
    custom: { rencana_bayar: 'Cash 10% + loan', domisili: 'Kota Bharu', waktu_survey: 'lihat-lihat dulu' },
    history: [
      { by: 'Aisyah', dispo: 'No Answer', ago: '2h ago', no: 3 },
      { by: 'Aisyah', dispo: 'No Answer', note: 'busy tone', ago: 'yesterday', no: 2 },
      { by: 'Faizal', dispo: 'No Answer', ago: '2 days ago', no: 1 },
    ],
  },
  {
    id: 'q3', name: 'Danish Iman', phone: '+60195556677', projectId: 'pr3', label: 'New', attempts: 0,
    custom: { domisili: 'Johor Bahru', trigger_beli: 'Cari side income' },
    history: [],
  },
]
const PROPERTY_DISPOS = [
  { key: 'Booked', label: '🏆 Booked', hint: 'locks this lead to you forever', win: true },
  { key: 'No Answer', label: 'No Answer', hint: 'back to queue · 20 min' },
  { key: 'Call Back Later', label: 'Call Back Later', hint: 'reserved for you · 8 h' },
  { key: 'Interested Not Ready', label: 'Interested Not Ready', hint: 'warm · returns in 48 h' },
  { key: 'Not Interested', label: 'Not Interested', hint: 'cooldown 48 h', close: true },
  { key: 'Wrong Number', label: 'Wrong Number', hint: 'cooldown 72 h', close: true },
]
const RECRUIT_DISPOS = [
  { key: 'Attend Online BOP', label: '🎥 Attend Online BOP', hint: 'book a session · locks to you', win: true, bop: 'online' },
  { key: 'Attend Physical BOP', label: '🏢 Attend Physical BOP', hint: 'book a session · locks to you', win: true, bop: 'physical' },
  { key: 'Link Referral Sent', label: 'Link Referral Sent', hint: 'reserved for you · 72 h' },
  { key: 'Call Back Later', label: 'Call Back Later', hint: 'reserved for you · 8 h' },
  { key: 'Working Full-Time', label: 'Working Full-Time', hint: 'cooldown 30 days' },
  { key: 'Wrong Number', label: 'Wrong Number', hint: 'removed from queue', close: true },
  { key: 'Not a Real Number', label: 'Not a Real Number', hint: 'removed from queue', close: true },
]
const QUOTES = [
  { body: 'Every call is a seed. Plant enough and the harvest takes care of itself.', author: 'AG Way' },
  { body: 'Trust is the currency of AG.', author: 'Kamal AG' },
  { body: 'Speed to lead wins the deal — 5 minutes or it cools.', author: 'Hukum 5 Minit' },
]
const HOLD_SECONDS = 25 * 60
const NO_ANSWER_CAP = 10

const labelPill = (label: string): 'danger' | 'warning' | 'info' | 'success' | 'default' =>
  label === 'Booked' ? 'success'
  : label === 'New' ? 'info'
  : label === 'Callback' ? 'warning'
  : label === 'No Answer' ? 'warning'
  : label.startsWith('BOP') ? 'success'
  : 'default'

type Tab = 'home' | 'followups' | 'booked' | 'projects' | 'messages'

export default function Leads() {
  const { user, t } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [tab, setTab] = useState<Tab>('home')
  const [queue, setQueue] = useState<M4ULead[]>(SEED_QUEUE)
  const [held, setHeld] = useState<M4ULead | null>(null)
  const [secs, setSecs] = useState(HOLD_SECONDS)
  const [followups, setFollowups] = useState<Reserved[]>([
    { id: 'f1', name: 'Zul Ariffin', phone: '+60198887766', projectId: 'pr1', label: 'Callback', attempts: 1, custom: {}, history: [], until: 'today · 6:30 PM' },
  ])
  const [booked, setBooked] = useState<M4ULead[]>([
    { id: 'bk1', name: 'Sarah Lim', phone: '+60123334444', projectId: 'pr1', label: 'Booked', attempts: 2, custom: {}, history: [] },
  ])
  const [grants, setGrants] = useState<Record<string, Grant>>(
    Object.fromEntries(PROJECTS.map((p) => [p.id, p.grant])),
  )
  const [messages, setMessages] = useState([
    { id: 'm1', from: 'Admin (HQ)', bucket: 'Wrong Number · 1–31 Jul', body: '3 leads marked Wrong Number this month — can you confirm the numbers were really invalid? Reply here.', open: true, reply: '' },
  ])
  const [dispo, setDispo] = useState('')
  const [note, setNote] = useState('')
  const [bopId, setBopId] = useState('')
  const [callsToday, setCallsToday] = useState(6)
  const [bookedToday, setBookedToday] = useState(1)
  const [autoNext, setAutoNext] = useState(false)
  const [toast, setToast] = useState('')
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], [])

  /* countdown — production: server-computed seconds, warn ≤120s, 0 = returned */
  useEffect(() => {
    if (!held) return
    const iv = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          clearInterval(iv)
          setQueue((q) => [...q, held])
          setHeld(null)
          say('Time up — this lead returned to the queue. You may be paused.')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [held])

  /* auto-chain into the next lead once the previous one is released */
  useEffect(() => {
    if (!autoNext || held) return
    setAutoNext(false)
    const next = queue.find((l) => grants[l.projectId] === 'active')
    if (next) {
      setQueue((q) => q.filter((x) => x.id !== next.id))
      setHeld(next)
      setSecs(HOLD_SECONDS)
      setDispo('')
      setNote('')
      setBopId('')
    }
  }, [autoNext, held, queue, grants])

  if (!user) return null
  // Real accounts get the live Marketing4U caller (engine in Postgres, one lead at
  // a time). Demo personas keep the mock walkthrough below.
  if (isReal) return <Caller />
  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3200)
  }
  const project = (id: string) => PROJECTS.find((p) => p.id === id)

  /* Assignment: pool, oldest-first, grant approved+active, one-at-a-time */
  const getNext = () => {
    if (held) return
    const next = queue.find((l) => grants[l.projectId] === 'active')
    if (!next) {
      say('No leads right now. Check back shortly — new leads sync in and cooldowns lift.')
      return
    }
    setQueue((q) => q.filter((x) => x.id !== next.id))
    setHeld(next)
    setSecs(HOLD_SECONDS)
    setDispo('')
    setNote('')
    setBopId('')
  }

  /* DispositionEngine rules, simulated faithfully */
  const submit = () => {
    if (!held || !dispo) return
    const isRecruit = project(held.projectId)?.type === 'recruitment'
    const rules = isRecruit ? RECRUIT_DISPOS : PROPERTY_DISPOS
    const rule = rules.find((r) => r.key === dispo)
    if (!rule) return
    if ('bop' in rule && rule.bop && !bopId) {
      say('Pick a BOP session first.')
      return
    }
    setCallsToday((c) => c + 1)
    const lead = { ...held, label: dispo === 'Interested Not Ready' ? 'Warm' : dispo === 'Call Back Later' ? 'Callback' : dispo }

    if (dispo === 'Booked' || dispo.startsWith('Attend')) {
      setBooked((b) => [{ ...lead, label: dispo === 'Booked' ? 'Booked' : dispo.includes('Online') ? 'BOP Online' : 'BOP Physical' }, ...b])
      if (dispo === 'Booked') setBookedToday((b) => b + 1)
      say(dispo === 'Booked' ? '🏆 Booked — this lead is yours forever!' : '🎉 BOP booked — confirmation sent to the prospect')
    } else if (dispo === 'Call Back Later') {
      setFollowups((f) => [...f, { ...lead, until: 'reserved · 8 h' }])
      say('Saved: Call Back Later — reserved for you (8 h)')
    } else if (dispo === 'Link Referral Sent') {
      setFollowups((f) => [...f, { ...lead, until: 'reserved · 72 h' }])
      say('Saved: Referral Sent — reserved for you (72 h)')
    } else if (dispo === 'No Answer') {
      const n = held.attempts + 1
      if (n >= NO_ANSWER_CAP) {
        say(`Unreachable after ${NO_ANSWER_CAP} attempts — retired from the queue`)
      } else {
        setQueue((q) => [...q, { ...lead, attempts: n }])
        say('Saved: No Answer — back to queue · 20 min cooldown')
      }
    } else if (dispo === 'Wrong Number' && isRecruit) {
      say('Saved: Wrong Number — removed')
    } else if (dispo === 'Not a Real Number') {
      say('Saved: Not a Real Number — removed')
    } else {
      say(`Saved: ${dispo} — ${rule.hint}`)
    }
    setHeld(null)
    /* production: JS chains straight into the next lead after 600 ms */
    setTimeout(() => setAutoNext(true), 900)
  }

  const saveProjects = (id: string) => {
    setGrants((g) => {
      const cur = g[id]
      const next: Grant = cur === 'active' ? 'inactive' : cur === 'inactive' ? 'active' : cur === 'none' ? 'pending' : cur
      return { ...g, [id]: next }
    })
  }

  const isRecruit = held && project(held.projectId)?.type === 'recruitment'
  const dispos = isRecruit ? RECRUIT_DISPOS : PROPERTY_DISPOS
  const activeRule = dispos.find((r) => r.key === dispo)
  const hot = held?.custom.waktu_survey?.includes('minggu ini')
  const nurture = held?.custom.waktu_survey?.includes('lihat')
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  const openMsgs = messages.filter((m) => m.open).length

  const TABS: { key: Tab; icon: typeof HomeIcon; label: string; badge?: number }[] = [
    { key: 'home', icon: HomeIcon, label: 'Home' },
    { key: 'followups', icon: Clock, label: 'Follow-ups', badge: followups.length },
    { key: 'booked', icon: Trophy, label: 'Booked' },
    { key: 'projects', icon: FolderOpen, label: 'Projects' },
    { key: 'messages', icon: MessagesSquare, label: 'Messages', badge: openMsgs },
  ]

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight">📞 Caller</h1>
          <p className="mt-0.5 text-[11px] text-muted">Marketing4U engine · one login · {user.country === 'MY' ? '🇲🇾 team MY' : '🇮🇩 team ID'}</p>
        </div>
        <Chip tone="accent">{queue.length} in queue</Chip>
      </header>

      {/* caller tab bar */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={clsx(
              'relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors duration-200',
              tab === tb.key ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink',
            )}
          >
            <tb.icon size={13} />
            {tb.label}
            {!!tb.badge && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white">
                {tb.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ================= HOME ================= */}
      {tab === 'home' && (
        <>
          {!held && (
            <>
              <Card className="mb-3 flex gap-3 p-4">
                <Quote size={18} className="shrink-0 text-accent" />
                <div>
                  <p className="text-sm italic leading-relaxed">"{quote.body}"</p>
                  <p className="mt-1 text-[11px] font-semibold text-muted">— {quote.author}</p>
                </div>
              </Card>
              <div className="mb-3 grid grid-cols-3 gap-3">
                {[
                  { v: callsToday, l: 'Calls today' },
                  { v: bookedToday, l: 'Booked today' },
                  { v: booked.length, l: 'Leads owned' },
                ].map((s) => (
                  <Card key={s.l} className="p-3 text-center">
                    <p className="font-display text-xl font-extrabold">{s.v}</p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{s.l}</p>
                  </Card>
                ))}
              </div>
              {openMsgs > 0 && (
                <button type="button" onClick={() => setTab('messages')} className="mb-3 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-left text-xs font-semibold transition-colors duration-200 hover:border-warning">
                  <MessagesSquare size={15} className="shrink-0 text-warning" />
                  Admin needs a reply — {openMsgs} open message{openMsgs > 1 ? 's' : ''}
                  <ChevronRight size={14} className="ml-auto text-muted" />
                </button>
              )}
              <button
                type="button"
                onClick={getNext}
                className="mb-4 flex w-full cursor-pointer flex-col items-center rounded-2xl bg-accent p-5 text-on-accent transition-opacity duration-200 hover:opacity-90"
              >
                <span className="flex items-center gap-2 font-display text-lg font-extrabold">
                  <Phone size={20} /> Get Next Lead
                </span>
                <span className="mt-1 text-[11px] opacity-85">one lead at a time · 25 minutes to disposition</span>
              </button>
            </>
          )}

          {/* ================= LEAD CARD ================= */}
          {held && (
            <Card className="mb-4 overflow-hidden">
              {/* countdown */}
              <div className={clsx('flex items-center justify-between px-4 py-2.5 text-xs font-bold', secs <= 120 ? 'bg-danger/15 text-danger' : 'bg-surface2 text-muted')}>
                <span>⏱ {mm}:{ss} to disposition</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                  <span className={clsx('block h-full rounded-full transition-all', secs <= 120 ? 'bg-danger' : 'bg-accent')} style={{ width: `${(secs / HOLD_SECONDS) * 100}%` }} />
                </span>
              </div>

              <div className="p-4">
                <div className="mb-2 flex items-center gap-3">
                  <Avatar name={held.name} color="var(--accent)" size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{held.name}</p>
                    <p className="text-xs text-muted">{project(held.projectId)?.name}</p>
                  </div>
                  <Chip tone={labelPill(held.label)}>{held.label}</Chip>
                </div>

                {(hot || nurture) && (
                  <div className="mb-2 flex gap-1.5">
                    {hot && <Chip tone="warning">🔥 HOT</Chip>}
                    {nurture && <Chip tone="success">🌱 Nurture</Chip>}
                    {held.attempts > 0 && <Chip>↻ {held.attempts} attempts</Chip>}
                  </div>
                )}

                {/* custom fields — visible_to_agent only */}
                {FIELD_LABELS.some(([k]) => held.custom[k]) && (
                  <div className="mb-3 divide-y divide-border rounded-xl border border-border text-xs">
                    {FIELD_LABELS.filter(([k]) => held.custom[k]).map(([k, label]) => (
                      <div key={k} className="flex justify-between gap-3 px-3 py-2">
                        <span className="shrink-0 font-semibold text-muted">{label}</span>
                        <span className="text-right">{held.custom[k]}</span>
                      </div>
                    ))}
                  </div>
                )}

                {project(held.projectId)?.desc && (
                  <p className="mb-3 rounded-lg bg-surface2 p-2.5 text-[11px] leading-relaxed text-muted">{project(held.projectId)!.desc}</p>
                )}

                {/* call box */}
                <div className="mb-3 flex gap-2.5">
                  <a href={`tel:${held.phone}`} className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-on-accent no-underline transition-opacity duration-200 hover:opacity-90">
                    <Phone size={16} /> {t('common.call')}
                  </a>
                  <a href={`https://wa.me/${held.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${held.name.split(' ')[0]}, saya dari IQI berkenaan ${project(held.projectId)?.name} 😊`)}`} target="_blank" rel="noreferrer" className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold no-underline transition-colors duration-200 hover:border-accent/60">
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                </div>


                {/* history */}
                {held.history.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Recent attempts</p>
                    {held.history.slice(0, 3).map((h) => (
                      <p key={h.no} className="border-b border-border py-1.5 text-[11px] text-muted last:border-0">
                        <b className="text-ink">{h.by}</b> · {h.dispo}
                        {h.note ? ` · "${h.note}"` : ''} · #{h.no} · {h.ago}
                      </p>
                    ))}
                  </div>
                )}

                {/* dispositions */}
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Outcome</p>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  {dispos.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setDispo(r.key)}
                      className={clsx(
                        'cursor-pointer rounded-xl border p-2.5 text-left transition-colors duration-200',
                        dispo === r.key
                          ? r.win ? 'border-accent bg-accent-soft' : 'close' in r && r.close ? 'border-danger bg-danger/10' : 'border-accent bg-accent-soft'
                          : 'border-border hover:border-accent/50',
                        r.win && 'col-span-2',
                      )}
                    >
                      <span className={clsx('block text-xs font-extrabold', r.win && 'text-accent', 'close' in r && r.close && 'text-danger')}>{r.label}</span>
                      <span className="mt-0.5 block text-[10px] text-muted">{r.hint}</span>
                    </button>
                  ))}
                </div>

                {/* BOP session picker */}
                {activeRule && 'bop' in activeRule && typeof activeRule.bop === 'string' && (
                  <select value={bopId} onChange={(e) => setBopId(e.target.value)} className="mb-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" aria-label="BOP session">
                    <option value="">Pick a {activeRule.bop} BOP session…</option>
                    {BOP_SESSIONS.filter((s) => s.type === activeRule.bop).map((s) => (
                      <option key={s.id} value={s.id}>{s.title} — {s.when}</option>
                    ))}
                  </select>
                )}

                {/* Booked lock warning */}
                {dispo === 'Booked' && (
                  <div className="mb-2 flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-[11px] leading-relaxed">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                    <span><b>Booked locks this lead to you forever.</b> Only confirm when the appointment is truly set. 💡 Ask for a referral while they're happy!</span>
                  </div>
                )}

                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Note (optional)…" rows={2} className="mb-3 w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent" />

                <button
                  type="button"
                  disabled={!dispo}
                  onClick={submit}
                  className={clsx(
                    'h-12 w-full cursor-pointer rounded-xl text-sm font-extrabold transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
                    dispo === 'Booked' || dispo.startsWith('Attend') ? 'bg-accent text-on-accent' : 'border border-border',
                  )}
                >
                  {dispo === 'Booked' ? 'Confirm Booking & Continue' : dispo.startsWith('Attend') ? 'Confirm BOP & Continue' : 'Submit & Next Lead'}
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ================= FOLLOW-UPS ================= */}
      {tab === 'followups' && (
        <>
          <SectionTitle>My follow-ups — reserved for you</SectionTitle>
          {followups.length === 0 && <Card className="p-6 text-center text-sm text-muted">No reservations. Callback & referral leads appear here.</Card>}
          <div className="space-y-2.5">
            {followups.map((l) => (
              <Card key={l.id} className="flex items-center gap-3 p-3.5">
                <Avatar name={l.name} color="var(--warning)" size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    <Chip tone={labelPill(l.label)}>{l.label}</Chip>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{project(l.projectId)?.name} · {l.until}</p>
                </div>
                <a href={`tel:${l.phone}`} aria-label={`Call ${l.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent no-underline"><Phone size={15} /></a>
                <a href={`https://wa.me/${l.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border no-underline"><MessageCircle size={15} /></a>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ================= BOOKED ================= */}
      {tab === 'booked' && (
        <>
          <SectionTitle>My booked leads — yours forever 🏆</SectionTitle>
          <div className="space-y-2.5">
            {booked.map((l) => (
              <Card key={l.id} className="flex items-center gap-3 p-3.5">
                <Avatar name={l.name} color="var(--success)" size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{l.name}</p>
                    <Chip tone={labelPill(l.label)}>{l.label}</Chip>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{project(l.projectId)?.name}</p>
                </div>
                <a href={`tel:${l.phone}`} aria-label={`Call ${l.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent no-underline"><Phone size={15} /></a>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ================= PROJECTS ================= */}
      {tab === 'projects' && (
        <>
          <SectionTitle>My projects — choose where your leads come from</SectionTitle>
          <div className="space-y-2.5">
            {PROJECTS.map((p) => {
              const g = grants[p.id]
              return (
                <Card key={p.id} className="flex items-center gap-3 p-3.5">
                  <input
                    type="checkbox"
                    checked={g === 'active' || g === 'pending'}
                    onChange={() => saveProjects(p.id)}
                    className="h-5 w-5 cursor-pointer accent-[var(--accent)]"
                    aria-label={`Toggle ${p.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-[11px] text-muted">{p.type === 'recruitment' ? '🎖️ Recruitment' : '🏠 Property'}</p>
                  </div>
                  <Chip tone={g === 'active' ? 'success' : g === 'pending' ? 'warning' : 'default'}>
                    {g === 'active' ? 'Active' : g === 'pending' ? 'Pending approval' : g === 'inactive' ? 'Approved · inactive' : '—'}
                  </Chip>
                </Card>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            New projects need admin approval once. Approved projects stay approved — switch them on/off anytime.
          </p>
        </>
      )}

      {/* ================= MESSAGES ================= */}
      {tab === 'messages' && (
        <>
          <SectionTitle>Messages — admin Q&A</SectionTitle>
          {messages.map((m) => (
            <Card key={m.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-bold">{m.from}</p>
                <Chip tone={m.open ? 'warning' : 'success'}>{m.open ? 'needs reply' : 'answered'}</Chip>
              </div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{m.bucket}</p>
              <p className="mb-2 text-sm leading-relaxed">{m.body}</p>
              {m.open ? (
                <div className="flex gap-2">
                  <input
                    value={m.reply}
                    onChange={(e) => setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, reply: e.target.value } : x)))}
                    placeholder="Type your reply…"
                    className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!m.reply.trim()) return
                      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, open: false } : x)))
                      say('Reply sent — thread resolved')
                    }}
                    className="h-10 cursor-pointer rounded-xl bg-accent px-4 text-xs font-bold text-on-accent transition-opacity duration-200 hover:opacity-90"
                  >
                    Reply
                  </button>
                </div>
              ) : (
                <p className="text-[11px] italic text-muted">You replied — admin notified.</p>
              )}
            </Card>
          ))}
        </>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] w-[90%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent">
          {toast}
        </div>
      )}
    </div>
  )
}
