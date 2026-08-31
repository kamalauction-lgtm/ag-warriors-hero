/* ADMIN CONSOLE — full-screen desktop dashboard for the ENTIRE super-app.
   Sections: Dashboard (whole business) · People · Sales · Activity · Elite ·
   Booths · Caller/M4U (one function, with its own sub-tabs) · Content ·
   Rewards · Country Settings */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Activity,
  Swords,
  Tent,
  PhoneCall,
  FolderCog,
  Gift,
  Globe2,
  X,
  Shield,
  Check,
  Ban,
  RotateCcw,
  Pause,
  Play,
  Download,
  Crown,
  Handshake,
  Zap,
  Flame,
  UserPlus,
  AlertTriangle,
  Timer,
  BellRing,
  Sun,
  Moon,
  Ticket,
  Award,
  Rocket,
  Compass,
  GraduationCap,
  Camera,
  Library,
  RefreshCw,
  Mic,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { Avatar, Bar, Card, Chip } from '../components/ui'
import { resetBrand, setBrandFile, useBrand, type BrandCountry, type BrandSlot } from '../lib/brand'
import { getIncomeCfg, setIncomeCfg, useIncomeCfg } from '../lib/income'
import { supabase, supabaseReady } from '../lib/supabase'
import { exportCsv } from '../lib/csv'
import ChallengeReports from '../modules/challenge/Reports'
import Coaches from '../modules/challenge/Coaches'
import Enrolment from '../modules/challenge/Enrolment'
import Health from '../modules/challenge/Health'
import Governance from '../modules/challenge/Governance'
import Authority from '../modules/challenge/Authority'
import CallerAdmin from '../modules/caller/CallerAdmin'
import TalentAdmin from '../modules/talent/TalentAdmin'
import OnbAdmin from '../modules/onboarding/OnbAdmin'
import SocialAdmin from '../modules/social/SocialAdmin'
import AtlasAdmin from '../modules/atlas/AtlasAdmin'
import AcademyAdmin from '../modules/academy/AcademyAdmin'
import EventsAdmin from '../modules/events/EventsAdmin'
import KamalagSessions from '../modules/events/KamalagSessions'
import CertTemplates from '../modules/events/CertTemplates'
import { BadgeRow } from '../components/Badges'
import WarriorProfile from '../components/WarriorProfile'
import './admin.css'

/* Curriculum editor — versioned, country-aware, audited (Super Admin).
   Three things changed after the 2026-08-23 audit:
     1. it filters by VERSION and by country variant (it used to select every row,
        which now means duplicate day numbers once v2 exists);
     2. it saves through fn_admin_save_day, which writes an audit event and REFUSES
        to rewrite a published day that warriors have already answered;
     3. a country variant still marked CONTENT REQUIRED is shown as such — warriors
        never see it, they get the generic row. */
const LANGS = ['en', 'ms-MY', 'id-ID'] as const
type J = Record<string, string>
interface CurDay {
  id: string; version_id: string; day_no: number; phase: number; xp_amount: number
  country_override: string | null; content_status: string; content_note: string | null
  proof_type: string | null
  title: J; objective: J; content: J; instructions: J | null; required_action: J
  stretch_action: J | null; evidence_requirement: J; reflection_question: J; coach_guidance: J | null
}
interface Ver { id: string; version: number; status: string }

function CurriculumEditor({ realId, onSaved }: { realId: boolean; onSaved: (m: string) => void }) {
  const [vers, setVers] = useState<Ver[]>([])
  const [verId, setVerId] = useState('')
  const [days, setDays] = useState<CurDay[]>([])
  const [lang, setLang] = useState<(typeof LANGS)[number]>('en')
  const [scope, setScope] = useState<'GENERIC' | 'MY' | 'ID'>('GENERIC')
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<CurDay>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!realId || !supabase) return
    const { data: vs } = await supabase.from('curriculum_versions')
      .select('id,version,status').order('version', { ascending: false })
    const list = (vs as Ver[]) ?? []
    setVers(list)
    const target = verId || list.find((v) => v.status === 'published')?.id || list[0]?.id || ''
    if (!target) { setDays([]); return }
    if (target !== verId) setVerId(target)
    const { data } = await supabase.from('curriculum_days').select('*')
      .eq('version_id', target).order('day_no')
    setDays((data as CurDay[]) ?? [])
  }, [realId, verId])
  useEffect(() => { load() }, [load])

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account to edit the live curriculum.</Card>

  const F: [keyof CurDay, string, number][] = [
    ['title', 'Title', 2], ['objective', 'Objective', 2], ['content', 'Learning content', 4],
    ['instructions', 'Instructions (how to do it in Hero)', 3],
    ['required_action', 'Required action', 3], ['stretch_action', 'Optional stretch', 2],
    ['evidence_requirement', 'Evidence requirement', 2], ['reflection_question', 'Reflection question', 2],
    ['coach_guidance', 'Coach guidance (what to verify)', 3],
  ]
  const ver = vers.find((v) => v.id === verId)
  const shown = days.filter((d) => (scope === 'GENERIC' ? d.country_override === null : d.country_override === scope))
  const gaps = days.filter((d) => d.content_status === 'content_required')

  const save = async (d: CurDay) => {
    if (!supabase) return
    setBusy(true)
    const patch: Record<string, unknown> = {}
    F.forEach(([k]) => {
      const dv = draft[k] as J | undefined
      if (dv) patch[k as string] = { ...((d[k] as J) ?? {}), ...dv }
    })
    if (draft.xp_amount != null) patch.xp_amount = draft.xp_amount
    if (draft.content_status) patch.content_status = draft.content_status
    if (Object.keys(patch).length === 0) { setBusy(false); onSaved('Nothing changed'); return }
    const { error } = await supabase.rpc('fn_admin_save_day', { p_day: d.id, p_patch: patch })
    setBusy(false)
    if (error) { onSaved('WARN ' + error.message); return }
    onSaved('Day ' + d.day_no + (d.country_override ? ' (' + d.country_override + ')' : '') + ' saved - audited')
    setDraft({}); setOpen(null); load()
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <select value={verId} onChange={(e) => { setVerId(e.target.value); setOpen(null) }}
          aria-label="Curriculum version"
          className="h-9 cursor-pointer rounded-xl border border-border bg-surface px-3 text-xs font-bold outline-none">
          {vers.map((v) => <option key={v.id} value={v.id}>v{v.version} · {v.status}</option>)}
        </select>
        {(['GENERIC', 'MY', 'ID'] as const).map((c) => (
          <button key={c} type="button" onClick={() => { setScope(c); setOpen(null) }}
            className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-extrabold',
              scope === c ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}>
            {c === 'GENERIC' ? 'Generic' : c === 'MY' ? 'MY' : 'ID'}
          </button>
        ))}
        <span className="w-2" />
        {LANGS.map((l) => (
          <button key={l} type="button" onClick={() => setLang(l)}
            className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-extrabold', lang === l ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:text-ink')}>
            {l}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy || !verId}
          onClick={async () => {
            if (!supabase) return
            setBusy(true)
            const { error } = await supabase.rpc('fn_admin_new_version', { p_from: verId, p_note: 'copied from v' + (ver?.version ?? '?') })
            setBusy(false)
            if (error) onSaved('WARN ' + error.message)
            else { onSaved('New draft version created'); setVerId(''); load() }
          }}
          className="h-9 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          + New draft version
        </button>
        {ver?.status === 'draft' && (
          <button type="button" disabled={busy}
            onClick={async () => {
              if (!supabase) return
              setBusy(true)
              const { error } = await supabase.rpc('fn_admin_publish_version', { p_version: verId, p_note: 'published from Command HQ' })
              setBusy(false)
              if (error) onSaved('WARN ' + error.message); else { onSaved('Version published'); load() }
            }}
            className="h-9 cursor-pointer rounded-xl bg-accent px-3 text-xs font-extrabold text-on-accent disabled:opacity-40">
            Publish v{ver.version}
          </button>
        )}
      </div>

      {gaps.length > 0 && (
        <Card className="mb-3 border-warning/50 bg-warning/10 p-3.5">
          <p className="text-xs font-extrabold text-warning">
            {gaps.length} country row(s) awaiting authorised local content
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Days {[...new Set(gaps.map((g) => g.day_no))].join(', ')}. Until each is written and set to
            <b> ok</b>, warriors read the generic row — Hero never substitutes the other country&apos;s content.
          </p>
        </Card>
      )}

      {shown.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted">
          {scope === 'GENERIC' ? 'This version has no days yet.' : 'No ' + scope + ' variants exist in this version.'}
        </Card>
      )}

      <div className="space-y-1.5">
        {shown.map((d) => (
          <Card key={d.id} className="overflow-hidden">
            <button type="button" onClick={() => { setOpen(open === d.id ? null : d.id); setDraft({}) }}
              className="flex w-full cursor-pointer items-center gap-3 p-3 text-left">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft font-display text-xs font-extrabold text-accent">{d.day_no}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{d.title?.[lang] ?? d.title?.en}</span>
              {d.content_status === 'content_required' && <Chip tone="warning">CONTENT REQUIRED</Chip>}
              {d.proof_type === 'native_record' && <Chip tone="success">system evidence</Chip>}
              <Chip>P{d.phase}</Chip><Chip tone="accent">{d.xp_amount} XP</Chip>
            </button>
            {open === d.id && (
              <div className="border-t border-border bg-surface2/40 p-3.5">
                {d.content_note && (
                  <p className="mb-3 rounded-lg bg-warning/10 p-2.5 text-[11px] font-semibold text-warning">
                    Authoring brief: {d.content_note}
                  </p>
                )}
                {F.map(([k, label, rows]) => (
                  <div key={k as string} className="mb-2.5">
                    <label className="mb-1 block text-[10px] font-bold uppercase text-muted">{label} · {lang}</label>
                    <textarea rows={rows}
                      defaultValue={(d[k] as J | null)?.[lang] ?? ''}
                      onChange={(e) => setDraft((dr) => ({ ...dr, [k]: { ...((dr[k] as J) ?? {}), [lang]: e.target.value } }))}
                      className="w-full rounded-xl border border-border bg-surface p-2.5 text-sm outline-none focus:border-accent" />
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[10px] font-bold uppercase text-muted">XP</label>
                  <input type="number" defaultValue={d.xp_amount} aria-label="XP amount"
                    onChange={(e) => setDraft((dr) => ({ ...dr, xp_amount: Number(e.target.value) || d.xp_amount }))}
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-center text-sm font-bold outline-none focus:border-accent" />
                  <label className="text-[10px] font-bold uppercase text-muted">Status</label>
                  <select defaultValue={d.content_status} aria-label="Content status"
                    onChange={(e) => setDraft((dr) => ({ ...dr, content_status: e.target.value }))}
                    className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs font-bold outline-none">
                    {['ok', 'draft', 'content_required'].map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                  <button type="button" disabled={busy} onClick={() => save(d)}
                    className="ml-auto cursor-pointer rounded-xl bg-accent px-5 py-2.5 text-xs font-extrabold text-on-accent hover:opacity-90 disabled:opacity-40">
                    Save Day {d.day_no}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-muted">
                  Saving writes an audit event. On a published version, a day that warriors have already
                  answered cannot have its required action, evidence or XP rewritten — create a new version instead.
                </p>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}

/* 30-Day Challenge — programme progress (Master Mentor view, live DB) */
interface ChRow {
  id: string; status: string; catch_up: boolean; cohort_id: string
  participant_id: string
  profiles: { name: string; country: string } | null
  cohorts: { name: string } | null
}
function ChallengeProgress({ realId }: { realId: boolean }) {
  const [rows, setRows] = useState<ChRow[]>([])
  const [ready, setReady] = useState<Record<string, string>>({})
  const [tasks, setTasks] = useState<Record<string, { sub: number; ok: number; last: string }>>({})
  const [xp, setXp] = useState<Record<string, number>>({})
  const [cohortDay, setCohortDay] = useState<Record<string, number>>({})
  const [accDay, setAccDay] = useState<Record<string, number>>({})
  const [err, setErr] = useState('')
  /* audit fix — this table used to have no loading state, no refetch and rendered
     stale rows underneath an error message, so a row deleted in SQL kept showing. */
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [asOf, setAsOf] = useState('')

  const load = useCallback(async () => {
    if (!realId || !supabase) { setState('ready'); return }
    setState('loading'); setErr('')
    const { data: es, error } = await supabase.from('enrolments')
      .select('id,status,catch_up,cohort_id,participant_id,profiles!enrolments_participant_id_fkey(name,country),cohorts(name)')
      .order('created_at')
    if (error) { setErr(error.message); setState('error'); setRows([]); return }
    const list = (es as unknown as ChRow[]) ?? []
    setRows(list)
    const { data: rs } = await supabase.from('readiness_submissions')
      .select('enrolment_id,status,created_at').order('created_at', { ascending: false })
    const rm: Record<string, string> = {}
    ;(rs ?? []).forEach((r: { enrolment_id: string; status: string }) => { if (!rm[r.enrolment_id]) rm[r.enrolment_id] = r.status })
    setReady(rm)
    /* dedupe resubmissions by (enrolment, day) — keep the newest version only,
       otherwise a warrior who resubmits twice reads as three tasks. */
    const { data: ts } = await supabase.from('task_submissions')
      .select('enrolment_id,day_no,status,version').order('version')
    const latest: Record<string, { status: string; day: number }> = {}
    ;(ts ?? []).forEach((t: { enrolment_id: string; day_no: number; status: string; version: number }) => {
      latest[`${t.enrolment_id}|${t.day_no}`] = { status: t.status, day: t.day_no }
    })
    const tm: Record<string, { sub: number; ok: number; last: string }> = {}
    Object.entries(latest).forEach(([k, v]) => {
      const eid = k.split('|')[0]
      const e = tm[eid] ?? { sub: 0, ok: 0, last: '—' }
      if (v.status === 'approved') e.ok++
      else if (['submitted', 'under_review'].includes(v.status)) e.sub++
      e.last = `D${v.day} ${v.status}`
      tm[eid] = e
    })
    setTasks(tm)
    const { data: pl } = await supabase.from('points_ledger').select('user_id,amount').eq('status', 'verified')
    const xm: Record<string, number> = {}
    ;(pl ?? []).forEach((p: { user_id: string; amount: number }) => { xm[p.user_id] = (xm[p.user_id] ?? 0) + p.amount })
    setXp(xm)
    const dm: Record<string, number> = {}
    await Promise.all([...new Set(list.map((r) => r.cohort_id))].map(async (c) => {
      const { data: d } = await supabase!.rpc('cohort_day', { p_cohort: c })
      dm[c] = (d as number) ?? 0
    }))
    setCohortDay(dm)
    /* THE day-column fix — the participant's own accessible day, per enrolment.
       The cohort clock is a property of the cohort and must never be printed
       on an onboarding row as if it were that warrior's progress. */
    const am: Record<string, number> = {}
    await Promise.all(list.map(async (r) => {
      const { data: d } = await supabase!.rpc('participant_accessible_day', { p_enrolment: r.id })
      am[r.id] = (d as number) ?? 0
    }))
    setAccDay(am)
    setAsOf(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    setState('ready')
  }, [realId])
  useEffect(() => { load() }, [load])

  const STAGE: Record<string, 'success' | 'warning' | 'info' | 'accent' | 'default' | 'danger'> = {
    active: 'success', onboarding: 'warning', invited: 'info', ready: 'accent',
    completed: 'accent', graduated: 'success', paused: 'default', withdrawn: 'danger',
  }
  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account on production to see live programme data.</Card>
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={load} disabled={state === 'loading'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Refresh
        </button>
        {state === 'ready' && asOf && <span className="text-[11px] text-muted">as of {asOf}</span>}
      </div>
      {state === 'error' && (
        <Card className="p-6 text-center">
          <p className="text-sm font-bold text-danger">⚠ Could not load programme data</p>
          <p className="mt-1 text-xs text-muted">{err}</p>
          <p className="mt-2 text-[11px] text-muted">Nothing is shown rather than showing you numbers that may be stale.</p>
        </Card>
      )}
      {state === 'loading' && <Card className="p-6 text-center text-xs text-muted">Loading live programme data…</Card>}
      {state === 'ready' && (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Warrior</th><th className="px-2 py-3">Cohort</th>
                <th className="px-2 py-3">Stage</th><th className="px-2 py-3">Readiness</th>
                <th className="px-2 py-3">Cohort day</th><th className="px-2 py-3">Their day</th>
                <th className="px-2 py-3">Tasks ✓/⏳</th>
                <th className="px-2 py-3">Latest</th><th className="px-4 py-3 text-right">Verified XP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-xs text-muted">No Warriors are enrolled in this cohort yet.</td></tr>}
              {rows.map((r) => {
                const t = tasks[r.id] ?? { sub: 0, ok: 0, last: '—' }
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                    <td className="px-4 py-3 font-semibold">
                      {r.profiles?.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.profiles?.name ?? '—'}
                      {r.catch_up && <Chip tone="warning" className="ml-1.5">catch-up</Chip>}
                    </td>
                    <td className="px-2 py-3 text-xs">{r.cohorts?.name ?? '—'}</td>
                    <td className="px-2 py-3"><Chip tone={STAGE[r.status] ?? 'default'}>{r.status}</Chip></td>
                    <td className="px-2 py-3"><Chip tone={ready[r.id] === 'approved' ? 'success' : ready[r.id] === 'submitted' ? 'warning' : 'default'}>{ready[r.id] ?? '—'}</Chip></td>
                    <td className="px-2 py-3 text-xs text-muted">{cohortDay[r.cohort_id] ?? '—'}/30</td>
                    <td className="px-2 py-3 font-bold">{r.status === 'active' ? `${accDay[r.id] ?? 0}/30` : '—'}</td>
                    <td className="px-2 py-3">{t.ok} ✓ · {t.sub} ⏳</td>
                    <td className="px-2 py-3 text-xs text-muted">{t.last}</td>
                    <td className="px-4 py-3 text-right font-display font-extrabold text-accent">{xp[r.participant_id] ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="p-4 text-[11px] text-muted">
            <b>Cohort day</b> = where the cohort is on the calendar. <b>Their day</b> = the latest day this warrior may open (blank until ACTIVE).
            Stages: invited → onboarding → ready → active → completed → graduated. Approvals stay human-only in the Coach Queue.
          </p>
        </Card>
      )}
    </>
  )
}

/* Income rules editor — full subsale engine constants, per country
   (ladder, agency max, OV rule, RGR tables, cap, properties) */
function IncomeRules({ country, onSaved }: { country: 'MY' | 'ID'; onSaved: (m: string) => void }) {
  const cfg = useIncomeCfg(country)
  const save = (patch: Partial<typeof cfg>) => {
    setIncomeCfg(country, { ...getIncomeCfg(country), ...patch }).then((err) =>
      onSaved(err
        ? `⚠ ${country} save failed: ${err}`
        : `${country} income rules saved — live for every agent`))
  }
  const num = 'w-16 rounded-lg border border-border bg-surface px-1.5 py-1.5 text-center text-xs font-bold outline-none focus:border-accent'
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
        {country === 'MY' ? '🇲🇾 Malaysia' : '🇮🇩 Indonesia'}
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-muted">
        <label>Agency max %
          <input type="number" step={0.5} defaultValue={cfg.agencyMax}
            onBlur={(e) => save({ agencyMax: Number(e.target.value) || cfg.agencyMax })} className={clsx(num, 'ml-1.5')} />
        </label>
        <label>{cfg.taxName} %
          <input type="number" step={1} defaultValue={Math.round(cfg.taxRate * 100)}
            onBlur={(e) => save({ taxRate: (Number(e.target.value) || 0) / 100 })} className={clsx(num, 'ml-1.5')} />
        </label>
        <label>Cap %
          <input type="number" step={1} defaultValue={Math.round(cfg.combinedCap * 100)}
            onBlur={(e) => save({ combinedCap: (Number(e.target.value) || 97) / 100 })} className={clsx(num, 'ml-1.5')} />
        </label>
      </div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
        RGR tiers % — standard (selling &lt; {Math.round(cfg.rgrHighMin * 100)}%) / high
      </p>
      <div className="mb-3 flex gap-1.5">
        {cfg.rgrStd.map((v, i) => (
          <input key={`s${i}`} type="number" step={1} defaultValue={Math.round(v * 100)} aria-label={`RGR std L${i + 1}`}
            onBlur={(e) => { const t = [...cfg.rgrStd]; t[i] = (Number(e.target.value) || 0) / 100; save({ rgrStd: t }) }} className={num} />
        ))}
        <span className="text-xs text-muted">/</span>
        {cfg.rgrHigh.map((v, i) => (
          <input key={`h${i}`} type="number" step={1} defaultValue={Math.round(v * 100)} aria-label={`RGR high L${i + 1}`}
            onBlur={(e) => { const t = [...cfg.rgrHigh]; t[i] = (Number(e.target.value) || 0) / 100; save({ rgrHigh: t }) }} className={num} />
        ))}
      </div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
        Rank ladder — name · acc. target · add-on % (total = base {Math.round(cfg.baseRate * 100)}% + add-on)
      </p>
      {cfg.ladder.map((l, i) => (
        <div key={i} className="mb-1 flex items-center gap-1.5 text-xs">
          <input defaultValue={l.name} onBlur={(e) => { const t = [...cfg.ladder]; t[i] = { ...l, name: e.target.value.toUpperCase() }; save({ ladder: t }) }}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 font-bold outline-none focus:border-accent" />
          <input type="number" defaultValue={l.target} aria-label="Accumulated target"
            onBlur={(e) => { const t = [...cfg.ladder]; t[i] = { ...l, target: Number(e.target.value) || 0 }; save({ ladder: t }) }}
            className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
          <input type="number" step={1} defaultValue={Math.round(l.addon * 100)} aria-label="Add-on %"
            onBlur={(e) => { const t = [...cfg.ladder]; t[i] = { ...l, addon: (Number(e.target.value) || 0) / 100 }; save({ ladder: t }) }}
            className={num} />
        </div>
      ))}
      <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider text-muted">Properties — name · price · agency % (comparison list)</p>
      {cfg.properties.map((pr, i) => (
        <div key={pr.id} className="mb-1 flex items-center gap-1.5 text-xs">
          <input defaultValue={pr.name} onBlur={(e) => { const ps = [...cfg.properties]; ps[i] = { ...pr, name: e.target.value }; save({ properties: ps }) }}
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
          <input type="number" defaultValue={pr.price} aria-label="Price"
            onBlur={(e) => { const ps = [...cfg.properties]; ps[i] = { ...pr, price: Number(e.target.value) || 0 }; save({ properties: ps }) }}
            className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
          <input type="number" step={0.1} max={cfg.agencyMax} defaultValue={pr.agency} aria-label="Agency %"
            onBlur={(e) => { const ps = [...cfg.properties]; ps[i] = { ...pr, agency: Math.min(Number(e.target.value) || 0, cfg.agencyMax) }; save({ properties: ps }) }}
            className={num} />
        </div>
      ))}
      <button type="button" onClick={() => save({ properties: [...cfg.properties, { id: `p${Date.now()}`, name: 'New property', price: 500000, agency: Math.min(3, cfg.agencyMax) }] })}
        className="cursor-pointer text-xs font-bold text-accent">+ Add property</button>

      {country === 'MY' ? (
        <>
          <p className="mb-2 mt-3 rounded-lg border border-accent/40 bg-accent-soft/40 p-2 text-[10px] font-semibold">
            🔒 MY Primary rules LOCKED (spec §E) — you edit project values only.
          </p>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">
            MY primary projects — name · price · REN% · 🎁 RGR bonus (selected projects, immediate recruiter, set period)
          </p>
          {(cfg.myPrimary ?? []).map((pr, i) => (
            <div key={pr.id} className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <input defaultValue={pr.name} onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, name: e.target.value }; save({ myPrimary: ps }) }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" defaultValue={pr.price} aria-label="Price"
                onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, price: Number(e.target.value) || 0 }; save({ myPrimary: ps }) }}
                className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" step={0.1} defaultValue={pr.ren} aria-label="REN %"
                onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, ren: Number(e.target.value) || 0 }; save({ myPrimary: ps }) }}
                className={num} />
              <button type="button" title="RGR bonus on/off"
                onClick={() => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrOn: !pr.rgrOn }; save({ myPrimary: ps }) }}
                className={clsx('cursor-pointer rounded-lg border px-2 py-1.5 font-bold', pr.rgrOn ? 'border-warning text-warning' : 'border-border text-muted opacity-50')}>🎁</button>
              {pr.rgrOn && (
                <>
                  <input type="number" step={0.5} defaultValue={pr.rgrPct} aria-label="RGR %" title="RGR % of price"
                    onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrPct: Number(e.target.value) || 0 }; save({ myPrimary: ps }) }}
                    className={clsx(num, 'border-warning/50')} />
                  <input defaultValue={pr.rgrFrom ?? ''} placeholder="from" aria-label="Valid from"
                    onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrFrom: e.target.value }; save({ myPrimary: ps }) }}
                    className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
                  <input defaultValue={pr.rgrTo ?? ''} placeholder="to" aria-label="Valid to"
                    onBlur={(e) => { const ps = [...(cfg.myPrimary ?? [])]; ps[i] = { ...pr, rgrTo: e.target.value }; save({ myPrimary: ps }) }}
                    className="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
                </>
              )}
            </div>
          ))}
          <button type="button" onClick={() => save({ myPrimary: [...(cfg.myPrimary ?? []), { id: `m${Date.now()}`, name: 'New project', price: 500000, ren: 2, vp: 0.73, hot: 0.4, hotOn: true, tlOn: true, lOn: true, rgrOn: false, rgrPct: 1, appear: ['income'] }] })}
            className="cursor-pointer text-xs font-bold text-accent">+ Add MY project</button>
        </>
      ) : (
        <>
          <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wider text-muted">
            ID Primary — pool distribution % (of dev amount; must total 100)
          </p>
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {Object.entries(cfg.primarySlices).map(([k, v]) => (
              <label key={k} className="text-center">
                <span className="block truncate text-[8px] font-bold text-muted">{k}</span>
                <input type="number" step={0.5} defaultValue={v} aria-label={k}
                  onBlur={(e) => save({ primarySlices: { ...cfg.primarySlices, [k]: Number(e.target.value) || 0 } })}
                  className="w-full rounded-lg border border-border bg-surface px-1 py-1.5 text-center text-xs font-bold outline-none focus:border-accent" />
              </label>
            ))}
          </div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted">Primary projects — name · price · % from developer</p>
          {cfg.primaryProps.map((pr, i) => (
            <div key={pr.id} className="mb-1 flex items-center gap-1.5 text-xs">
              <input defaultValue={pr.name} onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, name: e.target.value }; save({ primaryProps: ps }) }}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" defaultValue={pr.price} aria-label="Price"
                onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, price: Number(e.target.value) || 0 }; save({ primaryProps: ps }) }}
                className="w-28 rounded-lg border border-border bg-surface px-2 py-1.5 outline-none focus:border-accent" />
              <input type="number" step={0.5} defaultValue={pr.devPct} aria-label="Dev %" title="% from developer"
                onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, devPct: Number(e.target.value) || 0 }; save({ primaryProps: ps }) }}
                className={num} />
              <input type="number" step={1} defaultValue={pr.agentPct ?? cfg.primarySlices.AGENT} aria-label="Agent %" title="Agent share % — others reduce pro-rata"
                onBlur={(e) => { const ps = [...cfg.primaryProps]; ps[i] = { ...pr, agentPct: Number(e.target.value) || cfg.primarySlices.AGENT }; save({ primaryProps: ps }) }}
                className={clsx(num, 'border-accent/50')} />
              {(['income', 'catalog', 'elite'] as const).map((zone) => {
                const on = (pr.appear ?? ['income']).includes(zone)
                return (
                  <button key={zone} type="button" title={`Show in ${zone}`}
                    onClick={() => {
                      const cur = pr.appear ?? ['income']
                      const ps = [...cfg.primaryProps]
                      ps[i] = { ...pr, appear: on ? cur.filter((z) => z !== zone) : [...cur, zone] }
                      save({ primaryProps: ps })
                    }}
                    className={clsx('cursor-pointer rounded-lg border px-1.5 py-1.5 text-[11px]', on ? 'border-accent text-accent' : 'border-border text-muted opacity-50')}>
                    {zone === 'income' ? '💰' : zone === 'catalog' ? '🏠' : '⚔'}
                  </button>
                )
              })}
            </div>
          ))}
          <button type="button" onClick={() => save({ primaryProps: [...cfg.primaryProps, { id: `pp${Date.now()}`, name: 'New project', price: 1000000000, devPct: 5 }] })}
            className="cursor-pointer text-xs font-bold text-accent">+ Add project</button>
        </>
      )}
    </div>
  )
}

