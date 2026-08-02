/* TimeBox — full M5 Time-Boxing from production:
   tasks w/ time slots · status done / not-done+reason / postponed→carry-forward ·
   Day / Week / Month calendar · team events · reminders + browser push. */
import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  BellRing,
  CalendarDays,
  X,
  AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { Card, Chip, SectionTitle } from './ui'

interface TBTask {
  id: string
  label: string
  slot: string
  status: 'pending' | 'done' | 'notdone' | 'postponed'
  reason?: string
  postponedTo?: string
  carried?: boolean
}
const SEED: TBTask[] = [
  { id: 't1', label: 'Call 10 warm leads from EXSIM', slot: '09:00', status: 'done' },
  { id: 't2', label: 'Follow up Encik Lim (booking)', slot: '10:30', status: 'done' },
  { id: 't3', label: 'Site visit — Residensi appointment', slot: '14:00', status: 'pending' },
  { id: 't4', label: 'Post daily activity on IG', slot: '17:00', status: 'pending' },
  { id: 't5', label: 'Submit loan docs for Sarah', slot: '18:30', status: 'postponed', postponedTo: 'tomorrow', carried: true },
]
const WEEK = [
  { d: 'M', done: 6, planned: 8 },
  { d: 'T', done: 7, planned: 7 },
  { d: 'W', done: 4, planned: 8 },
  { d: 'T', done: 8, planned: 8 },
  { d: 'F', done: 5, planned: 9 },
  { d: 'S', done: 2, planned: 4 },
  { d: 'S', done: 0, planned: 0 },
]
/* team events — booths & BOP sessions land on everyone's calendar */
const EVENTS: Record<number, { icon: string; label: string }[]> = {
  6: [{ icon: '🎥', label: 'BOP Online 8:30 PM' }],
  9: [{ icon: '⛺', label: 'Booth MidValley' }, { icon: '🏢', label: 'BOP HQ KL 10 AM' }],
  10: [{ icon: '⛺', label: 'Booth MidValley' }],
  16: [{ icon: '⛺', label: 'Booth Pavilion BJ' }],
}
/* month completion heat (day → 0..1), mock */
const HEAT: Record<number, number> = { 1: 1, 2: 0.6, 3: 0.9, 4: 0.4, 5: 1, 7: 0.8 }

