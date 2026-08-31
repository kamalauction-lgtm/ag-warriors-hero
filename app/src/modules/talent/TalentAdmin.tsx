/* Hero Talent Compass — Facilitator Dashboard (§15).
   Every read goes through the talent_admin_* RPCs, which enforce two rules the UI
   must not be trusted with on its own:
     • an individual report is only released at the sharing level the participant chose;
     • written answers are never exposed to a facilitator at all (§6), so nothing
       here reads talent_responses.
   Group figures are anonymous counts and therefore cover everyone. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, Users, RefreshCw, Lock, FileText, AlertTriangle, X,
  Compass, Sparkles, Heart, Zap, TrendingUp, BatteryLow, Target, Eye, FlaskConical, HelpCircle,
  type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip, Bar } from '../../components/ui'
import { Bars, Donut, ScoreBars, StatTile, prettyKey, type Datum } from '../../components/charts'

interface EventRow {
  id: number; code: string; name: string; status: string; country_scope: string
  languages: string[]; version_code: string | null; max_participants: number | null
  starts_at: string | null; expires_at: string | null; started: number; completed: number
}
interface Overview {
  event: { id: number; code: string; name: string; status: string; country_scope: string; timezone: string }
  expected: number | null; started: number; completed: number; incomplete: number
  avg_minutes: number | null
  by_language: Record<string, number>; by_country: Record<string, number>
  by_experience: Record<string, number>; by_sharing: Record<string, number>
  reports: { generated: number; ai: number; fallback: number }
  motivations: { key: string; people: number; avg: number | null }[]
  demotivators: { key: string; people: number; avg: number | null }[]
  pathways: { key: string; people: number }[]
  entrepreneurship: { key: string; avg: number | null }[]
  success_drive: { key: string; avg: number | null }[]
  working_style: { key: string; avg: number | null }[]
  gaps: { key: string; avg: number | null }[]
}
interface Sitting {
  attempt_id: string; event: string; event_code: string; version: string
  purpose: 'person' | 'position'; status: string; language: string
  started_at: string; submitted_at: string | null; minutes: number | null
  sharing: string; flags: number; top_pathway: string | null; top_motivation: string | null
}
interface Person { email: string; name: string | null; sittings: Sitting[] }

interface RosterRow {
  attempt_id: string; full_name: string | null; preferred: string | null; contact: string | null
  email: string | null; sittings: number
  country: string | null; experience: string | null; leadership: string | null
  language: string; status: string; started_at: string; submitted_at: string | null
  minutes: number | null; sharing: 'private' | 'summary' | 'full'; has_report: boolean
  flags: number; top_pathway: string | null
  headline: { key: string; band: string | null; score: number | null }[] | null
}
interface ReportView {
  sharing: string; full_name: string | null; language?: string
  generated_by?: string; pending?: boolean
  content: Record<string, unknown> | null
}

const toData = (o: Record<string, number> | undefined): Datum[] =>
  Object.entries(o ?? {}).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

const SHARING_TONE: Record<string, 'default' | 'info' | 'success'> = {
  private: 'default', summary: 'info', full: 'success',
}

/* Pathway alignment band → Chip tone, so the strongest pathways read green at a
   glance and weaker ones stay quiet. Mirrors the participant report's band map. */
const RB_BAND: Record<string, 'success' | 'accent' | 'warning' | 'default'> = {
  'Strong Alignment': 'success', 'Good Alignment': 'accent',
  'Emerging Alignment': 'warning', 'Worth Revisiting': 'warning',
  'Development Opportunity': 'default', 'Insufficient Information': 'default',
}

/* One consistent section header (icon tile + title) so the eye can jump between
   sections instead of reading every line — the whole point of the redesign. */
function Head({ icon: Icon, title, tone = 'accent' }: { icon: LucideIcon; title: string; tone?: 'accent' | 'warning' | 'success' }) {
  const tones = { accent: 'bg-accent-soft text-accent', warning: 'bg-warning/12 text-warning', success: 'bg-success/12 text-success' }
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span className={clsx('flex h-6 w-6 items-center justify-center rounded-lg', tones[tone])}><Icon size={13} /></span>
      <h3 className="font-display text-[13px] font-bold tracking-tight">{title}</h3>
    </div>
  )
}

