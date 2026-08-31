/* P0.1 — Cohorts & Enrolment (Command HQ → 30 Days → Enrolment).
   Before this, the ONLY way into a cohort was the warrior pressing "Enrol" on
   /challenge; leadership had no door at all, and the cohort field on invitations
   was never read. Everything here goes through audited security-definer RPCs:
   fn_admin_create_cohort · fn_admin_update_cohort · fn_admin_enrol ·
   fn_admin_set_enrolment · fn_admin_enrolable. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Users, Plus, Search, Pause, Play, UserMinus, RefreshCw, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface Cohort {
  id: string; name: string; country: string | null; status: string
  official_start_date: string; official_timezone: string; daily_unlock_time: string
  curriculum_version_id: string | null
}
interface Enrol {
  id: string; participant_id: string; cohort_id: string; status: string
  catch_up_days: number; activated_at: string | null
  profiles: { name: string; country: string } | null
}
interface Person { id: string; name: string; country: string; phone: string | null; live_enrolment: boolean }
interface CoachOpt { user_id: string; profiles: { name: string } | null }
interface Version { id: string; version: number; status: string }

const STAGE_TONE: Record<string, 'success' | 'warning' | 'info' | 'accent' | 'default' | 'danger'> = {
  active: 'success', onboarding: 'warning', invited: 'info', ready: 'accent',
  completed: 'accent', graduated: 'success', paused: 'default', withdrawn: 'danger',
}

export default function Enrolment({ team, realId, onSaved }: {
  team: 'ALL' | 'MY' | 'ID'; realId: boolean; onSaved: (m: string) => void
}) {
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [enrols, setEnrols] = useState<Enrol[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [coaches, setCoaches] = useState<CoachOpt[]>([])
  const [versions, setVersions] = useState<Version[]>([])
  const [days, setDays] = useState<Record<string, number>>({})
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [err, setErr] = useState('')
  const [asOf, setAsOf] = useState('')

  // enrol form
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState('')
  const [coach, setCoach] = useState('')
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  // new cohort form
  const [showNew, setShowNew] = useState(false)
  const [nc, setNc] = useState({ name: '', country: 'MY', start: '', tz: '', unlock: '06:00', version: '', status: 'open' })

  const load = useCallback(async () => {
    if (!realId || !supabase) { setState('ready'); return }
    setState('loading'); setErr('')
    const [co, en, pe, ro, ve] = await Promise.all([
      supabase.from('cohorts').select('*').order('official_start_date', { ascending: false }),
      supabase.from('enrolments')
        .select('id,participant_id,cohort_id,status,catch_up_days,activated_at,profiles!enrolments_participant_id_fkey(name,country)')
        .order('created_at', { ascending: false }),
      supabase.rpc('fn_admin_enrolable', { p_country: team === 'ALL' ? null : team }),
      supabase.from('user_roles').select('user_id,role,profiles(name)')
        .in('role', ['elite_coach', 'master_mentor', 'super_admin']),
      supabase.from('curriculum_versions').select('id,version,status').order('version', { ascending: false }),
    ])
    if (co.error) { setErr(co.error.message); setState('error'); return }
    const cs = (co.data as Cohort[]) ?? []
    setCohorts(cs)
    setEnrols((en.data as unknown as Enrol[]) ?? [])
    setPeople((pe.data as Person[]) ?? [])
    // one row per coach even if they hold several roles
    const seen = new Set<string>()
    setCoaches(((ro.data as unknown as CoachOpt[]) ?? []).filter((r) => {
      if (seen.has(r.user_id)) return false
      seen.add(r.user_id); return true
    }))
    setVersions((ve.data as Version[]) ?? [])
    const dm: Record<string, number> = {}
    await Promise.all(cs.map(async (c) => {
      const { data } = await supabase!.rpc('cohort_day', { p_cohort: c.id })
      dm[c.id] = (data as number) ?? 0
    }))
    setDays(dm)
    setAsOf(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    setState('ready')
  }, [realId, team])
  useEffect(() => { load() }, [load])

  const rpc = async (fn: string, args: object, ok: string) => {
    if (!supabase) return null
    setBusy(true)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { onSaved('⚠ ' + error.message); return null }
    onSaved(ok); load(); return data
  }

  const visibleCohorts = useMemo(
    () => cohorts.filter((c) => team === 'ALL' || c.country === team || c.country === null),
    [cohorts, team])
  const candidates = useMemo(() => people
    .filter((p) => !p.live_enrolment)
    .filter((p) => !q || p.name?.toLowerCase().includes(q.toLowerCase()) || (p.phone ?? '').includes(q)),
    [people, q])
  const enrolsFor = (cid: string) => enrols.filter((e) => e.cohort_id === cid)

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account on production to manage cohorts and enrolment.</Card>
  if (state === 'error') return (
    <Card className="p-6 text-center">
      <p className="text-sm font-bold text-danger">⚠ Could not load cohorts</p>
      <p className="mt-1 text-xs text-muted">{err}</p>
    </Card>
  )

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={load} disabled={state === 'loading'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Refresh
        </button>
        {asOf && state === 'ready' && <span className="text-[11px] text-muted">as of {asOf}</span>}
        <span className="flex-1" />
        <button type="button" onClick={() => setShowNew((v) => !v)}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-3 text-xs font-extrabold text-on-accent">
          <Plus size={14} /> New cohort
        </button>
      </div>

      {showNew && (
        <Card className="mb-4 p-4">
          <SectionTitle>Create a cohort</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Cohort name (e.g. MY Cohort 2)"
              className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <select value={nc.country} onChange={(e) => setNc({ ...nc, country: e.target.value })}
              className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
              <option value="MY">🇲🇾 Malaysia</option><option value="ID">🇮🇩 Indonesia</option>
            </select>
            <label className="text-[11px] font-bold text-muted">Official start date
              <input type="date" value={nc.start} onChange={(e) => setNc({ ...nc, start: e.target.value })}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" /></label>
            <label className="text-[11px] font-bold text-muted">Daily unlock time (cohort timezone)
              <input type="time" value={nc.unlock} onChange={(e) => setNc({ ...nc, unlock: e.target.value })}
                className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" /></label>
            <select value={nc.version} onChange={(e) => setNc({ ...nc, version: e.target.value })}
              className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
              <option value="">Curriculum: latest published</option>
              {versions.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.status}</option>)}
            </select>
            <select value={nc.status} onChange={(e) => setNc({ ...nc, status: e.target.value })}
              className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
              <option value="draft">draft — not visible to warriors</option>
              <option value="open">open — accepts enrolment</option>
              <option value="active">active</option>
            </select>
          </div>
          <button type="button" disabled={busy || !nc.name || !nc.start}
            onClick={async () => {
              const ok = await rpc('fn_admin_create_cohort', {
                p_name: nc.name, p_country: nc.country, p_start: nc.start,
                p_timezone: nc.tz || null, p_unlock: nc.unlock,
                p_version: nc.version || null, p_status: nc.status,
              }, '✅ Cohort created')
              if (ok) { setShowNew(false); setNc({ ...nc, name: '', start: '' }) }
            }}
            className="mt-3 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
            Create cohort
          </button>
          <p className="mt-2 text-[11px] text-muted">
            Timezone defaults to Asia/Kuala_Lumpur (MY) or Asia/Jakarta (ID). The cohort clock and every
            warrior's accessible day are computed server-side from these settings.
          </p>
        </Card>
      )}

      {/* ---------- enrol warriors ---------- */}
      <SectionTitle><Users size={13} className="mr-1 inline" />Enrol warriors</SectionTitle>
      <Card className="mb-5 p-4">
        <div className="mb-2 grid gap-2 sm:grid-cols-3">
          <select value={target} onChange={(e) => setTarget(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
            <option value="">Choose cohort…</option>
            {visibleCohorts.filter((c) => ['draft', 'open', 'active'].includes(c.status))
              .map((c) => <option key={c.id} value={c.id}>{c.country === 'ID' ? '🇮🇩' : '🇲🇾'} {c.name} · day {days[c.id] ?? 0}/30</option>)}
          </select>
          <select value={coach} onChange={(e) => setCoach(e.target.value)}
            className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
            <option value="">Assign coach (optional)…</option>
            {coaches.map((c) => <option key={c.user_id} value={c.user_id}>{c.profiles?.name ?? c.user_id.slice(0, 8)}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (audit trail)"
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </div>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search warriors by name or phone…"
            className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent" />
        </div>
        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          {candidates.length === 0 && (
            <p className="p-5 text-center text-xs text-muted">
              {people.length === 0 ? 'No active profiles found in this country scope.'
                : 'Every active warrior in this scope already has a live enrolment.'}
            </p>
          )}
          {candidates.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-border p-2.5 last:border-0 hover:bg-surface2/50">
              <input type="checkbox" checked={pick.has(p.id)} className="h-4 w-4 accent-[var(--accent)]"
                onChange={(e) => {
                  const n = new Set(pick)
                  if (e.target.checked) n.add(p.id); else n.delete(p.id)
                  setPick(n)
                }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.country === 'ID' ? '🇮🇩' : '🇲🇾'} {p.name}</span>
                <span className="block text-[11px] text-muted">{p.phone ?? '—'}</span>
              </span>
            </label>
          ))}
        </div>
        <button type="button" disabled={busy || !target || pick.size === 0}
          onClick={async () => {
            const ok = await rpc('fn_admin_enrol', {
              p_cohort: target, p_participants: [...pick], p_coach: coach || null, p_note: note || null,
            }, `✅ Enrolled ${pick.size} warrior${pick.size > 1 ? 's' : ''} — they now complete readiness`)
            if (ok) { setPick(new Set()); setNote('') }
          }}
          className="mt-3 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
          Enrol {pick.size > 0 ? `${pick.size} selected` : 'warriors'}
        </button>
        <p className="mt-2 text-[11px] text-muted">
          Enrolled warriors land at <b>INVITED</b>. They complete onboarding and submit readiness; a Coach approves it
          in the Review Queue and only then does the enrolment become <b>ACTIVE</b> and Day 1 open.
          A warrior can hold only one live enrolment at a time.
        </p>
      </Card>

      {/* ---------- cohorts ---------- */}
      <SectionTitle><CalendarDays size={13} className="mr-1 inline" />Cohorts ({visibleCohorts.length})</SectionTitle>
      {visibleCohorts.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted">No cohorts exist for this country scope yet.</Card>)}
      {visibleCohorts.map((c) => {
        const list = enrolsFor(c.id)
        return (
          <Card key={c.id} className="mb-3 p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="font-display text-sm font-extrabold">{c.country === 'ID' ? '🇮🇩' : '🇲🇾'} {c.name}</p>
              <Chip tone={c.status === 'open' || c.status === 'active' ? 'success' : 'default'}>{c.status}</Chip>
              <Chip>day {days[c.id] ?? 0}/30</Chip>
              <span className="flex-1" />
              <select value={c.status} disabled={busy}
                onChange={(e) => rpc('fn_admin_update_cohort',
                  { p_cohort: c.id, p_patch: { status: e.target.value } }, `Cohort set to ${e.target.value}`)}
                className="h-8 cursor-pointer rounded-lg border border-border bg-surface px-2 text-[11px] font-bold outline-none">
                {['draft', 'open', 'active', 'completed', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <p className="mb-3 text-[11px] text-muted">
              Starts {c.official_start_date} · {c.official_timezone} · unlocks {String(c.daily_unlock_time).slice(0, 5)} local
            </p>
            {list.length === 0
              ? <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">No Warriors are enrolled in this cohort yet.</p>
              : (
                <div className="divide-y divide-border">
                  {list.map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{e.profiles?.name ?? '—'}</span>
                        <span className="block text-[11px] text-muted">
                          {e.activated_at ? `activated ${e.activated_at.slice(0, 10)}` : 'not activated'}
                          {e.catch_up_days > 0 && ` · +${e.catch_up_days} catch-up`}
                        </span>
                      </span>
                      <Chip tone={STAGE_TONE[e.status] ?? 'default'}>{e.status}</Chip>
                      <div className="flex gap-1.5">
                        {e.status === 'active' && (
                          <button type="button" disabled={busy} title="Pause"
                            onClick={() => {
                              const r = window.prompt('Reason for pausing this warrior?')
                              if (r && r.trim().length >= 3) rpc('fn_admin_set_enrolment',
                                { p_enrolment: e.id, p_status: 'paused', p_reason: r, p_catch_up_days: null }, 'Paused')
                            }}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border text-muted"><Pause size={13} /></button>
                        )}
                        {e.status === 'paused' && (
                          <button type="button" disabled={busy} title="Resume"
                            onClick={() => rpc('fn_admin_set_enrolment',
                              { p_enrolment: e.id, p_status: 'active', p_reason: 'resumed', p_catch_up_days: null }, 'Resumed')}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-success/50 text-success"><Play size={13} /></button>
                        )}
                        <button type="button" disabled={busy} title="Grant catch-up days"
                          onClick={() => {
                            const n = window.prompt('Grant how many extra accessible days?', String(e.catch_up_days || 0))
                            if (n !== null && !Number.isNaN(Number(n))) rpc('fn_admin_set_enrolment',
                              { p_enrolment: e.id, p_status: null, p_reason: 'catch-up granted', p_catch_up_days: Number(n) },
                              `Catch-up set to ${Number(n)} day(s)`)
                          }}
                          className="flex h-8 cursor-pointer items-center rounded-lg border border-border px-2 text-[11px] font-bold text-muted">+days</button>
                        {!['withdrawn', 'graduated'].includes(e.status) && (
                          <button type="button" disabled={busy} title="Withdraw"
                            onClick={() => {
                              const r = window.prompt('Reason for withdrawing this warrior? (kept in the audit trail)')
                              if (r && r.trim().length >= 3) rpc('fn_admin_set_enrolment',
                                { p_enrolment: e.id, p_status: 'withdrawn', p_reason: r, p_catch_up_days: null }, 'Withdrawn')
                            }}
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-danger/50 text-danger"><UserMinus size={13} /></button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </Card>
        )
      })}

      <Card className={clsx('mt-4 border-accent/40 bg-accent-soft p-3.5')}>
        <p className="flex items-center gap-1.5 text-xs font-extrabold text-accent"><ShieldCheck size={13} /> Every action here is audited</p>
        <p className="mt-1 text-[11px] text-muted">
          Cohort creation, enrolment, pause, catch-up grants and withdrawal all write an append-only
          audit event with the actor, the previous state and the reason. Nothing on this screen can
          approve readiness, approve evidence, award XP or graduate a warrior — those stay human decisions
          in the Coach Review Queue.
        </p>
      </Card>
    </>
  )
}
