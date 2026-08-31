/* Leads zone = the Marketing4U Call Manager, integrated (one login, country-aware).
   Flows ported from SPEC-CALLER-M4U.md:
   - Home: quote, stats, Get Next Lead (one-at-a-time · 25-min hold)
   - Lead card: countdown, label pill, custom fields, HOT/Nurture badges,
     call/WA, last-3 history, disposition sets by project type, BOP picker,
     Booked lock-forever confirm, note
   - Tabs: Follow-ups (my reservations) · Booked (mine forever) · Projects
     (self-select w/ approval badges) · Messages (admin Q&A, reply resolves) */
import { useCallback, useEffect, useMemo, useState } from 'react'
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
type LFn = (en: string, bm: string, id: string) => string
const FIELD_LABELS = (L: LFn): [string, string][] => [
  ['trigger_beli', L('Buying trigger', 'Pencetus beli', 'Pemicu beli')],
  ['rencana_bayar', L('Payment plan', 'Rancangan bayaran', 'Pembayaran')],
  ['budget_cicilan', L('Budget/mo', 'Bajet/bln', 'Budget/bln')],
  ['domisili', L('Location', 'Lokasi', 'Domisili')],
  ['waktu_survey', L('Survey availability', 'Boleh survey', 'Bisa survey')],
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
const PROPERTY_DISPOS = (L: LFn) => [
  { key: 'Booked', label: '🏆 Booked', hint: L('locks this lead to you forever', 'kunci lead ini milik anda selamanya', 'mengunci lead ini milikmu selamanya'), win: true },
  { key: 'No Answer', label: L('No Answer', 'Tidak Angkat', 'Tidak Diangkat'), hint: L('back to queue · 20 min', 'kembali ke barisan · 20 min', 'kembali ke antrean · 20 mnt') },
  { key: 'Call Back Later', label: L('Call Back Later', 'Telefon Semula Nanti', 'Telepon Lagi Nanti'), hint: L('reserved for you · 8 h', 'disimpan untuk anda · 8 jam', 'disimpan untukmu · 8 jam') },
  { key: 'Interested Not Ready', label: L('Interested Not Ready', 'Berminat, Belum Sedia', 'Berminat, Belum Siap'), hint: L('warm · returns in 48 h', 'warm · kembali dalam 48 jam', 'warm · kembali dalam 48 jam') },
  { key: 'Not Interested', label: L('Not Interested', 'Tidak Berminat', 'Tidak Berminat'), hint: L('cooldown 48 h', 'cooldown 48 jam', 'cooldown 48 jam'), close: true },
  { key: 'Wrong Number', label: L('Wrong Number', 'Salah Nombor', 'Salah Nomor'), hint: L('cooldown 72 h', 'cooldown 72 jam', 'cooldown 72 jam'), close: true },
]
const RECRUIT_DISPOS = (L: LFn) => [
  { key: 'Attend Online BOP', label: L('🎥 Attend Online BOP', '🎥 Hadir BOP Online', '🎥 Hadir BOP Online'), hint: L('book a session · locks to you', 'tempah sesi · kunci milik anda', 'pesan sesi · terkunci milikmu'), win: true, bop: 'online' },
  { key: 'Attend Physical BOP', label: L('🏢 Attend Physical BOP', '🏢 Hadir BOP Fizikal', '🏢 Hadir BOP Fisik'), hint: L('book a session · locks to you', 'tempah sesi · kunci milik anda', 'pesan sesi · terkunci milikmu'), win: true, bop: 'physical' },
  { key: 'Link Referral Sent', label: L('Link Referral Sent', 'Link Referral Dihantar', 'Link Referral Dikirim'), hint: L('reserved for you · 72 h', 'disimpan untuk anda · 72 jam', 'disimpan untukmu · 72 jam') },
  { key: 'Call Back Later', label: L('Call Back Later', 'Telefon Semula Nanti', 'Telepon Lagi Nanti'), hint: L('reserved for you · 8 h', 'disimpan untuk anda · 8 jam', 'disimpan untukmu · 8 jam') },
  { key: 'Working Full-Time', label: L('Working Full-Time', 'Bekerja Sepenuh Masa', 'Bekerja Penuh Waktu'), hint: L('cooldown 30 days', 'cooldown 30 hari', 'cooldown 30 hari') },
  { key: 'Wrong Number', label: L('Wrong Number', 'Salah Nombor', 'Salah Nomor'), hint: L('removed from queue', 'dibuang dari barisan', 'dihapus dari antrean'), close: true },
  { key: 'Not a Real Number', label: L('Not a Real Number', 'Bukan Nombor Sebenar', 'Bukan Nomor Asli'), hint: L('removed from queue', 'dibuang dari barisan', 'dihapus dari antrean'), close: true },
]
const QUOTES = (L: LFn) => [
  { body: L('Every call is a seed. Plant enough and the harvest takes care of itself.',
      'Setiap panggilan adalah benih. Tanam secukupnya, hasilnya datang sendiri.',
      'Setiap panggilan adalah benih. Tanam cukup banyak, panennya datang sendiri.'), author: 'AG Way' },
  { body: L('Trust is the currency of AG.', 'Kepercayaan adalah mata wang AG.', 'Kepercayaan adalah mata uang AG.'), author: 'Kamal AG' },
  { body: L('Speed to lead wins the deal — 5 minutes or it cools.',
      'Cepat hubungi lead menang deal — 5 minit atau ia sejuk.',
      'Cepat hubungi lead menangkan deal — 5 menit atau leadnya dingin.'),
    author: L('5-Minute Rule', 'Hukum 5 Minit', 'Aturan 5 Menit') },
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
  const { user, t, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [tab, setTab] = useState<Tab>('home')
  const [queue, setQueue] = useState<M4ULead[]>(SEED_QUEUE)
  const [held, setHeld] = useState<M4ULead | null>(null)
  const [secs, setSecs] = useState(HOLD_SECONDS)
  const [followups, setFollowups] = useState<Reserved[]>([
    { id: 'f1', name: 'Zul Ariffin', phone: '+60198887766', projectId: 'pr1', label: 'Callback', attempts: 1, custom: {}, history: [], until: L('today · 6:30 PM', 'hari ini · 6:30 PM', 'hari ini · 18:30') },
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quote = useMemo(() => { const qs = QUOTES(L); return qs[Math.floor(Math.random() * qs.length)] }, [locale])

  /* countdown — production: server-computed seconds, warn ≤120s, 0 = returned */
  useEffect(() => {
    if (!held) return
    const iv = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          clearInterval(iv)
          setQueue((q) => [...q, held])
          setHeld(null)
          say(L('Time up — this lead returned to the queue. You may be paused.',
            'Masa tamat — lead ini kembali ke barisan. Anda mungkin dijeda.',
            'Waktu habis — lead ini kembali ke antrean. Kamu mungkin dijeda.'))
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
      say(L('No leads right now. Check back shortly — new leads sync in and cooldowns lift.',
        'Tiada lead sekarang. Semak semula sebentar lagi — lead baru masuk dan cooldown tamat.',
        'Belum ada lead sekarang. Cek lagi sebentar — lead baru masuk dan cooldown berakhir.'))
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
    const rules = isRecruit ? RECRUIT_DISPOS(L) : PROPERTY_DISPOS(L)
    const rule = rules.find((r) => r.key === dispo)
    if (!rule) return
    if ('bop' in rule && rule.bop && !bopId) {
      say(L('Pick a BOP session first.', 'Pilih sesi BOP dahulu.', 'Pilih sesi BOP dulu.'))
      return
    }
    setCallsToday((c) => c + 1)
    const lead = { ...held, label: dispo === 'Interested Not Ready' ? 'Warm' : dispo === 'Call Back Later' ? 'Callback' : dispo }

    if (dispo === 'Booked' || dispo.startsWith('Attend')) {
      setBooked((b) => [{ ...lead, label: dispo === 'Booked' ? 'Booked' : dispo.includes('Online') ? 'BOP Online' : 'BOP Physical' }, ...b])
      if (dispo === 'Booked') setBookedToday((b) => b + 1)
      say(dispo === 'Booked'
        ? L('🏆 Booked — this lead is yours forever!', '🏆 Booked — lead ini milik anda selamanya!', '🏆 Booked — lead ini milikmu selamanya!')
        : L('🎉 BOP booked — confirmation sent to the prospect', '🎉 BOP ditempah — pengesahan dihantar kepada prospek', '🎉 BOP dipesan — konfirmasi dikirim ke prospek'))
    } else if (dispo === 'Call Back Later') {
      setFollowups((f) => [...f, { ...lead, until: L('reserved · 8 h', 'disimpan · 8 jam', 'disimpan · 8 jam') }])
      say(L('Saved: Call Back Later — reserved for you (8 h)', 'Disimpan: Telefon Semula Nanti — untuk anda (8 jam)', 'Disimpan: Telepon Lagi Nanti — untukmu (8 jam)'))
    } else if (dispo === 'Link Referral Sent') {
      setFollowups((f) => [...f, { ...lead, until: L('reserved · 72 h', 'disimpan · 72 jam', 'disimpan · 72 jam') }])
      say(L('Saved: Referral Sent — reserved for you (72 h)', 'Disimpan: Referral Dihantar — untuk anda (72 jam)', 'Disimpan: Referral Dikirim — untukmu (72 jam)'))
    } else if (dispo === 'No Answer') {
      const n = held.attempts + 1
      if (n >= NO_ANSWER_CAP) {
        say(L(`Unreachable after ${NO_ANSWER_CAP} attempts — retired from the queue`,
          `Tidak dapat dihubungi selepas ${NO_ANSWER_CAP} percubaan — dikeluarkan dari barisan`,
          `Tidak terjangkau setelah ${NO_ANSWER_CAP} percobaan — dikeluarkan dari antrean`))
      } else {
        setQueue((q) => [...q, { ...lead, attempts: n }])
        say(L('Saved: No Answer — back to queue · 20 min cooldown', 'Disimpan: Tidak Angkat — kembali ke barisan · cooldown 20 min', 'Disimpan: Tidak Diangkat — kembali ke antrean · cooldown 20 mnt'))
      }
    } else if (dispo === 'Wrong Number' && isRecruit) {
      say(L('Saved: Wrong Number — removed', 'Disimpan: Salah Nombor — dibuang', 'Disimpan: Salah Nomor — dihapus'))
    } else if (dispo === 'Not a Real Number') {
      say(L('Saved: Not a Real Number — removed', 'Disimpan: Bukan Nombor Sebenar — dibuang', 'Disimpan: Bukan Nomor Asli — dihapus'))
    } else {
      say(`${L('Saved', 'Disimpan', 'Disimpan')}: ${rule.label} — ${rule.hint}`)
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
  const dispos = isRecruit ? RECRUIT_DISPOS(L) : PROPERTY_DISPOS(L)
  const activeRule = dispos.find((r) => r.key === dispo)
  const fieldLabels = FIELD_LABELS(L)
  const hot = held?.custom.waktu_survey?.includes('minggu ini')
  const nurture = held?.custom.waktu_survey?.includes('lihat')
  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  const openMsgs = messages.filter((m) => m.open).length

  const TABS: { key: Tab; icon: typeof HomeIcon; label: string; badge?: number }[] = [
    { key: 'home', icon: HomeIcon, label: L('Home', 'Utama', 'Beranda') },
    { key: 'followups', icon: Clock, label: L('Follow-ups', 'Susulan', 'Tindak lanjut'), badge: followups.length },
    { key: 'booked', icon: Trophy, label: 'Booked' },
    { key: 'projects', icon: FolderOpen, label: L('Projects', 'Projek', 'Proyek') },
    { key: 'messages', icon: MessagesSquare, label: L('Messages', 'Mesej', 'Pesan'), badge: openMsgs },
  ]

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight">📞 Caller</h1>
          <p className="mt-0.5 text-[11px] text-muted">Marketing4U engine · {L('one login', 'satu login', 'satu login')} · {user.country === 'MY' ? '🇲🇾 team MY' : '🇮🇩 team ID'}</p>
        </div>
        <Chip tone="accent">{queue.length} {L('in queue', 'dalam barisan', 'dalam antrean')}</Chip>
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
                  { v: callsToday, l: L('Calls today', 'Panggilan hari ini', 'Panggilan hari ini') },
                  { v: bookedToday, l: L('Booked today', 'Booked hari ini', 'Booked hari ini') },
                  { v: booked.length, l: L('Leads owned', 'Leads milik anda', 'Leads milikmu') },
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
                  {L(`Admin needs a reply — ${openMsgs} open message${openMsgs > 1 ? 's' : ''}`,
                    `Admin perlukan balasan — ${openMsgs} mesej terbuka`,
                    `Admin butuh balasan — ${openMsgs} pesan terbuka`)}
                  <ChevronRight size={14} className="ml-auto text-muted" />
                </button>
              )}
              <button
                type="button"
                onClick={getNext}
                className="mb-4 flex w-full cursor-pointer flex-col items-center rounded-2xl bg-accent p-5 text-on-accent transition-opacity duration-200 hover:opacity-90"
              >
                <span className="flex items-center gap-2 font-display text-lg font-extrabold">
                  <Phone size={20} /> {L('Get Next Lead', 'Ambil Lead Seterusnya', 'Ambil Lead Berikutnya')}
                </span>
                <span className="mt-1 text-[11px] opacity-85">{L('one lead at a time · 25 minutes to disposition', 'satu lead pada satu masa · 25 minit untuk disposisi', 'satu lead sekali waktu · 25 menit untuk disposisi')}</span>
              </button>
            </>
          )}

          {/* ================= LEAD CARD ================= */}
          {held && (
            <Card className="mb-4 overflow-hidden">
              {/* countdown */}
              <div className={clsx('flex items-center justify-between px-4 py-2.5 text-xs font-bold', secs <= 120 ? 'bg-danger/15 text-danger' : 'bg-surface2 text-muted')}>
                <span>⏱ {mm}:{ss} {L('to disposition', 'untuk disposisi', 'untuk disposisi')}</span>
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
                    {held.attempts > 0 && <Chip>↻ {held.attempts} {L('attempts', 'percubaan', 'percobaan')}</Chip>}
                  </div>
                )}

                {/* custom fields — visible_to_agent only */}
                {fieldLabels.some(([k]) => held.custom[k]) && (
                  <div className="mb-3 divide-y divide-border rounded-xl border border-border text-xs">
                    {fieldLabels.filter(([k]) => held.custom[k]).map(([k, label]) => (
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
                  <a href={`https://wa.me/${held.phone.replace(/\D/g, '')}?text=${encodeURIComponent(L(
                    `Hi ${held.name.split(' ')[0]}, this is ${user.name.split(' ')[0]} from IQI regarding ${project(held.projectId)?.name} 😊`,
                    `Hai ${held.name.split(' ')[0]}, saya ${user.name.split(' ')[0]} dari IQI berkenaan ${project(held.projectId)?.name} 😊`,
                    `Halo ${held.name.split(' ')[0]}, saya ${user.name.split(' ')[0]} dari IQI mengenai ${project(held.projectId)?.name} 😊`,
                  ))}`} target="_blank" rel="noreferrer" className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold no-underline transition-colors duration-200 hover:border-accent/60">
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                </div>


                {/* history */}
                {held.history.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">{L('Recent attempts', 'Percubaan terkini', 'Riwayat panggilan')}</p>
                    {held.history.slice(0, 3).map((h) => (
                      <p key={h.no} className="border-b border-border py-1.5 text-[11px] text-muted last:border-0">
                        <b className="text-ink">{h.by}</b> · {h.dispo}
                        {h.note ? ` · "${h.note}"` : ''} · #{h.no} · {h.ago}
                      </p>
                    ))}
                  </div>
                )}

                {/* dispositions */}
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">{L('Outcome', 'Hasil', 'Hasil')}</p>
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
                    <option value="">{L(`Pick a ${activeRule.bop} BOP session…`, `Pilih sesi BOP ${activeRule.bop}…`, `Pilih sesi BOP ${activeRule.bop}…`)}</option>
                    {BOP_SESSIONS.filter((s) => s.type === activeRule.bop).map((s) => (
                      <option key={s.id} value={s.id}>{s.title} — {s.when}</option>
                    ))}
                  </select>
                )}

                {/* Booked lock warning */}
                {dispo === 'Booked' && (
                  <div className="mb-2 flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-[11px] leading-relaxed">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                    <span><b>{L('Booked locks this lead to you forever.', 'Booked mengunci lead ini milik anda selamanya.', 'Booked mengunci lead ini milikmu selamanya.')}</b> {L("Only confirm when the appointment is truly set. 💡 Ask for a referral while they're happy!", 'Sahkan hanya bila janji temu benar-benar ditetapkan. 💡 Minta referral semasa mereka gembira!', 'Konfirmasi hanya jika janji temu benar-benar pasti. 💡 Minta referral selagi mereka senang!')}</span>
                  </div>
                )}

                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={L('Note (optional)…', 'Nota (pilihan)…', 'Catatan (opsional)…')} rows={2} className="mb-3 w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent" />

                <button
                  type="button"
                  disabled={!dispo}
                  onClick={submit}
                  className={clsx(
                    'h-12 w-full cursor-pointer rounded-xl text-sm font-extrabold transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
                    dispo === 'Booked' || dispo.startsWith('Attend') ? 'bg-accent text-on-accent' : 'border border-border',
                  )}
                >
                  {dispo === 'Booked'
                    ? L('Confirm Booking & Continue', 'Sahkan Booking & Teruskan', 'Konfirmasi Booking & Lanjut')
                    : dispo.startsWith('Attend')
                      ? L('Confirm BOP & Continue', 'Sahkan BOP & Teruskan', 'Konfirmasi BOP & Lanjut')
                      : L('Submit & Next Lead', 'Hantar & Lead Seterusnya', 'Kirim & Lead Berikutnya')}
                </button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ================= FOLLOW-UPS ================= */}
      {tab === 'followups' && (
        <>
          <SectionTitle>{L('My follow-ups — reserved for you', 'Susulan saya — disimpan untuk anda', 'Tindak lanjut saya — disimpan untukmu')}</SectionTitle>
          {followups.length === 0 && <Card className="p-6 text-center text-sm text-muted">{L('No reservations. Callback & referral leads appear here.', 'Tiada simpanan. Lead callback & referral muncul di sini.', 'Belum ada simpanan. Lead callback & referral muncul di sini.')}</Card>}
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
          <SectionTitle>{L('My booked leads — yours forever 🏆', 'Lead booked saya — milik anda selamanya 🏆', 'Lead booked saya — milikmu selamanya 🏆')}</SectionTitle>
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
          <SectionTitle>{L('My projects — choose where your leads come from', 'Projek saya — pilih dari mana leads anda datang', 'Proyek saya — pilih dari mana leads kamu datang')}</SectionTitle>
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
                    <p className="text-[11px] text-muted">{p.type === 'recruitment' ? L('🎖️ Recruitment', '🎖️ Rekrutmen', '🎖️ Rekrutmen') : L('🏠 Property', '🏠 Hartanah', '🏠 Properti')}</p>
                  </div>
                  <Chip tone={g === 'active' ? 'success' : g === 'pending' ? 'warning' : 'default'}>
                    {g === 'active' ? L('Active', 'Aktif', 'Aktif')
                      : g === 'pending' ? L('Pending approval', 'Menunggu kelulusan', 'Menunggu persetujuan')
                      : g === 'inactive' ? L('Approved · inactive', 'Diluluskan · tidak aktif', 'Disetujui · nonaktif') : '—'}
                  </Chip>
                </Card>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            {L('New projects need admin approval once. Approved projects stay approved — switch them on/off anytime.',
              'Projek baru perlukan kelulusan admin sekali sahaja. Projek yang diluluskan kekal — hidup/matikan bila-bila masa.',
              'Proyek baru butuh persetujuan admin sekali saja. Proyek yang disetujui tetap disetujui — aktifkan/nonaktifkan kapan saja.')}
          </p>
        </>
      )}

      {/* ================= MESSAGES ================= */}
      {tab === 'messages' && (
        <>
          <SectionTitle>{L('Messages — admin Q&A', 'Mesej — soal jawab admin', 'Pesan — tanya jawab admin')}</SectionTitle>
          {messages.map((m) => (
            <Card key={m.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-xs font-bold">{m.from}</p>
                <Chip tone={m.open ? 'warning' : 'success'}>{m.open ? L('needs reply', 'perlu balasan', 'butuh balasan') : L('answered', 'dijawab', 'terjawab')}</Chip>
              </div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{m.bucket}</p>
              <p className="mb-2 text-sm leading-relaxed">{m.body}</p>
              {m.open ? (
                <div className="flex gap-2">
                  <input
                    value={m.reply}
                    onChange={(e) => setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, reply: e.target.value } : x)))}
                    placeholder={L('Type your reply…', 'Taip balasan anda…', 'Ketik balasanmu…')}
                    className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!m.reply.trim()) return
                      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, open: false } : x)))
                      say(L('Reply sent — thread resolved', 'Balasan dihantar — thread selesai', 'Balasan terkirim — thread selesai'))
                    }}
                    className="h-10 cursor-pointer rounded-xl bg-accent px-4 text-xs font-bold text-on-accent transition-opacity duration-200 hover:opacity-90"
                  >
                    {L('Reply', 'Balas', 'Balas')}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] italic text-muted">{L('You replied — admin notified.', 'Anda telah balas — admin dimaklumkan.', 'Kamu sudah membalas — admin diberi tahu.')}</p>
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
