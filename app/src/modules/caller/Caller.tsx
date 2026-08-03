/* Marketing4U caller — the agent flow, on live data (spec §2/§3/§4).
   One lead at a time, server-computed hold, dispositions loaded from the DB
   (m4u_dispositions) so cooldown rules can be retuned without a deploy. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Phone, MessageCircle, Clock, AlertTriangle, Trophy, FolderOpen, Home as HomeIcon } from 'lucide-react'
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

const pill = (label: string): 'success' | 'info' | 'warning' | 'danger' | 'default' =>
  label === 'Booked' || label.startsWith('BOP') ? 'success'
    : label === 'New' ? 'info'
    : label === 'Callback' || label === 'No Answer' || label === 'Warm' ? 'warning'
    : label === 'Wrong Number' || label === 'Not a Real Number' ? 'danger' : 'default'

type Tab = 'home' | 'followups' | 'booked' | 'projects'

export default function Caller() {
  const { user } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [tab, setTab] = useState<Tab>('home')
  const [lead, setLead] = useState<Lead | null>(null)
  const [prop, setProp] = useState<Prop | null>(null)
  const [disps, setDisps] = useState<Disp[]>([])
  const [fields, setFields] = useState<FieldDef[]>([])
  const [history, setHistory] = useState<Attempt[]>([])
  const [secs, setSecs] = useState(0)
  const [dispo, setDispo] = useState('')
  const [note, setNote] = useState('')
  const [bop, setBop] = useState('')
  const [bopSessions, setBopSessions] = useState<{ id: number; title: string; type: string; starts_at: string }[]>([])
  const [followups, setFollowups] = useState<Lead[]>([])
  const [booked, setBooked] = useState<Lead[]>([])
  const [projects, setProjects] = useState<{ property_id: number; approved: boolean; active: boolean; m4u_properties: Prop | null }[]>([])
  const [quote, setQuote] = useState<{ body: string; author: string | null } | null>(null)
  const [stats, setStats] = useState({ calls: 0, booked: 0, owned: 0 })
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const tick = useRef<number | null>(null)
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }
  const country = (user?.country ?? 'MY') as Country

  /* ---------- reference data ---------- */
  const loadRef = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    // pause state is authoritative in the DB (the expiry sweep sets it)
    const { data: me } = await supabase.from('profiles').select('status').eq('id', user.id).single()
    setPaused((me as { status: string } | null)?.status === 'paused')
    const [d, f, q, b, g] = await Promise.all([
      supabase.from('m4u_dispositions').select('*').eq('country', country).eq('active', true).order('sort_order'),
      supabase.from('m4u_field_settings').select('*').eq('country', country).order('sort_order'),
      supabase.from('quotes').select('body,author').eq('country', country).eq('active', true),
      supabase.from('bop_sessions').select('id,title,type,starts_at').eq('country', country)
        .eq('active', true).gte('starts_at', new Date().toISOString()).order('starts_at'),
      supabase.from('m4u_grants').select('property_id,approved,active,m4u_properties(id,name,type,description)')
        .eq('agent_id', user.id),
    ])
    setDisps((d.data as Disp[]) ?? [])
    setFields((f.data as FieldDef[]) ?? [])
    const qs = (q.data as { body: string; author: string | null }[]) ?? []
    if (qs.length) setQuote(qs[Math.floor(Math.random() * qs.length)])
    setBopSessions((b.data as typeof bopSessions) ?? [])
    setProjects((g.data as unknown as typeof projects) ?? [])
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

  useEffect(() => { loadRef(); loadMine() }, [loadRef, loadMine])

  /* ---------- countdown ---------- */
  useEffect(() => {
    if (tick.current) window.clearInterval(tick.current)
    if (!lead || secs <= 0) return
    tick.current = window.setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          window.clearInterval(tick.current!)
          setLead(null)
          say('⏱ Time up — the lead went back to the queue.')
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
    const [l, h] = await Promise.all([
      supabase.from('m4u_leads').select('*').eq('id', id).single(),
      supabase.from('m4u_attempts').select('id,disposition,note,called_at').eq('lead_id', id)
        .order('called_at', { ascending: false }).limit(3),
    ])
    const row = l.data as Lead | null
    setLead(row); setSecs(seconds); setHistory((h.data as Attempt[]) ?? [])
    setDispo(''); setNote(''); setBop('')
    if (row?.property_id) {
      const { data: p } = await supabase.from('m4u_properties')
        .select('id,name,type,description').eq('id', row.property_id).single()
      setProp((p as Prop) ?? null)
    } else setProp(null)
  }, [])

  const getNext = async () => {
    if (!supabase) return
    setBusy(true)
    const { data, error } = await supabase.rpc('m4u_next_lead')
    setBusy(false)
    if (error) {
      if (error.message.includes('paused')) { setPaused(true); return }
      say('⚠ ' + error.message); return
    }
    const row = (data as { lead_id: number; seconds_left: number; resumed: boolean }[])?.[0]
    if (!row?.lead_id) { say('No leads available right now — try again shortly.'); return }
    if (row.resumed) say('Resuming the lead you were holding')
    openLead(row.lead_id, row.seconds_left)
  }

  const submit = async () => {
    if (!supabase || !lead || !dispo) return
    const rule = disps.find((d) => d.key === dispo)
    if (rule?.bop_type && !bop) { say('Pick a BOP session first'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('m4u_disposition', {
      p_lead: lead.id, p_key: dispo, p_note: note || null,
      p_bop_session: bop ? Number(bop) : null,
    })
    setBusy(false)
    if (error) {
      if (error.message.includes('conflict')) { say('That lead moved on — fetching the next one'); setLead(null); getNext(); return }
      say('⚠ ' + error.message); return
    }
    const res = data as { label: string; dead: boolean; locked: boolean }
    say(res.locked ? `🏆 ${res.label} — locked to you` : `Saved: ${res.label}`)
    setLead(null); setSecs(0); loadMine()
  }

  const release = async () => {
    if (!supabase || !lead) return
    await supabase.rpc('m4u_release', { p_lead: lead.id })
    setLead(null); setSecs(0); say('Returned to the queue'); loadMine()
  }

  if (!user) return null
  if (!isReal) return null

  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  const hot = lead?.custom_fields?.waktu_survey?.includes('minggu ini')
  const nurture = lead?.custom_fields?.waktu_survey?.includes('lihat')
  const rule = disps.find((d) => d.key === dispo)
  const problem = lead ? phoneProblem(lead.phone_norm) : null

  /* ---------- paused ---------- */
  if (paused) return (
    <div className="animate-rise px-4 pt-5">
      <Card className="p-6 text-center">
        <AlertTriangle size={28} className="mx-auto mb-3 text-warning" />
        <p className="font-display text-base font-extrabold">You are paused</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          A lead timed out while you were holding it. Ask to continue and you can call again straight away.
        </p>
        <button type="button" disabled={busy}
          onClick={async () => {
            if (!supabase) return
            setBusy(true)
            const { data } = await supabase.rpc('m4u_reactivate')
            setBusy(false)
            if (data) { setPaused(false); say('Welcome back — you can call again') }
          }}
          className="mt-4 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
          Request to continue
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

      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {([['home', 'Home', HomeIcon], ['followups', `Follow-ups${followups.length ? ` (${followups.length})` : ''}`, Clock],
           ['booked', `Booked${booked.length ? ` (${booked.length})` : ''}`, Trophy], ['projects', 'Projects', FolderOpen]] as const)
          .map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k as Tab)}
            className={clsx('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-extrabold',
              tab === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* ---------------- HOME ---------------- */}
      {tab === 'home' && !lead && (
        <>
          {quote && (
            <Card className="mb-3 p-4">
              <p className="text-sm italic">“{quote.body}”</p>
              <p className="mt-1 text-[11px] text-muted">— {quote.author ?? 'AG'}</p>
            </Card>
          )}
          <div className="mb-3 grid grid-cols-3 gap-2">
            {([['Calls today', stats.calls], ['Booked today', stats.booked], ['Leads owned', stats.owned]] as const).map(([l, v]) => (
              <Card key={l} className="p-3 text-center">
                <p className="font-display text-xl font-extrabold text-accent">{v}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">{l}</p>
              </Card>
            ))}
          </div>
          <button type="button" disabled={busy} onClick={getNext}
            className="flex h-16 w-full cursor-pointer flex-col items-center justify-center rounded-2xl bg-accent text-on-accent disabled:opacity-40">
            <span className="font-display text-base font-extrabold">{busy ? 'Finding…' : 'Get Next Lead'}</span>
            <span className="text-[11px] opacity-85">one lead at a time · 25 minutes to disposition</span>
          </button>
        </>
      )}

      {/* ---------------- LEAD CARD ---------------- */}
      {lead && (
        <Card className="mb-4 overflow-hidden">
          <div className={clsx('flex items-center justify-between px-4 py-2.5 text-xs font-bold',
            secs <= 120 ? 'bg-danger/15 text-danger' : 'bg-surface2 text-muted')}>
            <span>⏱ {mm}:{ss} to disposition</span>
            <button type="button" onClick={release} className="cursor-pointer underline">release</button>
          </div>
          <div className="p-4">
            <div className="mb-2 flex items-center gap-3">
              <Avatar name={lead.name ?? 'Lead'} color="var(--accent)" size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{lead.name ?? 'Unnamed lead'}</p>
                <p className="text-xs text-muted">{prop?.name ?? 'Unassigned (triage)'}</p>
              </div>
              <Chip tone={pill(lead.current_label)}>{lead.current_label}</Chip>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {hot && <Chip tone="warning">🔥 HOT</Chip>}
              {nurture && <Chip tone="success">🌱 Nurture</Chip>}
              {lead.attempt_count > 0 && <Chip>↻ {lead.attempt_count} attempts</Chip>}
            </div>

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
                ⚠ This number cannot be dialled ({problem}). Tell an admin to correct it.
              </p>
            ) : (
              <div className="mb-1 flex gap-2.5">
                <a href={telHref(lead.phone_norm, lead.phone, country) ?? '#'}
                  className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-on-accent no-underline">
                  <Phone size={16} /> Call
                </a>
                <a href={waHref(lead.phone_norm, `Hi ${(lead.name ?? '').split(' ')[0]}, saya dari IQI berkenaan ${prop?.name ?? ''} 😊`, lead.phone, country) ?? '#'}
                  target="_blank" rel="noreferrer"
                  className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold no-underline hover:border-accent/60">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              </div>
            )}
            <p className="mb-3 text-center text-[11px] text-muted">{displayPhone(lead.phone_norm)}</p>

            {history.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Recent attempts</p>
                {history.map((h) => (
                  <p key={h.id} className="border-b border-border py-1.5 text-[11px] text-muted last:border-0">
                    <b className="text-ink">{h.disposition}</b>{h.note ? ` · “${h.note}”` : ''} · {new Date(h.called_at).toLocaleDateString()}
                  </p>
                ))}
              </div>
            )}

            {/* dispositions — straight from the DB for this project type */}
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Outcome</p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {disps.filter((d) => d.project_type === (prop?.type ?? 'property')).map((d) => (
                <button key={d.key} type="button" onClick={() => setDispo(d.key)}
                  className={clsx('cursor-pointer rounded-xl border p-2.5 text-left',
                    dispo === d.key ? (d.is_win ? 'border-accent bg-accent-soft' : 'border-accent bg-accent-soft')
                      : 'border-border hover:border-accent/50', d.is_win && 'col-span-2')}>
                  <span className={clsx('block text-xs font-extrabold', d.is_win && 'text-accent')}>{d.key}</span>
                  <span className="mt-0.5 block text-[10px] text-muted">{d.hint}</span>
                </button>
              ))}
            </div>

            {rule?.bop_type && (
              <select value={bop} onChange={(e) => setBop(e.target.value)} aria-label="BOP session"
                className="mb-2 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
                <option value="">Pick a {rule.bop_type} BOP session…</option>
                {bopSessions.filter((s) => s.type === rule.bop_type).map((s) => (
                  <option key={s.id} value={s.id}>{s.title} — {new Date(s.starts_at).toLocaleString()}</option>
                ))}
              </select>
            )}

            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)…"
              className="mb-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <button type="button" disabled={busy || !dispo} onClick={submit}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {busy ? 'Saving…' : 'Submit & Next Lead'}
            </button>
          </div>
        </Card>
      )}

      {/* ---------------- LISTS ---------------- */}
      {tab === 'followups' && !lead && (
        <>
          <SectionTitle>My follow-ups ({followups.length})</SectionTitle>
          {followups.length === 0 && <Card className="p-5 text-center text-xs text-muted">Nothing reserved for you right now.</Card>}
          {followups.map((l) => (
            <Card key={l.id} className="mb-2 flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{l.name ?? 'Unnamed'}</p>
                <p className="text-[11px] text-muted">{displayPhone(l.phone_norm)} · until {l.reserved_until ? new Date(l.reserved_until).toLocaleString() : '—'}</p>
              </div>
              <Chip tone={pill(l.current_label)}>{l.current_label}</Chip>
            </Card>
          ))}
        </>
      )}

      {tab === 'booked' && !lead && (
        <>
          <SectionTitle>Booked — yours forever ({booked.length})</SectionTitle>
          {booked.length === 0 && <Card className="p-5 text-center text-xs text-muted">No bookings yet. The next call could be the one 🔥</Card>}
          {booked.map((l) => (
            <Card key={l.id} className="mb-2 flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{l.name ?? 'Unnamed'}</p>
                <p className="text-[11px] text-muted">{displayPhone(l.phone_norm)}</p>
              </div>
              <a href={waHref(l.phone_norm, undefined, l.phone, country) ?? '#'} target="_blank" rel="noreferrer"
                className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold no-underline">WhatsApp</a>
            </Card>
          ))}
        </>
      )}

      {tab === 'projects' && !lead && (
        <>
          <SectionTitle>My projects</SectionTitle>
          {projects.length === 0 && <Card className="p-5 text-center text-xs text-muted">No projects assigned yet — ask your admin.</Card>}
          {projects.map((g) => (
            <Card key={g.property_id} className="mb-2 flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{g.m4u_properties?.name ?? `Project ${g.property_id}`}</p>
                <p className="text-[11px] text-muted">{g.m4u_properties?.type}</p>
              </div>
              {!g.approved ? <Chip tone="warning">pending approval</Chip>
                : g.active ? <Chip tone="success">active</Chip>
                : <Chip>approved · off</Chip>}
              {g.approved && (
                <button type="button"
                  onClick={async () => {
                    if (!supabase) return
                    await supabase.from('m4u_grants').update({ active: !g.active })
                      .eq('agent_id', user.id).eq('property_id', g.property_id)
                    loadRef(); say(g.active ? 'Paused — no new leads from this project' : 'Active — leads can come to you')
                  }}
                  className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold">
                  {g.active ? 'Turn off' : 'Turn on'}
                </button>
              )}
            </Card>
          ))}
        </>
      )}

      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
