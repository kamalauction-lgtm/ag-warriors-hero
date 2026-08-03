/* Caller admin — configuration tabs (spec §9): Projects, Pipelines, Fields,
   Quotes and the BOP funnel. All live data; writes go through PostgREST under
   the admin RLS policies. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'

export type SetupTab = 'projects' | 'pipelines' | 'fields' | 'quotes' | 'bop'

interface Prop { id: number; name: string; type: string; ad_source: string | null; country: string; description: string | null }
interface Pipe { ghl_pipeline_id: string; ghl_pipeline_name: string | null; property_id: number | null; country: string }
interface Field { country: string; field_key: string; label: string; visible_to_agent: boolean; aliases: string | null; sort_order: number }
interface Quote { id: number; body: string; author: string | null; active: boolean; country: string }
interface Session { id: number; title: string; type: string; starts_at: string; active: boolean; country: string; location: string | null; link: string | null }
interface Roster { session_id: number; lead_id: number; attended: string; caller_id: string | null }

export default function CallerSetup({ tab, onToast }: { tab: SetupTab; onToast: (m: string) => void }) {
  const [props, setProps] = useState<Prop[]>([])
  const [pipes, setPipes] = useState<Pipe[]>([])
  const [fields, setFields] = useState<Field[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [roster, setRoster] = useState<Roster[]>([])
  const [leadCounts, setLeadCounts] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    const [p, pi, f, q, s, r, l] = await Promise.all([
      supabase.from('m4u_properties').select('*').order('country').order('name'),
      supabase.from('m4u_pipeline_map').select('*'),
      supabase.from('m4u_field_settings').select('*').order('sort_order'),
      supabase.from('quotes').select('*').order('id'),
      supabase.from('bop_sessions').select('*').order('starts_at', { ascending: false }),
      supabase.from('bop_roster').select('session_id,lead_id,attended,caller_id'),
      supabase.from('m4u_leads').select('property_id').limit(5000),
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

  if (tab === 'projects') return (
    <>
      <p className="mb-3 text-xs text-muted">Projects drive which disposition set an agent sees — property or recruitment.</p>
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
      <p className="mb-3 text-xs text-muted">Shown at random on the caller home screen.</p>
      {quotes.map((q) => (
        <Card key={q.id} className="mb-2 flex flex-wrap items-center gap-2 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm italic">“{q.body}”</p>
            <p className="text-[11px] text-muted">— {q.author ?? 'AG'} · {q.country}</p>
          </div>
          <button type="button" disabled={busy}
            onClick={() => save(async () => await supabase!.from('quotes')
              .update({ active: !q.active }).eq('id', q.id), q.active ? 'Retired' : 'Live again')}
            className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-extrabold ${
              q.active ? 'border-success/60 text-success' : 'border-border text-muted'}`}>
            {q.active ? 'active' : 'off'}
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
          <p className="mb-2 text-sm font-bold">Sessions</p>
          <p className="text-[11px] text-muted">{sessions.filter((s) => s.active).length} active · {sessions.length} total</p>
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