/* One uploadable brand slot (logo / mascot) — Supabase Storage with
   version history (v1, v2, v3… kept; Reset deactivates, files stay). */
function BrandSlotEditor({
  country,
  slot,
  label,
  hint,
  onSaved,
}: {
  country: BrandCountry
  slot: BrandSlot
  label: string
  hint?: string
  onSaved: (m: string) => void
}) {
  const current = useBrand(country, slot)
  const inputId = `up-${country}-${slot}`
  const onPick = (f: File) => {
    setBrandFile(country, slot, f).then((err) =>
      onSaved(err ? `⚠ ${label} upload failed: ${err}` : `${label} updated — live on every device`))
  }
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface2">
        {current ? (
          <img src={current} alt={label} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-[9px] font-bold text-muted">empty</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-[10px] text-muted">{hint}</p>}
      </div>
      <input
        id={inputId}
        type="file"
        accept="image/png,image/webp,image/svg+xml,image/jpeg"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
      <label
        htmlFor={inputId}
        className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent transition-opacity hover:opacity-90"
      >
        Upload
      </label>
      <button
        type="button"
        onClick={() => {
          resetBrand(country, slot).then((err) =>
            onSaved(err ? `⚠ reset failed: ${err}` : `${label} reset to default (history kept)`))
        }}
        className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-ink"
      >
        Reset
      </button>
    </div>
  )
}

/* Country settings — live rows from country_settings, admin-editable.
   GHL / M4U secrets are shown as set / not set only, never displayed. */