/* Keyword lists render as chip clouds, not bullet walls — far faster to scan. */
const Cloud = ({ items, tone = 'default', cap = false }: { items: unknown[]; tone?: 'default' | 'accent' | 'warning'; cap?: boolean }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.filter(Boolean).map((it, i) => (
      <Chip key={i} tone={tone} className={cap ? 'capitalize' : undefined}>{String(it)}</Chip>
    ))}
  </div>
)

/* Renders whichever slice of the report the RPC released. Nothing is requested
   that consent did not already allow, so missing sections simply do not render. */
function ReportBody({ content, summaryOnly }: { content: Record<string, unknown> | null; summaryOnly: boolean }) {
  if (!content) return <p className="py-6 text-center text-sm text-muted">Nothing shared.</p>
  const list = (k: string) => (Array.isArray(content[k]) ? (content[k] as unknown[]) : [])
  const roles = list('roles') as { name?: string; key?: string; band?: string; score?: number }[]

  return (
    <div className="space-y-3">
      {content.low_confidence === true && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-warning">Low confidence — treat this as worth revisiting, not a conclusion.</p>
        </div>
      )}

      {/* profile headline — the one paragraph everyone reads first */}
      {typeof content.profile === 'string' && (
        <div className="rounded-2xl border border-accent/30 bg-accent-soft p-4">
          <p className="text-[13.5px] leading-relaxed text-ink">{content.profile}</p>
        </div>
      )}

      {/* pathways — ranked, band-coloured, with a score bar you can read at a glance */}
      {roles.length > 0 && (
        <Card className="p-4">
          <Head icon={Compass} title="Pathways to explore" />
          <div className="space-y-2.5">
            {roles.map((r, i) => (
              <div key={i} className="rounded-xl border border-border p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-extrabold text-bg">{i + 1}</span>
                  <span className="flex-1 text-[13px] font-bold">{r.name ?? prettyKey(r.key ?? '')}</span>
                  {r.band && <Chip tone={RB_BAND[r.band] ?? 'default'}>{r.band}</Chip>}
                  <b className="w-9 text-right text-[13px] tabular-nums">{r.score ?? '—'}</b>
                </div>
                {typeof r.score === 'number' && <Bar pct={r.score} />}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* strengths + motivations, side by side on wider screens */}
      <div className="grid gap-3 sm:grid-cols-2">
        {list('strengths').length > 0 && (
          <Card className="p-4"><Head icon={Sparkles} title="Natural strengths" tone="success" /><Cloud items={list('strengths')} tone="accent" cap /></Card>
        )}
        {list('motivations').length > 0 && (
          <Card className="p-4"><Head icon={Heart} title="What motivates" /><Cloud items={list('motivations')} cap /></Card>
        )}
      </div>

      {!summaryOnly && <>
        <div className="grid gap-3 sm:grid-cols-2">
          {list('entrepreneurial').length > 0 && (
            <Card className="p-4"><Head icon={Zap} title="Entrepreneurial" /><Cloud items={list('entrepreneurial')} cap /></Card>
          )}
          {list('success_drive').length > 0 && (
            <Card className="p-4"><Head icon={TrendingUp} title="Success drive" /><Cloud items={list('success_drive')} cap /></Card>
          )}
          {list('demotivators').length > 0 && (
            <Card className="p-4 sm:col-span-2"><Head icon={BatteryLow} title="What drains motivation" tone="warning" /><Cloud items={list('demotivators')} tone="warning" cap /></Card>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {list('development').length > 0 && (
            <Card className="p-4">
              <Head icon={Target} title="Development areas" />
              <ul className="space-y-1.5">
                {list('development').map((d, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed"><span className="text-accent">→</span><span className="capitalize">{String(d)}</span></li>
                ))}
              </ul>
            </Card>
          )}
          {list('blind_spots').length > 0 && (
            <Card className="p-4">
              <Head icon={Eye} title="Possible blind spots" tone="warning" />
              <ul className="space-y-1.5">
                {list('blind_spots').map((b, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed"><span className="text-warning">•</span><span className="capitalize">{String(b)}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {list('experiments').filter(Boolean).length > 0 && (
          <Card className="p-4">
            <Head icon={FlaskConical} title="Experiments to try next" />
            <ol className="space-y-2">
              {list('experiments').filter(Boolean).map((e, i) => (
                <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-extrabold text-bg">{i + 1}</span><span>{String(e)}</span></li>
              ))}
            </ol>
          </Card>
        )}

        {list('coach_questions').length > 0 && (
          <Card className="p-4">
            <Head icon={HelpCircle} title="Questions for coaching" />
            <ul className="space-y-2">
              {list('coach_questions').map((qq, i) => (
                <li key={i} className="border-l-2 border-accent/40 pl-3 text-[13px] italic leading-relaxed text-muted">“{String(qq)}”</li>
              ))}
            </ul>
          </Card>
        )}
      </>}

      {summaryOnly && (
        <p className="rounded-xl border border-border bg-surface2/50 p-3 text-[11px] leading-relaxed text-muted">
          This participant consented to a summary only. Development areas, blind spots and coach questions are withheld.
        </p>
      )}
    </div>
  )
}

/* `embedded` = rendered inside the admin console, which already supplies the
   page chrome; standalone = reached directly at /testme/admin. */
export default function TalentAdmin({ embedded = false }: { embedded?: boolean }) {
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventId, setEventId] = useState<number | null>(null)
  const [ov, setOv] = useState<Overview | null>(null)
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [tab, setTab] = useState<'overview' | 'people' | 'group'>('overview')
  const [open, setOpen] = useState<ReportView | null>(null)
  const [person, setPerson] = useState<Person | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  const loadEvents = useCallback(async () => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('talent_admin_events')
    if (error) { setErr(error.message); setLoading(false); return }
    const list = (data as EventRow[]) ?? []
    setEvents(list)
    setEventId((cur) => cur ?? list[0]?.id ?? null)
    setLoading(false)
  }, [])

  const loadEvent = useCallback(async (id: number) => {
    if (!supabase) return
    setLoading(true); setErr('')
    const [a, b] = await Promise.all([
      supabase.rpc('talent_admin_overview', { p_event: id }),
      supabase.rpc('talent_admin_roster', { p_event: id }),
    ])
    if (a.error || b.error) setErr(a.error?.message ?? b.error?.message ?? '')
    setOv((a.data as Overview) ?? null)
    setRoster((b.data as RosterRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadEvents() }, [loadEvents])
  useEffect(() => { if (eventId) loadEvent(eventId) }, [eventId, loadEvent])

  /* One person, every sitting they have done — the pre-programme /myself and the
     mid-class /testme sit side by side here, which is the whole point of keying
     on email. Consent still governs what each sitting releases. */
  const openPerson = async (email: string) => {
    if (!supabase) return
    const { data, error } = await supabase.rpc('talent_admin_person', { p_email: email })
    if (error) { setErr(error.message); return }
    setPerson(data as Person)
  }

  const openReport = async (r: RosterRow) => {
    if (!supabase || r.sharing === 'private') return
    const { data, error } = await supabase.rpc('talent_admin_report', { p_attempt: r.attempt_id })
    if (error) { setErr(error.message); return }
    setOpen(data as ReportView)
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return roster
    return roster.filter((r) =>
      (r.full_name ?? '').toLowerCase().includes(needle) ||
      (r.contact ?? '').toLowerCase().includes(needle))
  }, [roster, q])

  const ev = events.find((e) => e.id === eventId)
  const completionPct = ov && ov.started > 0 ? Math.round((ov.completed / ov.started) * 100) : 0

  return (
    <div className={embedded ? 'animate-rise' : 'animate-rise px-4 pt-5 pb-10'}>
      <header className="mb-4 flex items-center gap-3">
        {!embedded && (
          <Link to="/admin" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Talent Compass</h1>
          <p className="text-xs text-muted">Facilitator dashboard</p>
        </div>
        <button type="button" onClick={() => eventId && loadEvent(eventId)}
          className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-bold text-muted hover:text-ink">
          <RefreshCw size={12} /> Refresh
        </button>
      </header>

      {err && <Card className="mb-3 border-danger/40 p-3 text-xs text-danger">{err}</Card>}

      {/* event picker */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={eventId ?? ''} onChange={(e) => setEventId(Number(e.target.value))}
          className="min-w-[240px] rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          {events.length === 0 && <option value="">No events yet</option>}
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.name} · {e.code}</option>
          ))}
        </select>
        {ev && <Chip tone={ev.status === 'active' ? 'success' : 'default'}>{ev.status}</Chip>}
        {ev && <Chip>{ev.country_scope}</Chip>}
        {ev?.version_code && <Chip>{ev.version_code}</Chip>}
      </div>

      {events.length === 0 && !loading ? (
        <Card className="p-8 text-center">
          <Users size={28} className="mx-auto mb-2 text-muted" />
          <p className="text-sm text-muted">No assessment events exist yet. Create one in the database, then it appears here.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex gap-1 overflow-x-auto">
            {(['overview', 'people', 'group'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={clsx('cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold capitalize',
                  tab === t ? 'bg-accent text-bg' : 'border border-border text-muted hover:text-ink')}>
                {t === 'people' ? `Participants (${roster.length})` : t === 'group' ? 'Group insights' : 'Overview'}
              </button>
            ))}
          </div>

          {tab === 'overview' && ov && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <StatTile label="Expected" value={ov.expected ?? '—'} />
                <StatTile label="Started" value={ov.started} />
                <StatTile label="Completed" value={ov.completed} hint={`${completionPct}% of started`} />
                <StatTile label="Incomplete" value={ov.incomplete} />
                <StatTile label="Avg time" value={ov.avg_minutes ? `${ov.avg_minutes}m` : '—'} />
                <StatTile label="Reports" value={ov.reports.generated}
                  hint={`${ov.reports.ai} AI · ${ov.reports.fallback} fallback`} />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Language</p>
                  <Donut data={toData(ov.by_language)} unit="people" />
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Consent sharing</p>
                  <Donut data={toData(ov.by_sharing)} unit="people" />
                  <p className="mt-3 text-[11px] leading-relaxed text-muted">
                    Private means you see attendance only. The participant chooses this, and it cannot be overridden here.
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Country</p>
                  <Bars data={toData(ov.by_country)} />
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Experience</p>
                  <Bars data={toData(ov.by_experience)} />
                </Card>
              </div>
            </div>
          )}

          {tab === 'group' && ov && (
            <div className="space-y-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Role pathway distribution</p>
                  <Bars data={ov.pathways.map((p) => ({ label: prettyKey(p.key), value: p.people }))} />
                  <p className="mt-3 text-[11px] text-muted">Each person counted once, on their strongest pathway.</p>
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Top motivation drivers</p>
                  <Bars data={ov.motivations.map((m) => ({ label: prettyKey(m.key), value: m.people }))} />
                  <p className="mt-3 text-[11px] text-muted">How many people have this in their top three.</p>
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Common demotivators</p>
                  <Bars data={ov.demotivators.map((m) => ({ label: prettyKey(m.key), value: m.people }))} />
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Group development gaps</p>
                  <ScoreBars tone="warn" data={ov.gaps.map((g) => ({ label: prettyKey(g.key), value: g.avg ?? 0 }))} />
                  <p className="mt-3 text-[11px] text-muted">Weakest group averages — where coaching pays back most.</p>
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Entrepreneurship strengths</p>
                  <ScoreBars data={ov.entrepreneurship.map((g) => ({ label: prettyKey(g.key), value: g.avg ?? 0 }))} />
                </Card>
                <Card className="p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Success-drive strengths</p>
                  <ScoreBars data={ov.success_drive.map((g) => ({ label: prettyKey(g.key), value: g.avg ?? 0 }))} />
                </Card>
                <Card className="p-4 lg:col-span-2">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Working style</p>
                  <ScoreBars data={ov.working_style.map((g) => ({ label: prettyKey(g.key), value: g.avg ?? 0 }))} />
                </Card>
              </div>
              <p className="px-1 text-[11px] leading-relaxed text-muted">
                Group figures are anonymous averages across completed attempts. Written answers are never shown to
                facilitators, individually or in aggregate.
              </p>
            </div>
          )}

          {tab === 'people' && (
            <div className="space-y-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or contact"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              {filtered.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted">No participants yet.</Card>
              ) : filtered.map((r) => (
                <Card key={r.attempt_id} className="p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold">{r.full_name ?? 'Unnamed'}</p>
                    <Chip tone={SHARING_TONE[r.sharing]}>{r.sharing}</Chip>
                    <Chip tone={r.status === 'reported' || r.status === 'scored' ? 'success'
                      : r.status === 'submitted' ? 'info' : 'default'}>{r.status.replace('_', ' ')}</Chip>
                    {r.flags > 0 && <Chip tone="warning"><AlertTriangle size={11} /> {r.flags}</Chip>}
                    {r.sittings > 1 && r.email && (
                      <button type="button" onClick={() => openPerson(r.email!)}
                        className="cursor-pointer rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent">
                        {r.sittings}× · history
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {[r.contact, r.country, r.experience, r.language,
                      r.minutes ? `${r.minutes} min` : null].filter(Boolean).join(' · ')}
                  </p>
                  {r.sharing === 'private' ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                      <Lock size={11} /> Participant chose Private — attendance only, no results shared.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.top_pathway && <Chip tone="accent">{prettyKey(r.top_pathway)}</Chip>}
                      {(r.headline ?? []).map((h) => (
                        <span key={h.key} className="text-[11px] text-muted">{prettyKey(h.key)} {h.score ?? '—'}</span>
                      ))}
                      {r.has_report && (
                        <button type="button" onClick={() => openReport(r)}
                          className="ml-auto flex cursor-pointer items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] font-bold text-muted hover:text-ink">
                          <FileText size={11} /> {r.sharing === 'summary' ? 'Summary' : 'Full report'}
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {loading && <p className="py-6 text-center text-xs text-muted">Loading…</p>}

      {/* one person across sittings — portalled to <body>: the admin console has
          a transformed ancestor, which traps position:fixed inside it and made
          this box land mid-list instead of centre-screen */}
      {person && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setPerson(null)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-extrabold">{person.name ?? person.email}</h2>
                <p className="text-[11px] text-muted">{person.email} · {person.sittings?.length ?? 0} sittings</p>
              </div>
              <button type="button" onClick={() => setPerson(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><X size={15} /></button>
            </div>
            <div className="space-y-2">
              {(person.sittings ?? []).map((si) => (
                <Card key={si.attempt_id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={si.purpose === 'person' ? 'info' : 'accent'}>
                      {si.purpose === 'person' ? 'Before programme' : 'Task fit'}
                    </Chip>
                    <p className="min-w-0 flex-1 truncate text-sm font-bold">{si.event}</p>
                    <Chip tone={SHARING_TONE[si.sharing]}>{si.sharing}</Chip>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {[new Date(si.started_at).toLocaleDateString(), si.status,
                      si.minutes ? `${si.minutes} min` : null, si.language,
                      si.flags > 0 ? `${si.flags} flags` : null].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                    {si.top_pathway && <span>Top task: <b>{prettyKey(si.top_pathway)}</b></span>}
                    {si.top_motivation && <span>Drive: <b>{prettyKey(si.top_motivation)}</b></span>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* individual report — only ever reaches here at the consented level;
          portalled for the same fixed-inside-transform reason as above */}
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-extrabold">{open.full_name ?? 'Participant'}</h2>
                <p className="text-[11px] text-muted">
                  Shared as {open.sharing}{open.generated_by ? ` · ${open.generated_by}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><X size={15} /></button>
            </div>
            {open.pending ? (
              <p className="py-6 text-center text-sm text-muted">Report not generated yet.</p>
            ) : (
              <ReportBody content={open.content} summaryOnly={open.sharing === 'summary'} />
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
