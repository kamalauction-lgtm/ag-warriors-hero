/* Shared learning engine — extracted from Grow Onboarding once it was proven,
   now serving BOTH Grow Onboarding (onb_* RPCs) and Diag Academy (aca_* RPCs).
   The engine is parameterised by an `api` (RPC names) and a storage bucket, so
   each programme keeps its own tables and completion semantics while the
   participant experience stays identical: content renderers, ACTIVE-time
   heartbeat (tab visible + user active, server caps every beat), versioned
   acknowledgement, and server-graded knowledge checks. */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, CheckCircle2, ChevronRight, Circle, Clock, GraduationCap,
  FileText, Download, ExternalLink, ChevronLeft,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'

/* trilingual jsonb {"en","ms","id"} → current locale */
export type TX = Record<string, string> | null | undefined

export interface LessonData {
  id: number; type: string; title: TX; subtitle: TX; body: TX
  media: { youtube?: string; url?: string
    images?: { path: string; caption?: string | Record<string, string> }[]
    files?: { path: string; name: string }[] } | null
  duration_min: number | null; required: boolean; min_seconds: number
  ack_required: boolean; content_version: number
  prerequisite_id: number | null; sort: number
  quiz: { question: TX; options: TX[]; retry?: boolean } | null
  progress: { status: string; active_seconds: number; pages_seen: string[]
    ack_at: string | null; ack_version: number | null
    quiz_passed_at: string | null; completed_at: string | null } | null
}

export interface LearnApi { touch: string; ack: string; quiz: string; bucket: string }

/* Country first, language second (locked rule 2026-08-07): resolve the
   requested language, then the COUNTRY's default language, then English.
   The jsonb lives on a country-variant row, so fallback can never cross the
   country boundary — an ID user with EN missing sees the ID text of the SAME
   Indonesian content, never Malaysian content. */
export const useTLocale = () => {
  const { locale, user } = useApp()
  const countryDefault = user?.country === 'ID' ? 'id' : 'ms'
  return useCallback((t: TX) => {
    if (!t) return ''
    const want = locale === 'bm' ? 'ms' : locale
    return t[want] || t[countryDefault] || t.en || ''
  }, [locale, countryDefault])
}

/* captions may be a plain string (legacy) or a translated object */
export const capText = (c: string | Record<string, string> | undefined, T: (t: TX) => string) =>
  typeof c === 'string' ? c : c ? T(c) : ''

export const useL = () => {
  const { locale } = useApp()
  return useCallback((en: string, ms: string, id: string) =>
    locale === 'bm' ? ms : locale === 'id' ? id : en, [locale])
}

export const lessonDone = (l: LessonData) => l.progress?.status === 'completed'

/* ---------- active-engagement heartbeat ---------- */
export function useActiveSeconds(api: LearnApi, lessonId: number | null,
  onServerUpdate: (secs: number, completed: boolean) => void) {
  const pending = useRef(0)
  const lastActivity = useRef(Date.now())
  useEffect(() => {
    if (!lessonId || !supabase) return
    const mark = () => { lastActivity.current = Date.now() }
    const evs = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const
    evs.forEach((e) => window.addEventListener(e, mark, { passive: true }))

    const tickI = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastActivity.current < 45_000) {
        pending.current += 1
      }
    }, 1000)

    const flush = async () => {
      const secs = pending.current
      if (secs <= 0 || !supabase) return
      pending.current = 0
      const { data } = await supabase.rpc(api.touch, { p_lesson: lessonId, p_seconds: secs })
      const out = data as { completed: boolean; active_seconds: number } | null
      if (out) onServerUpdate(out.active_seconds, out.completed)
    }
    const flushI = window.setInterval(flush, 20_000)
    supabase.rpc(api.touch, { p_lesson: lessonId, p_seconds: 0 }).then(() => {})

    return () => {
      evs.forEach((e) => window.removeEventListener(e, mark))
      window.clearInterval(tickI); window.clearInterval(flushI)
      flush()
    }
  }, [lessonId]) // eslint-disable-line react-hooks/exhaustive-deps
}

const ytId = (url: string) =>
  url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null

/* signed URLs only — both learning buckets are private */
export function useSignedUrl(bucket: string, path: string | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path || !supabase) return
    supabase.storage.from(bucket).createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [bucket, path])
  return url
}

export function SignedImg({ bucket, path, alt, className }: {
  bucket: string; path: string; alt: string; className?: string
}) {
  const url = useSignedUrl(bucket, path)
  return url ? <img src={url} alt={alt} loading="lazy" className={className} /> : (
    <div className={clsx('flex h-40 items-center justify-center bg-surface2 text-xs text-muted', className)}>…</div>
  )
}

function FileRow({ bucket, f }: { bucket: string; f: { path: string; name: string } }) {
  const url = useSignedUrl(bucket, f.path)
  return (
    <a href={url ?? '#'} target="_blank" rel="noreferrer"
      className={clsx('mb-2 flex items-center gap-2.5 rounded-xl border border-border p-3 text-sm font-bold no-underline transition-colors hover:border-accent/60', !url && 'pointer-events-none opacity-50')}>
      <FileText size={16} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">{f.name}</span>
      <Download size={14} className="shrink-0 text-muted" />
    </a>
  )
}

