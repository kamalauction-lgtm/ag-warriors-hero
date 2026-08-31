/* Marketing4U caller — the agent flow, on live data (spec §2/§3/§4).
   One lead at a time, server-computed hold, dispositions loaded from the DB
   (m4u_dispositions) so cooldown rules can be retuned without a deploy.

   Feature-parity with the production PHP caller (admin4 bundle, 2026-08):
   auto-chain to the next lead after submit, Booked confirm banner, referral
   script tip, multi-interest chips, countdown progress bar, project
   self-request, admin↔agent Messages (m4u_notes + m4u_note_reply), and a
   printable-style Guide tab. UI strings follow the app language (en/bm/id). */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Phone, MessageCircle, Clock, AlertTriangle, Trophy, FolderOpen,
  Home as HomeIcon, MessagesSquare, BookOpen, Pin,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { telHref, waHref, displayPhone, phoneProblem } from '../../lib/phone'
import { Avatar, Card, Chip, SectionTitle } from '../../components/ui'
import type { Country } from '../../lib/phone'

interface Lead {
  id: number; name: string | null; phone: string | null; phone_norm: string | null
  current_label: string; attempt_count: number; status: string
  property_id: number | null; custom_fields: Record<string, string> | null
  reserved_until: string | null
}
interface Prop { id: number; name: string; type: string; description: string | null }
interface Disp {
  key: string; label: string; outcome: string; hint: string | null
  is_win: boolean; bop_type: string | null; sort_order: number
  project_type: 'property' | 'recruitment' | 'other'
}
interface Attempt { id: number; disposition: string; note: string | null; called_at: string }
interface FieldDef { field_key: string; label: string; visible_to_agent: boolean; sort_order: number }
interface Note {
  id: number; lead_id: number | null; parent_id: number | null; author_id: string | null
  author_role: string | null; target_agent_id: string | null; bucket_label: string | null
  body: string; requires_response: boolean; resolved_at: string | null; created_at: string
}

const pill = (label: string): 'success' | 'info' | 'warning' | 'danger' | 'default' =>
  label === 'Booked' || label.startsWith('BOP') ? 'success'
    : label === 'New' ? 'info'
    : label === 'Callback' || label === 'No Answer' || label === 'Warm' ? 'warning'
    : label === 'Wrong Number' || label === 'Not a Real Number' ? 'danger' : 'default'

/* disposition names in the agent's language — keys stay English for the engine */
const DISPO_NAME: Record<string, { en: string; bm: string; id: string }> = {
  'Booked': { en: 'Appointment Set', bm: 'Janji Temu Ditetapkan', id: 'Janji Temu Diatur' },
  'No Answer': { en: 'No Answer', bm: 'Tidak Angkat', id: 'Tidak Diangkat' },
  'Call Back Later': { en: 'Call Back Later', bm: 'Telefon Semula Nanti', id: 'Telepon Lagi Nanti' },
  'Interested Not Ready': { en: 'Interested, Not Ready', bm: 'Berminat, Belum Sedia', id: 'Berminat, Belum Siap' },
  'Not Interested': { en: 'Not Interested', bm: 'Tidak Berminat', id: 'Tidak Berminat' },
  'Wrong Number': { en: 'Wrong Number', bm: 'Salah Nombor', id: 'Salah Nomor' },
  'Attend Online BOP': { en: 'Attend Online BOP', bm: 'Hadir BOP Online', id: 'Hadir BOP Online' },
  'Attend Physical BOP': { en: 'Attend Physical BOP', bm: 'Hadir BOP Fizikal', id: 'Hadir BOP Fisik' },
  'Link Referral Sent': { en: 'Referral Link Sent', bm: 'Link Referral Dihantar', id: 'Link Referral Dikirim' },
  'Working Full-Time': { en: 'Working Full-Time', bm: 'Bekerja Sepenuh Masa', id: 'Bekerja Penuh Waktu' },
  'Not a Real Number': { en: 'Not a Real Number', bm: 'Bukan Nombor Sebenar', id: 'Bukan Nomor Asli' },
}

type Tab = 'home' | 'followups' | 'booked' | 'projects' | 'messages' | 'guide'

