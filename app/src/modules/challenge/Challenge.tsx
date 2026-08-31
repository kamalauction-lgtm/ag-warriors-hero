/* 30 Days Closing Challenge — participant journey (real Supabase, human-gated RPCs).
   Layers per spec §40a: global app gate (existing) → THIS challenge layer.
   enrol → readiness → cohort-clock roadmap → daily task + evidence → verified XP. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Lock, CheckCircle2, Hourglass, Upload, Trophy, Flame } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Bar, Card, Chip, SectionTitle } from '../../components/ui'
import Today from './Today'
import QuickLog from './QuickLog'
import Progress from './Progress'

const LKEY: Record<string, string> = { en: 'en', bm: 'ms-MY', id: 'id-ID' }
const jt = (j: Record<string, string> | null | undefined, loc: string) =>
  j?.[LKEY[loc] ?? 'en'] ?? j?.en ?? ''

interface Cohort { id: string; name: string; country: string | null; official_start_date: string; official_timezone: string; curriculum_version_id: string }
interface Enrolment { id: string; cohort_id: string; status: string; catch_up: boolean }
/* P0.2 — the three day concepts are resolved SERVER-SIDE by my_challenge_clock().
   cohort_day  = where the shared cohort is on the calendar
   stage       = where this warrior is in the lifecycle
   accessible  = the latest day THIS warrior may open (0 unless ACTIVE)
   The client never computes day access. */
interface Clock { enrolment_id: string | null; cohort_day: number; accessible_day: number; participant_stage: string; cohort_name?: string; timezone?: string }
interface DayRow { id: string; day_no: number; title: Record<string, string>; objective: Record<string, string>; content: Record<string, string>; required_action: Record<string, string>; evidence_requirement: Record<string, string>; reflection_question: Record<string, string>; xp_amount: number }