export default function TimeBox({ onToast }: { onToast: (m: string) => void }) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [tasks, setTasks] = useState<TBTask[]>(SEED)
  const [sheet, setSheet] = useState<TBTask | null>(null)
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newSlot, setNewSlot] = useState('12:00')
  const [notif, setNotif] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  )
  const [pickedDay, setPickedDay] = useState(1)

  const done = tasks.filter((x) => x.status === 'done').length
  const points = 20 + done * 10 // production: +20 morning plan, +10 per on-time task

  const setStatus = (id: string, patch: Partial<TBTask>, msg: string) => {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    setSheet(null)
    setReason('')
    onToast(msg)
  }

  const enableReminders = async () => {
    if (typeof Notification === 'undefined') return onToast('Notifications not supported here')
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setNotif(true)
      onToast('🔔 Reminders ON — you will be pinged before each slot')
      const next = tasks.find((x) => x.status === 'pending')
      if (next) {
        setTimeout(() => {
          try {
            new Notification('⏰ AG Warriors reminder', {
              body: `${next.label} — at ${next.slot}`,
              icon: '/brand/ag-shield.png',
            })
          } catch { /* mobile requires SW push — full build */ }
        }, 6000)
      }
    } else {
      setNotif(false)
      onToast('Browser blocked notifications — in-app reminders stay active')
    }
  }

  /* auto in-app reminder for overdue pending task (production: 5-min rule style) */
  useEffect(() => {
    const t = setTimeout(() => {
      const p = tasks.find((x) => x.status === 'pending')
      if (p) onToast(`⏰ Reminder: "${p.label}" at ${p.slot}`)
    }, 25000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const monthCells = useMemo(() => {
    const cells: { day: number | null }[] = []
    for (let i = 0; i < 5; i++) cells.push({ day: null }) // Aug 2026 starts Sat
    for (let d = 1; d <= 31; d++) cells.push({ day: d })
    return cells
  }, [])

  return (
    <>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={enableReminders}
            className={clsx(
              'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors duration-200',
              notif ? 'border-success/50 bg-success/10 text-success' : 'border-border text-muted hover:text-ink',
            )}
          >
            <BellRing size={12} /> {notif ? 'Reminders ON' : 'Enable reminders'}
          </button>
        }
      >
        ⏱ Time-Boxing
      </SectionTitle>

      {/* view tabs + points */}
      <div className="mb-3 flex items-center gap-2">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={clsx(
              'cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold capitalize transition-colors duration-200',
              view === v ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:text-ink',
            )}
          >
            {v}
          </button>
        ))}
        <Chip tone="accent" className="ml-auto">⭐ +{points} pts today</Chip>
      </div>

      {/* ---------- DAY ---------- */}
      {view === 'day' && (
        <Card className="mb-4 divide-y divide-border">
          {[...tasks].sort((a, b) => a.slot.localeCompare(b.slot)).map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSheet(task)}
              className="flex w-full cursor-pointer items-center gap-3 p-3.5 text-left transition-colors duration-200 hover:bg-surface2/60"
            >
              {task.status === 'done' ? (
                <CheckCircle2 size={20} className="shrink-0 text-success" />
              ) : task.status === 'postponed' ? (
                <Clock size={20} className="shrink-0 text-warning" />
              ) : task.status === 'notdone' ? (
                <AlertCircle size={20} className="shrink-0 text-danger" />
              ) : (
                <Circle size={20} className="shrink-0 text-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className={clsx('block truncate text-sm', task.status === 'done' && 'text-muted line-through')}>
                  {task.carried && <span className="mr-1 text-warning" title="Carried forward">↻</span>}
                  {task.label}
                </span>
                {task.status === 'notdone' && task.reason && (
                  <span className="block text-[11px] text-danger">Reason: {task.reason}</span>
                )}
                {task.status === 'postponed' && (
                  <span className="block text-[11px] text-warning">→ postponed to {task.postponedTo}</span>
                )}
              </span>
              <span className="shrink-0 text-xs font-semibold text-muted">{task.slot}</span>
            </button>
          ))}
          {adding ? (
            <div className="flex items-center gap-2 p-3">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Task…"
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
              />
              <input
                type="time"
                value={newSlot}
                onChange={(e) => setNewSlot(e.target.value)}
                className="h-10 rounded-xl border border-border bg-surface px-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newLabel.trim()) return
                  setTasks((ts) => [...ts, { id: `t${Date.now()}`, label: newLabel.trim(), slot: newSlot, status: 'pending' }])
                  setNewLabel('')
                  setAdding(false)
                  onToast('Task planned · +20 pts for morning planning')
                }}
                className="h-10 cursor-pointer rounded-xl bg-accent px-3.5 text-xs font-bold text-on-accent"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 p-3 text-xs font-bold text-accent transition-colors hover:bg-surface2/60"
            >
              <Plus size={14} /> Plan a task
            </button>
          )}
        </Card>
      )}

      {/* ---------- WEEK ---------- */}
      {view === 'week' && (
        <Card className="mb-4 p-4">
          <div className="flex h-32 items-end justify-between gap-2">
            {WEEK.map((w, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div className="relative flex w-full flex-1 items-end justify-center">
                  <div className="w-full max-w-8 rounded-md bg-surface2" style={{ height: `${Math.max((w.planned / 9) * 100, 4)}%` }} />
                  <div className="absolute bottom-0 w-full max-w-8 rounded-md" style={{ height: `${Math.max((w.done / 9) * 100, w.done ? 6 : 0)}%`, background: 'linear-gradient(180deg,#f0d488,#b08a3a)' }} />
                </div>
                <span className="text-[10px] font-bold text-muted">{w.d}</span>
                <span className="text-[9px] text-muted">{w.done}/{w.planned}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> Done</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-surface2" /> Planned</span>
            <span className="ml-auto font-semibold">32/44 this week · 73%</span>
          </div>
        </Card>
      )}

      {/* ---------- MONTH ---------- */}
      {view === 'month' && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-sm font-extrabold">August 2026</p>
            <Chip><CalendarDays size={11} /> team events included</Chip>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-muted">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={!c.day}
                onClick={() => c.day && setPickedDay(c.day)}
                className={clsx(
                  'relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors duration-150',
                  !c.day && 'invisible',
                  c.day === pickedDay ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:border-accent/40',
                  c.day === 1 && 'ring-1 ring-accent', // today
                )}
              >
                {c.day}
                <span className="mt-0.5 flex gap-0.5">
                  {c.day && HEAT[c.day] != null && (
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEAT[c.day]! >= 0.8 ? '#d4ac4a' : '#6b7488' }} />
                  )}
                  {c.day && EVENTS[c.day] && <span className="text-[8px] leading-none">{EVENTS[c.day][0].icon}</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1 text-xs font-bold">Aug {pickedDay}</p>
            {(EVENTS[pickedDay] ?? []).map((e) => (
              <p key={e.label} className="text-xs text-muted">{e.icon} {e.label} <Chip tone="accent" className="ml-1">team</Chip></p>
            ))}
            {HEAT[pickedDay] != null && (
              <p className="text-xs text-muted">✅ {Math.round(HEAT[pickedDay]! * 100)}% tasks completed</p>
            )}
            {!EVENTS[pickedDay] && HEAT[pickedDay] == null && <p className="text-xs text-muted">Nothing planned.</p>}
          </div>
        </Card>
      )}

      {/* ---------- status action sheet ---------- */}
      {sheet && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-4 pb-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="min-w-0 truncate text-sm font-bold">{sheet.label} · {sheet.slot}</p>
              <button type="button" onClick={() => setSheet(null)} aria-label="Close" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={14} /></button>
            </div>
            <button
              type="button"
              onClick={() => setStatus(sheet.id, { status: 'done', reason: undefined }, '✅ Done · +10 pts')}
              className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded-xl bg-success/12 p-3.5 text-sm font-bold text-success"
            >
              <CheckCircle2 size={17} /> Selesai — done
            </button>
            <div className="mb-2 rounded-xl border border-border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-danger"><AlertCircle size={15} /> Belum — not done (reason required)</p>
              <div className="flex gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why not done?"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => reason.trim() && setStatus(sheet.id, { status: 'notdone', reason: reason.trim() }, 'Marked not done — leader can see the reason')}
                  className="h-10 cursor-pointer rounded-xl border border-danger/50 px-3.5 text-xs font-bold text-danger disabled:opacity-40"
                  disabled={!reason.trim()}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {(['tomorrow', 'Mon', 'custom'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setStatus(sheet.id, { status: 'postponed', postponedTo: w, carried: true }, `⏭ Postponed to ${w} — will carry forward`)}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/50 py-3 text-xs font-bold text-warning"
                >
                  <Clock size={13} /> {w === 'custom' ? 'Pick date' : `→ ${w}`}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStatus(sheet.id, { status: 'pending', reason: undefined, postponedTo: undefined }, 'Reset to pending')}
              className="mt-2 w-full cursor-pointer py-2 text-center text-xs font-semibold text-muted"
            >
              Reset to pending
            </button>
          </div>
        </div>
      )}
    </>
  )
}