export default function Caller() {
  const { user, locale } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [tab, setTab] = useState<Tab>('home')
  const [lead, setLead] = useState<Lead | null>(null)
  const [prop, setProp] = useState<Prop | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [disps, setDisps] = useState<Disp[]>([])
  const [fields, setFields] = useState<FieldDef[]>([])
  const [history, setHistory] = useState<Attempt[]>([])
  const [secs, setSecs] = useState(0)
  const [total, setTotal] = useState(1)
  const [dispo, setDispo] = useState('')
  const [note, setNote] = useState('')
  const [bop, setBop] = useState('')
  const [bopSessions, setBopSessions] = useState<{ id: number; title: string; type: string; starts_at: string }[]>([])
  const [followups, setFollowups] = useState<Lead[]>([])
  const [booked, setBooked] = useState<Lead[]>([])
  const [projects, setProjects] = useState<{
    property_id: number; approved: boolean; active: boolean
    declined_at: string | null; decline_reason: string | null
    m4u_properties: Prop | null
  }[]>([])
  const [allProps, setAllProps] = useState<Prop[]>([])
  const [threads, setThreads] = useState<Note[]>([])
  const [replies, setReplies] = useState<Note[]>([])
  const [msgLeads, setMsgLeads] = useState<Record<number, string>>({})
  const [reply, setReply] = useState<Record<number, string>>({})
  const [quote, setQuote] = useState<{ body: string; author: string | null } | null>(null)
  const [stats, setStats] = useState({ calls: 0, booked: 0, owned: 0 })
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const tick = useRef<number | null>(null)
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }
  const country = (user?.country ?? 'MY') as Country
  /* one tiny trilingual helper — BM for MY warriors, ID for Indonesia */
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const dName = (key: string) => {
    const d = DISPO_NAME[key]
    return d ? (locale === 'bm' ? d.bm : locale === 'id' ? d.id : d.en) : key
  }

  /* ---------- reference data ---------- */
  const loadRef = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    // pause state is authoritative in the DB (the expiry sweep sets it)
    const { data: me } = await supabase.from('profiles').select('status').eq('id', user.id).single()
    setPaused((me as { status: string } | null)?.status === 'paused')
    const [d, f, q, b, g, ap] = await Promise.all([
      supabase.from('m4u_dispositions').select('*').eq('country', country).eq('active', true).order('sort_order'),
      supabase.from('m4u_field_settings').select('*').eq('country', country).order('sort_order'),
      supabase.from('quotes').select('body,author').eq('country', country).eq('active', true),
      supabase.from('bop_sessions').select('id,title,type,starts_at').eq('country', country)
        .eq('active', true).gte('starts_at', new Date().toISOString()).order('starts_at'),
      supabase.from('m4u_grants')
        .select('property_id,approved,active,declined_at,decline_reason,m4u_properties(id,name,type,description)')
        .eq('agent_id', user.id),
      supabase.from('m4u_properties').select('id,name,type,description')
        .eq('country', country).order('name'),
    ])
    setDisps((d.data as Disp[]) ?? [])
    setFields((f.data as FieldDef[]) ?? [])
    const qs = (q.data as { body: string; author: string | null }[]) ?? []
    if (qs.length) setQuote(qs[Math.floor(Math.random() * qs.length)])
    setBopSessions((b.data as typeof bopSessions) ?? [])
    setProjects((g.data as unknown as typeof projects) ?? [])
    // triage buckets (names like "__unassigned__") never appear in the picker
    setAllProps(((ap.data as Prop[]) ?? []).filter((p) => !p.name.startsWith('__')))
  }, [isReal, user, country])

  /* ---------- my lists + stats ---------- */
  const loadMine = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const [fu, bk, at] = await Promise.all([
      supabase.from('m4u_leads').select('*').eq('reserved_for', user.id).eq('status', 'pool')
        .gt('reserved_until', new Date().toISOString()).order('reserved_until'),
      supabase.from('m4u_leads').select('*').eq('owner_agent_id', user.id).order('updated_at', { ascending: false }),
      supabase.from('m4u_attempts').select('id,disposition').eq('agent_id', user.id)
        .gte('called_at', today.toISOString()),
    ])
    setFollowups((fu.data as Lead[]) ?? [])
    setBooked((bk.data as Lead[]) ?? [])
    const todays = (at.data as { disposition: string }[]) ?? []
    setStats({
      calls: todays.length,
      booked: todays.filter((a) => a.disposition === 'Booked' || a.disposition.startsWith('Attend')).length,
      owned: ((bk.data as Lead[]) ?? []).length,
    })
  }, [isReal, user])

  /* ---------- messages (admin↔agent Q&A) ---------- */
  const loadMsgs = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    const { data } = await supabase.from('m4u_notes').select('*')
      .eq('target_agent_id', user.id).is('parent_id', null)
      .order('created_at', { ascending: false }).limit(50)
    const parents = (data as Note[]) ?? []
    setThreads(parents)
    const ids = parents.map((p) => p.id)
    if (ids.length) {
      const { data: reps } = await supabase.from('m4u_notes').select('*').in('parent_id', ids)
        .order('created_at')
      setReplies((reps as Note[]) ?? [])
    } else setReplies([])
    const leadIds = [...new Set(parents.map((p) => p.lead_id).filter(Boolean))] as number[]
    if (leadIds.length) {
      // RLS may hide leads the agent no longer holds — fall back to "Lead #id"
      const { data: lds } = await supabase.from('m4u_leads').select('id,name').in('id', leadIds)
      setMsgLeads(Object.fromEntries(((lds ?? []) as { id: number; name: string | null }[])
        .map((l) => [l.id, l.name ?? `Lead #${l.id}`])))
    }
  }, [isReal, user])

  useEffect(() => { loadRef(); loadMine(); loadMsgs() }, [loadRef, loadMine, loadMsgs])

  const openMsgs = threads.filter((t) => !t.resolved_at)
  const msgBadge = openMsgs.filter((t) => t.requires_response).length

  /* ---------- countdown ---------- */
  useEffect(() => {
    if (tick.current) window.clearInterval(tick.current)
    if (!lead || secs <= 0) return
    tick.current = window.setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          window.clearInterval(tick.current!)
          setLead(null)
          say(L('⏱ Time up — the lead went back to the queue.',
                '⏱ Masa tamat — lead kembali ke barisan.',
                '⏱ Waktu habis — lead kembali ke antrean.'))
          loadMine()
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => { if (tick.current) window.clearInterval(tick.current) }
  }, [lead, secs > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const openLead = useCallback(async (id: number, seconds: number) => {
    if (!supabase) return
    const [l, h, ip] = await Promise.all([
      supabase.from('m4u_leads').select('*').eq('id', id).single(),
      supabase.from('m4u_attempts').select('id,disposition,note,called_at').eq('lead_id', id)
        .order('called_at', { ascending: false }).limit(3),
      supabase.from('m4u_lead_props').select('property_id,m4u_properties(name)').eq('lead_id', id),
    ])
    const row = l.data as Lead | null
    setLead(row); setSecs(seconds); setTotal(Math.max(seconds, 1))
    setHistory((h.data as Attempt[]) ?? [])
    setDispo(''); setNote(''); setBop('')
    setInterests((((ip.data ?? []) as unknown as { property_id: number; m4u_properties: { name: string } | null }[])
      .filter((x) => x.property_id !== row?.property_id && x.m4u_properties)
      .map((x) => x.m4u_properties!.name)))
    if (row?.property_id) {
      const { data: p } = await supabase.from('m4u_properties')
        .select('id,name,type,description').eq('id', row.property_id).single()
      setProp((p as Prop) ?? null)
    } else setProp(null)
  }, [])

  const getNext = useCallback(async () => {
    if (!supabase) return
    setBusy(true)
    const { data, error } = await supabase.rpc('m4u_next_lead')
    setBusy(false)
    if (error) {
      if (error.message.includes('paused')) { setPaused(true); return }
      say('⚠ ' + error.message); return
    }
    const row = (data as { lead_id: number; seconds_left: number; resumed: boolean }[])?.[0]
    if (!row?.lead_id) {
      say(L('No leads available right now — try again shortly.',
            'Tiada lead buat masa ini — cuba sebentar lagi.',
            'Belum ada lead saat ini — coba lagi sebentar.'))
      return
    }
    if (row.resumed) say(L('Resuming the lead you were holding', 'Menyambung lead yang anda pegang', 'Melanjutkan lead yang Anda pegang'))
    setTab('home')
    openLead(row.lead_id, row.seconds_left)
  }, [openLead, L])

  const submit = async () => {
    if (!supabase || !lead || !dispo) return
    const rule = disps.find((d) => d.key === dispo)
    if (rule?.bop_type && !bop) {
      say(L('Pick a BOP session first', 'Pilih sesi BOP dahulu', 'Pilih sesi BOP dahulu')); return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('m4u_disposition', {
      p_lead: lead.id, p_key: dispo, p_note: note || null,
      p_bop_session: bop ? Number(bop) : null,
    })
    setBusy(false)
    if (error) {
      if (error.message.includes('conflict')) {
        say(L('That lead moved on — fetching the next one', 'Lead itu sudah berpindah — mengambil yang seterusnya', 'Lead itu sudah berpindah — mengambil berikutnya'))
        setLead(null); window.setTimeout(getNext, 1200); return
      }
      say('⚠ ' + error.message); return
    }
    const res = data as { label: string; dead: boolean; locked: boolean; bop_type: string | null }
    say(res.bop_type && res.locked ? L('🎓 Booked into BOP!', '🎓 Ditempah ke BOP!', '🎓 Ditempah ke BOP!')
      : res.locked ? `🏆 ${dName(dispo)} — ${L('this lead is yours forever', 'lead ini milik anda selamanya', 'lead ini milik Anda selamanya')}`
      : `${L('Saved', 'Disimpan', 'Tersimpan')}: ${dName(dispo)}`)
    setLead(null); setSecs(0); loadMine()
    /* the continuous dialling loop — same 600 ms auto-chain as production */
    window.setTimeout(getNext, 600)
  }

  const release = async () => {
    if (!supabase || !lead) return
    await supabase.rpc('m4u_release', { p_lead: lead.id })
    setLead(null); setSecs(0)
    say(L('Returned to the queue', 'Dikembalikan ke barisan', 'Dikembalikan ke antrean')); loadMine()
  }

  /* Project access is decided server-side (migration 092). The client no longer
     writes m4u_grants at all — it could previously set its own `approved`. */
  const requestProject = async (propertyId: number) => {
    if (!supabase || !user) return
    const { error } = await supabase.rpc('fn_m4u_request_project', { p_property: propertyId })
    if (error) say('⚠ ' + error.message)
    else say(L('Requested — waiting for admin approval', 'Dimohon — menunggu kelulusan admin', 'Diajukan — menunggu persetujuan admin'))
    loadRef()
  }

  const askAgain = async (propertyId: number) => {
    if (!supabase) return
    const { error } = await supabase.rpc('fn_m4u_reopen_request', { p_property: propertyId })
    if (error) say('⚠ ' + error.message)
    else say(L('Asked again — waiting for admin', 'Dimohon semula — menunggu admin', 'Diajukan lagi — menunggu admin'))
    loadRef()
  }

  const sendReply = async (noteId: number) => {
    if (!supabase) return
    const body = (reply[noteId] ?? '').trim()
    if (!body) return
    setBusy(true)
    const { error } = await supabase.rpc('m4u_note_reply', { p_note: noteId, p_body: body })
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    setReply((r) => ({ ...r, [noteId]: '' }))
    say(L('Reply sent — thread resolved', 'Jawapan dihantar — soalan selesai', 'Jawaban terkirim — pertanyaan selesai'))
    loadMsgs()
  }

  if (!user) return null
  if (!isReal) return null

  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  const hot = lead?.custom_fields?.waktu_survey?.includes('minggu ini')
  const nurture = lead?.custom_fields?.waktu_survey?.includes('lihat')
  const rule = disps.find((d) => d.key === dispo)
  const problem = lead ? phoneProblem(lead.phone_norm) : null
  const pinnedNotes = lead ? openMsgs.filter((t) => t.lead_id === lead.id) : []
  const typeDisps = disps.filter((d) => d.project_type === (prop?.type ?? 'property'))
  const winD = typeDisps.filter((d) => d.is_win)
  const closeD = typeDisps.filter((d) => !d.is_win && (d.outcome === 'dead' || d.key === 'Not Interested' || d.key === 'Wrong Number'))
  const followD = typeDisps.filter((d) => !winD.includes(d) && !closeD.includes(d))
  const showReferralTip = dispo === 'Booked' || dispo === 'Interested Not Ready'
  const grantedIds = new Set(projects.map((g) => g.property_id))

  /* ---------- paused ---------- */
  if (paused) return (
    <div className="animate-rise px-4 pt-5">
      <Card className="p-6 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3 text-warning" />
        <p className="font-display text-base font-extrabold">{L('You are paused', 'Anda direhatkan seketika', 'Anda sedang istirahat sejenak')}</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          {L('A lead timed out while you were holding it. Ask to continue and you can call again straight away.',
             'Satu lead tamat masa semasa anda memegangnya. Mohon sambung dan anda boleh menelefon semula serta-merta.',
             'Sebuah lead kehabisan waktu saat Anda memegangnya. Minta lanjut dan Anda bisa menelepon lagi segera.')}
        </p>
        <button type="button" disabled={busy}
          onClick={async () => {
            if (!supabase) return
            setBusy(true)
            const { data } = await supabase.rpc('m4u_reactivate')
            setBusy(false)
            if (data) { setPaused(false); say(L('Welcome back — you can call again', 'Selamat kembali — anda boleh menelefon semula', 'Selamat kembali — Anda bisa menelepon lagi')) }
          }}
          className="mt-4 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
          {L('Request to continue', 'Mohon sambung semula', 'Minta lanjut kembali')}
        </button>
      </Card>
    </div>
  )

  return (
    <div className="animate-rise px-4 pt-5 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">📞 Caller</h1>
          <p className="text-xs text-muted">Marketing4U · {country === 'ID' ? '🇮🇩 Indonesia' : '🇲🇾 Malaysia'}</p>
        </div>
      </header>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {([['home', L('Home', 'Utama', 'Beranda'), HomeIcon],
           ['followups', `${L('Follow-ups', 'Susulan', 'Susulan')}${followups.length ? ` (${followups.length})` : ''}`, Clock],
           ['booked', `${L('Booked', 'Booking', 'Booking')}${booked.length ? ` (${booked.length})` : ''}`, Trophy],
           ['projects', L('Projects', 'Projek', 'Proyek'), FolderOpen],
           ['messages', `${L('Messages', 'Pesan', 'Pesan')}${msgBadge ? ` (${msgBadge > 9 ? '9+' : msgBadge})` : ''}`, MessagesSquare],
           ['guide', L('Guide', 'Panduan', 'Panduan'), BookOpen]] as const)
          .map(([k, label, Icon]) => (
          <button key={k as string} type="button" onClick={() => setTab(k as Tab)}
            className={clsx('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-extrabold transition-colors duration-200',
              tab === k ? 'border-accent bg-accent-soft text-accent'
                : k === 'messages' && msgBadge ? 'border-warning/60 text-warning'
                : 'border-border text-muted hover:text-ink')}>
            <Icon size={12} /> {label as string}
          </button>
        ))}
      </div>

      {/* ---------------- HOME ---------------- */}
      {tab === 'home' && !lead && (
        <>
          {msgBadge > 0 && (
            <button type="button" onClick={() => setTab('messages')}
              className="mb-3 flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-warning/50 bg-warning/10 p-3 text-left">
              <MessagesSquare size={16} className="shrink-0 text-warning" />
              <span className="min-w-0 flex-1 text-xs font-bold">
                {L(`${msgBadge} question${msgBadge > 1 ? 's' : ''} from admin waiting for your answer`,
                   `${msgBadge} soalan daripada admin menunggu jawapan anda`,
                   `${msgBadge} pertanyaan dari admin menunggu jawaban Anda`)}
              </span>
              <span className="shrink-0 text-xs font-extrabold text-warning">→</span>
            </button>
          )}
          {quote && (
            <Card className="mb-3 p-4">
              <p className="text-sm italic">“{quote.body}”</p>
              <p className="mt-1 text-[11px] text-muted">— {quote.author ?? 'AG'}</p>
            </Card>
          )}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {([[L('Calls today', 'Panggilan hari ini', 'Panggilan hari ini'), stats.calls],
               [L('Booked today', 'Booking hari ini', 'Booking hari ini'), stats.booked],
               [L('Leads owned', 'Lead dimiliki', 'Lead dimiliki'), stats.owned]] as const).map(([l, v]) => (
              <Card key={l as string} className="p-3 text-center">
                <p className="font-display text-xl font-extrabold text-accent">{v}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">{l}</p>
              </Card>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={getNext}
            className="flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-accent text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40">
            <span className="font-display text-base font-extrabold">
              {busy ? L('Finding…', 'Mencari…', 'Mencari…') : L('Get Next Lead', 'Ambil Lead Seterusnya', 'Ambil Lead Berikutnya')}
            </span>
            <span className="text-[11px] opacity-85">
              {L('one lead at a time · 25 minutes to disposition', 'satu lead pada satu masa · 25 minit untuk keputusan', 'satu lead dalam satu waktu · 25 menit untuk menentukan hasil')}
            </span>
          </button>
        </>
      )}

      {/* ---------------- LEAD CARD ---------------- */}
      {lead && (
        <Card className="mb-4 overflow-hidden">
          {/* countdown strip + progress bar (server-computed seconds) */}
          <div className={clsx('flex items-center justify-between px-4 py-2.5 text-xs font-bold',
            secs <= 120 ? 'bg-danger/15 text-danger' : 'bg-surface2 text-muted')}>
            <span>⏱ {mm}:{ss} {L('to disposition', 'untuk keputusan', 'untuk menentukan hasil')}</span>
            <button type="button" onClick={release} className="cursor-pointer underline">
              {L('release', 'lepaskan', 'lepaskan')}
            </button>
          </div>
          <div className="h-1 w-full bg-surface2">
            <div className={clsx('h-full transition-all duration-1000', secs <= 120 ? 'bg-danger' : 'bg-accent')}
              style={{ width: `${Math.max(0, Math.min(100, (secs / total) * 100))}%` }} />
          </div>
          <div className="p-4">
            <div className="mb-2 flex items-center gap-3">
              <Avatar name={lead.name ?? 'Lead'} color="var(--accent)" size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{lead.name ?? L('Unnamed lead', 'Lead tanpa nama', 'Lead tanpa nama')}</p>
                <p className="text-xs text-muted">{prop?.name ?? L('Unassigned (triage)', 'Belum ditetapkan', 'Proyek belum ditetapkan')}</p>
              </div>
              <Chip tone={pill(lead.current_label)}>{lead.current_label}</Chip>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {hot && <Chip tone="warning">🔥 HOT · {L('can survey this week', 'boleh survey minggu ini', 'bisa survey minggu ini')}</Chip>}
              {nurture && <Chip tone="success">🌱 Nurture</Chip>}
              {interests.map((n) => <Chip key={n} tone="info">➕ {L('Also interested', 'Juga berminat', 'Juga berminat')}: {n}</Chip>)}
              {lead.attempt_count > 0 && <Chip>↻ {lead.attempt_count} {L('attempts', 'percubaan', 'percobaan')}</Chip>}
            </div>

            {/* pinned admin questions on this very lead */}
            {pinnedNotes.map((n) => (
              <div key={n.id} className="mb-2 rounded-xl border border-warning/50 bg-warning/10 p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-warning">
                  <Pin size={11} /> {L('Admin note', 'Catatan admin', 'Catatan admin')}
                </p>
                <p className="text-xs leading-relaxed">{n.body}</p>
                {n.requires_response && (
                  <button type="button" onClick={() => setTab('messages')}
                    className="mt-1.5 cursor-pointer text-[11px] font-bold text-warning underline">
                    {L('Answer in Messages →', 'Jawab di Pesan →', 'Jawab di Pesan →')}
                  </button>
                )}
              </div>
            ))}

            {fields.filter((f) => f.visible_to_agent && lead.custom_fields?.[f.field_key]).length > 0 && (
              <div className="mb-3 divide-y divide-border rounded-xl border border-border text-xs">
                {fields.filter((f) => f.visible_to_agent && lead.custom_fields?.[f.field_key]).map((f) => (
                  <div key={f.field_key} className="flex justify-between gap-3 px-3 py-2">
                    <span className="shrink-0 font-semibold text-muted">{f.label}</span>
                    <span className="text-right">{lead.custom_fields![f.field_key]}</span>
                  </div>
                ))}
              </div>
            )}

            {prop?.description && (
              <p className="mb-3 rounded-lg bg-surface2 p-2.5 text-[11px] leading-relaxed text-muted">{prop.description}</p>
            )}

            {/* call box — tel keeps "+", wa.me strips it */}
            {problem ? (
              <p className="mb-3 rounded-lg bg-danger/10 p-2.5 text-xs text-danger">
                ⚠ {L('This number cannot be dialled', 'Nombor ini tidak boleh didail', 'Nomor ini tidak bisa dihubungi')} ({problem}).
              </p>
            ) : (
              <div className="mb-1 flex gap-2.5">
                <a href={telHref(lead.phone_norm, lead.phone, country) ?? '#'}
                  className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-on-accent no-underline transition-opacity hover:opacity-90">
                  <Phone size={16} /> {L('Call', 'Telefon', 'Telepon')}
                </a>
                <a href={waHref(lead.phone_norm, L(
                    `Hi ${(lead.name ?? '').split(' ')[0]}, this is ${(user?.name ?? '').split(' ')[0]} from IQI regarding ${prop?.name ?? ''} 😊`,
                    `Hai ${(lead.name ?? '').split(' ')[0]}, saya ${(user?.name ?? '').split(' ')[0]} dari IQI berkenaan ${prop?.name ?? ''} 😊`,
                    `Halo ${(lead.name ?? '').split(' ')[0]}, saya ${(user?.name ?? '').split(' ')[0]} dari IQI mengenai ${prop?.name ?? ''} 😊`,
                  ), lead.phone, country) ?? '#'}
                  target="_blank" rel="noreferrer"
                  className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold no-underline transition-colors hover:border-accent/60">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              </div>
            )}
            <p className="mb-3 text-center text-[11px] text-muted">{displayPhone(lead.phone_norm)}</p>

            {history.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
                  {L('Recent attempts', 'Percubaan terkini', 'Riwayat panggilan')}
                </p>
                {history.map((h) => (
                  <p key={h.id} className="border-b border-border py-1.5 text-[11px] text-muted last:border-0">
                    <b className="text-ink">{dName(h.disposition)}</b>{h.note ? ` · “${h.note}”` : ''} · {new Date(h.called_at).toLocaleDateString()}
                  </p>
                ))}
              </div>
            )}

            {/* dispositions — from the DB, grouped: win / follow-up / close */}
            {winD.map((d) => (
              <button key={d.key} type="button" onClick={() => setDispo(d.key)}
                className={clsx('mb-2 w-full cursor-pointer rounded-xl border-2 p-3 text-left transition-colors duration-200',
                  dispo === d.key ? 'border-accent bg-accent-soft' : 'border-accent/40 hover:border-accent')}>
                <span className="block text-sm font-extrabold text-accent">🏆 {dName(d.key)}</span>
                <span className="mt-0.5 block text-[10px] text-muted">{d.hint}</span>
              </button>
            ))}
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              {L('Follow-up', 'Tindakan susulan', 'Tindak lanjut')}
            </p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {followD.map((d) => (
                <button key={d.key} type="button" onClick={() => setDispo(d.key)}
                  className={clsx('cursor-pointer rounded-xl border p-2.5 text-left transition-colors duration-200',
                    dispo === d.key ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50')}>
                  <span className="block text-xs font-extrabold">{dName(d.key)}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{d.hint}</span>
                </button>
              ))}
            </div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
              {L('Close', 'Tutup', 'Tutup')}
            </p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {closeD.map((d) => (
                <button key={d.key} type="button" onClick={() => setDispo(d.key)}
                  className={clsx('cursor-pointer rounded-xl border p-2.5 text-left transition-colors duration-200',
                    dispo === d.key ? 'border-danger bg-danger/10' : 'border-border hover:border-danger/50')}>
                  <span className={clsx('block text-xs font-extrabold', dispo === d.key && 'text-danger')}>{dName(d.key)}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{d.hint}</span>
                </button>
              ))}
            </div>

            {/* anti fat-finger: a win locks the lead forever, so confirm it */}
            {rule?.is_win && (
              <p className="mb-2 rounded-xl border border-accent/60 bg-accent-soft p-3 text-xs font-bold leading-relaxed">
                🏆 {L('This locks the lead to you forever. Press the gold button to confirm.',
                      'Ini mengunci lead ini kepada anda selamanya. Tekan butang emas untuk sahkan.',
                      'Ini mengunci lead ini untuk Anda selamanya. Tekan tombol emas untuk konfirmasi.')}
              </p>
            )}

            {/* the referral ask — the cheapest lead source there is */}
            {showReferralTip && (
              <p className="mb-2 rounded-xl bg-surface2 p-3 text-[11px] leading-relaxed text-muted">
                💡 {L('Ask for a referral: "By the way, is anyone around you also looking for a home right now?"',
                      'Tanya referral: "Oh ya, ada sesiapa di sekeliling tuan/puan yang sedang cari rumah juga?"',
                      'Tanya referral: "Oh ya Pak/Bu, di lingkungan Bapak/Ibu ada yang lagi cari rumah juga?"')}
              </p>
            )}

            {rule?.bop_type && (
              <select value={bop} onChange={(e) => setBop(e.target.value)} aria-label="BOP session"
                className="mb-2 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
                <option value="">{L(`Pick a ${rule.bop_type} BOP session…`, `Pilih sesi BOP ${rule.bop_type}…`, `Pilih sesi BOP ${rule.bop_type}…`)}</option>
                {bopSessions.filter((s) => s.type === rule.bop_type).map((s) => (
                  <option key={s.id} value={s.id}>{s.title} — {new Date(s.starts_at).toLocaleString()}</option>
                ))}
              </select>
            )}

            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2}
              placeholder={L('Note (optional)…', 'Catatan (pilihan)…', 'Catatan (opsional)…')}
              className="mb-2 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent" />
            <button type="button" disabled={busy || !dispo} onClick={submit}
              className={clsx('h-12 w-full cursor-pointer rounded-xl text-sm font-extrabold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40',
                rule?.is_win ? 'bg-accent' : 'bg-accent')}>
              {busy ? L('Saving…', 'Menyimpan…', 'Menyimpan…')
                : !dispo ? L('Pick an outcome above', 'Pilih hasil di atas', 'Pilih hasil di atas')
                : rule?.is_win ? L('Confirm & Next Lead', 'Sahkan & Lead Seterusnya', 'Konfirmasi & Lead Berikutnya')
                : L('Submit & Next Lead', 'Hantar & Lead Seterusnya', 'Kirim & Lead Berikutnya')}
            </button>
          </div>
        </Card>
      )}

      {/* ---------------- FOLLOW-UPS ---------------- */}
      {tab === 'followups' && !lead && (
        <>
          <SectionTitle>{L('My follow-ups', 'Susulan saya', 'Tindak Lanjut Saya')} ({followups.length})</SectionTitle>
          {followups.length === 0 && <Card className="p-5 text-center text-xs text-muted">
            {L('Nothing reserved for you right now.', 'Tiada yang disimpan untuk anda buat masa ini.', 'Tidak ada yang disimpan untuk Anda saat ini.')}
          </Card>}
          {followups.map((l) => (
            <Card key={l.id} className="mb-2 flex items-center gap-2.5 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{l.name ?? L('Unnamed', 'Tanpa nama', 'Tanpa nama')}</p>
                <p className="text-[11px] text-muted">{displayPhone(l.phone_norm)} · {L('until', 'sehingga', 'hingga')} {l.reserved_until ? new Date(l.reserved_until).toLocaleString() : '—'}</p>
              </div>
              <Chip tone={pill(l.current_label)}>{l.current_label}</Chip>
              <a href={telHref(l.phone_norm, l.phone, country) ?? '#'} aria-label="Call"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent no-underline"><Phone size={14} /></a>
              <a href={waHref(l.phone_norm, undefined, l.phone, country) ?? '#'} target="_blank" rel="noreferrer" aria-label="WhatsApp"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border no-underline"><MessageCircle size={14} /></a>
            </Card>
          ))}
          {followups.length > 0 && (
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              {L('To log an outcome, the lead must come back through Get Next Lead.',
                 'Untuk merekod hasil, lead akan kembali melalui Ambil Lead Seterusnya.',
                 'Untuk mencatat hasil, lead akan kembali lewat Ambil Lead Berikutnya.')}
            </p>
          )}
        </>
      )}

      {/* ---------------- BOOKED ---------------- */}
      {tab === 'booked' && !lead && (
        <>
          <SectionTitle>{L('Booked — yours forever', 'Booking — milik anda selamanya', 'Lead Booking — milik Anda selamanya')} ({booked.length})</SectionTitle>
          {booked.length === 0 && <Card className="p-5 text-center text-xs text-muted">
            {L('No bookings yet. The next call could be the one 🔥', 'Belum ada booking. Panggilan seterusnya mungkin yang satu itu 🔥', 'Belum ada booking. Panggilan berikutnya bisa jadi yang satu itu 🔥')}
          </Card>}
          {booked.map((l) => (
            <Card key={l.id} className="mb-2 flex items-center gap-2.5 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{l.name ?? L('Unnamed', 'Tanpa nama', 'Tanpa nama')}</p>
                <p className="text-[11px] text-muted">{displayPhone(l.phone_norm)}</p>
              </div>
              <a href={telHref(l.phone_norm, l.phone, country) ?? '#'} aria-label="Call"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent no-underline"><Phone size={14} /></a>
              <a href={waHref(l.phone_norm, undefined, l.phone, country) ?? '#'} target="_blank" rel="noreferrer"
                className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold no-underline">WhatsApp</a>
            </Card>
          ))}
        </>
      )}

      {/* ---------------- PROJECTS (with self-request) ---------------- */}
      {tab === 'projects' && !lead && (
        <>
          <SectionTitle>{L('My projects', 'Projek saya', 'Proyek saya')}</SectionTitle>
          {projects.length === 0 && <Card className="mb-3 p-5 text-center text-xs text-muted">
            {L('No projects yet — request one below.', 'Belum ada projek — mohon di bawah.', 'Belum ada proyek — ajukan di bawah.')}
          </Card>}
          {projects.map((g) => (
            <Card key={g.property_id} className="mb-2 p-3.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{g.m4u_properties?.name ?? `Project ${g.property_id}`}</p>
                  <p className="text-[11px] text-muted">{g.m4u_properties?.type}</p>
                </div>
                {g.declined_at ? <Chip tone="danger">{L('not approved', 'tidak diluluskan', 'tidak disetujui')}</Chip>
                  : !g.approved ? <Chip tone="warning">{L('pending approval', 'menunggu kelulusan', 'menunggu persetujuan')}</Chip>
                  : g.active ? <Chip tone="success">{L('active', 'aktif', 'aktif')}</Chip>
                  : <Chip>{L('approved · off', 'lulus · tutup', 'disetujui · nonaktif')}</Chip>}
                {g.approved && (
                  <button type="button"
                    onClick={async () => {
                      if (!supabase) return
                      const { error } = await supabase.rpc('fn_m4u_toggle_project',
                        { p_property: g.property_id, p_active: !g.active })
                      if (error) { say('⚠ ' + error.message); return }
                      loadRef()
                      say(g.active
                        ? L('Paused — no new leads from this project', 'Dijeda — tiada lead baharu dari projek ini', 'Dijeda — tidak ada lead baru dari proyek ini')
                        : L('Active — leads can come to you', 'Aktif — lead boleh datang kepada anda', 'Aktif — lead bisa datang ke Anda'))
                    }}
                    className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold">
                    {g.active ? L('Turn off', 'Tutup', 'Matikan') : L('Turn on', 'Buka', 'Aktifkan')}
                  </button>
                )}
                {g.declined_at && (
                  <button type="button" onClick={() => askAgain(g.property_id)}
                    className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold">
                    {L('Ask again', 'Mohon semula', 'Ajukan lagi')}
                  </button>
                )}
              </div>
              {g.declined_at && g.decline_reason && (
                <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted">{g.decline_reason}</p>
              )}
            </Card>
          ))}

          {/* projects the agent may request — approval stays with admin */}
          {allProps.filter((p) => !grantedIds.has(p.id)).length > 0 && (
            <>
              <SectionTitle>{L('Available to request', 'Boleh dimohon', 'Bisa diajukan')}</SectionTitle>
              {allProps.filter((p) => !grantedIds.has(p.id)).map((p) => (
                <Card key={p.id} className="mb-2 flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-[11px] text-muted">{p.type}</p>
                  </div>
                  <button type="button" onClick={() => requestProject(p.id)}
                    className="cursor-pointer rounded-full bg-accent px-3.5 py-1.5 text-[11px] font-extrabold text-on-accent">
                    {L('Request', 'Mohon', 'Ajukan')}
                  </button>
                </Card>
              ))}
            </>
          )}
        </>
      )}

      {/* ---------------- MESSAGES ---------------- */}
      {tab === 'messages' && !lead && (
        <>
          <SectionTitle>{L('Messages from admin', 'Pesan daripada admin', 'Pesan dari admin')}</SectionTitle>
          {threads.length === 0 && <Card className="p-5 text-center text-xs text-muted">
            {L('No questions waiting. 👍', 'Tiada soalan menunggu. 👍', 'Tidak ada pertanyaan yang menunggu. 👍')}
          </Card>}
          {threads.map((t) => {
            const kids = replies.filter((r) => r.parent_id === t.id)
            const open = !t.resolved_at
            return (
              <Card key={t.id} className={clsx('mb-2.5 p-3.5', open && 'border-l-4 border-l-accent')}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Chip tone={open ? 'warning' : 'success'}>
                    {open ? L('needs answer', 'perlu jawapan', 'perlu jawaban') : L('answered', 'terjawab', 'terjawab')}
                  </Chip>
                  <span className="text-[10px] text-muted">
                    {t.lead_id ? (msgLeads[t.lead_id] ?? `Lead #${t.lead_id}`) : t.bucket_label ?? ''}
                    {' · '}{new Date(t.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed">{t.body}</p>
                {kids.map((k) => (
                  <p key={k.id} className="mt-2 rounded-lg bg-surface2 p-2.5 text-xs leading-relaxed">
                    <b className="text-accent">
                      {k.author_role === 'agent' ? L('You', 'Anda', 'Anda') : 'Admin'}:
                    </b>{' '}{k.body}
                  </p>
                ))}
                {open && (
                  <div className="mt-2.5 flex gap-2">
                    <input value={reply[t.id] ?? ''} onChange={(e) => setReply((r) => ({ ...r, [t.id]: e.target.value }))}
                      placeholder={L('Type your answer…', 'Taip jawapan anda…', 'Ketik jawaban Anda…')}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
                    <button type="button" disabled={busy || !(reply[t.id] ?? '').trim()} onClick={() => sendReply(t.id)}
                      className="shrink-0 cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
                      {L('Send', 'Hantar', 'Kirim')}
                    </button>
                  </div>
                )}
              </Card>
            )
          })}
        </>
      )}

      {/* ---------------- GUIDE ---------------- */}
      {tab === 'guide' && !lead && (
        <>
          <SectionTitle>{L('Caller quick guide', 'Panduan ringkas penelefon', 'Panduan Cepat Penelepon')}</SectionTitle>
          <Card className="mb-3 p-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              {L('How it works', 'Cara ia berfungsi', 'Cara kerjanya')}
            </p>
            <ol className="space-y-2 text-[13px] leading-relaxed">
              {[
                L('Tap Get Next Lead — you get ONE lead and 25 minutes.', 'Tekan Ambil Lead Seterusnya — anda dapat SATU lead dan 25 minit.', 'Tekan Ambil Lead Berikutnya — Anda dapat SATU lead dan 25 menit.'),
                L('Call first. WhatsApp if no answer.', 'Telefon dahulu. WhatsApp jika tidak berjawab.', 'Telepon dulu. WhatsApp jika tidak diangkat.'),
                L('Pick the honest outcome — the engine handles cooldowns and reservations.', 'Pilih hasil yang jujur — enjin uruskan cooldown dan simpanan.', 'Pilih hasil yang jujur — mesin mengurus cooldown dan reservasi.'),
                L('Add a short note for the next caller (or future you).', 'Tulis catatan ringkas untuk pemanggil seterusnya (atau anda sendiri nanti).', 'Tulis catatan singkat untuk penelepon berikutnya (atau Anda sendiri nanti).'),
                L('Submit — the next lead comes automatically. Keep the rhythm.', 'Hantar — lead seterusnya datang secara automatik. Kekalkan rentak.', 'Kirim — lead berikutnya datang otomatis. Jaga ritme.'),
              ].map((s, i) => (
                <li key={i} className="flex gap-2"><b className="text-accent">{i + 1}.</b><span>{s}</span></li>
              ))}
            </ol>
          </Card>
          <Card className="mb-3 border-accent/50 p-4">
            <p className="text-[13px] font-bold leading-relaxed">
              🏆 {L('Golden rule: an appointment locks the lead to YOU forever. Every call is a chance to own a lead for life.',
                    'Peraturan emas: janji temu mengunci lead kepada ANDA selamanya. Setiap panggilan ialah peluang memiliki lead seumur hidup.',
                    'Aturan emas: janji temu mengunci lead untuk ANDA selamanya. Setiap panggilan adalah peluang memiliki lead seumur hidup.')}
            </p>
          </Card>
          <Card className="mb-3 p-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              {L('What each outcome does', 'Fungsi setiap hasil', 'Fungsi setiap hasil')}
            </p>
            {disps.filter((d) => d.project_type === 'property').map((d) => (
              <div key={d.key} className="border-b border-border py-2 text-xs last:border-0">
                <b className={clsx(d.is_win && 'text-accent')}>{d.is_win ? '🏆 ' : ''}{dName(d.key)}</b>
                <span className="text-muted"> — {d.hint}</span>
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              {L('Install this app', 'Pasang aplikasi ini', 'Pasang aplikasi ini')}
            </p>
            <p className="text-xs leading-relaxed text-muted">
              {L('Android/Chrome: menu ⋮ → "Add to Home screen". iPhone/Safari: Share → "Add to Home Screen". The caller then opens full-screen like a real app.',
                 'Android/Chrome: menu ⋮ → "Tambah ke skrin Utama". iPhone/Safari: Kongsi → "Add to Home Screen". Caller akan dibuka penuh seperti aplikasi sebenar.',
                 'Android/Chrome: menu ⋮ → "Tambahkan ke layar Utama". iPhone/Safari: Bagikan → "Add to Home Screen". Caller akan terbuka penuh seperti aplikasi asli.')}
            </p>
          </Card>
        </>
      )}

      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
