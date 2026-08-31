/* GROW → Onboarding — the participant side (spec §3/§4/§14/§15).
   Content comes from onb_my_program(): published, country-scoped, quiz answer
   key stripped server-side. The rendering + engagement engine lives in
   modules/learn/LessonEngine.tsx (shared with Diag Academy); this file keeps
   the onboarding-specific shell: programme summary, sections, card logic. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, ChevronRight, Circle, Play, Lock, GraduationCap,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Bar, Card } from '../../components/ui'
import {
  LessonView, lessonDone, useTLocale, useL,
  type LessonData, type TX, type LearnApi,
} from '../learn/LessonEngine'

export type OnbLesson = LessonData
interface OnbSection { id: number; title: TX; lessons: OnbLesson[] }
export interface OnbData {
  program: { id: number; title: TX; subtitle: TX }
  completed_at: string | null
  sections: OnbSection[]
}

/* kept for Grow.tsx which imports the summary + locale helpers from here */
export const useOnbLocale = useTLocale

const ONB_API: LearnApi = { touch: 'onb_touch', ack: 'onb_ack', quiz: 'onb_quiz', bucket: 'onboarding' }

export function onbSummary(d: OnbData | null) {
  if (!d) return null
  const all = d.sections.flatMap((s) => s.lessons)
  const req = all.filter((l) => l.required)
  const done = req.filter(lessonDone).length
  const next = all.find((l) => l.required && !lessonDone(l)) ?? all.find((l) => !lessonDone(l))
  return { total: req.length, done, pct: req.length ? Math.round((done / req.length) * 100) : 0,
    next, complete: req.length > 0 && done >= req.length }
}

export default function GrowOnboarding() {
  const { user } = useApp()
  const T = useTLocale()
  const L = useL()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [data, setData] = useState<OnbData | null>(null)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!isReal || !supabase) { setLoading(false); return }
    const { data: d } = await supabase.rpc('onb_my_program')
    setData((d as OnbData) ?? null)
    setLoading(false)
  }, [isReal])
  useEffect(() => { load() }, [load])

  const sum = useMemo(() => onbSummary(data), [data])
  const allLessons = useMemo(() => data?.sections.flatMap((s) => s.lessons) ?? [], [data])
  const open = allLessons.find((l) => l.id === openId) ?? null

  const locked = (l: OnbLesson) =>
    l.prerequisite_id != null && !allLessons.find((x) => x.id === l.prerequisite_id && lessonDone(x))

  if (!user) return null

  return (
    <div className="animate-rise px-4 pt-5 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/grow" aria-label="Back"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">
            {data ? T(data.program.title) : 'Onboarding'}
          </h1>
          <p className="text-xs text-muted">
            {data ? T(data.program.subtitle) : L('Your AG journey starts here', 'Perjalanan AG anda bermula di sini', 'Perjalanan AG Anda dimulai di sini')}
          </p>
        </div>
      </header>

      {open ? (
        <LessonView api={ONB_API} lesson={open} onBack={() => { setOpenId(null); load() }} onRefresh={load} />
      ) : (
        <>
          {loading && <Card className="p-6 text-center text-xs text-muted">Loading…</Card>}
          {!loading && !data && (
            <Card className="p-8 text-center">
              <GraduationCap size={26} className="mx-auto mb-2 text-muted" />
              <p className="text-sm font-bold">{L('No programme published yet', 'Belum ada program diterbitkan', 'Belum ada program diterbitkan')}</p>
            </Card>
          )}

          {sum && (
            <>
              {sum.complete ? (
                <div className="hero-user mb-4 p-6 text-center">
                  <p className="text-3xl">🎓</p>
                  <p className="gold-text mt-1 font-display text-xl font-extrabold">
                    {L('Onboarding Complete', 'Onboarding Selesai', 'Onboarding Selesai')}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#c9c2a8]">
                    {L('You have completed your AG foundation.', 'Anda telah melengkapkan asas AG anda.', 'Anda telah menyelesaikan fondasi AG Anda.')}
                    <br />Become Better. Build Better. Give Better.
                  </p>
                </div>
              ) : (
                <Card className="mb-4 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-extrabold">
                      {sum.done} / {sum.total} {L('required lessons', 'pelajaran wajib', 'pelajaran wajib')}
                    </p>
                    <p className="font-display text-lg font-extrabold text-accent">{sum.pct}%</p>
                  </div>
                  <Bar pct={sum.pct} />
                  {sum.next && (
                    <button type="button" onClick={() => setOpenId(sum.next!.id)}
                      className="mt-3 flex w-full cursor-pointer items-center gap-2.5 rounded-xl bg-accent p-3 text-left text-on-accent">
                      <Play size={16} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[10px] font-bold uppercase tracking-wide opacity-80">
                          {L('Next', 'Seterusnya', 'Berikutnya')}
                        </span>
                        <span className="block truncate text-sm font-extrabold">{T(sum.next.title)}</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0" />
                    </button>
                  )}
                </Card>
              )}

              {data!.sections.map((s, si) => {
                const secDone = s.lessons.filter((l) => l.required).every(lessonDone) && s.lessons.length > 0
                return (
                  <div key={s.id} className="mb-4">
                    <p className="mb-1.5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                      <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                        secDone ? 'bg-success text-white' : 'bg-surface2')}>
                        {secDone ? '✓' : String(si + 1).padStart(2, '0')}
                      </span>
                      {T(s.title)}
                    </p>
                    <Card className="divide-y divide-border">
                      {s.lessons.length === 0 && (
                        <p className="p-4 text-center text-xs text-muted">{L('Coming soon', 'Akan datang', 'Segera hadir')}</p>
                      )}
                      {s.lessons.map((l) => {
                        const isDone = lessonDone(l)
                        const isLocked = locked(l)
                        const started = !!l.progress && !isDone
                        return (
                          <button key={l.id} type="button" disabled={isLocked}
                            onClick={() => setOpenId(l.id)}
                            className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left transition-colors hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-50">
                            {isDone ? <CheckCircle2 size={18} className="shrink-0 text-success" />
                              : isLocked ? <Lock size={16} className="shrink-0 text-muted" />
                              : started ? <Play size={17} className="shrink-0 text-accent" />
                              : <Circle size={17} className="shrink-0 text-border" />}
                            <span className="min-w-0 flex-1">
                              <span className={clsx('block truncate text-sm', isDone ? 'text-muted' : 'font-bold')}>
                                {T(l.title)}
                              </span>
                              <span className="block text-[10px] text-muted">
                                {[l.duration_min ? `≈${l.duration_min} min` : null,
                                  l.required ? null : L('optional', 'pilihan', 'opsional'),
                                  l.type !== 'article' ? l.type : null].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <ChevronRight size={15} className="shrink-0 text-muted" />
                          </button>
                        )
                      })}
                    </Card>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </div>
  )
}
