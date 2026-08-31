/* Caller admin — configuration tabs (spec §9): Projects, Pipelines, Fields,
   Quotes and the BOP funnel. All live data; writes go through PostgREST under
   the admin RLS policies. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'

export type SetupTab = 'agents' | 'projects' | 'pipelines' | 'fields' | 'quotes' | 'bop'

interface Prop { id: number; name: string; type: string; ad_source: string | null; country: string; description: string | null }
interface Pipe { ghl_pipeline_id: string; ghl_pipeline_name: string | null; property_id: number | null; country: string }
interface Field { country: string; field_key: string; label: string; visible_to_agent: boolean; aliases: string | null; sort_order: number }
interface Quote { id: number; body: string; author: string | null; active: boolean; country: string }
interface Session { id: number; title: string; type: string; starts_at: string; active: boolean; country: string; location: string | null; link: string | null }
interface Roster { session_id: number; lead_id: number; attended: string; caller_id: string | null }
interface Agent { id: string; name: string; email: string | null; status: string; role: string; country: string | null }
interface Grant { agent_id: string; property_id: number; approved: boolean; active: boolean }
/* A project request an agent made that nobody has decided yet. Before migration
   092 these existed in the database but had no surface anywhere in the admin. */
interface Pending {
  agent_id: string; agent_name: string; agent_email: string | null
  agent_country: string; agent_status: string
  property_id: number; project: string; project_type: string
  requested_at: string | null; waiting_hours: number | null
}