/* ---------------- the lesson screen ---------------- */
export function LessonView({ api, lesson, onBack, onRefresh }: {
  api: LearnApi; lesson: LessonData; onBack: () => void; onRefresh: () => void
}) {
  const T = useTLocale()
  const L = useL()
  const [secs, setSecs] = useState(lesson.progress?.active_seconds ?? 0)
  const [page, setPage] = useState(0)
  const [ans, setAns] = useState<number | null>(null)
  const [quizOut, setQuizOut] = useState<{ correct: boolean; explanation: TX } | null>(null)
  const [busy, setBusy] = useState(false)
  const [justDone, setJustDone] = useState(false)
  const done = lessonDone(lesson) || justDone

  useActiveSeconds(api, lesson.id, (s, completed) => {
    setSecs(s)
    if (completed && !done) { setJustDone(true); onRefresh() }
  })

  useEffect(() => {
    if (lesson.type !== 'carousel' || !supabase) return
    supabase.rpc(api.touch, { p_lesson: lesson.id, p_seconds: 0, p_page: page }).then(({ data }) => {
      const out = data as { completed: boolean } | null
      if (out?.completed && !done) { setJustDone(true); onRefresh() }
    })
  }, [page, lesson.id, lesson.type]) // eslint-disable-line react-hooks/exhaustive-deps

  const ack = async () => {
    if (!supabase) return
    setBusy(true)
    const { data } = await supabase.rpc(api.ack, { p_lesson: lesson.id })
    setBusy(false)
    if ((data as { completed: boolean } | null)?.completed) setJustDone(true)
    onRefresh()
  }

  const submitQuiz = async () => {
    if (!supabase || ans === null) return
    setBusy(true)
    const { data, error } = await supabase.rpc(api.quiz, { p_lesson: lesson.id, p_answer: ans })
    setBusy(false)
    if (error) return
    const out = data as { correct: boolean; completed: boolean; explanation: TX }
    setQuizOut({ correct: out.correct, explanation: out.explanation })
    if (out.completed) setJustDone(true)
    onRefresh()
  }

  const acked = !!lesson.progress?.ack_at && (lesson.progress?.ack_version ?? 0) >= lesson.content_version
  const quizPassed = !!lesson.progress?.quiz_passed_at || quizOut?.correct
  const needSecs = lesson.min_seconds > 0 && secs < lesson.min_seconds
  const images = lesson.media?.images ?? []
  const files = lesson.media?.files ?? []
  const yid = lesson.media?.youtube ? ytId(lesson.media.youtube) : null

  return (
    <div className="animate-rise">
      <button type="button" onClick={onBack}
        className="mb-3 flex cursor-pointer items-center gap-1.5 text-xs font-bold text-muted hover:text-ink">
        <ArrowLeft size={14} /> {L('All lessons', 'Semua pelajaran', 'Semua pelajaran')}
      </button>

      <Card className="mb-4 overflow-hidden">
        <div className="p-4">
          <div className="mb-1 flex items-start gap-2">
            <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold leading-tight">{T(lesson.title)}</h2>
            {done && <Chip tone="success">✓ {L('Done', 'Selesai', 'Selesai')}</Chip>}
          </div>
          {lesson.subtitle && <p className="mb-1 text-xs text-muted">{T(lesson.subtitle)}</p>}
          <p className="text-[10px] text-muted">
            {lesson.duration_min ? `≈ ${lesson.duration_min} min` : ''}
            {lesson.required ? ` · ${L('required', 'wajib', 'wajib')}` : ` · ${L('optional', 'pilihan', 'opsional')}`}
          </p>
        </div>

        {yid && (
          <div className="aspect-video w-full bg-black">
            <iframe title={T(lesson.title)} src={`https://www.youtube-nocookie.com/embed/${yid}?rel=0`}
              className="h-full w-full" allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen />
          </div>
        )}

        {lesson.type === 'carousel' && images.length > 0 && (
          <div>
            <SignedImg bucket={api.bucket} path={images[page]?.path}
              alt={capText(images[page]?.caption, T) || `${page + 1}`}
              className="max-h-[420px] w-full bg-black object-contain" />
            {capText(images[page]?.caption, T) && (
              <p className="px-4 pt-2 text-center text-xs text-muted">{capText(images[page]?.caption, T)}</p>
            )}
            <div className="flex items-center justify-between p-3">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border disabled:opacity-30"><ChevronLeft size={15} /></button>
              <div className="flex gap-1.5">
                {images.map((_, i) => (
                  <span key={i} className={clsx('h-1.5 w-1.5 rounded-full',
                    (lesson.progress?.pages_seen ?? []).includes(String(i)) || i === page ? 'bg-accent' : 'bg-border')} />
                ))}
              </div>
              <button type="button" disabled={page >= images.length - 1} onClick={() => setPage((p) => p + 1)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-30"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}

        {lesson.type !== 'carousel' && images.map((im, i) => (
          <div key={i}>
            <SignedImg bucket={api.bucket} path={im.path}
              alt={capText(im.caption, T) || T(lesson.title)} className="w-full" />
            {capText(im.caption, T) && (
              <p className="px-4 py-1.5 text-center text-xs text-muted">{capText(im.caption, T)}</p>
            )}
          </div>
        ))}

        <div className="p-4 pt-3">
          {lesson.body && T(lesson.body) && (
            <div className="mb-3 space-y-2.5 text-[13.5px] leading-relaxed">
              {T(lesson.body).split(/\n\n+/).map((para, i) => <p key={i}>{para}</p>)}
            </div>
          )}

          {files.map((f, i) => <FileRow key={i} bucket={api.bucket} f={f} />)}

          {lesson.media?.url && (
            <a href={lesson.media.url} target="_blank" rel="noreferrer"
              className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-accent/50 p-3 text-sm font-bold text-accent no-underline">
              <ExternalLink size={15} /> {L('Open resource', 'Buka sumber', 'Buka sumber')}
            </a>
          )}

          {!done && (
            <div className="mb-3 space-y-1.5 rounded-xl bg-surface2 p-3 text-[11px]">
              {lesson.min_seconds > 0 && (
                <p className={clsx('flex items-center gap-1.5', !needSecs ? 'text-success' : 'text-muted')}>
                  <Clock size={12} /> {L('Time with this lesson', 'Masa bersama pelajaran ini', 'Waktu dengan pelajaran ini')}:
                  {' '}{Math.min(secs, lesson.min_seconds)}/{lesson.min_seconds}s {!needSecs && '✓'}
                </p>
              )}
              {lesson.type === 'carousel' && images.length > 0 && (
                <p className="flex items-center gap-1.5 text-muted">
                  <Circle size={12} /> {L('View all pages', 'Lihat semua halaman', 'Lihat semua halaman')}
                </p>
              )}
              {lesson.ack_required && (
                <p className={clsx('flex items-center gap-1.5', acked ? 'text-success' : 'text-muted')}>
                  <CheckCircle2 size={12} /> {L('Acknowledgement below', 'Pengakuan di bawah', 'Pengakuan di bawah')} {acked && '✓'}
                </p>
              )}
              {lesson.quiz && (
                <p className={clsx('flex items-center gap-1.5', quizPassed ? 'text-success' : 'text-muted')}>
                  <GraduationCap size={12} /> {L('Knowledge check below', 'Semakan pengetahuan di bawah', 'Cek pengetahuan di bawah')} {quizPassed && '✓'}
                </p>
              )}
            </div>
          )}

          {lesson.quiz && !quizPassed && (
            <div className="mb-3 rounded-xl border border-accent/40 p-3.5">
              <p className="mb-2 text-[13px] font-bold">{T(lesson.quiz.question)}</p>
              {lesson.quiz.options.map((o, i) => (
                <button key={i} type="button" onClick={() => { setAns(i); setQuizOut(null) }}
                  className={clsx('mb-1.5 block w-full cursor-pointer rounded-lg border p-2.5 text-left text-xs',
                    ans === i ? 'border-accent bg-accent-soft font-bold' : 'border-border hover:border-accent/50')}>
                  {String.fromCharCode(65 + i)}. {T(o)}
                </button>
              ))}
              {quizOut && !quizOut.correct && (
                <p className="mb-1.5 rounded-lg bg-danger/10 p-2 text-xs text-danger">
                  {L('Not quite — review the lesson and try again.',
                     'Belum tepat — semak semula pelajaran dan cuba lagi.',
                     'Belum tepat — tinjau kembali pelajaran lalu coba lagi.')}
                </p>
              )}
              <button type="button" disabled={busy || ans === null} onClick={submitQuiz}
                className="h-10 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent disabled:opacity-40">
                {L('Check answer', 'Semak jawapan', 'Periksa jawaban')}
              </button>
            </div>
          )}
          {lesson.quiz && quizPassed && quizOut?.explanation && (
            <p className="mb-3 rounded-xl bg-success/10 p-3 text-xs leading-relaxed text-success">
              ✓ {T(quizOut.explanation)}
            </p>
          )}

          {lesson.ack_required && !acked && (
            <button type="button" disabled={busy} onClick={ack}
              className="mb-1 h-12 w-full cursor-pointer rounded-xl border-2 border-accent bg-accent-soft text-sm font-extrabold text-accent disabled:opacity-40">
              ✍ {L('I have read and understood this', 'Saya telah membaca dan memahami ini', 'Saya telah membaca dan memahami ini')}
            </button>
          )}

          {done && (
            <p className="rounded-xl bg-success/10 p-3 text-center text-sm font-bold text-success">
              ✓ {L('Lesson complete', 'Pelajaran selesai', 'Pelajaran selesai')}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
