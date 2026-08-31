/* Command HQ → Events (070). Public recruitment/BOP pages on hero:
     hero.iqiaggroup.com/my/<slug> · hero.iqiaggroup.com/id/<slug>
   Built on bop_sessions + bop_roster, so callers' "Attend BOP" bookings and
   public self-registrations land in ONE pipeline. Admin: create → dates →
   publish → link + QR poster → live board (who came through which agent,
   attended / no-show → rebook → joined) → CSV. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase'
import { exportCsv } from '../../lib/csv'
import { Card, Chip } from '../../components/ui'
import CertificatePanel from './CertificatePanel'

type Team = 'ALL' | 'MY' | 'ID'
interface Ev {
  id: string; country: 'MY' | 'ID'; slug: string; title: string; description: string | null
  kind: string; status: string; capacity: number | null; checkin_code: string | null; created_at: string
  registration_closes_at?: string | null; allow_walkin?: boolean
}
interface Sess {
  id: number; event_id: string | null; country: string; type: string; title: string; starts_at: string
  link: string | null; location: string | null; map_url: string | null; capacity: number | null; active: boolean
}
interface Row {
  session_id: number; session_title: string; starts_at: string; type: string
  lead_id: number; name: string | null; phone_norm: string | null; email: string | null; source: string
  attended: string; attended_at: string | null; checkin_method: string | null
  joined: boolean; friends: string | null; remarks: string | null; registered_at: string
  rebooked_to: number | null; referred_by: string | null; referred_name: string | null
  caller_id: string | null; caller_name: string | null
}

interface EvMeta { first: string | null; last: string | null; sessions: number; regs: number; present: number }
interface Legacy {
  id: number; country: string; type: string; title: string; starts_at: string
  location: string | null; link: string | null; active: boolean; regs: number; present: number
}

const ORIGIN = 'https://hero.iqiaggroup.com'
const cc = (c: string) => (c === 'ID' ? 'id' : 'my')
const tzOf = (c: string) => (c === 'ID' ? '+07:00' : '+08:00')
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
const genCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
/* ISO → value for <input type=datetime-local> in the event's country time */
const toLocalInput = (iso: string, c: string) => {
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: c === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}
const fmtDT = (iso: string, c: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: c === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur',
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function EventsAdmin({ team }: { team: Team }) {
  const [events, setEvents] = useState<Ev[]>([])
  const [sel, setSel] = useState<Ev | null>(null)
  const [sessions, setSessions] = useState<Sess[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [toast, setToastRaw] = useState('')
  const say = (m: string) => { setToastRaw(m); setTimeout(() => setToastRaw(''), 3200) }
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', slug: '', kind: 'recruitment', description: '', capacity: '', country: (team === 'ID' ? 'ID' : 'MY') as 'MY' | 'ID' })
  const [sf, setSf] = useState({ type: 'online', title: '', date: '', time: '19:30', link: '', location: '', map_url: '', capacity: '' })
  const [qr, setQr] = useState<{ link: string; checkin: string } | null>(null)
  const [sessF, setSessF] = useState<number | 'all'>('all')
  const [tab, setTab] = useState<'board' | 'certificate'>('board')
  /* Past events must be findable, not just archived. `meta` holds each event's
     date range and registration count so the list can say what an event WAS. */
  const [meta, setMeta] = useState<Record<string, EvMeta>>({})
  const [q, setQ] = useState('')                       // event search
  const [when, setWhen] = useState<'all' | 'upcoming' | 'past'>('all')
  const [rq, setRq] = useState('')                     // registrant search
  const [attF, setAttF] = useState<'all' | 'attended' | 'no_show' | 'pending'>('all')
  /* Remarks are where the floor actually records who brought whom ("HADIR - BU
     MITA"). 'all' | 'any' | 'none' | a normalised remark value. */
  const [remF, setRemF] = useState('all')
  /* Dates that exist in bop_sessions but were never given an event page — the
     BOP/M4U-era sessions that pre-date this module. They hold real history and
     must be findable, not invisible. */
  const [legacy, setLegacy] = useState<Legacy[]>([])
  const [showLegacy, setShowLegacy] = useState(false)

  const loadEvents = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    const evs = (data as Ev[]) ?? []
    if (evs.length === 0) { setEvents([]); setMeta({}); return }

    // dates + headcount per event, so a past event still tells its story in the list.
    // Meta is computed BEFORE events are shown: rendering the list first painted
    // every event as "no dates yet" (and misfiled Past as Upcoming) until this
    // query landed — and permanently if it failed, because the error was ignored.
    const { data: ss, error: ssErr } = await supabase.from('bop_sessions')
      .select('id,event_id,starts_at').in('event_id', evs.map((e) => e.id))
    if (ssErr) { setEvents(evs); say('⚠ Event dates could not load: ' + ssErr.message); return }
    const sess = (ss as { id: number; event_id: string; starts_at: string }[]) ?? []
    const ownerOf: Record<number, string> = {}
    const m: Record<string, EvMeta> = {}
    evs.forEach((e) => { m[e.id] = { first: null, last: null, sessions: 0, regs: 0, present: 0 } })
    sess.forEach((x) => {
      ownerOf[x.id] = x.event_id
      const k = m[x.event_id]; if (!k) return
      k.sessions++
      if (!k.first || x.starts_at < k.first) k.first = x.starts_at
      if (!k.last || x.starts_at > k.last) k.last = x.starts_at
    })
    if (sess.length) {
      const { data: rr } = await supabase.from('bop_roster')
        .select('session_id,attended').in('session_id', sess.map((x) => x.id))
      ;((rr as { session_id: number; attended: string }[]) ?? []).forEach((r) => {
        const k = m[ownerOf[r.session_id]]; if (!k) return
        k.regs++; if (r.attended === 'attended') k.present++
      })
    }
    setMeta(m)
    setEvents(evs)                          // one consistent paint: events + their dates together

    // sessions with no event page at all
    const { data: orph } = await supabase.from('bop_sessions')
      .select('id,country,type,title,starts_at,location,link,active')
      .is('event_id', null).order('starts_at', { ascending: false })
    const orphans = (orph as Omit<Legacy, 'regs' | 'present'>[]) ?? []
    if (orphans.length === 0) { setLegacy([]); return }
    const { data: orr } = await supabase.from('bop_roster')
      .select('session_id,attended').in('session_id', orphans.map((o) => o.id))
    const rc: Record<number, { regs: number; present: number }> = {}
    ;((orr as { session_id: number; attended: string }[]) ?? []).forEach((r) => {
      rc[r.session_id] ||= { regs: 0, present: 0 }
      rc[r.session_id].regs++; if (r.attended === 'attended') rc[r.session_id].present++
    })
    setLegacy(orphans.map((o) => ({ ...o, regs: rc[o.id]?.regs ?? 0, present: rc[o.id]?.present ?? 0 })))
  }, [])
  useEffect(() => { loadEvents() }, [loadEvents])

  /* Group invites (096). No API can ADD someone to a WhatsApp/Telegram group,
     so the Invite button opens WhatsApp with a ready message carrying both
     invite links; the person joins themselves and "approve new members" keeps
     the door guarded. The log makes sure nobody is invited twice. */
  const [inviteLinks, setInviteLinks] = useState<{ kind: string; label: string; url: string; active: boolean }[]>([])
  const [invited, setInvited] = useState<Record<number, string>>({})

  const loadDetail = useCallback(async (ev: Ev) => {
    if (!supabase) return
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from('bop_sessions').select('*').eq('event_id', ev.id).order('starts_at'),
      supabase.rpc('event_board', { p_event: ev.id }),
    ])
    setSessions((s as Sess[]) ?? [])
    setRows((b as Row[]) ?? [])
    const leads = [...new Set(((b as Row[]) ?? []).map((r) => r.lead_id))]
    const { data: ic } = await supabase.rpc('fn_invite_context', { p_country: ev.country, p_leads: leads })
    const ctx = ic as unknown as { links?: typeof inviteLinks; invited?: { lead_id: number; invited_at: string }[] } | null
    setInviteLinks((ctx?.links ?? []).filter((l) => l.active))
    setInvited(Object.fromEntries((ctx?.invited ?? []).map((x) => [x.lead_id, x.invited_at])))
  }, [])
  useEffect(() => { if (sel) loadDetail(sel) }, [sel, loadDetail])

  // QR posters: public link + venue check-in link (secret code embedded)
  useEffect(() => {
    if (!sel) { setQr(null); return }
    const pub = `${ORIGIN}/${cc(sel.country)}/${sel.slug}`
    const chk = `${pub}?checkin=1&code=${sel.checkin_code ?? ''}`
    Promise.all([QRCode.toDataURL(pub, { width: 360, margin: 1 }), QRCode.toDataURL(chk, { width: 360, margin: 1 })])
      .then(([a, b]) => setQr({ link: a, checkin: b })).catch(() => setQr(null))
  }, [sel])

  const [showArchived, setShowArchived] = useState(false)
  const scoped = useMemo(() => events.filter((e) => team === 'ALL' || e.country === team), [events, team])
  const archivedN = scoped.filter((e) => e.status === 'archived').length

  /* An event is PAST when it has dates and every one of them has already run.
     An event with no dates yet is not past — it is still being prepared. */
  const isPast = useCallback((e: Ev) => {
    const k = meta[e.id]
    return !!(k && k.last && new Date(k.last).getTime() < Date.now())
  }, [meta])

  const afterArchive = useMemo(
    () => scoped.filter((e) => showArchived || e.status !== 'archived'), [scoped, showArchived])
  const pastN = useMemo(() => afterArchive.filter(isPast).length, [afterArchive, isPast])
  const upcomingN = afterArchive.length - pastN

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return afterArchive
      .filter((e) => (when === 'all' ? true : when === 'past' ? isPast(e) : !isPast(e)))
      .filter((e) => !term
        || e.title.toLowerCase().includes(term)
        || e.slug.toLowerCase().includes(term)
        || (e.description ?? '').toLowerCase().includes(term)
        || e.kind.toLowerCase().includes(term))
      // past events read best newest-first by when they actually happened
      .sort((a, b) => {
        const la = meta[a.id]?.last ?? '', lb = meta[b.id]?.last ?? ''
        if (when === 'past') return lb.localeCompare(la)
        if (!la || !lb) return la ? -1 : lb ? 1 : 0
        return la.localeCompare(lb)
      })
  }, [afterArchive, when, q, isPast, meta])

  const createEvent = async () => {
    if (!supabase || !form.title.trim()) return
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('events').insert({
      country: team !== 'ALL' ? team : form.country, slug: form.slug || slugify(form.title),
      title: form.title.trim(), kind: form.kind, description: form.description.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null, checkin_code: genCode(), created_by: u.user?.id,
    }).select('*').single()
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say('Event created — add dates, then publish')
    setCreating(false); setForm({ ...form, title: '', slug: '', description: '', capacity: '' })
    await loadEvents(); setSel(data as Ev)
  }

  /* Give a pre-existing date an event page, so its history becomes first-class:
     public link, QR, roster, certificates. Nothing about the session changes
     except that it now has a parent — no registration is created or invented. */
  const adoptSession = async (l: Legacy) => {
    if (!supabase) return
    const past = new Date(l.starts_at).getTime() < Date.now()
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    let slug = slugify(l.title) || `session-${l.id}`
    const { data: clash } = await supabase.from('events')
      .select('id').eq('country', l.country).eq('slug', slug).maybeSingle()
    if (clash) slug = `${slug}-${l.id}`
    const { data, error } = await supabase.from('events').insert({
      country: l.country, slug, title: l.title, kind: 'bop',
      description: l.location ? `Venue: ${l.location}` : null,
      status: past ? 'closed' : 'draft', checkin_code: genCode(), created_by: u.user?.id,
    }).select('*').single()
    if (error) { setBusy(false); say('⚠ ' + error.message); return }
    const { error: e2 } = await supabase.from('bop_sessions')
      .update({ event_id: (data as Ev).id }).eq('id', l.id)
    setBusy(false)
    if (e2) { say('⚠ ' + e2.message); return }
    say(past ? 'Event page created — this past date is now on the board' : 'Event page created as a draft')
    await loadEvents(); setSel(data as Ev); setWhen('all')
  }

  /* Delete only when nothing was ever registered (a mistake); anything with
     data is archived instead — the roster is history we never throw away. */
  const deleteEvent = async (ev: Ev) => {
    if (!supabase) return
    if (rows.length > 0) { say('⚠ This event has registrations — archive it instead'); return }
    if (!window.confirm(`Delete "${ev.title}" and its dates? This cannot be undone.`)) return
    setBusy(true)
    await supabase.from('bop_sessions').delete().eq('event_id', ev.id)
    const { error } = await supabase.from('events').delete().eq('id', ev.id)
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say('Event deleted'); setSel(null); loadEvents()
  }

  const setStatus = async (ev: Ev, status: string) => {
    if (!supabase) return
    if (status === 'published' && sessions.filter((s) => s.active).length === 0) { say('⚠ Add at least one date before publishing'); return }
    const { error } = await supabase.from('events').update({ status, updated_at: new Date().toISOString() }).eq('id', ev.id)
    if (error) { say('⚠ ' + error.message); return }
    say(status === 'published' ? '🚀 Published — link is live' : `Status: ${status}`)
    await loadEvents(); setSel({ ...ev, status })
  }

  const addSession = async () => {
    if (!supabase || !sel || !sf.date) return
    setBusy(true)
    const { error } = await supabase.from('bop_sessions').insert({
      event_id: sel.id, country: sel.country, type: sf.type,
      title: sf.title.trim() || `${sel.title} · ${sf.type === 'online' ? 'Online' : 'Physical'}`,
      starts_at: `${sf.date}T${sf.time}:00${tzOf(sel.country)}`,
      link: sf.type === 'online' ? sf.link.trim() || null : null,
      location: sf.type === 'physical' ? sf.location.trim() || null : null,
      map_url: sf.type === 'physical' ? sf.map_url.trim() || null : null,
      capacity: sf.capacity ? Number(sf.capacity) : null, active: true,
    })
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say('Date added'); setSf({ ...sf, date: '', title: '', link: '', location: '', map_url: '', capacity: '' }); loadDetail(sel)
  }

  const toggleSession = async (s: Sess) => {
    if (!supabase || !sel) return
    await supabase.from('bop_sessions').update({ active: !s.active }).eq('id', s.id)
    loadDetail(sel)
  }

  const patchRow = async (r: Row, patch: Record<string, unknown>, msg?: string) => {
    if (!supabase || !sel) return
    const { error } = await supabase.from('bop_roster').update(patch).eq('session_id', r.session_id).eq('lead_id', r.lead_id)
    if (error) { say('⚠ ' + error.message); return }
    if (msg) say(msg)
    loadDetail(sel)
  }

  /* Build the invite in the event's language, open WhatsApp with it prefilled,
     and record that this person was asked. The message states only what is
     true: they registered, here are the official groups, joining is approved
     by an admin. */
  const inviteToGroups = async (r: Row) => {
    if (!supabase || !sel) return
    const first = (r.name ?? '').trim().split(/\s+/)[0] || ''
    const wa = inviteLinks.filter((l) => l.kind === 'whatsapp')
    const tg = inviteLinks.filter((l) => l.kind === 'telegram')
    const lines = sel.country === 'ID'
      ? [
          `Halo${first ? ' ' + first : ''}! Terima kasih sudah mendaftar di ${sel.title}.`,
          'Silakan bergabung ke grup resmi kami untuk info dan peluang selanjutnya:',
          ...wa.map((l) => `WhatsApp — ${l.label}: ${l.url}`),
          ...tg.map((l) => `Telegram — ${l.label}: ${l.url}`),
          'Permintaan bergabung akan disetujui oleh admin kami.',
        ]
      : [
          `Salam${first ? ' ' + first : ''}! Terima kasih kerana mendaftar untuk ${sel.title}.`,
          'Jemput sertai kumpulan rasmi kami untuk info dan peluang seterusnya:',
          ...wa.map((l) => `WhatsApp — ${l.label}: ${l.url}`),
          ...tg.map((l) => `Telegram — ${l.label}: ${l.url}`),
          'Permintaan menyertai akan diluluskan oleh admin kami.',
        ]
    const url = `https://wa.me/${r.phone_norm!.replace(/\D/g, '')}?text=${encodeURIComponent(lines.join('\n'))}`
    window.open(url, '_blank', 'noopener')
    const { error } = await supabase.rpc('fn_log_group_invite', { p_lead: r.lead_id, p_country: sel.country })
    if (error) { say('⚠ ' + error.message); return }
    setInvited((m) => ({ ...m, [r.lead_id]: new Date().toISOString() }))
    say(`✉ Invite ready in WhatsApp for ${r.name ?? 'the registrant'} — press send there`)
  }

  const rebook = async (r: Row, newSession: number) => {
    if (!supabase || !sel) return
    const { error } = await supabase.rpc('event_rebook', { p_session: r.session_id, p_lead: r.lead_id, p_new_session: newSession })
    if (error) { say('⚠ ' + error.message); return }
    say('↪ Rebooked — GHL/agent follow-up will carry the new date'); loadDetail(sel)
  }

  /* Free text typed by many different people on the floor, so the same group is
     written several ways: "HADIR-NURY" / "HADIR - NURY", "HADIR = PAK BAGUS".
     Separator and spacing variants are folded together, otherwise one person's
     group splits across two rows of the filter and every count is wrong. What is
     NOT folded is genuinely different wording — "… - BAWA KAWAN" stays its own
     value, because bringing a friend is a different note, not a typo. */
  const normRemark = (v: string | null) => (v ?? '')
    .toUpperCase()
    .replace(/[-=_–—]+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()

  /* The remark values actually present on the dates currently in view, most used
     first. Counted BEFORE the remark and search filters so the list does not
     shift underneath you while you use it. */
  const remarkOpts = useMemo(() => {
    const base = rows.filter((r) => sessF === 'all' || r.session_id === sessF)
    const seen = new Map<string, { label: string; n: number }>()
    let none = 0
    base.forEach((r) => {
      const k = normRemark(r.remarks)
      if (!k) { none += 1; return }
      const hit = seen.get(k)
      if (hit) hit.n += 1
      else seen.set(k, { label: (r.remarks ?? '').trim(), n: 1 })
    })
    return {
      none,
      any: base.length - none,
      list: [...seen.entries()].map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)),
    }
  }, [rows, sessF])

  /* Registrant search covers everything an admin would recall about a person:
     name, phone, email, the agent who brought them, remarks, friends, source. */
  const shown = useMemo(() => {
    const term = rq.trim().toLowerCase()
    return rows
      .filter((r) => sessF === 'all' || r.session_id === sessF)
      .filter((r) => attF === 'all'
        || (attF === 'pending' ? r.attended !== 'attended' && r.attended !== 'no_show' : r.attended === attF))
      .filter((r) => {
        if (remF === 'all') return true
        const k = normRemark(r.remarks)
        if (remF === 'none') return !k
        if (remF === 'any') return !!k
        return k === remF
      })
      .filter((r) => !term || [
        r.name, r.phone_norm, r.email, r.referred_name, r.caller_name,
        r.remarks, r.friends, r.source, r.session_title,
      ].some((v) => (v ?? '').toString().toLowerCase().includes(term)))
  }, [rows, sessF, attF, remF, rq])
  const stats = {
    reg: shown.length,
    present: shown.filter((r) => r.attended === 'attended').length,
    noshow: shown.filter((r) => r.attended === 'no_show').length,
    joined: shown.filter((r) => r.joined).length,
    viaAgent: shown.filter((r) => r.referred_by || r.caller_id).length,
  }
  const byAgent = useMemo(() => {
    const m: Record<string, { name: string; n: number; present: number }> = {}
    shown.forEach((r) => {
      const k = r.referred_name ?? r.caller_name
      if (!k) return
      m[k] ||= { name: k, n: 0, present: 0 }
      m[k].n++; if (r.attended === 'attended') m[k].present++
    })
    return Object.values(m).sort((a, b) => b.n - a.n)
  }, [shown])

  /* Legacy dates honour the same country scope and search box as the events list. */
  const legacyShown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return legacy
      .filter((l) => team === 'ALL' || l.country === team)
      .filter((l) => !term
        || l.title.toLowerCase().includes(term)
        || (l.location ?? '').toLowerCase().includes(term)
        || l.type.toLowerCase().includes(term))
  }, [legacy, team, q])

  const inp = 'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'
  const btn = 'cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink disabled:opacity-40'
  const gold = 'cursor-pointer rounded-xl bg-accent px-4 py-2 text-xs font-extrabold text-on-accent hover:opacity-90 disabled:opacity-40'

  return (
    <>
      {/* ---------- list + create ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-extrabold">Events · {team === 'ALL' ? 'MY + ID' : team}</p>
        <span className="text-xs text-muted">{visible.length} shown</span>
        {archivedN > 0 && (
          <button type="button" onClick={() => setShowArchived((v) => !v)}
            className="cursor-pointer rounded-full border border-border px-3 py-1 text-[11px] font-bold text-muted hover:text-ink">
            {showArchived ? 'Hide archived' : `Show archived (${archivedN})`}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setCreating((v) => !v)} className={gold}>+ New event</button>
      </div>

      {/* Upcoming / Past / All — past events stay first-class, not buried in archive */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {([['all', 'All', afterArchive.length],
             ['upcoming', 'Upcoming', upcomingN],
             ['past', 'Past', pastN]] as const).map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setWhen(k)}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[11px] font-extrabold ${
                when === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink'}`}>
              {label} ({n})
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search events — title, link, kind…"
            className="h-10 w-full rounded-xl border border-border bg-surface pl-3 pr-8 text-sm outline-none focus:border-accent" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted hover:text-ink">×</button>
          )}
        </div>
      </div>

      {creating && (
        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input className={inp} placeholder="Title — e.g. BOP Kerjaya Hartanah Ogos" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value, slug: slugify(e.target.value) })} />
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted">/{cc(team !== 'ALL' ? team : form.country)}/</span>
              <input className={inp} placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
            </div>
            <select className={inp} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {['recruitment', 'bop', 'training', 'launch', 'other'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <div className="flex gap-2">
              {team === 'ALL' && (
                <select className={inp} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value as 'MY' | 'ID' })}>
                  <option value="MY">🇲🇾 MY</option><option value="ID">🇮🇩 ID</option>
                </select>
              )}
              <input className={inp} type="number" placeholder="Capacity (optional)" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </div>
            <textarea className="md:col-span-2 min-h-[70px] rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Description shown on the public page (what, who should come, what they get)" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || !form.title.trim()} onClick={createEvent} className={gold}>Create (draft)</button>
            <button type="button" onClick={() => setCreating(false)} className={btn}>Cancel</button>
          </div>
        </Card>
      )}

      {/* ---------- dates that never got an event page ---------- */}
      {legacyShown.length > 0 && (
        <Card className="mb-4 p-3">
          <button type="button" onClick={() => setShowLegacy((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-2 text-left">
            <span className="text-sm font-extrabold">
              Earlier dates without an event page ({legacyShown.length})
            </span>
            <span className="text-[11px] text-muted">
              BOP sessions from before this module — visible and searchable, but they have no public page yet
            </span>
            <span className="flex-1" />
            <span className="text-muted">{showLegacy ? '▾' : '▸'}</span>
          </button>
          {showLegacy && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                    <th className="px-3 py-2">Session</th><th className="px-3 py-2">When</th>
                    <th className="px-3 py-2">Where</th><th className="px-3 py-2">People</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {legacyShown.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                      <td className="px-3 py-2.5">
                        <p className="font-bold">{l.country === 'MY' ? '🇲🇾' : '🇮🇩'} {l.title}</p>
                        <p className="text-[10px] text-muted">{l.type}</p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted">
                        {fmtDT(l.starts_at, l.country)}
                        {new Date(l.starts_at).getTime() < Date.now() && <Chip className="ml-1.5">past</Chip>}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-muted">{l.location ?? (l.link ? 'online' : '—')}</td>
                      <td className="px-3 py-2.5 text-[11px]">
                        {l.regs
                          ? <><b>{l.regs}</b> registered{l.present > 0 && <span className="text-success"> · {l.present} attended</span>}</>
                          : <span className="text-muted opacity-60">none recorded</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" disabled={busy} onClick={() => adoptSession(l)} className={btn}>
                          Create event page
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 pt-2 text-[10px] text-muted">
                Creating a page links this existing date to a new event — it never invents a registration.
                A date showing “none recorded” had no attendance captured in Hero at the time.
              </p>
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="px-3 py-2.5">Event</th><th className="px-3 py-2.5">When</th>
              <th className="px-3 py-2.5">People</th><th className="px-3 py-2.5">Link</th>
              <th className="px-3 py-2.5">Kind</th>
              <th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.id} className={`border-b border-border last:border-0 hover:bg-surface2/50 ${sel?.id === e.id ? 'bg-accent-soft/40' : ''}`}>
                <td className="px-3 py-2.5">
                  <p className="font-bold">
                    {e.country === 'MY' ? '🇲🇾' : '🇮🇩'} {e.title}
                    {isPast(e) && <Chip className="ml-1.5">past</Chip>}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-[11px] text-muted">
                  {meta[e.id]?.last
                    ? <>
                        {fmtDT(meta[e.id]!.first!, e.country)}
                        {meta[e.id]!.first !== meta[e.id]!.last && <> → {fmtDT(meta[e.id]!.last!, e.country)}</>}
                        <span className="ml-1 opacity-60">· {meta[e.id]!.sessions} date{meta[e.id]!.sessions > 1 ? 's' : ''}</span>
                      </>
                    : <span className="opacity-60">no dates yet</span>}
                </td>
                <td className="px-3 py-2.5 text-[11px]">
                  {meta[e.id]?.regs
                    ? <><b>{meta[e.id]!.regs}</b> registered
                        {meta[e.id]!.present > 0 && <span className="text-success"> · {meta[e.id]!.present} attended</span>}</>
                    : <span className="text-muted opacity-60">—</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted">/{cc(e.country)}/{e.slug}</td>
                <td className="px-3 py-2.5"><Chip>{e.kind}</Chip></td>
                <td className="px-3 py-2.5">
                  <Chip tone={e.status === 'published' ? 'success' : e.status === 'draft' ? 'warning' : 'default'}>{e.status}</Chip>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button type="button" onClick={() => setSel(sel?.id === e.id ? null : e)} className={btn}>{sel?.id === e.id ? 'Close' : 'Manage'}</button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">No events yet — create the first one.</td></tr>}
          </tbody>
        </table>
      </Card>

      {/* ---------- selected event ---------- */}
      {sel && (
        <>
          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            {/* publish + links + QR */}
            <Card className="p-4">
              <p className="mb-1 text-sm font-extrabold">{sel.title}</p>
              <p className="mb-3 text-[11px] text-muted">{sel.description || '—'}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {sel.status !== 'published' && sel.status !== 'archived' && <button type="button" onClick={() => setStatus(sel, 'published')} className={gold}>🚀 Publish</button>}
                {sel.status === 'published' && <button type="button" onClick={() => setStatus(sel, 'closed')} className={btn}>Close registrations</button>}
                {sel.status === 'archived' && <button type="button" onClick={() => setStatus(sel, 'closed')} className={btn}>Unarchive</button>}
                {sel.status !== 'archived' && rows.length > 0 && (
                  <button type="button" onClick={() => window.confirm('Archive this event? It keeps all registrations and leaves the active list.') && setStatus(sel, 'archived')} className={btn}>📦 Archive</button>
                )}
                {rows.length === 0 && (
                  <button type="button" disabled={busy} onClick={() => deleteEvent(sel)}
                    className="cursor-pointer rounded-xl border border-danger/50 px-3 py-2 text-xs font-bold text-danger hover:bg-danger/10 disabled:opacity-40">
                    🗑 Delete
                  </button>
                )}
              </div>
              <p className="mb-3 text-[10px] text-muted">
                {rows.length === 0 ? 'No registrations yet — a mistake can be deleted.' : `${rows.length} registrations — archive keeps them, delete is disabled.`}
              </p>
              {/* registration window — defaults open; walk-in at the venue on by default */}
              <div className="mb-3 rounded-xl border border-border p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted">Registration window</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-muted">Online registration closes</label>
                  <input type="datetime-local" className={inp}
                    defaultValue={sel.registration_closes_at ? toLocalInput(sel.registration_closes_at, sel.country) : ''}
                    onBlur={async (e) => {
                      if (!supabase) return
                      const v = e.target.value ? `${e.target.value}:00${tzOf(sel.country)}` : null
                      const { error } = await supabase.from('events').update({ registration_closes_at: v }).eq('id', sel.id)
                      if (error) say('⚠ ' + error.message); else { say(v ? 'Cutoff saved' : 'Registration stays open'); await loadEvents(); setSel({ ...sel, registration_closes_at: v }) }
                    }} />
                  <span className="text-[10px] text-muted">(blank = open, people can register during the event)</span>
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] font-semibold">
                  <input type="checkbox" checked={sel.allow_walkin !== false}
                    onChange={async (e) => {
                      if (!supabase) return
                      const { error } = await supabase.from('events').update({ allow_walkin: e.target.checked }).eq('id', sel.id)
                      if (error) say('⚠ ' + error.message); else { await loadEvents(); setSel({ ...sel, allow_walkin: e.target.checked }) }
                    }} className="h-4 w-4" style={{ accentColor: 'var(--accent)' }} />
                  Allow registration at the venue on event day (walk-in via check-in QR)
                </label>
              </div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Public link</p>
              <div className="mb-3 flex gap-1.5">
                <input readOnly value={`${ORIGIN}/${cc(sel.country)}/${sel.slug}`} className={`${inp} font-mono text-[11px]`} />
                <button type="button" className={btn}
                  onClick={() => { navigator.clipboard?.writeText(`${ORIGIN}/${cc(sel.country)}/${sel.slug}`); say('Link copied') }}>Copy</button>
              </div>
              <p className="mb-2 text-[10px] text-muted">
                Agents share <span className="font-mono">?ref=&lt;their phone&gt;</span> to get credit for every registration.
              </p>
              {qr && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <img src={qr.link} alt="Registration QR" className="mx-auto w-full max-w-[150px] rounded-lg bg-white p-1" />
                    <p className="mt-1 text-[10px] font-bold">Registration QR</p>
                    <a href={qr.link} download={`${sel.slug}-register-qr.png`} className="text-[10px] text-accent underline">download</a>
                  </div>
                  <div className="text-center">
                    <img src={qr.checkin} alt="Check-in QR" className="mx-auto w-full max-w-[150px] rounded-lg bg-white p-1" />
                    <p className="mt-1 text-[10px] font-bold">Venue check-in QR · code {sel.checkin_code}</p>
                    <a href={qr.checkin} download={`${sel.slug}-checkin-qr.png`} className="text-[10px] text-accent underline">download</a>
                    <p className="text-[9px] text-danger">show ONLY at the venue</p>
                  </div>
                </div>
              )}
            </Card>

            {/* dates */}
            <Card className="p-4 xl:col-span-2">
              <p className="mb-2 text-sm font-extrabold">Dates · {sessions.filter((s) => s.active).length} active</p>
              {sessions.map((s) => (
                <div key={s.id} className={`mb-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-xs ${!s.active ? 'opacity-50' : ''}`}>
                  <Chip tone={s.type === 'online' ? 'info' : 'accent'}>{s.type === 'online' ? '🎥 online' : '🏢 physical'}</Chip>
                  <span className="font-bold">{fmtDT(s.starts_at, sel.country)}</span>
                  <span className="truncate text-muted">{s.title}</span>
                  <span className="text-muted">· {rows.filter((r) => r.session_id === s.id).length} registered{s.capacity ? ` / ${s.capacity}` : ''}</span>
                  <span className="flex-1" />
                  <button type="button" onClick={() => toggleSession(s)} className={btn}>{s.active ? 'Deactivate' : 'Reactivate'}</button>
                </div>
              ))}
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <select className={inp} value={sf.type} onChange={(e) => setSf({ ...sf, type: e.target.value })}>
                  <option value="online">🎥 Online (Gmeet/Zoom)</option><option value="physical">🏢 Physical (venue)</option>
                </select>
                <input className={inp} type="date" value={sf.date} onChange={(e) => setSf({ ...sf, date: e.target.value })} />
                <input className={inp} type="time" value={sf.time} onChange={(e) => setSf({ ...sf, time: e.target.value })} />
                <input className={inp} placeholder="Session title (optional)" value={sf.title} onChange={(e) => setSf({ ...sf, title: e.target.value })} />
                {sf.type === 'online' ? (
                  <input className={`${inp} md:col-span-2`} placeholder="Join link (Meet/Zoom) — revealed only after registration" value={sf.link} onChange={(e) => setSf({ ...sf, link: e.target.value })} />
                ) : (
                  <>
                    <input className={inp} placeholder="Venue name + address" value={sf.location} onChange={(e) => setSf({ ...sf, location: e.target.value })} />
                    <input className={inp} placeholder="Google Maps link" value={sf.map_url} onChange={(e) => setSf({ ...sf, map_url: e.target.value })} />
                  </>
                )}
                <input className={inp} type="number" placeholder="Capacity (optional)" value={sf.capacity} onChange={(e) => setSf({ ...sf, capacity: e.target.value })} />
                <button type="button" disabled={busy || !sf.date} onClick={addSession} className={gold}>+ Add date</button>
              </div>
            </Card>
          </div>

          {/* ---------- board / certificate tabs ---------- */}
          <div className="mb-3 flex gap-1.5">
            {(['board', 'certificate'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold ${tab === t ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink'}`}>
                {t === 'board' ? '👥 Registrations' : '🎓 Certificate'}
              </button>
            ))}
          </div>
          {tab === 'certificate' && <CertificatePanel ev={sel} say={say} />}
          {tab === 'board' && <>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[['Registered', stats.reg, 'var(--accent)'], ['Present', stats.present, '#43c59e'], ['No-show', stats.noshow, '#f4826d'],
              ['Joined IQI', stats.joined, '#a78bfa'], ['Via agent', stats.viaAgent, '#4f9cf9']].map(([l, v, c]) => (
              <Card key={String(l)} className="p-3.5">
                <p className="font-display text-xl font-extrabold" style={{ color: String(c) }}>{v as number}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">{l}</p>
              </Card>
            ))}
          </div>

          <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
            <select value={String(sessF)} onChange={(e) => setSessF(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="h-10 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
              <option value="all">All dates</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{fmtDT(s.starts_at, sel.country)} · {s.type}</option>)}
            </select>
            <div className="relative min-w-[200px] flex-1">
              <input value={rq} onChange={(e) => setRq(e.target.value)}
                placeholder="Search people — name, phone, email, agent, remarks…"
                className="h-10 w-full rounded-xl border border-border bg-surface pl-3 pr-8 text-sm outline-none focus:border-accent" />
              {rq && (
                <button type="button" onClick={() => setRq('')} aria-label="Clear"
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted hover:text-ink">×</button>
              )}
            </div>
            <div className="flex gap-1.5">
              {([['all', 'All'], ['attended', 'Attended'], ['no_show', 'No-show'], ['pending', 'Not marked']] as const)
                .map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setAttF(k)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold ${
                      attF === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink'}`}>
                    {label}
                  </button>
                ))}
            </div>
            {/* Remarks filter. The floor writes the referrer's name in here, so
                picking one value answers "who did BU MITA actually bring, and
                how many turned up?" — the stat tiles above follow the filter. */}
            <select value={remF} onChange={(e) => setRemF(e.target.value)} aria-label="Filter by remark"
              className={`h-10 max-w-[230px] cursor-pointer rounded-xl border bg-surface px-3 text-sm outline-none ${
                remF === 'all' ? 'border-border' : 'border-accent text-accent'}`}>
              <option value="all">All remarks</option>
              <option value="any">Has a remark · {remarkOpts.any}</option>
              <option value="none">No remark yet · {remarkOpts.none}</option>
              {remarkOpts.list.length > 0 && (
                <optgroup label="Exact remark">
                  {remarkOpts.list.map((o) => (
                    <option key={o.key} value={o.key}>{o.label} · {o.n}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {remF !== 'all' && (
              <button type="button" onClick={() => setRemF('all')}
                className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted hover:text-ink">
                Clear remark filter
              </button>
            )}
            {byAgent.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {byAgent.slice(0, 6).map((a) => (
                  <Chip key={a.name} tone="accent">🎖 {a.name} · {a.n}{a.present ? ` (${a.present} ✓)` : ''}</Chip>
                ))}
              </div>
            )}
            <span className="flex-1" />
            <button type="button" className={btn} onClick={() => loadDetail(sel)}>↻ Refresh</button>
            <button type="button" className={btn}
              onClick={() => {
                if (!shown.length) { say('Nothing to export'); return }
                exportCsv(`${sel.slug}-registrations`, shown.map((r) => ({
                  name: r.name, phone: r.phone_norm, email: r.email, session: r.session_title, starts_at: r.starts_at, mode: r.type,
                  source: r.source, via_agent: r.referred_name ?? r.caller_name ?? '',
                  attended: r.attended, attended_at: r.attended_at, method: r.checkin_method,
                  joined: r.joined ? 'YES' : '', friends: r.friends, remarks: r.remarks, registered_at: r.registered_at,
                })))
                say(`Exported ${shown.length} rows`)
              }}>⬇ CSV</button>
          </Card>

          <Card className="divide-y divide-border">
            {shown.length === 0 && (
              <p className="p-6 text-center text-xs text-muted">
                {rows.length === 0
                  ? 'No registrations yet. Share the link or let callers book "Attend BOP".'
                  : `No one matches this filter. ${rows.length} registration${rows.length > 1 ? 's' : ''} in total.`}
              </p>
            )}
            {shown.map((r) => {
              const fresh = Date.now() - new Date(r.registered_at).getTime() < 10 * 60000
              const others = sessions.filter((s) => s.active && s.id !== r.session_id && new Date(s.starts_at) > new Date())
              return (
                <div key={`${r.session_id}-${r.lead_id}`} className="p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{r.name ?? 'Unnamed'}</span>
                    {fresh && <span className="animate-pulse rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-extrabold text-on-accent">NEW</span>}
                    <span className="text-muted">{r.phone_norm}</span>
                    {r.email && <span className="text-muted">✉ {r.email}</span>}
                    <Chip>{r.source}</Chip>
                    {(r.referred_name || r.caller_name) && <Chip tone="accent">🎖 {r.referred_name ?? r.caller_name}</Chip>}
                    <span className="text-muted">{fmtDT(r.starts_at, sel.country)} · {r.type}</span>
                    <span className="flex-1" />
                    <label className="flex cursor-pointer items-center gap-1.5 font-bold">
                      <input type="checkbox" checked={r.attended === 'attended'}
                        onChange={(e) => patchRow(r, e.target.checked
                          ? { attended: 'attended', attended_at: new Date().toISOString(), checkin_method: 'admin' }
                          : { attended: 'pending', attended_at: null, checkin_method: null })}
                        className="h-4 w-4" style={{ accentColor: '#43c59e' }} />
                      <span className={r.attended === 'attended' ? 'text-success' : r.attended === 'no_show' ? 'text-danger' : 'text-muted'}>
                        {r.attended === 'attended' ? `Present${r.checkin_method ? ` · ${r.checkin_method}` : ''}` : r.attended === 'no_show' ? 'No-show' : 'Present?'}
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 font-bold">
                      <input type="checkbox" checked={r.joined}
                        onChange={(e) => patchRow(r, { joined: e.target.checked, joined_at: e.target.checked ? new Date().toISOString() : null },
                          e.target.checked ? '🎉 Marked as joined IQI' : undefined)}
                        className="h-4 w-4" style={{ accentColor: '#a78bfa' }} />
                      <span className={r.joined ? 'text-[#a78bfa]' : 'text-muted'}>Joined</span>
                    </label>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {r.friends && <span className="text-muted">👥 {r.friends}</span>}
                    <input defaultValue={r.remarks ?? ''} placeholder="Remarks…"
                      onBlur={(e) => e.target.value !== (r.remarks ?? '') && patchRow(r, { remarks: e.target.value || null })}
                      className="h-8 min-w-[160px] flex-1 rounded-lg border border-border bg-surface px-2 text-xs outline-none focus:border-accent" />
                    {r.attended !== 'attended' && others.length > 0 && !r.rebooked_to && (
                      <select defaultValue="" onChange={(e) => e.target.value && rebook(r, Number(e.target.value))}
                        className="h-8 cursor-pointer rounded-lg border border-warning/50 bg-surface px-2 text-xs font-bold text-warning outline-none">
                        <option value="">↪ Rebook to…</option>
                        {others.map((s) => <option key={s.id} value={s.id}>{fmtDT(s.starts_at, sel.country)} · {s.type}</option>)}
                      </select>
                    )}
                    {r.rebooked_to && <Chip tone="warning">↪ rebooked</Chip>}
                    {r.phone_norm && (
                      <a href={`https://wa.me/${r.phone_norm.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                        className="rounded-lg border border-border px-2 py-1 text-xs font-bold text-muted no-underline hover:text-ink">🟢 WA</a>
                    )}
                    {/* One tap: WhatsApp opens with the group-invite message
                        (WhatsApp + Telegram links) ready — admin just hits send. */}
                    {r.phone_norm && inviteLinks.length > 0 && (
                      invited[r.lead_id]
                        ? <Chip tone="success">✉ invited</Chip>
                        : <button type="button"
                            onClick={() => inviteToGroups(r)}
                            className="cursor-pointer rounded-lg border border-accent/60 px-2 py-1 text-xs font-bold text-accent">
                            ➕ Invite to groups
                          </button>
                    )}
                  </div>
                </div>
              )
            })}
          </Card>
          </>}
        </>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>
      )}
    </>
  )
}