export default function Challenge() {
  const { user, locale, t } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [enrol, setEnrol] = useState<Enrolment | null>(null)
  const [readiness, setReadiness] = useState<string>('not_started')
  const [clock, setClock] = useState<Clock>({ enrolment_id: null, cohort_day: 0, accessible_day: 0, participant_stage: 'none' })
  const [days, setDays] = useState<DayRow[]>([])
  const [openDay, setOpenDay] = useState<DayRow | null>(null)
  const [subs, setSubs] = useState<Record<number, string>>({})
  const [xp, setXp] = useState(0)
  const [board, setBoard] = useState<{ name: string; pts: number }[]>([])
  const [reports, setReports] = useState<{ id: string; period: string; strengths: string; progress: string; barriers: string; agreed_actions: string; next_review: string | null; status: string }[]>([])
  const [badges, setBadges] = useState<{ code: string; icon: string | null; name: Record<string, string> }[]>([])
  const [streak, setStreak] = useState(0)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  // forms
  const [form, setForm] = useState({ experience: 'Beginner', baseline: 0, goal: '', motivation: '', commitment: '2 hours/day', acks: false })
  const [resp, setResp] = useState('')
  const [refl, setRefl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [tab, setTab] = useState<'today' | 'progress' | 'roadmap'>('today')
  const [quickLog, setQuickLog] = useState(false)

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data: cs } = await supabase.from('cohorts').select('*').in('status', ['open', 'active'])
    setCohorts((cs as Cohort[]) ?? [])
    const { data: es } = await supabase.from('enrolments')
      .select('*').eq('participant_id', user!.id)
      .order('created_at', { ascending: false }).limit(1)
    const e = (es?.[0] as Enrolment) ?? null
    setEnrol(e)
    if (e) {
      const { data: rs } = await supabase.from('readiness_submissions').select('status').eq('enrolment_id', e.id).order('created_at', { ascending: false }).limit(1)
      setReadiness(rs?.[0]?.status ?? 'not_started')
      const { data: ck } = await supabase.rpc('my_challenge_clock')
      setClock((ck as Clock) ?? { enrolment_id: e.id, cohort_day: 0, accessible_day: 0, participant_stage: e.status })
      let cid = (cs as Cohort[])?.find((c) => c.id === e.cohort_id)?.curriculum_version_id
      if (!cid) {
        // enrolled into a cohort that is not in the open/active list (draft, or admin-placed)
        const { data: own } = await supabase.from('cohorts').select('*').eq('id', e.cohort_id).limit(1)
        if (own?.[0]) { setCohorts((prev) => [...prev, own[0] as Cohort]); cid = (own[0] as Cohort).curriculum_version_id }
      }
      if (cid) {
        const { data: ds } = await supabase.from('curriculum_days').select('*').eq('version_id', cid).order('day_no')
        setDays((ds as DayRow[]) ?? [])
      }
      const { data: ss } = await supabase.from('task_submissions').select('day_no,status,version').eq('enrolment_id', e.id).order('version')
      const m: Record<number, string> = {}
      ;(ss ?? []).forEach((s: { day_no: number; status: string }) => { m[s.day_no] = s.status })
      setSubs(m)
      const { data: pl } = await supabase.from('points_ledger').select('amount').eq('user_id', user!.id).eq('status', 'verified')
      setXp((pl ?? []).reduce((t: number, r: { amount: number }) => t + r.amount, 0))
      const { data: lb } = await supabase.from('points_ledger').select('user_id, amount, profiles!points_ledger_user_id_fkey(name)').eq('cohort_id', e.cohort_id).eq('status', 'verified')
      const agg: Record<string, { name: string; pts: number }> = {}
      ;((lb ?? []) as unknown as { user_id: string; amount: number; profiles: { name: string } | null }[]).forEach((r) => {
        agg[r.user_id] = { name: r.profiles?.name ?? 'Warrior', pts: (agg[r.user_id]?.pts ?? 0) + r.amount }
      })
      setBoard(Object.values(agg).sort((a, b) => b.pts - a.pts).slice(0, 10))
      const { data: ub } = await supabase.from('user_badges')
        .select('badge_code, ch_badges(code,icon,name)').eq('user_id', user!.id)
      setBadges(((ub ?? []) as unknown as { ch_badges: { code: string; icon: string | null; name: Record<string, string> } | null }[])
        .map((r) => r.ch_badges).filter((b): b is { code: string; icon: string | null; name: Record<string, string> } => !!b))
      const { data: st } = await supabase.rpc('challenge_streak', { p_enrolment: e.id })
      setStreak((st as number) ?? 0)
      const { data: cr } = await supabase.from('coaching_reports')
        .select('id,period,strengths,progress,barriers,agreed_actions,next_review,status')
        .eq('participant_id', user!.id).order('created_at', { ascending: false })
      setReports((cr as typeof reports) ?? [])
    }
  }, [isReal, user])

  useEffect(() => { load() }, [load])

  const rpc = async (fn: string, args: object, ok: string) => {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) say('⚠ ' + error.message)
    else { say(ok); load() }
  }

  const submitTask = async () => {
    if (!supabase || !enrol || !openDay) return
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_submit_task', {
      p_enrolment: enrol.id, p_day: openDay.day_no, p_response: resp, p_reflection: refl,
    })
    if (!error && file && data) {
      const path = `${user!.id}/${data}/${file.name}`
      const up = await supabase.storage.from('evidence').upload(path, file)
      if (!up.error) await supabase.from('evidence_assets').insert({ submission_id: data, kind: file.type.startsWith('image') ? 'image' : 'document', storage_path: path, uploaded_by: user!.id })
    }
    setBusy(false)
    if (error) say('⚠ ' + error.message)
    else { say('✅ Submitted — waiting for Coach review'); setOpenDay(null); setResp(''); setRefl(''); setFile(null); load() }
  }

  if (!user) return null
  const approvedCount = Object.values(subs).filter((s) => s === 'approved').length
  const header = (
    <header className="mb-4 flex items-center gap-3">
      <Link to="/grow" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl font-extrabold tracking-tight">{t('ch.title')}</h1>
        <p className="text-xs text-muted">{t('ch.tagline')}</p>
      </div>
      {enrol?.catch_up && <Chip tone="warning">{t('ch.catchUp')}</Chip>}
      <Chip tone="accent"><Trophy size={11} /> {xp} XP</Chip>
    </header>
  )

  if (!isReal)
    return (
      <div className="animate-rise px-4 pt-5">{header}
        <Card className="p-6 text-center">
          <Lock size={30} className="mx-auto mb-3 text-muted" />
          <p className="font-display text-base font-extrabold">{t('ch.liveTitle')}</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{t('ch.liveBody')}</p>
        </Card>
      </div>
    )

  return (
    <div className="animate-rise px-4 pt-5">{header}

      {/* ---- ENROL ---- */}
      {!enrol && (
        <Card className="p-4">
          <SectionTitle>{t('ch.chooseCohort')}</SectionTitle>
          {cohorts.map((c) => (
            <p key={c.id} className="mb-1 text-sm"><b>{c.name}</b> <span className="text-xs text-muted">{t('ch.starts')} {c.official_start_date} · {c.official_timezone}</span></p>
          ))}
          <div className="mt-3 space-y-2.5">
            <input placeholder={t('ch.goalPh')} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <input placeholder={t('ch.motivationPh')} value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} className="h-11 rounded-xl border border-border bg-surface px-2 text-sm outline-none">
                {['Beginner', '1-2 years', '3+ years'].map((x) => <option key={x}>{x}</option>)}
              </select>
              <input type="number" placeholder={t('ch.baselinePh')} value={form.baseline || ''} onChange={(e) => setForm({ ...form, baseline: Number(e.target.value) || 0 })} className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input type="checkbox" checked={form.acks} onChange={(e) => setForm({ ...form, acks: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
              {t('ch.ack')}
            </label>
            <button type="button" disabled={busy || !form.acks || !form.goal}
              onClick={() => {
                const c = cohorts.find((x) => x.country === user.country) ?? cohorts[0]
                if (!c) return say(t('ch.noCohort'))
                rpc('fn_enrol_self', { p_cohort: c.id, p_experience: form.experience, p_baseline: form.baseline, p_goal: form.goal, p_motivation: form.motivation, p_commitment: form.commitment, p_acks: { rules: true, evidence: true, conduct: true, privacy: true } }, '✅ Enrolled — now submit readiness')
              }}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {t('ch.enrol')} {user.country === 'MY' ? 'MY' : 'ID'} Cohort 1
            </button>
          </div>
        </Card>
      )}

      {/* ---- READINESS (invited by an admin, or self-enrolled) ---- */}
      {enrol && ['invited', 'onboarding', 'ready'].includes(enrol.status) && (
        <Card className="p-4">
          <SectionTitle>{t('ch.readinessGate')}</SectionTitle>
          {/* the three concepts, never conflated: the cohort is on day N, you are not on day N */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Chip>{t('ch.cohortDay')} {clock.cohort_day}/30</Chip>
            <Chip tone="warning">{enrol.status.toUpperCase()}</Chip>
            <Chip>{t('ch.yourDay')} —</Chip>
          </div>
          {readiness === 'submitted' || readiness === 'under_review' ? (
            <div className="py-4 text-center">
              <Hourglass size={28} className="mx-auto mb-2 animate-pulse text-warning" />
              <p className="text-sm font-bold">{t('ch.readySubmitted')}</p>
              <p className="mt-1 text-xs text-muted">{t('ch.readyHuman')}</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">{readiness === 'revision_required' ? t('ch.readyRevision') : t('ch.readyConfirm')}</p>
              <button type="button" disabled={busy}
                onClick={() => rpc('fn_submit_readiness', { p_enrolment: enrol.id, p_checklist: { profile: true, tools: true, goal: true, baseline: true } }, '📨 Readiness submitted for review')}
                className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                {t('ch.submitReadiness')}
              </button>
            </>
          )}
        </Card>
      )}

      {/* ---- ACTIVE ---- */}
      {enrol && enrol.status === 'active' && !openDay && (
        <>
          {/* TODAY is the main experience; the 30-day grid is the second view */}
          <div className="mb-4 flex gap-1.5">
            {([['today', t('ch.tabToday')], ['progress', t('ch.tabProgress')], ['roadmap', t('ch.roadmap')]] as const).map(([k, lbl]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={clsx('h-10 flex-1 cursor-pointer rounded-xl border text-xs font-extrabold',
                  tab === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}>
                {lbl}
              </button>
            ))}
          </div>
          {tab === 'today' && (
            <Today enrolmentId={enrol.id}
              onOpenDay={(d) => { const row = days.find((x) => x.day_no === d); if (row) setOpenDay(row) }}
              onQuickLog={() => setQuickLog(true)} />
          )}
          {tab === 'progress' && <Progress enrolmentId={enrol.id} />}
          {tab === 'roadmap' && (
          <>
          <Card className="mb-4 p-4">
            <div className="mb-1 flex justify-between text-xs font-bold">
              <span>{t('ch.yourDay')} {clock.accessible_day || t('ch.startsSoon')}<span className="text-muted"> / 30</span></span>
              <span className="text-muted">{approvedCount} {t('ch.approvedCount')}</span>
            </div>
            {/* progress = what you have VERIFIED, not what the calendar says */}
            <Bar pct={(approvedCount / 30) * 100} />
            <p className="mt-2 text-[11px] text-muted">
              {t('ch.cohortDay')} {clock.cohort_day}/30
              {clock.accessible_day < clock.cohort_day && ` · ${t('ch.ownPace')}`}
            </p>
          </Card>
          <SectionTitle>{t('ch.roadmap')}</SectionTitle>
          <div className="mb-4 grid grid-cols-5 gap-2">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => {
              const row = days.find((x) => x.day_no === d)
              const locked = d > clock.accessible_day
              const st = subs[d]
              return (
                <button key={d} type="button" disabled={locked || !row}
                  onClick={() => row && setOpenDay(row)}
                  className={clsx('flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border text-sm font-extrabold transition-colors',
                    st === 'approved' ? 'border-success bg-success/15 text-success'
                    : st ? 'border-warning bg-warning/10 text-warning'
                    : locked ? 'border-border text-muted opacity-40'
                    : row ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted opacity-40')}>
                  {locked ? <Lock size={12} /> : st === 'approved' ? <CheckCircle2 size={14} /> : d}
                  <span className="text-[8px] font-semibold">{locked ? d : ''}</span>
                </button>
              )
            })}
          </div>
          </>
          )}
          <Link to="/journey" className="mb-2.5 block">
            <Card className="flex items-center gap-3 p-3.5">
              <span className="text-xl">🎓</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t('ch.journeyTitle')}</p>
                <p className="text-[11px] text-muted">{t('ch.journeySub')}</p>
              </div>
              <Chip tone="accent">{t('ch.open')}</Chip>
            </Card>
          </Link>
          <Link to="/pipeline" className="mb-4 block">
            <Card className="flex items-center gap-3 p-3.5">
              <span className="text-xl">📇</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{t('ch.pipelineTitle')}</p>
                <p className="text-[11px] text-muted">{t('ch.pipelineSub')}</p>
              </div>
              <Chip tone="accent">{t('ch.open')}</Chip>
            </Card>
          </Link>
          {reports.length > 0 && (
            <>
              <SectionTitle>{t('ch.reportsTitle')}</SectionTitle>
              <div className="mb-4 space-y-2.5">
                {reports.map((cr) => (
                  <Card key={cr.id} className="p-3.5">
                    <div className="mb-1 flex items-center gap-2">
                      <p className="flex-1 text-sm font-bold">{cr.period ?? t('ch.report')}</p>
                      <Chip tone={cr.status === 'shared' ? 'warning' : 'success'}>{cr.status}</Chip>
                    </div>
                    {cr.strengths && <p className="text-xs"><b>{t('ch.strengths')}</b> {cr.strengths}</p>}
                    {cr.progress && <p className="text-xs"><b>{t('ch.progress')}</b> {cr.progress}</p>}
                    {cr.barriers && <p className="text-xs"><b>{t('ch.barriers')}</b> {cr.barriers}</p>}
                    {cr.agreed_actions && <p className="text-xs"><b>{t('ch.actions')}</b> {cr.agreed_actions}</p>}
                    {cr.next_review && <p className="mt-1 text-[11px] text-muted">{t('ch.nextReview')} {cr.next_review}</p>}
                    {cr.status === 'shared' && (
                      <button type="button" disabled={busy}
                        onClick={() => rpc('fn_ack_report', { p_report: cr.id }, '✅ Acknowledged — Coach notified')}
                        className="mt-2 h-10 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent disabled:opacity-40">
                        {t('ch.acknowledge')}
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
          {badges.length > 0 && (
            <>
              <SectionTitle>{t('ch.badges')} ({badges.length})</SectionTitle>
              <Card className="mb-4 flex flex-wrap gap-2 p-3.5">
                {badges.map((b) => (
                  <span key={b.code} className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-bold">
                    <span className="text-base">{b.icon ?? '🏅'}</span> {jt(b.name, locale)}
                  </span>
                ))}
              </Card>
            </>
          )}
          {streak > 1 && (
            <Card className="mb-4 flex items-center gap-3 p-3.5">
              <Flame size={20} className="text-accent" />
              <p className="flex-1 text-sm font-bold">{streak}{t('ch.streakSuffix')}</p>
              {streak >= 7 && <Chip tone="success">{t('ch.onFire')}</Chip>}
            </Card>
          )}
          <SectionTitle>{t('ch.leaderboard')}</SectionTitle>
          <Card className="divide-y divide-border">
            {board.length === 0 && <p className="p-4 text-center text-xs text-muted">{t('ch.noXp')}</p>}
            {board.map((b, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <span className="w-6 text-center">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                <span className="flex-1 text-sm font-semibold">{b.name}</span>
                <span className="font-display text-sm font-extrabold text-accent">{b.pts} XP</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* ---- DAY TASK ---- */}
      {enrol && openDay && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-base font-extrabold">{t('ch.day')} {openDay.day_no} — {jt(openDay.title, locale)}</p>
            <Chip tone="accent">+{openDay.xp_amount} XP</Chip>
          </div>
          <p className="mb-2 text-xs font-semibold text-accent">{jt(openDay.objective, locale)}</p>
          <p className="mb-3 rounded-xl bg-surface2 p-3 text-sm leading-relaxed">{jt(openDay.content, locale)}</p>
          <p className="mb-1 text-xs font-bold uppercase text-muted">{t('ch.requiredAction')}</p>
          <p className="mb-3 text-sm">{jt(openDay.required_action, locale)}</p>
          <p className="mb-1 text-xs font-bold uppercase text-muted">{t('ch.evidence')} {jt(openDay.evidence_requirement, locale)}</p>
          <textarea value={resp} onChange={(e) => setResp(e.target.value)} rows={3} placeholder={t('ch.responsePh')} className="mb-2 w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent" />
          <p className="mb-1 text-xs font-bold uppercase text-muted">{t('ch.reflection')} {jt(openDay.reflection_question, locale)}</p>
          <textarea value={refl} onChange={(e) => setRefl(e.target.value)} rows={2} placeholder={t('ch.reflectionPh')} className="mb-2 w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent" />
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs font-bold text-accent">
            <Upload size={14} /> {file ? file.name : t('ch.attach')}
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {subs[openDay.day_no] === 'revision_required' && <p className="mb-2 rounded-lg bg-warning/10 p-2 text-xs font-bold text-warning">⚠ Coach requested revision — your previous submission is preserved; this creates version {`v+1`}.</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !resp} onClick={submitTask}
              className="h-12 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {busy ? t('ch.submitting') : t('ch.submitReview')}
            </button>
            <button type="button" onClick={() => setOpenDay(null)} className="h-12 cursor-pointer rounded-xl border border-border px-4 text-xs font-bold text-muted">{t('ch.back')}</button>
          </div>
        </Card>
      )}

      {/* other statuses */}
      {enrol && !['invited', 'onboarding', 'ready', 'active'].includes(enrol.status) && !openDay && (
        <Card className="p-6 text-center">
          <Flame size={26} className="mx-auto mb-2 text-accent" />
          <p className="text-sm font-bold">{t('ch.status')} {enrol.status}</p>
        </Card>
      )}

      {quickLog && enrol && (
        <QuickLog enrolmentId={enrol.id} onClose={() => setQuickLog(false)}
          onDone={(m) => { setQuickLog(false); say(m); load() }} />
      )}

      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