interface CSRow {
  country: 'MY' | 'ID'; currency: string; tax_name: string; tax_rate: number
  default_language: string; phone_prefix: string; timezone: string
  ghl_location_id: string | null; m4u_secret: string | null
}
function CountrySettingsCard({ c, onSaved }: { c: 'MY' | 'ID'; onSaved: (m: string) => void }) {
  const [row, setRow] = useState<CSRow | null>(null)
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState<CSRow | null>(null)

  useEffect(() => {
    supabase?.from('country_settings').select('*').eq('country', c).maybeSingle()
      .then(({ data }) => setRow(data as CSRow | null))
  }, [c])

  const save = async () => {
    if (!supabase || !draft) return
    const { error } = await supabase.from('country_settings').update({
      currency: draft.currency, tax_name: draft.tax_name, tax_rate: draft.tax_rate,
      default_language: draft.default_language, phone_prefix: draft.phone_prefix,
      timezone: draft.timezone, updated_at: new Date().toISOString(),
    }).eq('country', c)
    if (error) { onSaved(`⚠ ${c} save failed: ${error.message}`); return }
    setRow(draft); setEdit(false)
    onSaved(`${c} settings saved — live for every agent`)
  }

  const inp = 'w-40 rounded-lg border border-border bg-surface px-2 py-1.5 text-right text-sm font-semibold outline-none focus:border-accent'
  if (!row) return <Card className="p-5 text-center text-xs text-muted">Loading {c}…</Card>
  const d = draft ?? row
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-sm font-extrabold">{c === 'MY' ? '🇲🇾 Malaysia' : '🇮🇩 Indonesia'}</p>
        {!edit && (
          <button type="button" onClick={() => { setDraft(row); setEdit(true) }}
            className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink">
            Edit
          </button>
        )}
      </div>
      {([
        ['Currency', 'currency', d.currency],
        ['Tax name', 'tax_name', d.tax_name],
        ['Tax rate %', 'tax_rate', String(Math.round(d.tax_rate * 10000) / 100)],
        ['Default language', 'default_language', d.default_language],
        ['Phone prefix', 'phone_prefix', d.phone_prefix],
        ['Timezone', 'timezone', d.timezone],
      ] as [string, keyof CSRow, string][]).map(([label, field, val]) => (
        <div key={field} className="flex items-center justify-between border-b border-border py-2.5 text-sm">
          <span className="text-muted">{label}</span>
          {edit ? (
            field === 'default_language' ? (
              <select value={val} className={inp}
                onChange={(e) => setDraft({ ...d, default_language: e.target.value })}>
                <option value="en">en</option><option value="ms">ms (BM)</option><option value="id">id</option>
              </select>
            ) : (
              <input value={val} className={inp}
                onChange={(e) => setDraft({
                  ...d,
                  [field]: field === 'tax_rate' ? (Number(e.target.value) || 0) / 100 : e.target.value,
                })} />
            )
          ) : (
            <span className="font-semibold">{field === 'tax_rate' ? `${val}%` : val}</span>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between border-b border-border py-2.5 text-sm">
        <span className="text-muted">GHL account</span>
        <span className="font-semibold">{row.ghl_location_id ? 'connected' : 'not set'}</span>
      </div>
      <div className="flex items-center justify-between py-2.5 text-sm">
        <span className="text-muted">M4U webhook secret</span>
        <span className="font-semibold">{row.m4u_secret ? 'set' : 'not set'}</span>
      </div>
      {edit && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={save}
            className="flex-1 cursor-pointer rounded-xl bg-accent py-2.5 text-xs font-bold text-on-accent hover:opacity-90">
            Save {c}
          </button>
          <button type="button" onClick={() => { setDraft(null); setEdit(false) }}
            className="cursor-pointer rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      )}
    </Card>
  )
}

type Section =
  | 'dashboard' | 'people' | 'sales' | 'activity' | 'elite' | 'booths' | 'events' | 'certtpl' | 'kamalsesi'
  | 'caller' | 'content' | 'rewards' | 'settings' | 'challenge' | 'talent' | 'growonb' | 'social' | 'atlas' | 'academy'
type CallerTab =
  | 'overview' | 'leads' | 'pipelines' | 'projects' | 'fields'
  | 'import' | 'quotes' | 'bop' | 'reports' | 'audit'
type Team = 'ALL' | 'MY' | 'ID'


/* PostgREST silently caps any GET at 1000 rows — `.limit(5000)` does not lift it.
   This bit us during the migration (multi-interest links resolved 1179/4102) and
   again on this dashboard: 3,701 calls reported as 1,000. Page until short. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown }>, maxPages = 6): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < maxPages; page++) {
    const { data } = await build(page * 1000, page * 1000 + 999)
    const rows = (data as T[]) ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

const NAV: { group: string; items: { key: Section; icon: typeof Users; label: string; badge?: number }[] }[] = [
  { group: 'Overview', items: [{ key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' }] },
  {
    group: 'Business',
    items: [
      { key: 'people', icon: Users, label: 'People & Roles' },
      { key: 'sales', icon: TrendingUp, label: 'Sales Oversight' },
      { key: 'activity', icon: Activity, label: 'Activity Monitor' },
    ],
  },
  {
    group: 'Team',
    items: [
      { key: 'elite', icon: Swords, label: 'Elite & Captains' },
      { key: 'booths', icon: Tent, label: 'Booths' },
      { key: 'events', icon: Ticket, label: 'Events' },
      { key: 'certtpl', icon: Award, label: 'Certificate Templates' },
      { key: 'kamalsesi', icon: Mic, label: 'Kamal AG Sessions' },
    ],
  },
  {
    group: 'Functions',
    items: [
      { key: 'challenge', icon: Rocket, label: '30-Day Challenge' },
      { key: 'caller', icon: PhoneCall, label: 'Caller · M4U' },
      { key: 'talent', icon: Compass, label: 'Talent Compass' },
      { key: 'growonb', icon: GraduationCap, label: 'Grow · Onboarding' },
      { key: 'social', icon: Camera, label: 'Social Coaching' },
      { key: 'atlas', icon: Library, label: 'ATLAS Library' },
      { key: 'academy', icon: Compass, label: 'Grow · AG Academy' },
      { key: 'content', icon: FolderCog, label: 'App Content' },
      { key: 'rewards', icon: Gift, label: 'Rewards' },
    ],
  },
  { group: 'System', items: [{ key: 'settings', icon: Globe2, label: 'Country Settings' }] },
]

/* ---------------- DEMO-ONLY fixtures (see the guard at the caller section) ---------------- */
interface AgentRow {
  id: string; name: string; phone: string; email: string; team: 'MY' | 'ID'
  status: 'pending' | 'active' | 'paused'; role: string; rank: string; elite?: boolean; projects: string[]
}
const SEED_AGENTS: AgentRow[] = [
  { id: 'a1', name: 'Aisyah Rahman', phone: '+60 13-888 2020', email: 'aisyah@iqi.my', team: 'MY', status: 'active', role: 'leader', rank: 'HOT', elite: true, projects: ['EXSIM Residensi', 'Erinaz Suites'] },
  { id: 'a2', name: 'Faizal Hassan', phone: '+60 17-220 4455', email: 'faizal@iqi.my', team: 'MY', status: 'active', role: 'agent', rank: 'TL', elite: true, projects: ['EXSIM Residensi'] },
  { id: 'a3', name: 'Budi Santoso', phone: '+62 812-3456-789', email: 'budi@iqi.id', team: 'ID', status: 'paused', role: 'agent', rank: 'L', projects: ['Vividz Grand'] },
  { id: 'a4', name: 'Dewi Anggraini', phone: '+62 813-9988-776', email: 'dewi@iqi.id', team: 'ID', status: 'active', role: 'leader', rank: 'TL', projects: ['Vividz Grand', 'Podomoro Park'] },
  { id: 'a5', name: 'Mei Ling Wong', phone: '+60 12-334 5566', email: 'meiling@iqi.my', team: 'MY', status: 'pending', role: 'agent', rank: 'REN', projects: [] },
  { id: 'a6', name: 'Rizky Pratama', phone: '+62 821-1122-334', email: 'rizky@iqi.id', team: 'ID', status: 'pending', role: 'agent', rank: 'REN', projects: [] },
]
interface LeadRow {
  id: string; name: string; phone: string; project: string; team: 'MY' | 'ID'
  label: string; status: 'pool' | 'assigned' | 'locked' | 'dead'; cb: number; holder?: string; updated: string
}
const SEED_LEADS: LeadRow[] = [
  { id: 'l1', name: 'Hafiz Omar', phone: '+60127001122', project: 'EXSIM Residensi', team: 'MY', label: 'Booked', status: 'locked', cb: 1, holder: '🏆 Aisyah', updated: '5m ago' },
  { id: 'l2', name: 'Michelle Yeo', phone: '+60162334455', project: 'Erinaz Suites', team: 'MY', label: 'No Answer', status: 'pool', cb: 4, updated: '12m ago' },
  { id: 'l3', name: 'Zul Ariffin', phone: '+60198887766', project: 'EXSIM Residensi', team: 'MY', label: 'Callback', status: 'pool', cb: 1, holder: '🔒 Faizal', updated: '1h ago' },
  { id: 'l4', name: 'Sari Wulandari', phone: '+628123334444', project: 'Vividz Grand', team: 'ID', label: 'New', status: 'pool', cb: 0, updated: '2m ago' },
  { id: 'l5', name: 'Agus Salim', phone: '+628567778888', project: 'Unassigned (triage)', team: 'ID', label: 'New', status: 'pool', cb: 0, updated: '8m ago' },
  { id: 'l6', name: 'Tan Ah Beng', phone: '+60129990000', project: 'Erinaz Suites', team: 'MY', label: 'Unreachable', status: 'dead', cb: 10, updated: '2d ago' },
]
const PIVOT_AGENTS = ['Aisyah', 'Faizal', 'Dewi', 'Budi']
const PIVOT: Record<string, number[]> = {
  Booked: [7, 5, 4, 2],
  'No Answer': [31, 44, 28, 19],
  Callback: [9, 6, 11, 4],
  'Not Interested': [12, 9, 14, 6],
  'Wrong Number': [2, 4, 1, 3],
}

export default function Admin() {
  const nav = useNavigate()
  const { user, theme, toggleTheme } = useApp()
  /* The AG crest in the sidebar comes from the Brand Studio slot, so replacing
     the logo there replaces it here too — same source as Login and the public
     certificate/event pages. Falls back to the icon if no asset is set. */
  const shield = useBrand('GLOBAL', 'shield')
  const [section, setSection] = useState<Section>('dashboard')
  /* Live reward campaigns. The old table rendered a hardcoded array, so nobody
     could publish a real one — the catalogue on /grow was always fiction. */
  const [rw, setRw] = useState<{ id: string; country: string; title: string; tier: string | null
    category: string | null; target_label: string | null; active: boolean; poster_path: string | null }[]>([])
  const [rwForm, setRwForm] = useState({ title: '', tier: '', category: '', target_label: '', country: 'MY' })
  const [rwPoster, setRwPoster] = useState<File | null>(null)
  const [rwBusy, setRwBusy] = useState(false)

  /* People & Roles, on live data. The table used to render SEED_AGENTS and the
     approve/pause buttons only mutated local state — a reload undid everything.
     Challenge roles come from user_roles via fn_set_challenge_role, which is
     also where the lockout guard lives (you cannot strip your own super_admin). */
  interface Person {
    id: string; name: string; email: string | null; phone: string | null
    country: string | null; role: string; status: string; is_elite?: boolean
    career_rank: string | null
  }
  const [people, setPeople] = useState<Person[]>([])
  /* live sidebar badge — real pending registrations, not a hardcoded number */
  const [pendingCount, setPendingCount] = useState(0)
  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, [section])
  const [roles, setRoles] = useState<{ user_id: string; role: string }[]>([])
  const [captainIds, setCaptainIds] = useState<Set<string>>(new Set())
  const [openWarrior, setOpenWarrior] = useState<Person | null>(null)
  const [pplBusy, setPplBusy] = useState(false)
  const [pplQ, setPplQ] = useState('')
  const loadPeople = useCallback(async () => {
    if (!supabase) return
    const [{ data: p }, { data: r }, { data: pd }] = await Promise.all([
      supabase.from('profiles').select('id,name,email,phone,country,role,status,is_elite,career_rank').order('name'),
      supabase.from('user_roles').select('user_id,role'),
      supabase.from('pods').select('captain_id'),
    ])
    setPeople((p as Person[]) ?? [])
    setRoles((r as { user_id: string; role: string }[]) ?? [])
    setCaptainIds(new Set(((pd as { captain_id: string }[]) ?? []).map((x) => x.captain_id)))
  }, [])
  useEffect(() => { if (section === 'people') loadPeople() }, [section, loadPeople])
  const pplSave = async (fn: () => Promise<{ error: unknown }>, ok: string) => {
    setPplBusy(true)
    const { error } = await fn()
    setPplBusy(false)
    if (error) say('⚠ ' + (error as { message?: string }).message)
    else { say(ok); loadPeople() }
  }
  const hasRole = (id: string, r: string) => roles.some((x) => x.user_id === id && x.role === r)

  /* Elite & Captains, live. fn_set_elite refuses to demote a serving Captain and
     fn_create_pod refuses a non-elite captain, so the spec rules hold in the
     database rather than in button logic. */
  interface PodRow { id: string; name: string; captain_id: string; country: string }
  const [livePods, setLivePods] = useState<PodRow[]>([])
  const [podMembers, setPodMembers] = useState<{ pod_id: string; agent_id: string }[]>([])
  const [eliteQ, setEliteQ] = useState('')
  const [podForm, setPodForm] = useState({ name: '', captain: '', country: 'MY' })
  const loadElite = useCallback(async () => {
    if (!supabase) return
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('pods').select('id,name,captain_id,country').order('name'),
      supabase.from('pod_members').select('pod_id,agent_id'),
    ])
    setLivePods((p as PodRow[]) ?? [])
    setPodMembers((m as { pod_id: string; agent_id: string }[]) ?? [])
  }, [])
  useEffect(() => { if (section === 'elite') { loadElite(); loadPeople() } }, [section, loadElite, loadPeople])

  /* Dashboard on live aggregates. The hero used to show invented money
     ("RM 12.4M pipeline") and the tiles fixed numbers; anything without a real
     source is now simply absent rather than made up. */
  interface Dash {
    warriors: number; my: number; id: number; pendingRegs: number
    queue: number; triage: number; ghlPending: number; lastLeadAt: string | null
    calls30: number; callsToday: number; activeToday: number
    appts30: number; pods: number; talentReports: number
    byDispo: { label: string; value: number }[]
    topAgents: { name: string; value: number }[]
    todayDispo: { label: string; value: number }[]
  }
  /* the global country switcher — declared before loadDash, which depends on it */
  const [team, setTeam] = useState<Team>('ALL')
  const [dash, setDash] = useState<Dash | null>(null)
  const loadDash = useCallback(async () => {
    if (!supabase) return
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const [prof, Lraw, Araw, podsQ, wins, reps] = await Promise.all([
      supabase.from('profiles').select('id,country,status'),
      fetchAll<{ status: string; property_id: number | null; ghl_sync_pending: boolean; received_at: string | null; country: string }>(
        (from, to) => supabase!.from('m4u_leads').select('status,property_id,ghl_sync_pending,received_at,country')
          .order('received_at', { ascending: false, nullsFirst: false }).range(from, to)),
      fetchAll<{ agent_id: string; disposition: string; called_at: string }>(
        (from, to) => supabase!.from('m4u_attempts').select('agent_id,disposition,called_at')
          .gte('called_at', since30).order('called_at', { ascending: false }).range(from, to)),
      supabase.from('pods').select('id,country'),
      supabase.from('m4u_dispositions').select('key,is_win,active'),
      supabase.from('talent_attempts').select('id,status'),
    ])
    const Pall = (prof.data ?? []) as { id: string; country: string | null; status: string }[]
    /* the All/MY/ID switcher scopes the whole dashboard */
    const inT = (c: string | null | undefined) => team === 'ALL' || c === team
    const countryOf = Object.fromEntries(Pall.map((x) => [x.id, x.country]))
    const P = Pall
    const L = Lraw.filter((x) => inT(x.country))
    const A = Araw.filter((x) => inT(countryOf[x.agent_id]))
    const winKeys = new Set(((wins.data ?? []) as { key: string; is_win: boolean; active: boolean }[])
      .filter((d) => d.is_win && d.active).map((d) => d.key))
    const nameOf = (id: string) => P.find((x) => x.id === id)
    const todayA = A.filter((a) => new Date(a.called_at) >= today)
    const count = (arr: { disposition: string }[]) => {
      const m: Record<string, number> = {}
      arr.forEach((a) => { m[a.disposition] = (m[a.disposition] ?? 0) + 1 })
      return Object.entries(m).map(([label, value]) => ({ label, value }))
        .sort((x, y) => y.value - x.value)
    }
    const byAgent: Record<string, number> = {}
    A.forEach((a) => { byAgent[a.agent_id] = (byAgent[a.agent_id] ?? 0) + 1 })
    setDash({
      warriors: P.filter((x) => x.status === 'active' && inT(x.country)).length,
      my: P.filter((x) => x.country === 'MY' && x.status === 'active').length,
      id: P.filter((x) => x.country === 'ID' && x.status === 'active').length,
      pendingRegs: P.filter((x) => x.status === 'pending' && inT(x.country)).length,
      queue: L.filter((x) => x.status === 'pool').length,
      triage: L.filter((x) => !x.property_id).length,
      ghlPending: L.filter((x) => x.ghl_sync_pending).length,
      lastLeadAt: L[0]?.received_at ?? null,
      calls30: A.length,
      callsToday: todayA.length,
      activeToday: new Set(todayA.map((a) => a.agent_id)).size,
      appts30: A.filter((a) => winKeys.has(a.disposition)).length,
      pods: ((podsQ.data ?? []) as { id: string; country: string }[]).filter((p) => inT(p.country)).length,
      talentReports: ((reps.data ?? []) as { status: string }[]).filter((r) => r.status === 'reported').length,
      byDispo: count(A).slice(0, 6),
      topAgents: Object.entries(byAgent).sort((x, y) => y[1] - x[1]).slice(0, 5)
        .map(([id, value]) => ({ name: (nameOf(id) as unknown as { id: string } & { country: string | null }) ? (people.find((pp) => pp.id === id)?.name ?? 'Warrior') : 'Warrior', value })),
      todayDispo: count(todayA).slice(0, 5),
    })
  }, [people, team])
  useEffect(() => { if (section === 'dashboard') { loadDash(); loadPeople() } }, [section, loadDash, loadPeople])

  /* Announcements + Directory (App Content). A broadcast fans out through
     fn_announce into every warrior's existing notification bell; the history
     table records who sent what to how many. */
  interface Announcement { id: string; country: string; title: string; body: string
    recipients: number; created_at: string }
  interface DirEntry { id: string; country: string; category: string; name: string
    role: string | null; phone: string | null; email: string | null; sort: number; active: boolean }
  const [anns, setAnns] = useState<Announcement[]>([])
  const [dirs, setDirs] = useState<DirEntry[]>([])
  const [annForm, setAnnForm] = useState({ title: '', body: '', country: 'ALL', link: '' })
  const [dirForm, setDirForm] = useState({ name: '', role: '', phone: '', email: '',
    category: 'Leadership', country: 'ALL' })
  const [cBusy, setCBusy] = useState(false)
  const loadContent = useCallback(async () => {
    if (!supabase) return
    const [{ data: a }, { data: d }] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('directory_entries').select('*').order('category').order('sort').order('name'),
    ])
    setAnns((a as Announcement[]) ?? [])
    setDirs((d as DirEntry[]) ?? [])
  }, [])
  useEffect(() => { if (section === 'content') loadContent() }, [section, loadContent])
  const cSave = async (fn: () => Promise<{ error: unknown }>, ok: string) => {
    setCBusy(true)
    const { error } = await fn()
    setCBusy(false)
    if (error) say('⚠ ' + (error as { message?: string }).message)
    else { say(ok); loadContent() }
  }

  /* Activity Monitor: counts only, by design. The RPC never returns task labels
     or reasons — a warrior's planner stays private; leadership sees the numbers. */
  interface ActRow { user_id: string; name: string; country: string | null
    planned: number; done: number; notdone: number; calls_today: number }
  const [act, setAct] = useState<ActRow[] | null>(null)
  useEffect(() => {
    if (section !== 'activity' || !supabase) return
    ;(async () => {
      const { data, error } = await supabase.rpc('timebox_admin_today')
      if (error) { say('⚠ ' + error.message); return }
      setAct((data as ActRow[]) ?? [])
    })()
  }, [section])

  /* Booths, live. Create with a date range and AM/PM shifts; the roster count
     comes from booth_signups. Warriors sign themselves up (policy allows it);
     the agent-side page can follow after launch. */
  interface Booth { id: string; country: string; title: string; location: string | null
    date_start: string | null; date_end: string | null; shifts: string[] | null }
  const [booths, setBooths] = useState<Booth[]>([])
  const [signups, setSignups] = useState<{ booth_id: string; agent_id: string; on_date: string; shift: string }[]>([])
  const [boothForm, setBoothForm] = useState({ title: '', location: '', country: 'MY',
    date_start: '', date_end: '', am: true, pm: true })
  const loadBooths = useCallback(async () => {
    if (!supabase) return
    const [{ data: b }, { data: g }] = await Promise.all([
      supabase.from('booths').select('*').order('date_start', { ascending: false, nullsFirst: false }),
      supabase.from('booth_signups').select('booth_id,agent_id,on_date,shift'),
    ])
    setBooths((b as Booth[]) ?? [])
    setSignups((g as typeof signups) ?? [])
  }, [])
  useEffect(() => { if (section === 'booths') loadBooths() }, [section, loadBooths])

  /* Sales Oversight: the challenge CRM is the only real deal pipeline. Before
     the cohort starts it is empty — shown as empty, not decorated. */
  const CH_STAGES = ['NEW','CONTACTED','ENGAGED','QUALIFIED','APPOINTMENT_SET',
    'PRESENTATION_OR_VIEWING','FOLLOW_UP','NEGOTIATION','CLOSING_PROCESS',
    'CLOSED_WON','CLOSED_LOST','NURTURE','DISQUALIFIED'] as const
  const [chStages, setChStages] = useState<Record<string, number> | null>(null)
  const [chClosings, setChClosings] = useState<{ total: number; verified: number } | null>(null)
  useEffect(() => {
    if (section !== 'sales' || !supabase) return
    ;(async () => {
      const [{ data: l }, { data: c }] = await Promise.all([
        supabase.from('ch_leads').select('stage'),
        supabase.from('ch_closings').select('id,verified_by'),
      ])
      const m: Record<string, number> = {}
      ;((l ?? []) as { stage: string }[]).forEach((x) => { m[x.stage] = (m[x.stage] ?? 0) + 1 })
      setChStages(m)
      const rows = (c ?? []) as { id: string; verified_by: string | null }[]
      setChClosings({ total: rows.length, verified: rows.filter((x) => x.verified_by).length })
    })()
  }, [section])
  /* Kamal's model (2026-08-05) — THREE systems, never mixed (standing order):
       1. CAREER rank: REN → L → TL → HOT → TM → VP (profiles.career_rank).
          Everyone defaults to REN; admin promotes with confirmation.
       2. TIM ELIT position: Captain — held regardless of career rank, managed
          in Elite & Captains; shown here as a read-only badge.
       3. LEADERSHIP positions: Elite Coach / Master Mentor / Super Admin —
          stackable, anyone can hold them alongside anything else. Toggles, but
          every change confirms first (the accidental-press fix stays). */
  /* Icons everywhere (Kamal 2026-08-05): every rank and position has one, and a
     person holding several shows ALL of them as badges beside their name.
     Career icons follow the ladder metals (silver REN -> red VP). */
  const CAREER_RANKS = [
    { v: 'REN', icon: '⚪' }, { v: 'L', icon: '🟤' }, { v: 'TL', icon: '🔵' },
    { v: 'HOT', icon: '🟡' }, { v: 'TM', icon: '🟣' }, { v: 'VP', icon: '🔴' },
  ]
  const POSITIONS = [
    { v: 'elite_coach', label: 'Elite Coach', icon: '🛡️' },
    { v: 'master_mentor', label: 'Master Mentor', icon: '🎓' },
    { v: 'super_admin', label: 'Super Admin', icon: '🔑' },
  ]
  const setCareer = async (p: Person, rank: string) => {
    if (rank === (p.career_rank ?? 'REN')) return
    if (!confirm(`Set ${p.name}'s career rank to ${rank}?`)) { loadPeople(); return }
    await pplSave(async () => await supabase!.from('profiles')
      .update({ career_rank: rank }).eq('id', p.id), `${p.name} → ${rank}`)
  }
  const togglePosition = async (p: Person, role: string, label: string) => {
    const has = hasRole(p.id, role)
    const warning = role === 'super_admin' && !has
      ? `⚠ Grant SUPER ADMIN to ${p.name}?\n\nThey will control roles, approvals and every admin console.`
      : `${has ? 'Remove' : 'Grant'} ${label} ${has ? 'from' : 'to'} ${p.name}?`
    if (!confirm(warning)) return
    await pplSave(async () => await supabase!.rpc('fn_set_challenge_role',
      { p_user: p.id, p_role: role, p_grant: !has }),
      `${p.name}: ${label} ${has ? 'removed' : 'granted'}`)
  }

  const loadRewards = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('rewards').select('*').order('country').order('sort')
    setRw((data as typeof rw) ?? [])
  }, [])
  useEffect(() => { if (section === 'rewards') loadRewards() }, [section, loadRewards])
  const rwSave = async (fn: () => Promise<{ error: unknown }>, ok: string) => {
    setRwBusy(true)
    const { error } = await fn()
    setRwBusy(false)
    if (error) say('⚠ ' + (error as { message?: string }).message)
    else { say(ok); loadRewards() }
  }
  const [chTab, setChTab] = useState<'health' | 'progress' | 'enrolment' | 'curriculum' | 'coaches' | 'reports' | 'governance' | 'authority'>('health')
  const [callerTab, setCallerTab] = useState<CallerTab>('overview')
  /* DEMO-ONLY fixtures. Rendered exclusively inside the `section === 'caller' &&
     !(supabaseReady && real id)` branch, behind a visible DEMO PREVIEW banner.
     They are never reachable from a production account. People & Roles, the
     caller console and every challenge surface read live tables only. */
  const [agents] = useState(SEED_AGENTS)
  const [leads, setLeads] = useState(SEED_LEADS)
  const [toast, setToast] = useState('')
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!supabaseReady || !supabase || !user || !user.id.includes('-')) return
    const poll = async () => {
      const { count } = await supabase!.from('notifications')
        .select('id', { count: 'exact', head: true }).eq('to_agent', user.id).eq('read', false)
      setUnread(count ?? 0)
    }
    poll()
    const t = setInterval(poll, 30000)
    return () => clearInterval(t)
  }, [user])

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2800)
  }
  const inTeam = <T extends { team: 'MY' | 'ID' }>(rows: T[]) =>
    team === 'ALL' ? rows : rows.filter((r) => r.team === team)

  const fAgents = inTeam(agents)
  const fLeads = inTeam(leads)
  // demo derivations kept only where a demo section still uses them


  if (!user) return null

  const leadAction = (id: string, patch: Partial<LeadRow>, msg: string) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
    say(msg)
  }

  return (
    <div className="fixed inset-0 z-[90] flex bg-bg text-ink">
      {/* ---------------- sidebar ---------------- */}
      <aside className="adm-side flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          {shield ? (
            <img src={shield} alt="AG" className="adm-mark h-11 w-11 shrink-0 object-contain" />
          ) : (
            <div className="adm-crest flex h-10 w-10 items-center justify-center rounded-xl text-[#1a1407]">
              <Shield size={19} />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-display text-sm font-extrabold leading-tight">Command HQ</p>
            <p className="text-[10px] tracking-wide text-muted">AG WARRIORS · ADMIN</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((g) => (
            <div key={g.group} className="mb-3">
              <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted">{g.group}</p>
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => setSection(it.key)}
                  className={clsx(
                    'adm-nav-item mb-0.5 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold',
                    section === it.key ? 'on' : 'text-muted hover:bg-surface2 hover:text-ink',
                  )}
                >
                  <it.icon size={15} className="shrink-0" />
                  <span className="flex-1">{it.label}</span>
                  {it.key === 'people' && pendingCount > 0 && (
                    <span className="adm-pulse flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white">{pendingCount}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => nav('/')}
          className="m-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-bold text-muted transition-colors duration-200 hover:text-ink"
        >
          <X size={13} /> Exit console
        </button>
      </aside>

      {/* ---------------- main ---------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3.5">
          <h1 className="font-display text-lg font-extrabold tracking-tight">
            {NAV.flatMap((g) => g.items).find((i) => i.key === section)?.label}
          </h1>
          <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border p-1">
            {(['ALL', 'MY', 'ID'] as Team[]).map((tm) => (
              <button
                key={tm}
                type="button"
                onClick={() => setTeam(tm)}
                className={clsx(
                  'cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-colors duration-150',
                  team === tm ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink',
                )}
              >
                {tm === 'ALL' ? '🌐 All' : tm === 'MY' ? '🇲🇾 MY' : '🇮🇩 ID'}
              </button>
            ))}
          </div>
          <button type="button" onClick={toggleTheme} aria-label="Toggle light/dark"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors duration-200 hover:text-ink">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link to="/notifications" aria-label="Notifications"
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
            <BellRing size={16} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-extrabold text-on-accent">{unread}</span>
            )}
          </Link>
          <Avatar name={user.name} color="var(--accent)" size={34} />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {/* ============ DASHBOARD — WHOLE APP ============ */}
          {section === 'dashboard' && (
            <>
              {/* hero */}
              <div className="adm-hero mb-5 p-6">
                <img src="/brand/ag-shield.png" alt="" className="adm-hero-shield" />
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#c9c2a8]">
                  Command HQ · {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <h2 className="mt-1 font-display text-2xl font-extrabold leading-tight">
                  Salam, {user.name.split(' ')[0]} 👋
                </h2>
                <p className="mt-1 text-xs text-[#c9c2a8]">
                  {dash?.warriors ?? '—'} warriors across MY {dash?.my ?? '—'} + ID {dash?.id ?? '—'}
                </p>
                <div className="relative mt-4 flex flex-wrap gap-6">
                  <div>
                    <p className="adm-gold font-display text-3xl font-extrabold">{dash?.calls30?.toLocaleString() ?? '—'}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#c9c2a8]">Calls · 30 days</p>
                  </div>
                  <div>
                    <p className="adm-gold font-display text-3xl font-extrabold">{dash?.appts30 ?? '—'}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#c9c2a8]">Appointments · 30 days</p>
                  </div>
                  <div>
                    <p className="font-display text-3xl font-extrabold text-white">{dash?.talentReports ?? '—'}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#c9c2a8]">Talent profiles issued</p>
                  </div>
                </div>
              </div>

              {/* KPI cards with icon chips */}
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { v: dash?.warriors ?? 0, l: 'Warriors', sub: `MY ${dash?.my ?? 0} · ID ${dash?.id ?? 0}`, icon: Users, tint: '#d4ac4a' },
                  { v: dash?.activeToday ?? 0, l: 'Callers active today', icon: Zap, tint: '#22c55e' },
                  { v: dash?.queue ?? 0, l: 'Caller queue', icon: PhoneCall, tint: '#3b82f6' },
                  { v: dash?.pods ?? 0, l: 'Elite pods', icon: Swords, tint: '#8b5cf6' },
                  { v: dash?.appts30 ?? 0, l: 'Appointments (30d)', icon: Handshake, tint: '#10b981' },
                  { v: dash?.pendingRegs ?? 0, l: 'Pending regs', icon: UserPlus, tint: '#f59e0b', warn: (dash?.pendingRegs ?? 0) > 0 },
                ].map((k) => (
                  <div key={k.l} className={clsx('adm-kpi p-4', k.warn && 'border-warning/50')}>
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="adm-kpi-icon" style={{ background: `${k.tint}1f`, color: k.tint }}>
                        <k.icon size={17} />
                      </span>
                      {k.warn && <AlertTriangle size={14} className="text-warning" />}
                    </div>
                    <p className="font-display text-2xl font-extrabold">{k.v}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{k.l}</p>
                    {'sub' in k && k.sub && <p className="text-[10px] text-muted">{k.sub}</p>}
                  </div>
                ))}
              </div>

              {/* needs-attention strip */}
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {[
                  { l: 'Pending registrations', v: dash?.pendingRegs ?? 0, s: 'people' as Section, icon: UserPlus, tint: '#f59e0b' },
                  { l: 'Triage leads (no project)', v: dash?.triage ?? 0, s: 'caller' as Section, icon: PhoneCall, tint: '#3b82f6' },
                  { l: 'GHL sync pending', v: dash?.ghlPending ?? 0, s: 'caller' as Section, icon: BellRing, tint: '#8b5cf6' },
                  { l: 'Hours since last lead', v: dash?.lastLeadAt ? Math.round((Date.now() - +new Date(dash.lastLeadAt)) / 36e5) : 0, s: 'caller' as Section, icon: Timer, tint: (dash?.lastLeadAt && Date.now() - +new Date(dash.lastLeadAt) > 12 * 36e5) ? '#ef4444' : '#22c55e' },
                  { l: 'Calls today', v: dash?.callsToday ?? 0, s: 'caller' as Section, icon: Flame, tint: '#f97316' },
                  { l: 'Talent profiles', v: dash?.talentReports ?? 0, s: 'talent' as Section, icon: Gift, tint: '#ec4899' },
                ].map((a) => (
                  <button
                    key={a.l}
                    type="button"
                    onClick={() => setSection(a.s)}
                    className="adm-alert p-3"
                    style={{ borderColor: `${a.tint}55`, background: `${a.tint}12` }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="adm-kpi-icon" style={{ background: `${a.tint}22`, color: a.tint, width: 30, height: 30 }}>
                        <a.icon size={15} />
                      </span>
                      <div>
                        <p className="font-display text-lg font-extrabold leading-none" style={{ color: a.tint }}>{a.v}</p>
                        <p className="mt-0.5 text-[9px] font-semibold text-muted">{a.l}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {/* Caller outcomes, 30 days */}
                <Card className="p-5">
                  <p className="mb-4 font-display text-sm font-extrabold">Caller outcomes — 30 days</p>
                  {(dash?.byDispo ?? []).length === 0 && (
                    <p className="py-6 text-center text-xs text-muted">No calls in the last 30 days.</p>
                  )}
                  {(dash?.byDispo ?? []).map((d, i) => {
                    const max = Math.max(1, ...(dash?.byDispo ?? []).map((x) => x.value))
                    const hues = ['#3b82f6', '#6366f1', '#8b5cf6', '#d4ac4a', '#f59e0b', '#22c55e']
                    return (
                      <div key={d.label} className="adm-funnel-step"
                        style={{ width: `${55 + (d.value / max) * 45}%`,
                                 background: `linear-gradient(90deg, ${hues[i % hues.length]}cc, ${hues[i % hues.length]})` }}>
                        <span>{d.label}</span>
                        <span>{d.value}</span>
                      </div>
                    )
                  })}
                </Card>

                {/* Top callers */}
                <Card className="p-5">
                  <p className="mb-4 font-display text-sm font-extrabold">Top callers — 30 days</p>
                  {(dash?.topAgents ?? []).length === 0 && (
                    <p className="py-6 text-center text-xs text-muted">No calls yet.</p>
                  )}
                  {(dash?.topAgents ?? []).map((a) => {
                    const max = Math.max(1, ...(dash?.topAgents ?? []).map((x) => x.value))
                    const pct = Math.round((a.value / max) * 100)
                    return (
                      <div key={a.name} className="mb-3.5">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-semibold">{a.name}</span>
                          <span className="text-muted">{a.value} calls</span>
                        </div>
                        <div className="adm-track">
                          <div className={clsx('adm-fill', pct >= 60 && 'adm-fill--green')} style={{ width: `${Math.max(pct, 3)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  <button type="button" onClick={() => setSection('activity')} className="mt-1 cursor-pointer text-xs font-bold text-accent">Open Activity Monitor →</button>
                </Card>

                {/* Today's calls donut, computed from real dispositions */}
                <Card className="p-5">
                  <p className="mb-4 font-display text-sm font-extrabold">📞 Caller today</p>
                  {(() => {
                    const rows = dash?.todayDispo ?? []
                    const totalToday = rows.reduce((t, r) => t + r.value, 0)
                    if (totalToday === 0) return (
                      <p className="py-6 text-center text-xs text-muted">No calls yet today.</p>
                    )
                    const hues = ['#22c55e', '#3b82f6', '#d4ac4a', '#ef4444', '#6b7488']
                    let acc = 0
                    const segs = rows.map((r, i) => {
                      const from = (acc / totalToday) * 100; acc += r.value
                      return `${hues[i % hues.length]} ${from}% ${(acc / totalToday) * 100}%`
                    }).join(', ')
                    return (
                      <div className="mb-4 flex items-center gap-5">
                        <div className="adm-donut h-28 w-28 shrink-0" style={{ background: `conic-gradient(${segs})` }}>
                          <div className="adm-donut-label">
                            <span className="font-display text-lg font-extrabold">{totalToday}</span>
                            <span className="text-[9px] font-semibold uppercase text-muted">calls</span>
                          </div>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                          {rows.map((r, i) => (
                            <p key={r.label} className="flex items-center gap-2 font-semibold">
                              <span className="h-2 w-2 rounded-full" style={{ background: hues[i % hues.length] }} /> {r.label} · {r.value}
                            </p>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                  <button type="button" onClick={() => setSection('caller')} className="w-full cursor-pointer rounded-xl bg-accent py-2.5 text-xs font-bold text-on-accent transition-opacity hover:opacity-90">Open Caller admin →</button>
                </Card>
              </div>
            </>
          )}

          {/* ============ PEOPLE & ROLES ============ */}
          {section === 'people' && (() => {
            const filtered = people.filter((a) =>
              (team === 'ALL' || a.country === team)
              && (!pplQ || a.name.toLowerCase().includes(pplQ.toLowerCase())
                  || (a.email ?? '').toLowerCase().includes(pplQ.toLowerCase())))
            const pending = filtered.filter((a) => a.status === 'pending')
            return (
              <>
                {pending.length > 0 && (
                  <Card className="mb-5 border-warning/50 p-5">
                    <p className="mb-3 font-display text-sm font-extrabold text-warning">
                      Pending registrations ({pending.length})
                    </p>
                    {pending.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0">
                        <Avatar name={a.name} color="var(--warning)" size={38} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold">{a.name}
                            <span className="ml-1 text-xs font-normal text-muted">
                              {a.country === 'MY' ? 'MY' : 'ID'} {a.phone} - {a.email}
                            </span>
                          </p>
                        </div>
                        <button type="button" disabled={pplBusy}
                          onClick={() => pplSave(async () => await supabase!.from('profiles')
                            .update({ status: 'active' }).eq('id', a.id), a.name + ' approved')}
                          className="flex cursor-pointer items-center gap-1 rounded-lg bg-success px-3.5 py-2 text-xs font-bold text-white hover:opacity-90">
                          <Check size={13} /> Approve
                        </button>
                        <button type="button" disabled={pplBusy}
                          onClick={() => pplSave(async () => await supabase!.from('profiles')
                            .update({ status: 'rejected' }).eq('id', a.id), a.name + ' rejected')}
                          className="flex cursor-pointer items-center gap-1 rounded-lg border border-danger/50 px-3.5 py-2 text-xs font-bold text-danger hover:bg-danger/10">
                          <Ban size={13} /> Reject
                        </button>
                      </div>
                    ))}
                  </Card>
                )}

                <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
                  <input value={pplQ} onChange={(e) => setPplQ(e.target.value)}
                    placeholder="Search name or email"
                    className="h-10 min-w-[200px] flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
                  <span className="text-[11px] text-muted">{filtered.length} people</span>
                  <button type="button"
                    onClick={() => {
                      exportCsv(`people-${team}-${new Date().toISOString().slice(0, 10)}`, filtered.map((a) => ({
                        name: a.name, email: a.email, phone: a.phone, country: a.country,
                        role: a.role, status: a.status, career_rank: a.career_rank,
                        elite_captain: a.is_elite ? 'yes' : '',
                      })))
                      say(`Exported ${filtered.length} people`)
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink">
                    <Download size={13} /> CSV
                  </button>
                </Card>

                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-3">Person</th>
                        <th className="px-4 py-3">Country</th>
                        <th className="px-4 py-3">Challenge roles</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.filter((a) => a.status !== 'pending').map((a) => (
                        <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                          <td className="px-4 py-3">
                            {/* click the person to open the full profile drawer */}
                            <div className="flex cursor-pointer items-center gap-2.5"
                              onClick={() => setOpenWarrior(a)}
                              title={`Open ${a.name}'s profile`}>
                              <Avatar name={a.name} color="var(--accent)" size={32} />
                              <div>
                                <p className="flex flex-wrap items-center gap-2 font-semibold">
                                  {a.name}
                                  <BadgeRow rank={a.career_rank} captain={captainIds.has(a.id)}
                                    elite={a.is_elite}
                                    positions={POSITIONS.filter((r) => hasRole(a.id, r.v)).map((r) => r.v)} />
                                </p>
                                <p className="text-[11px] text-muted">{a.email ?? a.phone ?? '-'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">{a.country ?? '-'}</td>
                          <td className="px-4 py-3">
                            {/* system 1: career ladder */}
                            <select value={a.career_rank ?? 'REN'} disabled={pplBusy}
                              aria-label={`Career rank for ${a.name}`}
                              onChange={(e) => setCareer(a, e.target.value)}
                              className="h-8 cursor-pointer rounded-lg border border-border bg-surface px-2 text-[11px] font-bold outline-none">
                              {CAREER_RANKS.map((r) => <option key={r.v} value={r.v}>{r.icon} {r.v}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {/* One guarded dropdown instead of tappable chips — nothing
                                changes without picking from the list AND confirming. The
                                badges beside the name show what is currently held. */}
                            <select value="" disabled={pplBusy}
                              aria-label={'Positions for ' + a.name}
                              onChange={(e) => { const r = POSITIONS.find((x) => x.v === e.target.value)
                                if (r) togglePosition(a, r.v, r.label) }}
                              className="h-8 cursor-pointer rounded-lg border border-border bg-surface px-2 text-[11px] outline-none">
                              <option value="">＋ Positions…</option>
                              {POSITIONS.map((r) => (
                                <option key={r.v} value={r.v}>
                                  {hasRole(a.id, r.v) ? '✓ ' : ''}{r.icon} {r.label}{hasRole(a.id, r.v) ? ' — remove' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <Chip tone={a.status === 'active' ? 'success' : a.status === 'rejected' ? 'danger' : 'warning'}>
                              {a.status}
                            </Chip>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {a.status === 'active' ? (
                              <button type="button" disabled={pplBusy}
                                onClick={() => pplSave(async () => await supabase!.from('profiles')
                                  .update({ status: 'paused' }).eq('id', a.id), a.name + ' paused')}
                                className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-warning">
                                <Pause size={12} className="mr-1 inline" />Pause
                              </button>
                            ) : (
                              <button type="button" disabled={pplBusy}
                                onClick={() => pplSave(async () => await supabase!.from('profiles')
                                  .update({ status: 'active' }).eq('id', a.id), a.name + ' reactivated')}
                                className="cursor-pointer rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white">
                                <Play size={12} className="mr-1 inline" />Reactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted">Nobody matches.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <p className="p-4 text-[11px] text-muted">
                    Three separate systems, never mixed: <b>Career</b> (REN→VP ladder) ·
                        <b> Tim Elit</b> (Captain/Elite — managed in Elite &amp; Captains) ·
                        <b> Positions</b> (stackable; <b>Elite Coach</b> approves evidence in the
                        Coach Review Queue — grant it before the cohort starts).
                  </p>
                </Card>
                {openWarrior && (
                  <WarriorProfile
                    person={{ id: openWarrior.id, name: openWarrior.name, email: openWarrior.email,
                      country: openWarrior.country, career_rank: openWarrior.career_rank,
                      is_elite: openWarrior.is_elite, captain: captainIds.has(openWarrior.id),
                      positions: POSITIONS.filter((r) => hasRole(openWarrior.id, r.v)).map((r) => r.v) }}
                    onClose={() => setOpenWarrior(null)} />
                )}
              </>
            )
          })()}

          {section === 'sales' && (() => {
            const total = Object.values(chStages ?? {}).reduce((t, n) => t + n, 0)
            const hues = ['#3b82f6','#6366f1','#8b5cf6','#a78bfa','#d4ac4a','#f59e0b','#fb923c',
                          '#f472b6','#ec4899','#22c55e','#ef4444','#64748b','#6b7488']
            return (
              <>
                <Card className="mb-4 p-5">
                  <p className="mb-1 font-display text-sm font-extrabold">30-Day Challenge pipeline — live</p>
                  <p className="mb-4 text-xs text-muted">
                    Every lead in the challenge CRM by stage. Closings count only when a human Coach verifies them.
                  </p>
                  {chStages === null ? (
                    <p className="py-6 text-center text-xs text-muted">Loading...</p>
                  ) : total === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm font-bold">Pipeline is empty - and that is correct</p>
                      <p className="mx-auto mt-1 max-w-md text-xs text-muted">
                        The cohort has not started. From 8 August, every lead your warriors log in the
                        30-Day Challenge appears here by stage, and verified closings count up below.
                      </p>
                    </div>
                  ) : (
                    CH_STAGES.filter((st) => (chStages[st] ?? 0) > 0).map((st, i) => {
                      const max = Math.max(...Object.values(chStages))
                      return (
                        <div key={st} className="adm-funnel-step"
                          style={{ width: `${55 + ((chStages[st] ?? 0) / max) * 45}%`,
                                   background: `linear-gradient(90deg, ${hues[i % hues.length]}cc, ${hues[i % hues.length]})` }}>
                          <span>{st.replaceAll('_', ' ')}</span>
                          <span>{chStages[st]}</span>
                        </div>
                      )
                    })
                  )}
                </Card>
                <div className="grid grid-cols-2 gap-3 md:max-w-md">
                  <div className="adm-kpi p-4">
                    <p className="font-display text-2xl font-extrabold">{chClosings?.total ?? '—'}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Closings submitted</p>
                  </div>
                  <div className="adm-kpi p-4">
                    <p className="font-display text-2xl font-extrabold text-success">{chClosings?.verified ?? '—'}</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Verified by Coach</p>
                  </div>
                </div>
                <button type="button"
                  onClick={async () => {
                    const rows = await fetchAll<{ client_name: string; client_phone: string | null
                      project: string | null; unit_no: string | null; price: number; commission: number
                      stage: string; country: string; created_at: string
                      profiles: { name: string } | null }>((from, to) =>
                      supabase!.from('deals')
                        .select('client_name,client_phone,project,unit_no,price,commission,stage,country,created_at,profiles!deals_agent_id_fkey(name)')
                        .order('created_at', { ascending: false }).range(from, to) as never)
                    const scoped = rows.filter((r) => team === 'ALL' || r.country === team)
                    if (!scoped.length) { say('No deals to export yet'); return }
                    exportCsv(`deals-${team}-${new Date().toISOString().slice(0, 10)}`, scoped.map((r) => ({
                      agent: r.profiles?.name ?? '', client: r.client_name, phone: r.client_phone,
                      project: r.project, unit: r.unit_no, price: r.price, commission: r.commission,
                      stage: r.stage, country: r.country, created: r.created_at?.slice(0, 10),
                    })))
                    say(`Exported ${scoped.length} deals`)
                  }}
                  className="mt-4 flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink">
                  <Download size={13} /> Export company deals CSV
                </button>
              </>
            )
          })()}

          {section === 'activity' && (
            <Card className="p-5">
              <p className="mb-1 font-display text-sm font-extrabold">Daily activity — live</p>
              <p className="mb-4 text-xs text-muted">
                Today's plan counts from My Day plus calls made. Task contents stay private
                to each warrior - leadership sees the numbers, never the list.
              </p>
              {act === null && <p className="py-6 text-center text-xs text-muted">Loading...</p>}
              {act !== null && act.filter((a) => team === 'ALL' || a.country === team).length === 0 && (
                <p className="py-6 text-center text-xs text-muted">No active warriors in this view.</p>
              )}
              {(act ?? []).filter((a) => team === 'ALL' || a.country === team).map((a) => {
                const pct = a.planned > 0 ? Math.round((a.done / a.planned) * 100) : 0
                return (
                  <div key={a.user_id} className="mb-4 rounded-xl border border-border p-3.5">
                    <div className="mb-1.5 flex items-center gap-2.5">
                      <Avatar name={a.name}
                        color={pct >= 60 ? 'var(--success)' : a.planned > 0 ? 'var(--warning)' : 'var(--danger)'} size={32} />
                      <p className="flex-1 text-sm font-semibold">{a.country ?? ''} {a.name}</p>
                      <p className="text-xs text-muted">
                        {a.done}/{a.planned} tasks{a.calls_today > 0 ? ` · ${a.calls_today} calls` : ''}
                      </p>
                      <span className="font-display text-sm font-extrabold">{a.planned > 0 ? pct + '%' : '—'}</span>
                    </div>
                    <Bar pct={a.planned > 0 ? pct : 0} />
                    {a.planned === 0 && a.calls_today === 0 && (
                      <p className="mt-1.5 text-[11px] font-semibold text-danger">No plan and no calls today</p>
                    )}
                  </div>
                )
              })}
            </Card>
          )}

          {/* ============ ELITE & CAPTAINS ============ */}
          {section === 'elite' && (() => {
            /* the All/MY/ID switcher scopes EVERYTHING here — chips, counts,
               search hits, captain picker and the pod table */
            const inTeam = (c: string | null | undefined) => team === 'ALL' || c === team
            const eliteFolk = people.filter((a) => a.is_elite && inTeam(a.country))
            const teamPods = livePods.filter((p) => inTeam(p.country))
            const teamMembers = podMembers.filter((m) =>
              teamPods.some((p) => p.id === m.pod_id))
            const nameOf = (id: string) => people.find((x) => x.id === id)?.name ?? 'Unknown'
            const searchHits = eliteQ.trim()
              ? people.filter((a) => a.status === 'active' && inTeam(a.country)
                  && a.name.toLowerCase().includes(eliteQ.toLowerCase())).slice(0, 8)
              : []
            return (
              <>
                {/* army command banner */}
                <div
                  className="mb-5 flex items-center gap-4 rounded-2xl border p-4"
                  style={{
                    borderColor: '#3a3f1f',
                    background:
                      'repeating-linear-gradient(45deg, rgba(109,112,40,.16) 0 12px, rgba(73,74,23,.16) 12px 24px), linear-gradient(180deg, #22260f, #11130d)',
                    color: '#e9e2cc',
                  }}
                >
                  <img src="/brand/tim-elit-logo.png" alt="" className="h-14 w-14 rounded-xl border-2 object-contain p-1" style={{ borderColor: '#6d7028', background: '#14180a' }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-extrabold uppercase tracking-[0.12em]" style={{ color: '#d8b25a' }}>
                      Elite Team Command
                    </p>
                    <p className="text-[11px]" style={{ color: '#c9c2a8' }}>
                      {team !== 'ALL' ? `${team === 'MY' ? '🇲🇾' : '🇮🇩'} ` : ''}{eliteFolk.length} elite warriors - {teamPods.length} pods - {teamMembers.length} pod members
                    </p>
                  </div>
                </div>

                <div className="mb-5 grid gap-3 lg:grid-cols-2">
                  {/* -------- appoint / demote elite -------- */}
                  <Card className="p-4">
                    <p className="mb-1 text-sm font-bold">Manage Elite Team</p>
                    <p className="mb-3 text-[11px] text-muted">
                      Search any active warrior and appoint them. A serving Captain must hand over
                      their pod before they can be demoted - the database enforces it.
                    </p>
                    <input value={eliteQ} onChange={(e) => setEliteQ(e.target.value)}
                      placeholder="Search warriors to appoint"
                      className="mb-2 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
                    {searchHits.map((a) => (
                      <div key={a.id} className="flex items-center gap-2.5 border-b border-border py-2 last:border-0">
                        <Avatar name={a.name} color="var(--accent)" size={28} />
                        <span className="min-w-0 flex-1 truncate text-sm">{a.name}
                          <span className="ml-1 text-[10px] text-muted">{a.country}</span></span>
                        <button type="button" disabled={pplBusy}
                          onClick={() => pplSave(async () => await supabase!.rpc('fn_set_elite',
                            { p_user: a.id, p_elite: !a.is_elite }),
                            a.name + (a.is_elite ? ' removed from Tim Elit' : ' appointed to Tim Elit')).then(loadElite)}
                          className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-extrabold',
                            a.is_elite ? 'border-danger/50 text-danger' : 'border-accent bg-accent-soft text-accent')}>
                          {a.is_elite ? 'Demote' : 'Appoint'}
                        </button>
                      </div>
                    ))}
                    {eliteFolk.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {eliteFolk.map((a) => (
                          <Chip key={a.id} tone="accent"><Crown size={10} /> {a.name}</Chip>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* -------- create pod -------- */}
                  <Card className="p-4">
                    <p className="mb-1 text-sm font-bold">Create Pod</p>
                    <p className="mb-3 text-[11px] text-muted">
                      The Captain must already be Elite - appoint them on the left first.
                    </p>
                    <input value={podForm.name} onChange={(e) => setPodForm({ ...podForm, name: e.target.value })}
                      placeholder="Pod name, e.g. ALPHA"
                      className="mb-2 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm uppercase outline-none focus:border-accent" />
                    <div className="mb-2 flex gap-2">
                      <select value={podForm.captain} onChange={(e) => setPodForm({ ...podForm, captain: e.target.value })}
                        aria-label="Captain"
                        className="h-10 min-w-0 flex-1 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
                        <option value="">Choose Captain (elite only)</option>
                        {eliteFolk.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <select value={team !== 'ALL' ? team : podForm.country}
                        onChange={(e) => setPodForm({ ...podForm, country: e.target.value })}
                        disabled={team !== 'ALL'} aria-label="Country"
                        title={team !== 'ALL' ? 'Country follows the All/MY/ID switcher above' : undefined}
                        className="h-10 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none disabled:opacity-60">
                        <option value="MY">MY</option>
                        <option value="ID">ID</option>
                      </select>
                    </div>
                    <button type="button" disabled={pplBusy || !podForm.name.trim() || !podForm.captain}
                      onClick={() => pplSave(async () => await supabase!.rpc('fn_create_pod',
                        { p_name: podForm.name, p_captain: podForm.captain,
                          p_country: team !== 'ALL' ? team : podForm.country }),
                        'Pod ' + podForm.name.toUpperCase() + ' created').then(() => { setPodForm({ ...podForm, name: '', captain: '' }); loadElite() })}
                      className="h-10 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent disabled:opacity-40">
                      + Create Pod
                    </button>
                  </Card>
                </div>

                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-3">Pod</th><th className="px-4 py-3">Captain</th>
                        <th className="px-4 py-3">Country</th><th className="px-4 py-3">Members</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamPods.map((p) => (
                        <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                          <td className="px-4 py-3 font-display font-extrabold">{p.name}</td>
                          <td className="px-4 py-3">{nameOf(p.captain_id)}</td>
                          <td className="px-4 py-3">{p.country}</td>
                          <td className="px-4 py-3">{podMembers.filter((m) => m.pod_id === p.id).length}</td>
                          <td className="px-4 py-3 text-right">
                            <button type="button" disabled={pplBusy}
                              onClick={() => { if (confirm('Disband pod ' + p.name + '?'))
                                pplSave(async () => await supabase!.from('pods').delete().eq('id', p.id),
                                  'Pod ' + p.name + ' disbanded').then(loadElite) }}
                              className="cursor-pointer rounded-lg border border-danger/50 px-3 py-1.5 text-xs font-bold text-danger">
                              Disband
                            </button>
                          </td>
                        </tr>
                      ))}
                      {livePods.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted">
                          No pods yet. Appoint Elite members, then create the first pod above.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                  <p className="p-4 text-[11px] text-muted">
                    Closings and the Balang pool are not shown yet - no funded-closing feed is
                    connected, and an invented figure would be worse than none.
                    "Captain" is a position (pod leader), not a rank.
                  </p>
                </Card>
              </>
            )
          })()}

          {section === 'booths' && (
            <>
              <Card className="mb-4 max-w-3xl p-4">
                <p className="mb-2 text-sm font-bold">Create booth</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={boothForm.title} onChange={(e) => setBoothForm({ ...boothForm, title: e.target.value })}
                    placeholder="Booth title * (e.g. MidValley Megamall)"
                    className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent md:col-span-2" />
                  <input value={boothForm.location} onChange={(e) => setBoothForm({ ...boothForm, location: e.target.value })}
                    placeholder="Location / address"
                    className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                  <select value={boothForm.country} onChange={(e) => setBoothForm({ ...boothForm, country: e.target.value })}
                    aria-label="Country"
                    className="h-10 cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
                    <option value="MY">MY</option><option value="ID">ID</option>
                  </select>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted">First day *</span>
                    <input type="date" value={boothForm.date_start}
                      onChange={(e) => setBoothForm({ ...boothForm, date_start: e.target.value })}
                      className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Last day *</span>
                    <input type="date" value={boothForm.date_end}
                      onChange={(e) => setBoothForm({ ...boothForm, date_end: e.target.value })}
                      className="mt-1 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none" />
                  </label>
                  <div className="flex items-end gap-3 md:col-span-2">
                    {(['am', 'pm'] as const).map((k) => (
                      <label key={k} className="flex cursor-pointer items-center gap-1.5 text-xs font-bold">
                        <input type="checkbox" checked={boothForm[k]}
                          onChange={(e) => setBoothForm({ ...boothForm, [k]: e.target.checked })} />
                        {k.toUpperCase()} shift
                      </label>
                    ))}
                    <button type="button"
                      disabled={rwBusy || !boothForm.title.trim() || !boothForm.date_start || !boothForm.date_end
                        || boothForm.date_end < boothForm.date_start || (!boothForm.am && !boothForm.pm)}
                      onClick={() => rwSave(async () => await supabase!.from('booths').insert({
                        title: boothForm.title.trim(),
                        location: boothForm.location.trim() || null,
                        country: boothForm.country,
                        date_start: boothForm.date_start,
                        date_end: boothForm.date_end,
                        shifts: [boothForm.am && 'AM', boothForm.pm && 'PM'].filter(Boolean),
                      }), 'Booth created').then(() => { setBoothForm({ ...boothForm, title: '', location: '' }); loadBooths() })}
                      className="ml-auto h-10 cursor-pointer rounded-xl bg-accent px-5 text-xs font-extrabold text-on-accent disabled:opacity-40">
                      + Create booth
                    </button>
                  </div>
                </div>
              </Card>

              <Card className="max-w-3xl">
                {booths.filter((b) => team === 'ALL' || b.country === team).map((b) => {
                  const mine = signups.filter((g) => g.booth_id === b.id)
                  const days = b.date_start && b.date_end
                    ? Math.round((+new Date(b.date_end) - +new Date(b.date_start)) / 864e5) + 1 : 0
                  return (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 border-b border-border p-4 last:border-0">
                      <span className="text-xl">⛺</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{b.country === 'MY' ? '🇲🇾' : '🇮🇩'} {b.title}</p>
                        <p className="text-[11px] text-muted">
                          {[b.location, b.date_start && b.date_end
                            && `${new Date(b.date_start).toLocaleDateString()} – ${new Date(b.date_end).toLocaleDateString()} (${days}d)`,
                            (b.shifts ?? []).join(' + ')].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <Chip tone={mine.length > 0 ? 'success' : 'default'}>{mine.length} signed up</Chip>
                      <button type="button" disabled={rwBusy}
                        onClick={() => { if (confirm(`Delete booth "${b.title}"? Signups go with it.`))
                          rwSave(async () => await supabase!.from('booths').delete().eq('id', b.id),
                            'Booth deleted').then(loadBooths) }}
                        className="cursor-pointer rounded-lg border border-danger/50 px-3 py-1.5 text-xs font-bold text-danger">
                        Delete
                      </button>
                    </div>
                  )
                })}
                {booths.length === 0 && (
                  <p className="p-8 text-center text-xs text-muted">
                    No booths yet. Create the first one above — warriors can then be signed up per day and shift.
                  </p>
                )}
              </Card>
            </>
          )}

          {section === 'caller' && supabaseReady && user.id.includes('-') && <CallerAdmin team={team} />}
          {section === 'events' && <EventsAdmin team={team} />}
          {section === 'certtpl' && <CertTemplates team={team} />}
          {section === 'kamalsesi' && <KamalagSessions />}
          {section === 'caller' && !(supabaseReady && user.id.includes('-')) && (
            <>
              <div className="no-scrollbar mb-5 flex gap-1.5 overflow-x-auto">
                {(['overview', 'leads', 'pipelines', 'projects', 'fields', 'import', 'quotes', 'bop', 'reports', 'audit'] as CallerTab[]).map((ct) => (
                  <button
                    key={ct}
                    type="button"
                    onClick={() => setCallerTab(ct)}
                    className={clsx(
                      'shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold capitalize transition-colors duration-150',
                      callerTab === ct ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink',
                    )}
                  >
                    {ct === 'bop' ? 'BOP' : ct}
                  </button>
                ))}
              </div>

              {/* P0.8 — this whole branch renders ONLY for demo personas (the condition
                  above is !supabaseReady || demo id). Real accounts get <CallerAdmin/>,
                  which is 100% live. The banner makes that impossible to mistake. */}
              <Card className="mb-4 border-warning/50 bg-warning/10 p-3">
                <p className="text-xs font-extrabold text-warning">⚠ DEMO PREVIEW — not live data</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  These are illustrative records for the product demo. Sign in with a real
                  account to open the live Marketing4U console.
                </p>
              </Card>

              {callerTab === 'overview' && (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                    {([
                      ['Pool', 4], ['Assigned', 0], ['Locked', 1], ['Dead', 1],
                      ['Calls today', 214], ['Webhooks', 37], ['GHL retry', 2],
                    ] as [string, number][]).map(([l, v]) => (
                      <Card key={l} className="p-3.5 text-center">
                        <p className="font-display text-xl font-extrabold">{v}</p>
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">{l}</p>
                      </Card>
                    ))}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Queue by label</p>
                      {([['New', 42], ['No Answer', 31], ['Callback', 12], ['Warm', 9], ['Not Interested', 17], ['Wrong Number', 5]] as [string, number][]).map(([l, v]) => (
                        <div key={l} className="mb-2.5">
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="font-semibold">{l}</span>
                            <span className="text-muted">{v} · {Math.round(v / 1.16)}%</span>
                          </div>
                          <Bar pct={v / 0.42} />
                        </div>
                      ))}
                    </Card>
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Dead / Unreachable — revive</p>
                      {fLeads.filter((l) => l.status === 'dead').map((l) => (
                        <div key={l.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                          <Avatar name={l.name} color="var(--danger)" size={34} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{l.name}</p>
                            <p className="text-[11px] text-muted">{l.project} · {l.label} · ↻{l.cb}</p>
                          </div>
                          <button type="button" onClick={() => leadAction(l.id, { status: 'pool', label: 'New', cb: 0 }, `Revived ${l.name}`)} className="flex cursor-pointer items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent"><RotateCcw size={12} /> Revive</button>
                        </div>
                      ))}
                      {fLeads.filter((l) => l.status === 'dead').length === 0 && <p className="py-6 text-center text-sm text-muted">No dead leads 🎉</p>}
                    </Card>
                  </div>
                </>
              )}

              {callerTab === 'leads' && (
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                        <th className="px-4 py-3">Lead</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Label</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">CB</th><th className="px-4 py-3">Holder</th><th className="px-4 py-3 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fLeads.map((l) => (
                        <tr key={l.id} className={clsx('border-b border-border last:border-0 hover:bg-surface2/50', l.project.includes('triage') && 'bg-warning/10')}>
                          <td className="px-4 py-3"><p className="font-semibold">{l.name}</p><p className="text-[11px] text-muted">{l.phone}</p></td>
                          <td className="px-4 py-3">{l.project.includes('triage') ? <Chip tone="warning">⚠ {l.project}</Chip> : l.project}</td>
                          <td className="px-4 py-3"><Chip tone={l.label === 'Booked' ? 'success' : l.label === 'New' ? 'info' : l.status === 'dead' ? 'danger' : 'default'}>{l.label}</Chip></td>
                          <td className="px-4 py-3"><Chip tone={l.status === 'locked' ? 'accent' : l.status === 'dead' ? 'danger' : 'default'}>{l.status}</Chip></td>
                          <td className="px-4 py-3">{l.cb}</td>
                          <td className="px-4 py-3 text-xs">{l.holder ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1.5">
                              {l.status === 'dead' && <button type="button" onClick={() => leadAction(l.id, { status: 'pool', label: 'New', cb: 0 }, 'Revived — full fresh life')} className="cursor-pointer rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-bold text-on-accent">Revive</button>}
                              {l.status === 'locked' && <button type="button" onClick={() => leadAction(l.id, { status: 'pool', label: 'New', holder: undefined }, 'Ownership released')} className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted">Release</button>}
                              {l.status === 'pool' && (
                                <select defaultValue="" onChange={(e) => { if (e.target.value) leadAction(l.id, { holder: `🔒 ${e.target.value}` }, `Reserved for ${e.target.value} · 24 h`) }} className="cursor-pointer rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-bold outline-none" aria-label="Reassign">
                                  <option value="">Reassign…</option>
                                  {fAgents.filter((a) => a.status === 'active').map((a) => <option key={a.id} value={a.name.split(' ')[0]}>{a.name}</option>)}
                                </select>
                              )}
                              {l.project.includes('triage') && <button type="button" onClick={() => leadAction(l.id, { project: 'Vividz Grand' }, 'Project set — out of triage')} className="cursor-pointer rounded-lg bg-warning px-2.5 py-1.5 text-[11px] font-bold text-white">Set project</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {callerTab === 'pipelines' && (
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="font-display text-sm font-extrabold">GHL pipeline → project mapping</p>
                    <button type="button" onClick={() => say('Pulled 4 pipelines from GHL')} className="cursor-pointer rounded-lg bg-accent px-3.5 py-2 text-xs font-bold text-on-accent">Fetch from GHL</button>
                  </div>
                  {[
                    { name: 'VIVIDZ FB Campaign', id: 'pip_9f2k', mapped: '', warn: true },
                    { name: 'EXSIM Residensi', id: 'pip_2a8c', mapped: 'EXSIM Residensi', warn: false },
                    { name: 'ERINAZ KELANTAN', id: 'pip_7x1d', mapped: 'Erinaz Suites', warn: false },
                    { name: 'AG Recruitment', id: 'pip_5m3q', mapped: 'AG Recruitment Drive', warn: false },
                  ].map((p) => (
                    <div key={p.id} className={clsx('flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0', p.warn && 'bg-warning/10')}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{p.name} {p.warn && <Chip tone="warning">triage</Chip>}</p>
                        <p className="text-[11px] text-muted">{p.id}</p>
                      </div>
                      <select defaultValue={p.mapped} onChange={() => say(`Mapped ${p.name}`)} className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold outline-none" aria-label={`Map ${p.name}`}>
                        <option value="">— map to project —</option>
                        {['EXSIM Residensi', 'Erinaz Suites', 'AG Recruitment Drive', 'Vividz Grand', 'Podomoro Park'].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                  ))}
                </Card>
              )}

              {callerTab === 'projects' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {[
                    { name: 'EXSIM Residensi', team: 'MY', type: 'property', leads: 84, agents: 5 },
                    { name: 'Erinaz Suites', team: 'MY', type: 'property', leads: 46, agents: 3 },
                    { name: 'AG Recruitment Drive', team: 'MY', type: 'recruitment', leads: 31, agents: 4 },
                    { name: 'Vividz Grand', team: 'ID', type: 'property', leads: 112, agents: 7 },
                    { name: 'Podomoro Park', team: 'ID', type: 'property', leads: 58, agents: 4 },
                  ].filter((p) => team === 'ALL' || p.team === team).map((p) => (
                    <Card key={p.name} className="flex items-center gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{p.name} <span className="ml-1">{p.team === 'MY' ? '🇲🇾' : '🇮🇩'}</span> {p.type === 'recruitment' && <Chip tone="accent">recruitment</Chip>}</p>
                        <p className="text-[11px] text-muted">{p.leads} leads · {p.agents} agents</p>
                      </div>
                      <button type="button" onClick={() => say(`Edit ${p.name}`)} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">Edit</button>
                    </Card>
                  ))}
                </div>
              )}

              {callerTab === 'fields' && (
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-4 py-3">Key</th><th className="px-4 py-3">Label</th><th className="px-4 py-3">Aliases</th><th className="px-4 py-3">Agent sees</th></tr></thead>
                    <tbody>
                      {([
                        ['usia', 'Usia', 'umur, age', false],
                        ['trigger_beli', 'Pemicu beli', 'pemicu_beli, trigger, alasan_beli', true],
                        ['rencana_bayar', 'Pembayaran', 'rencana_pembayaran, payment, bayar', true],
                        ['budget_cicilan', 'Budget/bln', 'budget, cicilan, installment', true],
                        ['domisili', 'Domisili', 'lokasi, kota, alamat', true],
                        ['waktu_survey', 'Bisa survey', 'jadwal_survey, site_visit', true],
                      ] as [string, string, string, boolean][]).map(([k, l, a, vis]) => (
                        <tr key={k} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-mono text-xs">{k}</td>
                          <td className="px-4 py-3 font-semibold">{l}</td>
                          <td className="px-4 py-3 text-xs text-muted">{a}</td>
                          <td className="px-4 py-3"><Chip tone={vis ? 'success' : 'default'}>{vis ? 'Yes' : 'Admin only'}</Chip></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {callerTab === 'import' && (
                <Card className="max-w-xl p-6">
                  <p className="mb-1 font-display text-sm font-extrabold">Import leads — Excel / CSV</p>
                  <p className="mb-4 text-xs text-muted">Max 5,000 rows · dedupes exactly like webhook leads.</p>
                  <div className="mb-4 flex h-28 items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-muted">Drop .xlsx / .csv here</div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => say('Imported: 214 inserted · 12 multi-interest · 3 revived · 41 duplicates')} className="flex-1 cursor-pointer rounded-xl bg-accent py-3 text-sm font-bold text-on-accent">Import</button>
                    <button type="button" onClick={() => say('Template downloaded')} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border px-4 text-xs font-bold text-muted"><Download size={14} /> Template</button>
                  </div>
                </Card>
              )}

              {callerTab === 'quotes' && (
                <Card className="max-w-2xl p-5">
                  <p className="mb-3 font-display text-sm font-extrabold">Motivational quotes</p>
                  {[
                    { body: 'Trust is the currency of AG.', author: 'Kamal AG', team: 'MY' as const },
                    { body: 'Speed to lead wins the deal — 5 minutes or it cools.', author: 'Hukum 5 Minit', team: 'MY' as const },
                    { body: 'Satu telepon lagi. Satu peluang lagi.', author: 'AG Indonesia', team: 'ID' as const },
                  ].filter((q) => team === 'ALL' || q.team === team).map((q) => (
                    <p key={q.body} className="border-b border-border py-3 text-sm italic last:border-0">"{q.body}" <span className="text-xs not-italic text-muted">— {q.author} · {q.team === 'MY' ? '🇲🇾' : '🇮🇩'}</span></p>
                  ))}
                </Card>
              )}

              {callerTab === 'bop' && (
                <>
                  <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                    {([['Called', 128], ['Booked', 43], ['Attended', 27], ['Show rate', '66%'], ['JOINED 🎉', 11]] as [string, number | string][]).map(([l, v]) => (
                      <Card key={l} className="p-4 text-center">
                        <p className="font-display text-xl font-extrabold">{v}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</p>
                      </Card>
                    ))}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Recruitment funnel</p>
                      {([['Dihubungi', 128], ['Ditempah', 43], ['Hadir', 27], ['Sertai', 11]] as [string, number][]).map(([l, v]) => (
                        <div key={l} className="mb-3">
                          <div className="mb-1 flex justify-between text-xs"><span className="font-semibold">{l}</span><span className="text-muted">{v}</span></div>
                          <Bar pct={v / 1.28} />
                        </div>
                      ))}
                    </Card>
                    <Card className="p-5">
                      <p className="mb-3 font-display text-sm font-extrabold">Upcoming sessions</p>
                      {[
                        { t: 'BOP Online — Wednesday Night', when: 'Wed 6 Aug · 8:30 PM', booked: 9, type: '🎥' },
                        { t: 'BOP HQ Kuala Lumpur', when: 'Sat 9 Aug · 10:00 AM', booked: 3, type: '🏢' },
                      ].map((s) => (
                        <div key={s.t} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                          <span className="text-xl">{s.type}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{s.t}</p>
                            <p className="text-[11px] text-muted">{s.when} · {s.booked} booked {s.booked < 5 && <span className="text-warning">· fill seats!</span>}</p>
                          </div>
                          <button type="button" onClick={() => say('Roster: attended / no-show / JOINED + CSV')} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">Roster</button>
                        </div>
                      ))}
                    </Card>
                  </div>
                </>
              )}

              {callerTab === 'reports' && (
                <>
                  <div className="mb-5 grid grid-cols-3 gap-3 md:max-w-lg">
                    {([['Calls', 486], ['Bookings', 18], ['Conversion', '3.7%']] as [string, number | string][]).map(([l, v]) => (
                      <Card key={l} className="p-4 text-center">
                        <p className="font-display text-xl font-extrabold">{v}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{l}</p>
                      </Card>
                    ))}
                  </div>
                  <Card className="overflow-x-auto">
                    <p className="p-4 pb-0 font-display text-sm font-extrabold">Agent × outcome pivot <span className="text-xs font-normal text-muted">— click any number to audit</span></p>
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-4 py-3">Agent</th>{Object.keys(PIVOT).map((k) => <th key={k} className="px-3 py-3 text-right">{k}</th>)}</tr></thead>
                      <tbody>
                        {PIVOT_AGENTS.map((a, i) => (
                          <tr key={a} className="border-b border-border last:border-0 hover:bg-surface2/50">
                            <td className="px-4 py-2.5 font-semibold">{a}</td>
                            {Object.keys(PIVOT).map((k) => (
                              <td key={k} className="px-3 py-2.5 text-right">
                                <button type="button" onClick={() => { setCallerTab('audit'); say(`Audit: ${a} × ${k}`) }} className={clsx('cursor-pointer rounded px-1.5 py-0.5 font-semibold transition-colors hover:bg-accent-soft hover:text-accent', k === 'Booked' && 'text-accent')}>{PIVOT[k][i]}</button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </>
              )}

              {callerTab === 'audit' && (
                <Card className="p-5">
                  <p className="mb-1 font-display text-sm font-extrabold">Audit — Aisyah × No Answer (last 30 days)</p>
                  <p className="mb-4 text-xs text-muted">Cross-check numbers · ask questions · rework leads</p>
                  {[
                    { lead: 'Michelle Yeo', note: 'busy tone', ago: '2h ago', status: 'pool' },
                    { lead: 'Ravi Kumar', note: '', ago: '5h ago', status: 'pool' },
                    { lead: 'Lim Wei Jie', note: 'rang out twice', ago: '1d ago', status: 'assigned' },
                  ].map((r) => (
                    <div key={r.lead} className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{r.lead} <Chip>No Answer</Chip></p>
                        <p className="text-[11px] text-muted">{r.note ? `"${r.note}" · ` : ''}{r.ago} · now {r.status}</p>
                      </div>
                      <button type="button" onClick={() => say('Lead recalled to pool')} className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted hover:text-ink">Recall</button>
                      <button type="button" onClick={() => say('Question sent — requires response')} className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent">💬 Ask agent</button>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}

          {/* ============ 30-DAY CHALLENGE ============ */}
          {section === 'talent' && (
            supabaseReady && user.id.includes('-')
              ? <TalentAdmin embedded />
              : <Card className="p-8 text-center text-sm text-muted">Sign in with a real account to open the Talent Compass dashboard.</Card>
          )}

          {section === 'growonb' && (
            supabaseReady && user.id.includes('-')
              ? <OnbAdmin />
              : <Card className="p-8 text-center text-sm text-muted">Sign in with a real account to manage Grow Onboarding.</Card>
          )}

          {section === 'social' && (
            supabaseReady && user.id.includes('-')
              ? <SocialAdmin />
              : <Card className="p-8 text-center text-sm text-muted">Sign in with a real account to manage Social Coaching.</Card>
          )}

          {section === 'atlas' && (
            supabaseReady && user.id.includes('-')
              ? <AtlasAdmin />
              : <Card className="p-8 text-center text-sm text-muted">Sign in with a real account to manage the ATLAS Library.</Card>
          )}

          {section === 'academy' && (
            supabaseReady && user.id.includes('-')
              ? <AcademyAdmin />
              : <Card className="p-8 text-center text-sm text-muted">Sign in with a real account to manage AG Academy.</Card>
          )}

          {section === 'challenge' && (
            <>
              <a href="/coach"
                className="mb-3 flex cursor-pointer items-center gap-3 rounded-xl border border-accent/50 bg-accent-soft p-3.5 no-underline">
                <span className="text-xl">🛡</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-accent">Open Coach Review Queue →</p>
                  <p className="text-[11px] text-muted">Approve readiness, evidence, closings and journey steps. Approvals live here, not in Command HQ.</p>
                </div>
              </a>
              <div className="mb-4 flex gap-1.5">
                {(['health', 'progress', 'enrolment', 'curriculum', 'coaches', 'reports', 'governance', 'authority'] as const).map((ct) => (
                  <button key={ct} type="button" onClick={() => setChTab(ct)}
                    className={clsx('cursor-pointer rounded-full border px-4 py-2 text-xs font-extrabold capitalize', chTab === ct ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
                    {ct === 'health' ? '🩺 Health' : ct === 'progress' ? '📊 Progress' : ct === 'enrolment' ? '🎯 Enrolment' : ct === 'curriculum' ? '✏️ Curriculum' : ct === 'coaches' ? '👥 Coaches' : ct === 'governance' ? '⚖️ Governance' : ct === 'authority' ? '🔑 Authority & Pilot' : '📄 Reports'}
                  </button>
                ))}
              </div>
              {chTab === 'authority'
                ? <Authority realId={supabaseReady && user.id.includes('-')} onSaved={say} />
                : chTab === 'governance'
                ? <Governance realId={supabaseReady && user.id.includes('-')} />
                : chTab === 'health'
                ? <Health team={team} realId={supabaseReady && user.id.includes('-')} />
                : chTab === 'progress'
                ? <ChallengeProgress realId={supabaseReady && user.id.includes('-')} />
                : chTab === 'enrolment'
                ? <Enrolment team={team} realId={supabaseReady && user.id.includes('-')} onSaved={say} />
                : chTab === 'curriculum'
                  ? <CurriculumEditor realId={supabaseReady && user.id.includes('-')} onSaved={say} />
                  : chTab === 'coaches'
                    ? <Coaches realId={supabaseReady && user.id.includes('-')} onSaved={say} />
                    : <ChallengeReports realId={supabaseReady && user.id.includes('-')} />}
            </>
          )}

          {/* ============ APP CONTENT ============ */}
          {section === 'content' && (
            <>
              <PosterChannels say={say} />
              <InviteLinksPanel say={say} />
              <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {([
                  { t: 'Academy / ATLAS', d: 'Curriculum editor — Challenge lessons', go: 'challenge' as Section },
                  { t: 'Quotes & motivation', d: 'Caller home-screen quotes', go: 'caller' as Section },
                  { t: 'Projects & docs', d: 'Projects, pipelines, fields', go: 'caller' as Section },
                  { t: 'Reward campaigns', d: 'Publish reward campaigns', go: 'rewards' as Section },
                ]).map((c) => (
                  <Card key={c.t} className="p-4" onClick={() => setSection(c.go)}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold">{c.t}</p>
                      <Chip tone="accent">open →</Chip>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">{c.d}</p>
                  </Card>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {/* ---------- Announcements ---------- */}
                <Card className="p-4">
                  <p className="mb-1 text-sm font-bold">📣 Announcements</p>
                  <p className="mb-3 text-[11px] text-muted">
                    Lands in every warrior's notification bell instantly. Country-scoped.
                  </p>
                  <input value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                    placeholder="Title *"
                    className="mb-2 h-10 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                  <textarea value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
                    placeholder="Message *" rows={3}
                    className="mb-2 w-full rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent" />
                  <div className="flex flex-wrap gap-2">
                    <input value={annForm.link} onChange={(e) => setAnnForm({ ...annForm, link: e.target.value })}
                      placeholder="Link on tap (optional, e.g. /challenge)"
                      className="h-10 min-w-[160px] flex-1 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                    <select value={annForm.country} onChange={(e) => setAnnForm({ ...annForm, country: e.target.value })}
                      aria-label="Country"
                      className="h-10 cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
                      <option value="ALL">🌏 Both</option>
                      <option value="MY">🇲🇾 MY</option>
                      <option value="ID">🇮🇩 ID</option>
                    </select>
                    <button type="button" disabled={cBusy || !annForm.title.trim() || !annForm.body.trim()}
                      onClick={() => { if (confirm(`Broadcast to ${annForm.country === 'ALL' ? 'ALL warriors' : annForm.country}?`))
                        cSave(async () => {
                          const { data, error } = await supabase!.rpc('fn_announce', {
                            p_title: annForm.title, p_body: annForm.body,
                            p_country: annForm.country, p_link: annForm.link.trim() || null,
                          })
                          if (!error) say(`Sent to ${(data as { recipients: number })?.recipients ?? '?'} warriors`)
                          return { error }
                        }, 'Announcement sent').then(() => setAnnForm({ ...annForm, title: '', body: '', link: '' })) }}
                      className="h-10 cursor-pointer rounded-xl bg-accent px-5 text-xs font-extrabold text-on-accent disabled:opacity-40">
                      Broadcast
                    </button>
                  </div>
                  {anns.length > 0 && (
                    <div className="mt-4 space-y-1.5 border-t border-border pt-3">
                      {anns.map((a) => (
                        <p key={a.id} className="text-[11px] text-muted">
                          <b className="text-ink">{a.title}</b> · {a.country} · {a.recipients} warriors ·
                          {' '}{new Date(a.created_at).toLocaleString()}
                        </p>
                      ))}
                    </div>
                  )}
                </Card>

                {/* ---------- Directory ---------- */}
                <Card className="p-4">
                  <p className="mb-1 text-sm font-bold">📇 Directory</p>
                  <p className="mb-3 text-[11px] text-muted">
                    Leadership, hotlines and PICs — agents see it under Grow → Directory. WhatsApp-first.
                  </p>
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <input value={dirForm.name} onChange={(e) => setDirForm({ ...dirForm, name: e.target.value })}
                      placeholder="Name *"
                      className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                    <input value={dirForm.role} onChange={(e) => setDirForm({ ...dirForm, role: e.target.value })}
                      placeholder="Role / title"
                      className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                    <input value={dirForm.phone} onChange={(e) => setDirForm({ ...dirForm, phone: e.target.value })}
                      placeholder="Phone +60…"
                      className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                    <input value={dirForm.email} onChange={(e) => setDirForm({ ...dirForm, email: e.target.value })}
                      placeholder="Email"
                      className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                    <select value={dirForm.category} onChange={(e) => setDirForm({ ...dirForm, category: e.target.value })}
                      aria-label="Category"
                      className="h-10 cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
                      {['Leadership', 'Hotline', 'PIC', 'Support'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <select value={dirForm.country} onChange={(e) => setDirForm({ ...dirForm, country: e.target.value })}
                        aria-label="Country"
                        className="h-10 min-w-0 flex-1 cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
                        <option value="ALL">🌏</option><option value="MY">🇲🇾</option><option value="ID">🇮🇩</option>
                      </select>
                      <button type="button" disabled={cBusy || !dirForm.name.trim()}
                        onClick={() => cSave(async () => await supabase!.from('directory_entries').insert({
                          name: dirForm.name.trim(), role: dirForm.role.trim() || null,
                          phone: dirForm.phone.trim() || null, email: dirForm.email.trim() || null,
                          category: dirForm.category, country: dirForm.country, sort: dirs.length,
                        }), 'Contact added').then(() => setDirForm({ ...dirForm, name: '', role: '', phone: '', email: '' }))}
                        className="h-10 cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
                        + Add
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 space-y-1 overflow-y-auto border-t border-border pt-2">
                    {dirs.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                        <Chip>{d.category}</Chip>
                        <span className="min-w-0 flex-1 truncate font-semibold">{d.name}
                          <span className="ml-1 font-normal text-muted">{d.role ?? ''} {d.phone ?? ''}</span>
                        </span>
                        <span className="text-muted">{d.country}</span>
                        <button type="button" disabled={cBusy}
                          onClick={() => cSave(async () => await supabase!.from('directory_entries')
                            .update({ active: !d.active }).eq('id', d.id), d.active ? 'Hidden' : 'Visible again')}
                          className={clsx('cursor-pointer rounded-full border px-2.5 py-1 text-[10px] font-bold',
                            d.active ? 'border-success/60 text-success' : 'border-border text-muted')}>
                          {d.active ? 'visible' : 'hidden'}
                        </button>
                        <button type="button" disabled={cBusy}
                          onClick={() => { if (confirm(`Delete ${d.name}?`))
                            cSave(async () => await supabase!.from('directory_entries').delete().eq('id', d.id), 'Deleted') }}
                          className="cursor-pointer text-[10px] font-bold text-danger">✕</button>
                      </div>
                    ))}
                    {dirs.length === 0 && <p className="py-3 text-center text-[11px] text-muted">No contacts yet.</p>}
                  </div>
                </Card>
              </div>
            </>
          )}

          {section === 'rewards' && (
            <>
              <Card className="mb-3 max-w-3xl p-4">
                <p className="mb-2 text-sm font-bold">Publish a reward campaign</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <input value={rwForm.title} onChange={(e) => setRwForm({ ...rwForm, title: e.target.value })}
                    placeholder="Campaign title *"
                    className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                  <input value={rwForm.tier} onChange={(e) => setRwForm({ ...rwForm, tier: e.target.value })}
                    placeholder="Tier (e.g. Gold)"
                    className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                  <input value={rwForm.category} onChange={(e) => setRwForm({ ...rwForm, category: e.target.value })}
                    placeholder="Category (e.g. Trip)"
                    className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                  <input value={rwForm.target_label} onChange={(e) => setRwForm({ ...rwForm, target_label: e.target.value })}
                    placeholder="Target (e.g. 12 closings)"
                    className="h-10 rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
                  <select value={rwForm.country} onChange={(e) => setRwForm({ ...rwForm, country: e.target.value })}
                    aria-label="Country"
                    className="h-10 cursor-pointer rounded-xl border border-border bg-surface2 px-3 text-sm outline-none">
                    <option value="MY">🇲🇾 Malaysia</option>
                    <option value="ID">🇮🇩 Indonesia</option>
                  </select>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface2 px-3 text-xs font-bold text-muted hover:text-ink">
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                      onChange={(e) => setRwPoster(e.target.files?.[0] ?? null)} />
                    🖼 {rwPoster ? rwPoster.name.slice(0, 22) : 'Poster (optional)'}
                  </label>
                  <button type="button" disabled={rwBusy || !rwForm.title.trim()}
                    onClick={() => rwSave(async () => {
                      /* poster first, row second — a row pointing at a failed upload
                         would show agents a broken image forever */
                      let posterPath: string | null = null
                      if (rwPoster) {
                        const ext = rwPoster.name.split('.').pop()?.toLowerCase() ?? 'png'
                        const key = `${rwForm.country}/${Date.now()}-${rwForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.${ext}`
                        const up = await supabase!.storage.from('rewards').upload(key, rwPoster,
                          { contentType: rwPoster.type, upsert: false })
                        if (up.error) return { error: up.error }
                        posterPath = supabase!.storage.from('rewards').getPublicUrl(key).data.publicUrl
                      }
                      return await supabase!.from('rewards').insert({
                        title: rwForm.title.trim(),
                        tier: rwForm.tier.trim() || null,
                        category: rwForm.category.trim() || null,
                        target_label: rwForm.target_label.trim() || null,
                        poster_path: posterPath,
                        country: rwForm.country, active: true, sort: rw.length,
                      })
                    }, 'Campaign published').then(() => { setRwForm({ ...rwForm, title: '', tier: '', category: '', target_label: '' }); setRwPoster(null) })}
                    className="h-10 cursor-pointer rounded-xl bg-accent px-5 text-xs font-extrabold text-on-accent disabled:opacity-40">
                    + Publish
                  </button>
                </div>
              </Card>

              <Card className="max-w-3xl overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Country</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Status</th><th /></tr></thead>
                  <tbody>
                    {rw.filter((r) => team === 'ALL' || r.country === team).map((r) => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface2/50">
                        <td className="px-4 py-3 font-semibold">
                          <div className="flex items-center gap-2.5">
                            {r.poster_path && (
                              <img src={r.poster_path} alt="" className="h-9 w-9 rounded-lg border border-border object-cover" />
                            )}
                            {r.title}
                          </div>
                        </td>
                        <td className="px-4 py-3">{r.tier ? <Chip tone="accent">{r.tier}</Chip> : <span className="text-muted">—</span>}</td>
                        <td className="px-4 py-3">{r.country === 'MY' ? '🇲🇾' : '🇮🇩'}</td>
                        <td className="px-4 py-3 text-xs">{r.target_label ?? '—'}</td>
                        <td className="px-4 py-3">
                          <button type="button" disabled={rwBusy}
                            onClick={() => rwSave(async () => await supabase!.from('rewards')
                              .update({ active: !r.active }).eq('id', r.id), r.active ? 'Campaign paused' : 'Campaign live')}
                            className="cursor-pointer">
                            <Chip tone={r.active ? 'success' : 'default'}>{r.active ? 'active' : 'draft'}</Chip>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" disabled={rwBusy}
                            onClick={() => { if (confirm(`Delete "${r.title}"?`))
                              rwSave(async () => await supabase!.from('rewards').delete().eq('id', r.id), 'Campaign deleted') }}
                            className="cursor-pointer text-[11px] font-bold text-danger">Delete</button>
                        </td>
                      </tr>
                    ))}
                    {rw.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted">
                        No campaigns yet. Publish one above and it appears on every agent's Grow screen.
                      </td></tr>
                    )}
                  </tbody>
                </table>
                <p className="p-4 text-[11px] text-muted">Country-scoped — Indonesia gets its own campaigns.</p>
              </Card>
            </>
          )}

          {section === 'settings' && (
            <>
            {/* Brand Studio — uploadable logos & mascots */}
            <Card className="mb-5 p-5">
              <div className="mb-1 flex items-center gap-2">
                <p className="font-display text-sm font-extrabold">🎨 Brand Studio</p>
                <Chip tone="accent">change anytime — no developer needed</Chip>
              </div>
              <p className="mb-4 text-[11px] leading-relaxed text-muted">
                Upload transparent PNG/WebP for best results (backgrounds can be auto-removed on upload in the full build).
                Every change keeps version history — swap to 3D or festive styles any time and roll back if needed.
              </p>
              <div className="grid gap-x-8 gap-y-2 xl:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">🇲🇾 Malaysia — 2 logos + mascots</p>
                  <BrandSlotEditor country="MY" slot="logo_iqi" label="Logo 1 · IQI" hint="Header + poster left mark" onSaved={say} />
                  <BrandSlotEditor country="MY" slot="logo_ag" label="Logo 2 · AG" hint="Header + poster right mark" onSaved={say} />
                  <BrandSlotEditor country="MY" slot="mascot_home" label="Mascot · Home" hint="My Day hero corner" onSaved={say} />
                  <BrandSlotEditor country="MY" slot="mascot_login" label="Mascot · Login" hint="Optional — hidden when empty" onSaved={say} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">🇮🇩 Indonesia — 2 logos + mascots</p>
                  <BrandSlotEditor country="ID" slot="logo_iqi" label="Logo 1 · IQI" hint="Header + poster left mark" onSaved={say} />
                  <BrandSlotEditor country="ID" slot="logo_ag" label="Logo 2 · AG" hint="Header + poster right mark" onSaved={say} />
                  <BrandSlotEditor country="ID" slot="mascot_home" label="Mascot · Home" hint="My Day hero corner" onSaved={say} />
                  <BrandSlotEditor country="ID" slot="mascot_login" label="Mascot · Login" hint="Optional — hidden when empty" onSaved={say} />
                </div>
              </div>
              <div className="mt-3 border-t border-border pt-1">
                <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wider text-muted">🌐 Global</p>
                <BrandSlotEditor country="GLOBAL" slot="shield" label="AG Shield" hint="Login splash + admin hero watermark" onSaved={say} />
              </div>
            </Card>

            {/* Income rules — comm added by admin for BOTH countries */}
            <Card className="mb-5 p-5">
              <div className="mb-1 flex items-center gap-2">
                <p className="font-display text-sm font-extrabold">💰 Income rules</p>
                <Chip tone="accent">REN · L · TL · HOT · VP · GVP</Chip>
              </div>
              <p className="mb-4 text-[11px] text-muted">
                Set OV % per rank and every property's price/comm/RGR. Users see OV for their level & below only. Edits go live instantly.
              </p>
              <div className="grid gap-x-8 gap-y-5 xl:grid-cols-2">
                <IncomeRules country="MY" onSaved={say} />
                <IncomeRules country="ID" onSaved={say} />
              </div>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              {(['MY', 'ID'] as const).map((c) => (
                <CountrySettingsCard key={c} c={c} onSaved={say} />
              ))}
            </div>
            </>
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
   Poster channels — where a Win Poster may be published (095).
   The Telegram bot token lives as a Worker secret; this screen only handles
   chat ids, which are not credentials. "Find my groups" asks the bot which
   groups it can see, so nobody has to hunt a chat id through a third-party bot
   and drop the leading minus sign doing it.
--------------------------------------------------------------------------- */
function PosterChannels({ say }: { say: (m: string) => void }) {
  const [rows, setRows] = useState<{ id: string; country: string; label: string; chat_id: string; active: boolean }[]>([])
  const [found, setFound] = useState<{ chat_id: string; title: string; type: string }[] | null>(null)
  const [bot, setBot] = useState<string>('')
  const [form, setForm] = useState({ country: 'MY', label: '', chat_id: '' })
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('poster_channels')
      .select('id,country,label,chat_id,active').order('country')
    setRows((data as typeof rows) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const worker = async (path: string, body?: object) => {
    const { data: s } = await supabase!.auth.getSession()
    const res = await fetch(`https://m4u-api.iqiaggroup.workers.dev${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
      body: JSON.stringify(body ?? {}),
    })
    return { ok: res.ok, body: await res.json().catch(() => ({})) as Record<string, unknown> }
  }

  const discover = async () => {
    setBusy('find')
    const r = await worker('/poster/telegram/chats')
    setBusy('')
    if (!r.ok) { say('⚠ ' + String(r.body.error ?? 'could not reach Telegram')); return }
    setBot(String((r.body.bot as { username?: string })?.username ?? ''))
    setFound((r.body.chats as typeof found) ?? [])
    if (r.body.hint) say(String(r.body.hint))
  }

  const save = async () => {
    if (!form.label.trim() || !form.chat_id.trim()) return
    setBusy('save')
    const { error } = await supabase!.rpc('fn_admin_set_poster_channel', {
      p_country: form.country, p_label: form.label.trim(),
      p_chat_id: form.chat_id.trim(), p_active: true, p_id: null,
    })
    setBusy('')
    if (error) { say('⚠ ' + error.message); return }
    say(`Saved — ${form.country} posts to ${form.label.trim()}`)
    setForm({ country: form.country, label: '', chat_id: '' }); load()
  }

  const test = async (chat_id: string) => {
    setBusy(chat_id)
    const r = await worker('/poster/telegram/test', { chat_id })
    setBusy('')
    say(r.ok ? `✅ Test message delivered to ${String(r.body.sent_to ?? chat_id)}`
             : `⚠ ${String(r.body.error ?? 'failed')}${r.body.hint ? ` — ${String(r.body.hint)}` : ''}`)
  }

  const inp = 'h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'
  return (
    <Card className="mb-5 p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold">Poster channels</p>
        <Chip>{rows.length} configured</Chip>
        <span className="flex-1" />
        <button type="button" disabled={!!busy} onClick={discover}
          className="h-9 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          {busy === 'find' ? 'Asking Telegram…' : 'Find my groups'}
        </button>
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Where leaders may publish a Win Poster. One group per country — a leader only ever sees their own.
        The bot token is stored on the server, never here.
      </p>

      {found && (
        <div className="mb-3 rounded-xl border border-border p-3">
          <p className="mb-2 text-xs font-bold">
            {bot ? `@${bot} can see ${found.length} group(s)` : `${found.length} group(s) found`}
          </p>
          {found.length === 0 && <p className="text-[11px] text-muted">Add the bot to the group as an admin, then press “Find my groups” again.</p>}
          {found.map((c) => (
            <div key={c.chat_id} className="mb-1.5 flex flex-wrap items-center gap-2 text-xs last:mb-0">
              <span className="flex-1 truncate font-semibold">{c.title}</span>
              <code className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">{c.chat_id}</code>
              <button type="button" onClick={() => setForm((f) => ({ ...f, label: c.title, chat_id: c.chat_id }))}
                className="cursor-pointer rounded-full border border-accent/60 px-3 py-1 text-[10px] font-extrabold text-accent">use</button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
          aria-label="Country" className={`${inp} cursor-pointer`}>
          <option value="MY">🇲🇾 MY</option>
          <option value="ID">🇮🇩 ID</option>
        </select>
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Label leaders see — AG Warriors MY" className={`${inp} min-w-[180px] flex-1`} />
        <input value={form.chat_id} onChange={(e) => setForm({ ...form, chat_id: e.target.value })}
          placeholder="-1001234567890" className={`${inp} min-w-[150px]`} />
        <button type="button" disabled={busy === 'save' || !form.label.trim() || !form.chat_id.trim()} onClick={save}
          className="h-10 cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
          + Add
        </button>
      </div>

      {rows.map((r) => (
        <div key={r.id} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-xs last:mb-0">
          <span className="font-bold">{r.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.label}</span>
          <code className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">{r.chat_id}</code>
          {!r.active && <Chip tone="warning">off</Chip>}
          <span className="flex-1" />
          <button type="button" disabled={!!busy} onClick={() => test(r.chat_id)}
            className="cursor-pointer rounded-full border border-border px-3 py-1 text-[10px] font-extrabold text-muted hover:text-ink disabled:opacity-40">
            {busy === r.chat_id ? 'sending…' : 'Send test'}
          </button>
        </div>
      ))}
      {rows.length === 0 && <p className="text-[11px] text-muted">No channels yet — leaders will see “no Telegram group connected”.</p>}
    </Card>
  )
}

/* ---------------------------------------------------------------------------
   Group invite links (096) — the WhatsApp/Telegram groups new people are
   invited into from Events. Links only; membership is never automated, because
   no legitimate API can add a person to a WhatsApp or Telegram group and the
   unofficial route gets the agency number banned. Keep "approve new members"
   ON in both platforms so a leaked link still passes a human.
--------------------------------------------------------------------------- */
function InviteLinksPanel({ say }: { say: (m: string) => void }) {
  const [rows, setRows] = useState<{ id: string; country: string; kind: string; label: string; url: string; active: boolean }[]>([])
  const [form, setForm] = useState({ country: 'MY', kind: 'whatsapp', label: '', url: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    // reads go through the RPC (the table has no client policies at all)
    const my = await supabase.rpc('fn_invite_context', { p_country: 'MY', p_leads: [] })
    const id = await supabase.rpc('fn_invite_context', { p_country: 'ID', p_leads: [] })
    const links = (c: string, d: unknown) =>
      (((d as { links?: { id: string; kind: string; label: string; url: string; active: boolean }[] })?.links) ?? [])
        .map((l) => ({ ...l, country: c }))
    setRows([...links('MY', my.data), ...links('ID', id.data)])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!supabase || !form.label.trim() || !form.url.trim()) return
    setBusy(true)
    const { error } = await supabase.rpc('fn_admin_set_invite_link', {
      p_country: form.country, p_kind: form.kind, p_label: form.label.trim(),
      p_url: form.url.trim(), p_active: true, p_id: null,
    })
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say(`Saved — ${form.kind} link for ${form.country}`)
    setForm({ ...form, label: '', url: '' }); load()
  }

  const toggle = async (r: typeof rows[number]) => {
    setBusy(true)
    const { error } = await supabase!.rpc('fn_admin_set_invite_link', {
      p_country: r.country, p_kind: r.kind, p_label: r.label, p_url: r.url,
      p_active: !r.active, p_id: r.id,
    })
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say(r.active ? 'Link switched off' : 'Link live again'); load()
  }

  const inp = 'h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'
  return (
    <Card className="mb-5 p-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-sm font-bold">Group invite links</p>
        <Chip>{rows.filter((r) => r.active).length} live</Chip>
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Used by Events → “Invite to groups”: WhatsApp opens with these links in a ready message.
        Nothing is auto-joined — keep “approve new members” ON in the groups themselves.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
          aria-label="Country" className={`${inp} cursor-pointer`}>
          <option value="MY">🇲🇾 MY</option><option value="ID">🇮🇩 ID</option>
        </select>
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}
          aria-label="Platform" className={`${inp} cursor-pointer`}>
          <option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option>
        </select>
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
          placeholder="Label — AG HEROES MY" className={`${inp} min-w-[160px] flex-1`} />
        <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder={form.kind === 'whatsapp' ? 'https://chat.whatsapp.com/…' : 'https://t.me/+…'}
          className={`${inp} min-w-[200px] flex-1`} />
        <button type="button" disabled={busy || !form.label.trim() || !form.url.trim()} onClick={save}
          className="h-10 cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
          + Add
        </button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="mb-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-xs last:mb-0">
          <span className="font-bold">{r.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.kind === 'telegram' ? '✈️' : '🟢'} {r.label}</span>
          <code className="max-w-[260px] truncate rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">{r.url}</code>
          <span className="flex-1" />
          <button type="button" disabled={busy} onClick={() => toggle(r)}
            className={`cursor-pointer rounded-full border px-3 py-1 text-[10px] font-extrabold ${
              r.active ? 'border-success/60 text-success' : 'border-border text-muted'}`}>
            {r.active ? 'live' : 'off'}
          </button>
        </div>
      ))}
      {rows.length === 0 && <p className="text-[11px] text-muted">No links yet — the Invite button stays hidden in Events until one is live.</p>}
    </Card>
  )
}
