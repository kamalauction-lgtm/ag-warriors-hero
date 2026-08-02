/* Onboarding gate — production M1 reborn:
   pending-approval → Academy lessons (all must be marked understood) →
   setup checklist → graduation 🎉 unlocks the app.
   Lessons are admin-managed content in the full build (per country/language). */
import { useMemo, useState } from 'react'
import {
  PlayCircle,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  Circle,
  Smartphone,
  BellRing,
  Camera,
  MessagesSquare,
  PartyPopper,
  ShieldCheck,
  Hourglass,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { useBrand } from '../lib/brand'
import { Bar, Card, Chip, ProgressRing } from '../components/ui'

const LESSONS = [
  { id: 'l1', type: 'video', title: 'Welcome to AG Warriors', sub: 'Who we are · Become Better, Build Better, Give Better', min: 3 },
  { id: 'l2', type: 'video', title: 'The AG Way — how we sell', sub: 'Calling → Follow-Up → Appointment → Booking → Loan → Closing', min: 5 },
  { id: 'l3', type: 'text', title: 'Your tools — the app in 5 minutes', sub: 'My Day · Sales · Leads · Team · Grow', min: 4 },
  { id: 'l4', type: 'image', title: 'Commission & career', sub: 'How you earn · the ladder REN → VP', min: 3 },
  { id: 'l5', type: 'text', title: 'Rules of the house', sub: 'Ethics, WhatsApp discipline, speed-to-lead', min: 2 },
]
const CHECKLIST = [
  { id: 'c1', icon: Smartphone, title: 'Install the app', sub: 'Add to Home Screen — works like a real app' },
  { id: 'c2', icon: BellRing, title: 'Enable notifications', sub: 'Lead alerts + task reminders' },
  { id: 'c3', icon: Camera, title: 'Profile photo', sub: 'Used on posters & leaderboard' },
  { id: 'c4', icon: MessagesSquare, title: 'Join the team WhatsApp', sub: 'Your leader\'s group link' },
]

export default function Onboarding() {
  const { user, completeOnboarding, approveDemo, logout } = useApp()
  const shield = useBrand('GLOBAL', 'shield')
  const [openLesson, setOpenLesson] = useState<string | null>(null)
  const [doneLessons, setDoneLessons] = useState<Record<string, boolean>>({})
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [graduated, setGraduated] = useState(false)
  if (!user) return null

  const lessonsDone = LESSONS.filter((l) => doneLessons[l.id]).length
  const allLessons = lessonsDone === LESSONS.length
  const checksDone = CHECKLIST.filter((c) => checks[c.id]).length
  const allChecks = checksDone === CHECKLIST.length
  const pct = useMemo(
    () => Math.round(((lessonsDone + checksDone) / (LESSONS.length + CHECKLIST.length)) * 100),
    [lessonsDone, checksDone],
  )
  const phase: 'pending' | 'course' | 'checklist' | 'graduate' = user.pendingApproval
    ? 'pending'
    : !allLessons
      ? 'course'
      : !allChecks
        ? 'checklist'
        : 'graduate'

  const Icon = (t: string) => (t === 'video' ? PlayCircle : t === 'image' ? ImageIcon : FileText)

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 py-6">
      {/* header */}
      <div className="hero-user mb-5 flex items-center gap-3 p-4">
        <img src={shield ?? '/brand/ag-shield.png'} alt="" className="h-12 w-12 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c9c2a8]">Warrior Onboarding</p>
          <p className="gold-text font-display text-lg font-extrabold">Selamat datang, {user.name.split(' ')[0]}!</p>
        </div>
        <ProgressRing pct={pct} size={54} />
      </div>

      {/* ---- PENDING APPROVAL ---- */}
      {phase === 'pending' && (
        <Card className="p-6 text-center">
          <Hourglass size={36} className="mx-auto mb-3 animate-pulse text-warning" />
          <p className="font-display text-lg font-extrabold">Waiting for approval</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
            Your leader has been notified {user.country === 'MY' ? '🇲🇾' : '🇮🇩'}. While waiting,
            you can already start the Academy below — smart warriors don't wait. 🔥
          </p>
          <button type="button" onClick={approveDemo}
            className="mt-4 cursor-pointer rounded-xl bg-accent px-5 py-3 text-sm font-extrabold text-on-accent transition-opacity hover:opacity-90">
            ✅ Simulate admin approval (demo)
          </button>
          <p className="mt-3 text-[10px] text-muted">In the live build this happens in Admin → People.</p>
        </Card>
      )}

      {/* ---- ACADEMY COURSE (M1 gate) ---- */}
      {phase !== 'pending' && !graduated && (
        <>
          <p className="mb-2 flex items-center gap-2 text-sm font-extrabold">
            <ShieldCheck size={15} className="text-accent" /> Academy — {lessonsDone}/{LESSONS.length} lessons
            {allLessons && <Chip tone="success">complete ✓</Chip>}
          </p>
          <div className="mb-5 space-y-2">
            {LESSONS.map((l, i) => {
              const done = !!doneLessons[l.id]
              const locked = i > 0 && !doneLessons[LESSONS[i - 1].id]
              const open = openLesson === l.id
              const LIcon = Icon(l.type)
              return (
                <Card key={l.id} className={clsx('overflow-hidden', locked && 'opacity-50')}>
                  <button type="button" disabled={locked}
                    onClick={() => setOpenLesson(open ? null : l.id)}
                    className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left disabled:cursor-not-allowed">
                    {done ? <CheckCircle2 size={20} className="shrink-0 text-success" /> : <Circle size={20} className="shrink-0 text-muted" />}
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block text-sm font-bold', done && 'text-muted line-through')}>{l.title}</span>
                      <span className="block truncate text-[11px] text-muted">{l.sub}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-muted">
                      <LIcon size={14} /> {l.min} min{locked ? ' · 🔒' : ''}
                    </span>
                  </button>
                  {open && !locked && (
                    <div className="animate-rise border-t border-border bg-surface2/40 p-4">
                      <div className="mb-3 flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-muted">
                        <LIcon size={30} />
                        <span className="ml-2 text-xs">Lesson {l.type} — admin uploads content per country</span>
                      </div>
                      <button type="button"
                        onClick={() => { setDoneLessons((d) => ({ ...d, [l.id]: true })); setOpenLesson(null) }}
                        className="w-full cursor-pointer rounded-xl bg-accent py-3 text-sm font-extrabold text-on-accent transition-opacity hover:opacity-90">
                        ✓ Saya faham — mark complete
                      </button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>

          {/* ---- SETUP CHECKLIST ---- */}
          <p className={clsx('mb-2 flex items-center gap-2 text-sm font-extrabold', !allLessons && 'opacity-40')}>
            🎒 Setup — {checksDone}/{CHECKLIST.length}
            {allChecks && <Chip tone="success">ready ✓</Chip>}
          </p>
          <div className={clsx('mb-5 space-y-2', !allLessons && 'pointer-events-none opacity-40')}>
            {CHECKLIST.map((c) => {
              const done = !!checks[c.id]
              return (
                <Card key={c.id} onClick={() => setChecks((x) => ({ ...x, [c.id]: !x[c.id] }))}
                  className="flex cursor-pointer items-center gap-3 p-3.5">
                  <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', done ? 'bg-success/15 text-success' : 'bg-accent-soft text-accent')}>
                    <c.icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-sm font-bold', done && 'text-muted line-through')}>{c.title}</span>
                    <span className="block text-[11px] text-muted">{c.sub}</span>
                  </span>
                  {done ? <CheckCircle2 size={18} className="text-success" /> : <Circle size={18} className="text-muted" />}
                </Card>
              )
            })}
          </div>

          {/* ---- GRADUATE ---- */}
          <button type="button" disabled={phase !== 'graduate'}
            onClick={() => setGraduated(true)}
            className="mb-3 h-13 w-full cursor-pointer rounded-2xl bg-accent py-4 font-display text-base font-extrabold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
            🎓 Graduate & enter the app
          </button>
        </>
      )}

      {/* ---- GRADUATION ---- */}
      {graduated && (
        <Card className="border-accent p-8 text-center">
          <PartyPopper size={44} className="mx-auto mb-3 text-accent" />
          <p className="gold-text font-display text-2xl font-extrabold">Warrior activated!</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
            +50 bonus points 🏆 · Your leader has been notified.
            Your <b>30-Day Closing Challenge</b> starts tomorrow — Day 1: your first morning plan.
          </p>
          <button type="button" onClick={completeOnboarding}
            className="mt-5 w-full cursor-pointer rounded-2xl bg-accent py-4 font-display text-base font-extrabold text-on-accent transition-opacity hover:opacity-90">
            🦅 Enter AG Warriors
          </button>
        </Card>
      )}

      <button type="button" onClick={logout} className="mt-auto cursor-pointer py-3 text-center text-xs font-semibold text-muted">
        Sign out
      </button>
    </div>
  )
}
