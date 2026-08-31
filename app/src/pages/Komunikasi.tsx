/* Komunikasi — "Command Radio" (099). The one ren module Hero lacked.
   Country War Room + per-pod Squad channels + direct messages. Membership is
   computed server-side; this page only reads fn_comms_overview and posts
   through fn_comms_send. A DM notifies the other person via web push. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Send, Search, RefreshCw, Radio, Users, MessageCircle } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { Card } from '../components/ui'

interface Channel { id: string; kind: 'warroom' | 'squad' | 'dm'; title: string | null; last_body: string | null; last_at: string | null; unread: number }
interface Msg { id: string; sender_id: string; body: string; created_at: string }

const KIND_ICON = { warroom: Radio, squad: Users, dm: MessageCircle }

export default function Komunikasi() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')

  const [channels, setChannels] = useState<Channel[]>([])
  const [active, setActive] = useState<Channel | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')
  // new DM
  const [dmSearch, setDmSearch] = useState('')
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  const loadChannels = useCallback(async () => {
    if (!isReal || !supabase) { setState('ready'); return }
    const { data, error } = await supabase.rpc('fn_comms_overview')
    if (error) { setErr(error.message); setState('error'); return }
    setChannels((data as unknown as Channel[]) ?? [])
    setState('ready')
  }, [isReal])
  useEffect(() => { loadChannels() }, [loadChannels])

  useEffect(() => {
    if (!isReal || !supabase) return
    supabase.from('profiles').select('id,name').eq('status', 'active').order('name')
      .then(({ data }) => setRoster((data as typeof roster) ?? []))
  }, [isReal])

  const openChannel = useCallback(async (ch: Channel) => {
    if (!supabase) return
    setActive(ch); setMsgs([])
    const { data } = await supabase.from('comms_messages')
      .select('id,sender_id,body,created_at').eq('channel_id', ch.id)
      .order('created_at', { ascending: true }).limit(200)
    const rows = (data as Msg[]) ?? []
    setMsgs(rows)
    const need = [...new Set(rows.map((m) => m.sender_id))].filter((id) => !names[id])
    if (need.length) {
      const { data: ps } = await supabase.from('profiles').select('id,name').in('id', need)
      setNames((n) => ({ ...n, ...Object.fromEntries(((ps as { id: string; name: string }[]) ?? []).map((p) => [p.id, p.name])) }))
    }
    await supabase.rpc('fn_comms_mark_read', { p_channel: ch.id })
    setChannels((cs) => cs.map((c) => (c.id === ch.id ? { ...c, unread: 0 } : c)))
    setTimeout(() => endRef.current?.scrollIntoView(), 60)
  }, [names])

  // light polling while a channel is open (no realtime dependency)
  useEffect(() => {
    if (!active || !supabase) return
    const t = setInterval(async () => {
      const { data } = await supabase!.from('comms_messages')
        .select('id,sender_id,body,created_at').eq('channel_id', active.id)
        .order('created_at', { ascending: true }).limit(200)
      const rows = (data as Msg[]) ?? []
      setMsgs((prev) => (rows.length !== prev.length ? rows : prev))
      if (rows.length) supabase!.rpc('fn_comms_mark_read', { p_channel: active.id })
    }, 6000)
    return () => clearInterval(t)
  }, [active])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  const send = async () => {
    if (!supabase || !active || !draft.trim()) return
    setBusy(true)
    const body = draft.trim()
    setDraft('')
    const { error } = await supabase.rpc('fn_comms_send', { p_channel: active.id, p_body: body })
    setBusy(false)
    if (error) { setErr(error.message); setDraft(body); return }
    const { data } = await supabase.from('comms_messages')
      .select('id,sender_id,body,created_at').eq('channel_id', active.id)
      .order('created_at', { ascending: true }).limit(200)
    setMsgs((data as Msg[]) ?? [])
  }

  const startDm = async (otherId: string) => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('fn_comms_start_dm', { p_other: otherId })
    if (error) { setErr(error.message); return }
    const chId = (data as { channel_id: string }).channel_id
    await loadChannels()
    setDmSearch('')
    const { data: over } = await supabase.rpc('fn_comms_overview')
    const found = ((over as unknown as Channel[]) ?? []).find((c) => c.id === chId)
    if (found) openChannel(found)
  }

  const dmResults = useMemo(() => {
    const n = dmSearch.trim().toLowerCase()
    if (!n) return []
    return roster.filter((r) => r.id !== user?.id && r.name.toLowerCase().includes(n)).slice(0, 6)
  }, [dmSearch, roster, user])

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (!isReal) return (
    <div className="mx-auto max-w-lg px-4 py-6 md:max-w-3xl">
      <Card className="p-6 text-center text-sm text-muted">
        {L('Sign in with your real account to use Command Radio.',
           'Log masuk dengan akaun sebenar anda untuk guna Command Radio.',
           'Masuk dengan akun asli Anda untuk memakai Command Radio.')}
      </Card>
    </div>
  )

  return (
    <div className="mx-auto flex h-[100dvh] max-w-lg flex-col px-4 pb-24 pt-5 md:max-w-3xl">
      <header className="mb-3 flex items-center gap-3">
        {active ? (
          <button type="button" onClick={() => setActive(null)} aria-label="Back to channels"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted">
            <ArrowLeft size={18} />
          </button>
        ) : (
          <Link to="/team" aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted">
            <ArrowLeft size={18} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">
            {active ? (active.title ?? L('Direct message', 'Mesej terus', 'Pesan langsung')) : L('Command Radio', 'Command Radio', 'Command Radio')}
          </p>
          <p className="truncate text-[11px] text-muted">
            {active
              ? (active.kind === 'warroom' ? L('Everyone in your country', 'Semua di negara anda', 'Semua di negara Anda')
                 : active.kind === 'squad' ? L('Your squad', 'Skuad anda', 'Skuad Anda') : L('Just the two of you', 'Anda berdua sahaja', 'Hanya kalian berdua'))
              : L('War Room · Squads · Direct messages', 'War Room · Skuad · Mesej terus', 'War Room · Skuad · Pesan langsung')}
          </p>
        </div>
        {!active && (
          <button type="button" onClick={loadChannels} aria-label="Refresh"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted">
            <RefreshCw size={15} className={state === 'loading' ? 'animate-spin' : ''} />
          </button>
        )}
      </header>

      {state === 'error' && <Card className="p-4 text-center text-sm text-danger">⚠ {err}</Card>}

      {/* -------- CHANNEL LIST -------- */}
      {!active && state === 'ready' && (
        <div className="flex-1 overflow-y-auto">
          {/* start a DM */}
          <div className="relative mb-3">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={dmSearch} onChange={(e) => setDmSearch(e.target.value)}
              placeholder={L('Message someone…', 'Mesej seseorang…', 'Pesan seseorang…')}
              className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent" />
            {dmResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-bg shadow-lg">
                {dmResults.map((r) => (
                  <button key={r.id} type="button" onClick={() => startDm(r.id)}
                    className="block w-full cursor-pointer px-3 py-2.5 text-left text-sm hover:bg-surface2">{r.name}</button>
                ))}
              </div>
            )}
          </div>

          {channels.length === 0 && (
            <Card className="p-6 text-center text-xs text-muted">
              {L('No channels yet. Your War Room appears once you have a country set.',
                 'Belum ada saluran. War Room anda muncul apabila negara anda ditetapkan.',
                 'Belum ada channel. War Room Anda muncul setelah negara Anda diatur.')}
            </Card>
          )}
          <div className="space-y-2">
            {channels.map((c) => {
              const Icon = KIND_ICON[c.kind]
              return (
                <button key={c.id} type="button" onClick={() => openChannel(c)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:border-accent/50">
                  <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                    c.kind === 'warroom' ? 'bg-danger/12 text-danger' : c.kind === 'squad' ? 'bg-accent-soft text-accent' : 'bg-surface2 text-muted')}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{c.title ?? L('Direct message', 'Mesej terus', 'Pesan langsung')}</p>
                    <p className="truncate text-[12px] text-muted">{c.last_body ?? L('No messages yet', 'Belum ada mesej', 'Belum ada pesan')}</p>
                  </div>
                  {c.last_at && <span className="shrink-0 text-[10px] text-muted">{fmtTime(c.last_at)}</span>}
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-extrabold text-on-accent">{c.unread}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* -------- THREAD -------- */}
      {active && (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto pb-2">
            {msgs.length === 0 && <p className="py-8 text-center text-xs text-muted">{L('Say something first.', 'Mulakan perbualan.', 'Mulai obrolan.')}</p>}
            {msgs.map((m) => {
              const mine = m.sender_id === user!.id
              return (
                <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={clsx('max-w-[80%] rounded-2xl px-3.5 py-2', mine ? 'bg-accent text-on-accent' : 'border border-border bg-surface')}>
                    {!mine && active.kind !== 'dm' && <p className="mb-0.5 text-[10px] font-bold text-accent">{names[m.sender_id] ?? '…'}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
                    <p className={clsx('mt-0.5 text-right text-[9px]', mine ? 'text-on-accent/70' : 'text-muted')}>{fmtTime(m.created_at)}</p>
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
          <div className="flex items-end gap-2 border-t border-border pt-2">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={L('Message…', 'Mesej…', 'Pesan…')}
              className="max-h-28 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent" />
            <button type="button" onClick={send} disabled={busy || !draft.trim()} aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-40">
              <Send size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