export default function CallerSetup({ tab, onToast }: { tab: SetupTab; onToast: (m: string) => void }) {
  const [props, setProps] = useState<Prop[]>([])
  const [pipes, setPipes] = useState<Pipe[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [roster, setRoster] = useState<Roster[]>([])
  const [leadCounts, setLeadCounts] = useState<Record<number, number>>({})
  const [agents, setAgents] = useState<Agent[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [declining, setDeclining] = useState<string | null>(null)
  const [docsFor, setDocsFor] = useState<number | null>(null)
  const [declineWhy, setDeclineWhy] = useState('')
  const [callCounts, setCallCounts] = useState<Record<string, number>>({})
  const [openAgent, setOpenAgent] = useState<string | null>(null)
  const [agentQ, setAgentQ] = useState('')
  const [busy, setBusy] = useState(false)
  // add/edit state for the two things the old console could do and this one could not
  const [qForm, setQForm] = useState({ body: '', author: '', country: 'MY' })
  const [qEdit, setQEdit] = useState<Quote | null>(null)
  const [sForm, setSForm] = useState({
    title: '', type: 'online', country: 'MY', starts_at: '',
    link: '', location: '', map_url: '', notes: '',
  })

  const load = useCallback(async () => {
    if (!supabase) return
    const [p, pi, f, q, s, r, l, ag, gr, at, pend] = await Promise.all([
      supabase.from('m4u_properties').select('*').order('country').order('name'),
      supabase.from('m4u_pipeline_map').select('*'),
      supabase.from('m4u_field_settings').select('*').order('sort_order'),
      supabase.from('quotes').select('*').order('id'),
      supabase.from('bop_sessions').select('*').order('starts_at', { ascending: false }),
      supabase.from('bop_roster').select('session_id,lead_id,attended,caller_id'),
      supabase.from('m4u_leads').select('property_id').limit(5000),
      supabase.from('profiles').select('id,name,email,status,role,country').order('name'),
      supabase.from('m4u_grants').select('agent_id,property_id,approved,active'),
      supabase.from('m4u_attempts').select('agent_id').limit(5000),
      supabase.rpc('fn_m4u_pending_requests'),
    ])
    setProps((p.data as Prop[]) ?? [])
    setPipes((pi.data as Pipe[]) ?? [])
    setFields((f.data as Field[]) ?? [])
    setQuotes((q.data as Quote[]) ?? [])
    setSessions((s.data as Session[]) ?? [])
    setRoster((r.data as Roster[]) ?? [])
    const counts: Record<number, number> = {}
    ;((l.data as { property_id: number | null }[]) ?? []).forEach((x) => {
      if (x.property_id) counts[x.property_id] = (counts[x.property_id] ?? 0) + 1
    })
    setLeadCounts(counts)
    setAgents((ag.data as Agent[]) ?? [])
    setGrants((gr.data as Grant[]) ?? [])
    const calls: Record<string, number> = {}
    ;((at.data as { agent_id: string }[]) ?? []).forEach((x) => {
      calls[x.agent_id] = (calls[x.agent_id] ?? 0) + 1
    })
    setCallCounts(calls)
    setPending((pend.data as unknown as Pending[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (fn: () => Promise<{ error: unknown }>, ok: string) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) onToast('⚠ ' + (error as { message?: string }).message)
    else { onToast(ok); load() }
  }

  /* ---------------- BOP funnel ---------------- */
  const funnel = useMemo(() => {
    const booked = roster.length
    const attended = roster.filter((r) => r.attended === 'attended').length
    const noShow = roster.filter((r) => r.attended === 'no_show').length
    const pending = roster.filter((r) => r.attended === 'pending').length
    return { booked, attended, noShow, pending, showRate: booked ? (attended / booked) * 100 : 0 }
  }, [roster])

  /* The single write path for project access (migration 092). The old code
     PATCHed m4u_grants directly, which RLS silently filtered to zero rows —
     the toast said "approved" and nothing changed. */
  const setAccess = (agentId: string, propId: number, approved: boolean, ok: string) =>
    save(async () => await supabase!.rpc('fn_m4u_set_project_access', {
      p_agent: agentId, p_property: propId, p_approved: approved, p_reason: null,
    }), ok)

  if (tab === 'agents') {
    const shown = agents.filter((a) =>
      !agentQ || a.name.toLowerCase().includes(agentQ.toLowerCase())
      || (a.email ?? '').toLowerCase().includes(agentQ.toLowerCase()))
    const paused = agents.filter((a) => a.status === 'paused')
    const setStatus = (a: Agent, status: string) =>
      save(async () => await supabase!.from('profiles').update({ status }).eq('id', a.id),
        `${a.name} → ${status}`)

    return (
      <>
        {/* ---- PROJECT REQUESTS WAITING ON YOU ----
            Agents could always ask for a project; until now the ask had nowhere
            to appear, so requests sat unanswered for weeks. */}
        {pending.length > 0 && (
          <Card className="mb-3 border-warning/60 p-4">
            <p className="mb-1 text-sm font-bold text-warning">
              {pending.length} project request{pending.length > 1 ? 's' : ''} waiting for you
            </p>
            <p className="mb-3 text-[11px] text-muted">
              The agent sees “pending approval” until you decide. No leads reach them from that project meanwhile.
            </p>
            {pending.map((r) => {
              const key = `${r.agent_id}:${r.property_id}`
              const days = r.waiting_hours == null ? null : Math.floor(r.waiting_hours / 24)
              return (
                <div key={key} className="mb-2 rounded-xl border border-border p-3 last:mb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {r.agent_country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.agent_name}
                        <span className="ml-1.5 font-normal text-muted">wants</span> {r.project}
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        {r.agent_email} · {r.project_type}
                        {r.waiting_hours == null
                          ? ' · asked before we recorded request times'
                          : ` · waiting ${days && days > 0 ? `${days}d` : `${r.waiting_hours}h`}`}
                      </p>
                    </div>
                    {r.agent_status !== 'active' && <Chip tone="warning">{r.agent_status}</Chip>}
                    {days != null && days >= 3 && <Chip tone="warning">{days} days</Chip>}
                    <button type="button" disabled={busy}
                      onClick={() => setAccess(r.agent_id, r.property_id, true,
                        `${r.agent_name} approved for ${r.project}`)}
                      className="cursor-pointer rounded-full bg-accent px-4 py-1.5 text-[11px] font-extrabold text-on-accent disabled:opacity-40">
                      Approve
                    </button>
                    <button type="button" disabled={busy}
                      onClick={() => { setDeclining(declining === key ? null : key); setDeclineWhy('') }}
                      className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted hover:text-ink">
                      Decline
                    </button>
                  </div>
                  {declining === key && (
                    <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
                      <input value={declineWhy} onChange={(e) => setDeclineWhy(e.target.value)}
                        placeholder="Reason — the agent is told this"
                        className="h-9 min-w-[200px] flex-1 rounded-xl border border-border bg-surface2 px-3 text-xs outline-none focus:border-accent" />
                      <button type="button" disabled={busy || !declineWhy.trim()}
                        onClick={() => save(async () => await supabase!.rpc('fn_m4u_decline_request', {
                          p_agent: r.agent_id, p_property: r.property_id, p_reason: declineWhy.trim(),
                        }), `Declined — ${r.agent_name} was told why`).then(() => setDeclining(null))}
                        className="h-9 cursor-pointer rounded-xl border border-danger/60 px-4 text-[11px] font-extrabold text-danger disabled:opacity-40">
                        Send decline
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={agentQ} onChange={(e) => setAgentQ(e.target.value)} placeholder="Search name or email…"
            className="h-10 min-w-[200px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          <Chip tone="success">{agents.filter((a) => a.status === 'active').length} active</Chip>
          <Chip tone="warning">{paused.length} paused</Chip>
        </div>

        {paused.length > 0 && (
          <Card className="mb-3 border-warning/50 p-3.5">
            <p className="mb-2 text-xs">
              <b>{paused.length} agents are paused</b> — carried over from the old system, where a lapsed
              lead hold paused the caller. They can each tap “Request to continue”, or you can reactivate them all now.
            </p>
            <button type="button" disabled={busy}
              onClick={() => save(async () => await supabase!.from('profiles')
                .update({ status: 'active' }).eq('status', 'paused').in('id', paused.map((a) => a.id)),
                `${paused.length} agents reactivated`)}
              className="h-10 cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
              Reactivate all {paused.length}
            </button>
          </Card>
        )}

        {shown.map((a) => {
          const mine = grants.filter((g) => g.agent_id === a.id)
          const live = mine.filter((g) => g.approved && g.active).length
          return (
            <Card key={a.id} className="mb-2 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setOpenAgent(openAgent === a.id ? null : a.id)}
                  className="min-w-0 flex-1 cursor-pointer text-left">
                  <p className="truncate text-sm font-bold">
                    {a.country === 'ID' ? '🇮🇩' : '🇲🇾'} {a.name}
                    {a.role !== 'agent' && <span className="ml-1.5 text-[10px] text-accent">({a.role.replace('_', ' ')})</span>}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {a.email} · {callCounts[a.id] ?? 0} calls · {live}/{mine.length} projects live
                  </p>
                </button>
                <Chip tone={a.status === 'active' ? 'success' : a.status === 'paused' ? 'warning' : 'default'}>{a.status}</Chip>
                {a.status !== 'active'
                  ? <button type="button" disabled={busy} onClick={() => setStatus(a, 'active')}
                      className="cursor-pointer rounded-full border border-success/60 px-3 py-1.5 text-[11px] font-extrabold text-success">Activate</button>
                  : <button type="button" disabled={busy} onClick={() => setStatus(a, 'paused')}
                      className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-extrabold text-muted">Pause</button>}
              </div>

              {openAgent === a.id && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
                    Projects — leads flow only when approved and on
                  </p>
                  {props.filter((p) => p.country === a.country).map((p) => {
                    const g = mine.find((x) => x.property_id === p.id)
                    return (
                      <div key={p.id} className="mb-1.5 flex items-center gap-2 text-xs">
                        <span className="flex-1 truncate">{p.name}</span>
                        {g?.approved && g.active && <Chip tone="success">live</Chip>}
                        {g?.approved && !g.active && <Chip>agent off</Chip>}
                        {g && !g.approved && <Chip tone="warning">requested</Chip>}
                        <button type="button" disabled={busy}
                          onClick={() => setAccess(a.id, p.id, !g?.approved,
                            g?.approved ? `${p.name} access removed` : `${p.name} approved for ${a.name}`)}
                          className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-extrabold ${
                            g?.approved ? 'border-border text-muted' : 'border-accent/60 text-accent'}`}>
                          {g?.approved ? 'Remove' : 'Approve'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </>
    )
  }

  if (tab === 'projects') return (
    <>
      <p className="mb-3 text-xs text-muted">Projects drive which disposition set an agent sees — property or recruitment. “Docs” opens the Project Library for that project: files, links and instructions agents can read.</p>
      {props.map((p) => (
        <Card key={p.id} className="mb-2 flex flex-wrap items-center gap-2 p-3.5">
          <span className="text-sm font-bold">{p.country === 'ID' ? '🇮🇩' : '🇲🇾'} {p.name}</span>
          <Chip tone={p.type === 'recruitment' ? 'accent' : 'default'}>{p.type}</Chip>
          {p.ad_source === '__unassigned__' && <Chip tone="warning">triage bucket</Chip>}
          <span className="text-[11px] text-muted">{leadCounts[p.id] ?? 0} leads</span>
          <span className="flex-1" />
          <select value={p.type} disabled={busy} aria-label={`Type for ${p.name}`}
            onChange={(e) => save(async () => await supabase!.from('m4u_properties')
              .update({ type: e.target.value }).eq('id', p.id), `${p.name} → ${e.target.value}`)}
            className="h-9 cursor-pointer rounded-xl border border-border bg-surface px-2 text-xs outline-none">
            {['property', 'recruitment', 'other'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <button type="button" onClick={() => setDocsFor(docsFor === p.id ? null : p.id)}
            className="h-9 cursor-pointer rounded-xl border border-accent/60 px-3 text-xs font-bold text-accent">
            {docsFor === p.id ? 'Close docs' : '📁 Docs'}
          </button>
          {docsFor === p.id && (
            <div className="mt-2 w-full border-t border-border pt-3">
              <ProjectDocs propertyId={p.id} country={p.country} onToast={onToast} />
            </div>
          )}
        </Card>
      ))}
    </>
  )

  if (tab === 'pipelines') return (
    <>
      <p className="mb-3 text-xs text-muted">
        GHL pipelines map to projects. Unmapped pipelines send their leads to triage — map them to route leads correctly.
      </p>
      {pipes.length === 0 && <Card className="p-5 text-center text-xs text-muted">No pipelines mapped yet.</Card>}
      {[...pipes].sort((a, b) => Number(!!a.property_id) - Number(!!b.property_id)).map((pi) => (
        <Card key={pi.ghl_pipeline_id} className={`mb-2 flex flex-wrap items-center gap-2 p-3.5 ${!pi.property_id ? 'border-warning/50' : ''}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{pi.ghl_pipeline_name ?? '(unnamed pipeline)'}</p>
            <p className="truncate text-[10px] text-muted">{pi.ghl_pipeline_id}</p>
          </div>
          {!pi.property_id && <Chip tone="warning">unmapped → triage</Chip>}
          <select value={pi.property_id ?? ''} disabled={busy} aria-label="Map to project"
            onChange={(e) => save(async () => await supabase!.from('m4u_pipeline_map')
              .update({ property_id: e.target.value ? Number(e.target.value) : null })
              .eq('ghl_pipeline_id', pi.ghl_pipeline_id), 'Pipeline mapped')}
            className="h-9 cursor-pointer rounded-xl border border-border bg-surface px-2 text-xs outline-none">
            <option value="">— unmapped —</option>
            {props.filter((p) => p.country === pi.country).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Card>
      ))}
    </>
  )

  if (tab === 'fields') return (
    <>
      <p className="mb-3 text-xs text-muted">
        Controls which lead-form fields agents see on the call card. Aliases let a renamed Facebook/GHL field keep working without code.
      </p>
      {fields.map((f) => (
        <Card key={`${f.country}-${f.field_key}`} className="mb-2 flex flex-wrap items-center gap-2 p-3.5">
          <span className="text-sm font-bold">{f.country === 'ID' ? '🇮🇩' : '🇲🇾'} {f.label}</span>
          <code className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">{f.field_key}</code>
          {f.aliases && <span className="text-[10px] text-muted">aliases: {f.aliases}</span>}
          <span className="flex-1" />
          <button type="button" disabled={busy}
            onClick={() => save(async () => await supabase!.from('m4u_field_settings')
              .update({ visible_to_agent: !f.visible_to_agent })
              .eq('country', f.country).eq('field_key', f.field_key),
              f.visible_to_agent ? 'Hidden from agents' : 'Visible to agents')}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
              f.visible_to_agent ? 'border-success/60 text-success' : 'border-border text-muted'}`}>
            {f.visible_to_agent ? '✓ visible to agent' : 'hidden'}
          </button>
        </Card>
      ))}
    </>
  )

  if (tab === 'quotes') return (
    <>
      <Card className="mb-3 p-4">
        <p className="mb-2 text-sm font-bold">{qEdit ? 'Edit quote' : 'Add a quote'}</p>
        <textarea
          value={qEdit ? qEdit.body : qForm.body}
          onChange={(e) => qEdit ? setQEdit({ ...qEdit, body: e.target.value })
                                 : setQForm({ ...qForm, body: e.target.value })}
          placeholder="e.g. Every call brings you closer to the next closing."
          rows={2}
          className="mb-2 w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent" />
        <div className="flex flex-wrap gap-2">
          <input
            value={qEdit ? (qEdit.author ?? '') : qForm.author}
            onChange={(e) => qEdit ? setQEdit({ ...qEdit, author: e.target.value })
                                   : setQForm({ ...qForm, author: e.target.value })}
            placeholder="Author / source (optional)"
            className="h-10 min-w-[180px] flex-1 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
          <select
            value={qEdit ? qEdit.country : qForm.country}
            onChange={(e) => qEdit ? setQEdit({ ...qEdit, country: e.target.value })
                                   : setQForm({ ...qForm, country: e.target.value })}
            aria-label="Country"
            className="h-10 cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
            <option value="MY">MY</option>
            <option value="ID">ID</option>
          </select>
          {qEdit ? (
            <>
              <button type="button" disabled={busy || !qEdit.body.trim()}
                onClick={() => save(async () => await supabase!.from('quotes').update({
                  body: qEdit.body.trim(),
                  author: qEdit.author?.trim() || null,
                  country: qEdit.country,
                }).eq('id', qEdit.id), 'Quote updated').then(() => setQEdit(null))}
                className="h-10 cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
                Save
              </button>
              <button type="button" onClick={() => setQEdit(null)}
                className="h-10 cursor-pointer rounded-xl border border-border px-4 text-xs font-bold text-muted hover:text-ink">
                Cancel
              </button>
            </>
          ) : (
            <button type="button" disabled={busy || !qForm.body.trim()}
              onClick={() => save(async () => await supabase!.from('quotes').insert({
                body: qForm.body.trim(),
                author: qForm.author.trim() || null,
                country: qForm.country,
                active: true,
              }), 'Quote added').then(() => setQForm({ body: '', author: '', country: qForm.country }))}
              className="h-10 cursor-pointer rounded-xl bg-accent px-5 text-xs font-extrabold text-on-accent disabled:opacity-40">
              + Add
            </button>
          )}
        </div>
      </Card>

      <p className="mb-2 text-xs text-muted">
        Shown at random on the caller home screen. {quotes.filter((q) => q.active).length} active of {quotes.length}.
      </p>
      {quotes.map((q) => (
        <Card key={q.id} className="mb-2 flex flex-wrap items-center gap-2 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm italic">“{q.body}”</p>
            <p className="text-[11px] text-muted">— {q.author ?? 'AG'} · {q.country}</p>
          </div>
          <button type="button" disabled={busy} onClick={() => setQEdit(q)}
            className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted hover:text-ink">
            Edit
          </button>
          <button type="button" disabled={busy}
            onClick={() => save(async () => await supabase!.from('quotes')
              .update({ active: !q.active }).eq('id', q.id), q.active ? 'Retired' : 'Live again')}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
              q.active ? 'border-success/60 text-success' : 'border-border text-muted'}`}>
            {q.active ? 'active' : 'off'}
          </button>
          <button type="button" disabled={busy}
            onClick={() => { if (confirm('Delete this quote permanently?'))
              save(async () => await supabase!.from('quotes').delete().eq('id', q.id), 'Quote deleted') }}
            className="cursor-pointer rounded-full border border-danger/50 px-3 py-1.5 text-[11px] font-bold text-danger">
            Delete
          </button>
        </Card>
      ))}
    </>
  )

  /* BOP */
  const FUNNEL = [
    { l: 'Booked onto a session', v: funnel.booked, c: '#4f9cf9' },
    { l: 'Attended', v: funnel.attended, c: '#43c59e' },
    { l: 'No-show', v: funnel.noShow, c: '#f4826d' },
    { l: 'Awaiting outcome', v: funnel.pending, c: '#f2b544' },
  ]
  const max = Math.max(1, ...FUNNEL.map((f) => f.v))
  return (
    <>
      {/* Create a session — the old console could do this and this one could not,
          so sessions could only ever be created outside the app. */}
      <Card className="mb-4 p-4">
        <p className="mb-1 text-sm font-bold">Create a BOP session</p>
        <p className="mb-3 text-[11px] text-muted">
          Callers pick one of these when they choose “Attend BOP”; the prospect then gets the
          WhatsApp confirmation and reminder.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Type</span>
            <select value={sForm.type} onChange={(e) => setSForm({ ...sForm, type: e.target.value })}
              className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
              <option value="online">Online</option>
              <option value="physical">Physical</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Date &amp; time *</span>
            <input type="datetime-local" value={sForm.starts_at}
              onChange={(e) => setSForm({ ...sForm, starts_at: e.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Session title *</span>
            <input value={sForm.title} onChange={(e) => setSForm({ ...sForm, title: e.target.value })}
              placeholder="Business Opportunity Preview (Online)"
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Meeting link (online)</span>
            <input value={sForm.link} onChange={(e) => setSForm({ ...sForm, link: e.target.value })}
              placeholder="https://meet.google.com/…"
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Location / address (physical)</span>
            <input value={sForm.location} onChange={(e) => setSForm({ ...sForm, location: e.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Map link (optional)</span>
            <input value={sForm.map_url} onChange={(e) => setSForm({ ...sForm, map_url: e.target.value })}
              placeholder="https://maps.app.goo.gl/…"
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Country</span>
            <select value={sForm.country} onChange={(e) => setSForm({ ...sForm, country: e.target.value })}
              className="mt-1 h-10 w-full cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
              <option value="MY">MY</option>
              <option value="ID">ID</option>
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Notes (optional)</span>
            <input value={sForm.notes} onChange={(e) => setSForm({ ...sForm, notes: e.target.value })}
              className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
          </label>
        </div>
        <button type="button" disabled={busy || !sForm.title.trim() || !sForm.starts_at}
          onClick={() => save(async () => await supabase!.from('bop_sessions').insert({
            title: sForm.title.trim(),
            type: sForm.type,
            country: sForm.country,
            // datetime-local has no zone; the browser's own offset is the intended one
            starts_at: new Date(sForm.starts_at).toISOString(),
            link: sForm.link.trim() || null,
            location: sForm.location.trim() || null,
            map_url: sForm.map_url.trim() || null,
            notes: sForm.notes.trim() || null,
            active: true,
          }), 'Session created').then(() => setSForm({
            title: '', type: sForm.type, country: sForm.country, starts_at: '',
            link: '', location: '', map_url: '', notes: '',
          }))}
          className="mt-3 h-10 cursor-pointer rounded-xl bg-accent px-5 text-xs font-extrabold text-on-accent disabled:opacity-40">
          + Create session
        </button>
      </Card>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-bold">Recruitment funnel</p>
          <div className="space-y-2">
            {FUNNEL.map((f) => (
              <div key={f.l} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 text-muted">{f.l}</span>
                <span className="h-4 flex-1 overflow-hidden rounded bg-surface2">
                  <span className="block h-full rounded transition-all duration-500" style={{ width: `${(f.v / max) * 100}%`, background: f.c }} />
                </span>
                <b className="w-8 text-right">{f.v}</b>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            Show rate <b className="text-ink">{funnel.showRate.toFixed(0)}%</b>
            {funnel.booked >= 10 && funnel.showRate < 25 && <span className="ml-2 text-warning">⚠ low — check booking quality</span>}
          </p>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-sm font-bold">Upcoming sessions</p>
          {(() => {
            const soon = sessions
              .filter((x) => x.active && new Date(x.starts_at).getTime() > Date.now())
              .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
            if (!soon.length) return <p className="text-[11px] text-muted">No upcoming sessions.</p>
            return (
              <div className="space-y-1.5">
                {soon.slice(0, 5).map((x) => (
                  <div key={x.id} className="flex items-center gap-2 text-[11px]">
                    <Chip tone="accent">{x.type}</Chip>
                    <span className="min-w-0 flex-1 truncate">{x.title}</span>
                    <span className="text-muted">{new Date(x.starts_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )
          })()}
          <p className="mt-3 text-[11px] text-muted">
            {sessions.filter((x) => x.active).length} active · {sessions.length} total
          </p>
        </Card>
      </div>
      {sessions.map((s) => {
        const mine = roster.filter((r) => r.session_id === s.id)
        return (
          <Card key={s.id} className="mb-2 flex flex-wrap items-center gap-2 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{s.country === 'ID' ? '🇮🇩' : '🇲🇾'} {s.title}</p>
              <p className="text-[11px] text-muted">
                {new Date(s.starts_at).toLocaleString()} · {s.type}{s.location ? ` · ${s.location}` : ''}
              </p>
            </div>
            <Chip>{mine.length} booked</Chip>
            {mine.filter((r) => r.attended === 'attended').length > 0 && (
              <Chip tone="success">{mine.filter((r) => r.attended === 'attended').length} attended</Chip>
            )}
            <button type="button" disabled={busy}
              onClick={() => save(async () => await supabase!.from('bop_sessions')
                .update({ active: !s.active }).eq('id', s.id), s.active ? 'Session closed' : 'Session reopened')}
              className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
                s.active ? 'border-success/60 text-success' : 'border-border text-muted'}`}>
              {s.active ? 'active' : 'closed'}
            </button>
          </Card>
        )
      })}
    </>
  )
}

/* ---------------------------------------------------------------------------
   Project Docs (100) — the admin curation panel for one project's library.
   Files upload to the private project-docs bucket (admin storage policy),
   then register via fn_admin_set_project_resource. Agents read them in the
   Project Library page; a file downloads through the worker's signed URL.
--------------------------------------------------------------------------- */
function ProjectDocs({ propertyId, country, onToast }:
  { propertyId: number; country: string; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<{ id: string; kind: string; title: string; description: string | null
    url: string | null; body: string | null; file_type: string | null; file_size: number | null; visibility: string }[]>([])
  const [form, setForm] = useState({ kind: 'note', title: '', body: '', url: '', visibility: 'all' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.rpc('fn_project_resources', { p_property: propertyId })
    setRows((data as typeof rows) ?? [])
  }, [propertyId])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!supabase || !form.title.trim()) return
    setBusy(true)
    try {
      let storage_path: string | null = null, file_type: string | null = null, file_size: number | null = null
      if (form.kind === 'file') {
        if (!file) { onToast('Choose a file first'); setBusy(false); return }
        const path = `${country}/${propertyId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const up = await supabase.storage.from('project-docs').upload(path, file, { upsert: false })
        if (up.error) { onToast('⚠ upload: ' + up.error.message); setBusy(false); return }
        storage_path = path; file_type = file.type || 'application/octet-stream'; file_size = file.size
      }
      const { error } = await supabase.rpc('fn_admin_set_project_resource', {
        p_id: null, p_property: propertyId, p_kind: form.kind, p_title: form.title.trim(),
        p_description: null, p_storage_path: storage_path, p_file_type: file_type, p_file_size: file_size,
        p_url: form.kind === 'link' ? form.url.trim() : null,
        p_body: form.kind === 'note' ? form.body.trim() : null,
        p_visibility: form.visibility, p_sort: rows.length,
      })
      if (error) { onToast('⚠ ' + error.message); setBusy(false); return }
      onToast('Added to library'); setForm({ kind: form.kind, title: '', body: '', url: '', visibility: form.visibility })
      setFile(null); if (fileRef.current) fileRef.current.value = ''; load()
    } finally { setBusy(false) }
  }

  const del = async (id: string, path: string | null) => {
    if (!supabase || !window.confirm('Delete this item?')) return
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_admin_delete_project_resource', { p_id: id })
    if (!error && (data as { storage_path?: string })?.storage_path) {
      await supabase.storage.from('project-docs').remove([(data as { storage_path: string }).storage_path])
    } else if (path) { await supabase.storage.from('project-docs').remove([path]) }
    setBusy(false)
    if (error) { onToast('⚠ ' + error.message); return }
    onToast('Removed'); load()
  }

  const inp = 'h-9 rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-accent'
  return (
    <div>
      {rows.map((r) => (
        <div key={r.id} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-xs">
          <span>{r.kind === 'file' ? '📄' : r.kind === 'link' ? '🔗' : '📝'}</span>
          <span className="font-bold">{r.title}</span>
          {r.visibility === 'granted' && <Chip tone="warning">approved only</Chip>}
          <span className="flex-1" />
          <button type="button" disabled={busy} onClick={() => del(r.id, r.file_type ? null : null)}
            className="cursor-pointer rounded-full border border-danger/50 px-2.5 py-1 text-[10px] font-bold text-danger">Delete</button>
        </div>
      ))}
      {rows.length === 0 && <p className="mb-2 text-[11px] text-muted">No materials yet — add the first below.</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Kind" className={`${inp} cursor-pointer`}>
          <option value="note">📝 Instruction</option><option value="link">🔗 Link</option><option value="file">📄 File</option>
        </select>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className={`${inp} min-w-[140px] flex-1`} />
        <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} aria-label="Who" className={`${inp} cursor-pointer`}>
          <option value="all">All agents</option><option value="granted">Approved only</option>
        </select>
      </div>
      {form.kind === 'note' && (
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={2}
          placeholder="Instructions agents will read…" className="mt-2 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs outline-none focus:border-accent" />
      )}
      {form.kind === 'link' && (
        <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" className={`${inp} mt-2 w-full`} />
      )}
      {form.kind === 'file' && (
        <input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-accent" />
      )}
      <button type="button" disabled={busy || !form.title.trim()} onClick={add}
        className="mt-2 h-9 cursor-pointer rounded-lg bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
        {busy ? 'Saving…' : '+ Add to library'}
      </button>
    </div>
  )
}
