/* TimeBox — full M5 Time-Boxing from production:
   tasks w/ time slots · status done / not-done+reason / postponed→carry-forward ·
   Day / Week / Month calendar · team events · reminders + browser push. */
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { supabase, supabaseReady } from '../lib/supabase'
import { enablePush, getPushState, pushSupported } from '../lib/push'
import { useApp } from '../lib/store'

interface TBTask {
  id: string
  label: string
  slot: string
  status: 'pending' | 'done' | 'notdone' | 'postponed'
  reason?: string
  postponedTo?: string
  carried?: boolean
}
/* Showcase rows for the demo personas. A real account never sees these — it
   gets its own saved planner from time_tasks. */
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
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const dateLocale = locale === 'bm' ? 'ms-MY' : locale === 'id' ? 'id-ID' : 'en-GB'
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  // demo personas keep the showcase list; a real account starts from its own saved day
  const [tasks, setTasks] = useState<TBTask[]>(isReal ? [] : SEED)
  const [week, setWeek] = useState<{ date: string; planned: number; done: number }[]>([])
  const [loaded, setLoaded] = useState(!isReal)
  const [sheet, setSheet] = useState<TBTask | null>(null)
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newSlot, setNewSlot] = useState('12:00')
  const [notif, setNotif] = useState(false)
  const [pickedDay, setPickedDay] = useState(new Date().getDate())

  /* real accounts: ON = device is push-subscribed (the cron reminds via 065) */
  useEffect(() => {
    if (isReal && pushSupported()) { getPushState().then((s) => setNotif(s === 'on')) }
    else setNotif(typeof Notification !== 'undefined' && Notification.permission === 'granted')
  }, [isReal])

  /* THE "tasks disappear" bug: this used toISOString() = the UTC date. Before
     08:00 MY / 07:00 ID local, UTC is still YESTERDAY — morning loads filtered
     on the wrong day and morning inserts were stamped on it too. The date must
     be the agent's local calendar day, matching the DB default. */
  const tz = user?.country === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur'
  const localDate = useCallback((d: Date = new Date()) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d), [tz])
  const today = localDate()

  /* yesterday's unfinished tasks stay VISIBLE today until the agent acts */
  const [carryover, setCarryover] = useState<TBTask[]>([])

  const load = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    const yesterday = localDate(new Date(Date.now() - 864e5))
    const [{ data: rows }, { data: wk }, { data: prev }] = await Promise.all([
      supabase.from('time_tasks').select('*').eq('user_id', user.id).eq('on_date', today)
        .order('sort_order').order('slot'),
      supabase.rpc('timebox_week'),
      supabase.from('time_tasks').select('*').eq('user_id', user.id)
        .eq('on_date', yesterday).eq('status', 'pending').order('slot'),
    ])
    const toTask = (r: TBTask & { on_date: string }): TBTask => ({
      id: r.id, label: r.label, slot: r.slot ?? '', status: r.status,
      reason: r.reason ?? undefined, carried: r.carried,
    })
    setTasks(((rows ?? []) as (TBTask & { on_date: string })[]).map(toTask))
    setCarryover(((prev ?? []) as (TBTask & { on_date: string })[]).map(toTask))
    setWeek((wk as { date: string; planned: number; done: number }[]) ?? [])
    setLoaded(true)
  }, [isReal, user, today, localDate])
  useEffect(() => { load() }, [load])

  /* ---------- history: month calendar + search over ALL saved tasks ---------- */
  interface HistRow {
    id: string; on_date: string; label: string; slot: string | null; status: TBTask['status']
    reason?: string | null; carried?: boolean; updated_at?: string | null
  }
  const [monthOffset, setMonthOffset] = useState(0)
  const [monthRows, setMonthRows] = useState<HistRow[]>([])
  const [monthTick, setMonthTick] = useState(0)   // bump to refetch the month
  const [sq, setSq] = useState('')
  const [sqRows, setSqRows] = useState<HistRow[] | null>(null)

  const monthBase = useMemo(() => {
    const [y, m] = today.split('-').map(Number)
    return new Date(y, m - 1 + monthOffset, 1)
  }, [today, monthOffset])

  useEffect(() => {
    if (!isReal || !supabase || !user || view !== 'month') return
    const y = monthBase.getFullYear(), m = monthBase.getMonth()
    const first = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const last = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`
    supabase.from('time_tasks').select('id,on_date,label,slot,status,reason,carried,updated_at')
      .eq('user_id', user.id).gte('on_date', first).lte('on_date', last)
      .order('on_date').order('slot')
      .then(({ data }) => setMonthRows((data as HistRow[]) ?? []))
  }, [isReal, user, view, monthBase, tasks.length, monthTick])

  const searchTasks = async () => {
    if (!isReal || !supabase || !user || !sq.trim()) { setSqRows(null); return }
    const { data } = await supabase.from('time_tasks').select('id,on_date,label,slot,status')
      .eq('user_id', user.id).ilike('label', `%${sq.trim()}%`)
      .order('on_date', { ascending: false }).limit(50)
    setSqRows((data as HistRow[]) ?? [])
  }

  const done = tasks.filter((x) => x.status === 'done').length
  const points = 20 + done * 10 // production: +20 morning plan, +10 per on-time task

  const setStatus = async (id: string, patch: Partial<TBTask>, msg: string) => {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    setSheet(null)
    setReason('')
    onToast(msg)
    if (!isReal || !supabase) return
    // Postponing is not a plain update: it also creates tomorrow's copy, so today's
    // record of what actually happened survives.
    if (patch.status === 'postponed') {
      const { error } = await supabase.rpc('timebox_postpone', { p_id: id, p_reason: patch.reason ?? null })
      if (error) onToast('⚠ ' + error.message)
    } else {
      const { error } = await supabase.from('time_tasks')
        .update({ status: patch.status, reason: patch.reason ?? null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) onToast('⚠ ' + error.message)
    }
    load()
  }

  const addTask = async (label: string, slot: string) => {
    if (!label.trim()) return
    if (!isReal || !supabase || !user) {
      setTasks((ts) => [...ts, { id: `local-${ts.length}`, label: label.trim(), slot, status: 'pending' }])
      onToast(L('Task added', 'Tugasan ditambah', 'Tugas ditambahkan'))
      return
    }
    const { error } = await supabase.from('time_tasks').insert({
      user_id: user.id, on_date: today, label: label.trim(), slot,
      sort_order: tasks.length,
    })
    if (error) { onToast('⚠ ' + error.message); return }
    onToast(L('Task added', 'Tugasan ditambah', 'Tugas ditambahkan'))
    load()
  }

  const removeTask = async (id: string) => {
    setTasks((ts) => ts.filter((x) => x.id !== id))
    if (isReal && supabase) await supabase.from('time_tasks').delete().eq('id', id)
  }

  /* Real accounts subscribe this device to web push — the worker cron then
     pings ~15 minutes before each pending slot, even with the app closed. */
  const enableReminders = async () => {
    if (isReal && user && pushSupported()) {
      const err = await enablePush(user.id)
      if (err) { onToast(`⚠ ${err}`); return }
      setNotif(true)
      onToast(L('🔔 Reminders ON — this device gets a push before each slot',
        '🔔 Peringatan AKTIF — peranti ini terima push sebelum setiap slot',
        '🔔 Pengingat AKTIF — perangkat ini menerima push sebelum setiap slot'))
      return
    }
    if (typeof Notification === 'undefined') return onToast(L('Notifications not supported here', 'Notifikasi tidak disokong di sini', 'Notifikasi tidak didukung di sini'))
    const perm = await Notification.requestPermission()
    setNotif(perm === 'granted')
    onToast(perm === 'granted'
      ? L('🔔 Reminders ON', '🔔 Peringatan AKTIF', '🔔 Pengingat AKTIF')
      : L('Browser blocked notifications — in-app reminders stay active',
          'Pelayar sekat notifikasi — peringatan dalam apl kekal aktif',
          'Browser memblokir notifikasi — pengingat dalam aplikasi tetap aktif'))
  }

  /* auto in-app reminder for overdue pending task (production: 5-min rule style) */
  useEffect(() => {
    const t = setTimeout(() => {
      const p = tasks.find((x) => x.status === 'pending')
      if (p) onToast(L(`⏰ Reminder: "${p.label}" at ${p.slot}`, `⏰ Peringatan: "${p.label}" pada ${p.slot}`, `⏰ Pengingat: "${p.label}" pukul ${p.slot}`))
    }, 25000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* real month grid — Monday-start, computed for whichever month is shown */
  const monthCells = useMemo(() => {
    const y = monthBase.getFullYear(), m = monthBase.getMonth()
    const lead = (new Date(y, m, 1).getDay() + 6) % 7
    const cells: { day: number | null }[] = []
    for (let i = 0; i < lead; i++) cells.push({ day: null })
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) cells.push({ day: d })
    return cells
  }, [monthBase])
  const dateOf = (day: number) =>
    `${monthBase.getFullYear()}-${String(monthBase.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const monthByDay = useMemo(() => {
    const map: Record<string, HistRow[]> = {}
    monthRows.forEach((r) => { (map[r.on_date] ||= []).push(r) })
    return map
  }, [monthRows])

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
            <BellRing size={12} /> {notif
              ? L('Reminders ON', 'Peringatan AKTIF', 'Pengingat AKTIF')
              : L('Enable reminders', 'Aktifkan peringatan', 'Aktifkan pengingat')}
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
            {v === 'day' ? L('Day', 'Hari', 'Hari') : v === 'week' ? L('Week', 'Minggu', 'Minggu') : L('Month', 'Bulan', 'Bulan')}
          </button>
        ))}
        <Chip tone="accent" className="ml-auto">⭐ +{points} {L('pts today', 'mata hari ini', 'poin hari ini')}</Chip>
      </div>

      {/* ---------- search across the whole saved history ---------- */}
      {isReal && (
        <div className="mb-3">
          <div className="flex gap-2">
            <input value={sq} onChange={(e) => setSq(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchTasks()}
              placeholder={L('Search all my tasks…', 'Cari semua tugasan saya…', 'Cari semua tugasku…')}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <button type="button" onClick={searchTasks}
              className="h-10 cursor-pointer rounded-xl border border-border px-3.5 text-xs font-bold text-muted hover:text-ink">
              🔍
            </button>
            {sqRows !== null && (
              <button type="button" onClick={() => { setSq(''); setSqRows(null) }}
                className="h-10 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold text-muted hover:text-ink">✕</button>
            )}
          </div>
          {sqRows !== null && (
            <Card className="mt-2 divide-y divide-border">
              {sqRows.length === 0 && (
                <p className="p-4 text-center text-xs text-muted">
                  {L('Nothing found — tasks are kept forever, try another word.',
                    'Tiada jumpaan — tugasan disimpan selamanya, cuba perkataan lain.',
                    'Tidak ditemukan — tugas tersimpan selamanya, coba kata lain.')}
                </p>
              )}
              {sqRows.map((r) => (
                <div key={r.id} className="flex items-center gap-2.5 p-2.5 text-xs">
                  <span className="w-16 shrink-0 font-bold text-muted">
                    {new Date(r.on_date).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className={clsx('min-w-0 flex-1 truncate', r.status === 'done' && 'text-muted line-through')}>{r.label}</span>
                  {r.slot && <span className="shrink-0 text-muted">{r.slot}</span>}
                  <Chip tone={r.status === 'done' ? 'success' : r.status === 'notdone' ? 'danger' : r.status === 'postponed' ? 'warning' : 'default'}>
                    {r.status === 'done' ? L('done', 'selesai', 'selesai')
                      : r.status === 'notdone' ? L('not done', 'tak siap', 'belum')
                      : r.status === 'postponed' ? L('postponed', 'tangguh', 'ditunda')
                      : L('pending', 'belum buat', 'menunggu')}
                  </Chip>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* ---------- yesterday's unfinished — still yours until you act ---------- */}
      {view === 'day' && carryover.length > 0 && (
        <Card className="mb-3 border-warning/40">
          <p className="border-b border-border p-3 text-xs font-bold text-warning">
            ⏳ {L("Yesterday — not finished (still here until you decide)",
              'Semalam — belum selesai (kekal di sini sehingga anda tentukan)',
              'Kemarin — belum selesai (tetap di sini sampai kamu putuskan)')}
          </p>
          {carryover.map((task) => (
            <button key={task.id} type="button" onClick={() => setSheet(task)}
              className="flex w-full cursor-pointer items-center gap-3 border-b border-border p-3 text-left last:border-0 hover:bg-surface2/60">
              <Circle size={18} className="shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate text-sm">{task.label}</span>
              <span className="shrink-0 text-xs font-semibold text-muted">{task.slot}</span>
            </button>
          ))}
        </Card>
      )}

      {/* ---------- DAY ---------- */}
      {view === 'day' && (
        <Card className="mb-4 divide-y divide-border">
          {/* An empty planner is the honest state for a brand-new account —
              better than inventing someone else's day for them. */}
          {loaded && tasks.length === 0 && (
            <div className="p-6 text-center">
              <Clock size={26} className="mx-auto mb-2 text-muted" />
              <p className="text-sm font-bold">{L('Nothing planned yet', 'Belum ada rancangan', 'Belum ada rencana')}</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
                {L('Add your first task for today. Anything you postpone carries forward to tomorrow.',
                  'Tambah tugasan pertama anda untuk hari ini. Apa yang ditangguh dibawa ke esok.',
                  'Tambahkan tugas pertamamu untuk hari ini. Yang ditunda akan dibawa ke besok.')}
              </p>
            </div>
          )}
          {[...tasks].sort((a, b) => (a.slot ?? '').localeCompare(b.slot ?? '')).map((task) => (
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
                  {task.carried && <span className="mr-1 text-warning" title={L('Carried forward', 'Dibawa dari semalam', 'Dibawa dari kemarin')}>↻</span>}
                  {task.label}
                </span>
                {task.status === 'notdone' && task.reason && (
                  <span className="block text-[11px] text-danger">{L('Reason', 'Sebab', 'Alasan')}: {task.reason}</span>
                )}
                {task.status === 'postponed' && (
                  <span className="block text-[11px] text-warning">→ {L('postponed to', 'ditangguh ke', 'ditunda ke')} {task.postponedTo === 'tomorrow' ? L('tomorrow', 'esok', 'besok') : task.postponedTo}</span>
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
                placeholder={L('Task…', 'Tugasan…', 'Tugas…')}
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
                onClick={async () => {
                  if (!newLabel.trim()) return
                  await addTask(newLabel, newSlot)
                  setNewLabel('')
                  setAdding(false)
                }}
                className="h-10 cursor-pointer rounded-xl bg-accent px-3.5 text-xs font-bold text-on-accent"
              >
                {L('Add', 'Tambah', 'Tambah')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 p-3 text-xs font-bold text-accent transition-colors hover:bg-surface2/60"
            >
              <Plus size={14} /> {L('Add task', 'Tambah tugasan', 'Tambah tugas')}
            </button>
          )}
        </Card>
      )}

      {/* ---------- WEEK ---------- */}
      {view === 'week' && (
        <Card className="mb-4 p-4">
          <div className="flex h-32 items-end justify-between gap-2">
            {(isReal
              ? week.map((w) => ({
                  d: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(w.date).getDay()],
                  planned: w.planned, done: w.done,
                }))
              : WEEK
            ).map((w, i) => (
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
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" /> {L('Done', 'Selesai', 'Selesai')}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-surface2" /> {L('Planned', 'Dirancang', 'Direncanakan')}</span>
            <span className="ml-auto font-semibold">32/44 {L('this week', 'minggu ini', 'minggu ini')} · 73%</span>
          </div>
        </Card>
      )}

      {/* ---------- MONTH — the real archive: every saved day, browsable ---------- */}
      {view === 'month' && (
        <Card className="mb-4 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setMonthOffset((n) => n - 1)} aria-label="Previous month"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">‹</button>
              <p className="min-w-[130px] text-center font-display text-sm font-extrabold">
                {monthBase.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })}
              </p>
              <button type="button" onClick={() => setMonthOffset((n) => Math.min(n + 1, 0))} aria-label="Next month"
                disabled={monthOffset >= 0}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink disabled:opacity-30">›</button>
            </div>
            <Chip><CalendarDays size={11} /> {L('tap a day for its tasks', 'ketik hari untuk tugasannya', 'ketuk hari untuk tugasnya')}</Chip>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-muted">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthCells.map((c, i) => {
              const rows = c.day ? (isReal ? monthByDay[dateOf(c.day)] ?? [] : []) : []
              const doneN = rows.filter((r) => r.status === 'done').length
              const isToday = c.day != null && monthOffset === 0 && dateOf(c.day) === today
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!c.day}
                  onClick={() => c.day && setPickedDay(c.day)}
                  className={clsx(
                    'relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors duration-150',
                    !c.day && 'invisible',
                    c.day === pickedDay ? 'border-accent bg-accent-soft text-accent' : 'border-border hover:border-accent/40',
                    isToday && 'ring-1 ring-accent',
                  )}
                >
                  {c.day}
                  <span className="mt-0.5 flex gap-0.5">
                    {isReal && rows.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full"
                        style={{ background: doneN === rows.length ? '#d4ac4a' : doneN > 0 ? '#6b7488' : '#3a3f2a' }}
                        title={`${doneN}/${rows.length}`} />
                    )}
                    {!isReal && c.day && HEAT[c.day] != null && (
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: HEAT[c.day]! >= 0.8 ? '#d4ac4a' : '#6b7488' }} />
                    )}
                    {!isReal && c.day && EVENTS[c.day] && <span className="text-[8px] leading-none">{EVENTS[c.day][0].icon}</span>}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-bold">
              {new Date(monthBase.getFullYear(), monthBase.getMonth(), pickedDay).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'short' })}
              {isReal && (monthByDay[dateOf(pickedDay)]?.length ?? 0) > 0 && (
                <span className="ml-2 font-normal text-muted">
                  {monthByDay[dateOf(pickedDay)]!.filter((r) => r.status === 'done').length}/{monthByDay[dateOf(pickedDay)]!.length} {L('done', 'selesai', 'selesai')}
                </span>
              )}
            </p>
            {isReal && (monthByDay[dateOf(pickedDay)] ?? []).map((r) => (
              <div key={r.id} className="border-b border-border py-1.5 last:border-0">
                <div className="flex items-center gap-2 text-xs">
                  {r.status === 'done' ? <CheckCircle2 size={14} className="shrink-0 text-success" />
                    : r.status === 'notdone' ? <AlertCircle size={14} className="shrink-0 text-danger" />
                    : r.status === 'postponed' ? <Clock size={14} className="shrink-0 text-warning" />
                    : <Circle size={14} className="shrink-0 text-muted" />}
                  <span className={clsx('min-w-0 flex-1 truncate', r.status === 'done' && 'text-muted line-through')}>
                    {r.carried && <span className="mr-1 text-warning" title={L('Carried forward', 'Dibawa dari semalam', 'Dibawa dari kemarin')}>↻</span>}
                    {r.label}
                  </span>
                  <Chip tone={r.status === 'done' ? 'success' : r.status === 'notdone' ? 'danger' : r.status === 'postponed' ? 'warning' : 'default'}>
                    {r.status === 'done' ? L('Done', 'Siap', 'Selesai')
                      : r.status === 'notdone' ? L('Not done', 'Tak siap', 'Belum')
                      : r.status === 'postponed' ? L('Postponed', 'Ditangguh', 'Ditunda')
                      : L('Pending', 'Belum buat', 'Menunggu')}
                  </Chip>
                  {r.slot && <span className="shrink-0 text-muted">{r.slot}</span>}
                </div>
                <div className="ml-6 mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted">
                  {r.status === 'done' && r.updated_at && (
                    <span>✅ {L('finished at', 'siap pada', 'selesai pukul')}{' '}
                      {new Date(r.updated_at).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                  {r.status === 'notdone' && r.reason && (
                    <span className="text-danger">{L('Reason', 'Sebab', 'Alasan')}: {r.reason}</span>
                  )}
                  {r.status === 'postponed' && (
                    <span className="text-warning">→ {L('moved to the next day', 'dibawa ke hari berikutnya', 'dipindah ke hari berikutnya')}</span>
                  )}
                </div>
              </div>
            ))}
            {isReal && (monthByDay[dateOf(pickedDay)] ?? []).length === 0 && (
              <p className="text-xs text-muted">{L('Nothing saved on this day.', 'Tiada tugasan tersimpan hari ini.', 'Tidak ada tugas tersimpan di hari ini.')}</p>
            )}
            {/* plan ahead: add a task straight onto today or a future day */}
            {isReal && dateOf(pickedDay) >= today && (
              <div className="mt-2 flex items-center gap-2">
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={L('Add a task for this day…', 'Tambah tugasan untuk hari ini…', 'Tambah tugas untuk hari ini…')}
                  className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-xs outline-none focus:border-accent" />
                <input type="time" value={newSlot} onChange={(e) => setNewSlot(e.target.value)}
                  className="h-9 rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent" />
                <button type="button" disabled={!newLabel.trim()}
                  onClick={async () => {
                    if (!supabase || !user || !newLabel.trim()) return
                    const { error } = await supabase.from('time_tasks').insert({
                      user_id: user.id, on_date: dateOf(pickedDay), label: newLabel.trim(), slot: newSlot,
                    })
                    if (error) { onToast('⚠ ' + error.message); return }
                    setNewLabel('')
                    onToast(L('Task added', 'Tugasan ditambah', 'Tugas ditambahkan'))
                    load()
                    setMonthTick((n) => n + 1)
                  }}
                  className="h-9 cursor-pointer rounded-xl bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-40">
                  {L('Add', 'Tambah', 'Tambah')}
                </button>
              </div>
            )}
            {!isReal && (
              <>
                {(EVENTS[pickedDay] ?? []).map((e) => (
                  <p key={e.label} className="text-xs text-muted">{e.icon} {e.label} <Chip tone="accent" className="ml-1">{L('team', 'pasukan', 'tim')}</Chip></p>
                ))}
                {HEAT[pickedDay] != null && (
                  <p className="text-xs text-muted">✅ {Math.round(HEAT[pickedDay]! * 100)}% {L('tasks completed', 'tugasan selesai', 'tugas selesai')}</p>
                )}
                {!EVENTS[pickedDay] && HEAT[pickedDay] == null && <p className="text-xs text-muted">{L('Nothing planned.', 'Tiada rancangan.', 'Tidak ada rencana.')}</p>}
              </>
            )}
          </div>
        </Card>
      )}

      {/* ---------- status action sheet ---------- */}
      {sheet && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-4 pb-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="min-w-0 truncate text-sm font-bold">{sheet.label} · {sheet.slot}</p>
              <button type="button" onClick={() => setSheet(null)} aria-label={L('Close', 'Tutup', 'Tutup')} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={14} /></button>
            </div>
            <button
              type="button"
              onClick={() => setStatus(sheet.id, { status: 'done', reason: undefined }, L('✅ Done · +10 pts', '✅ Selesai · +10 mata', '✅ Selesai · +10 poin'))}
              className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded-xl bg-success/12 p-3.5 text-sm font-bold text-success"
            >
              <CheckCircle2 size={17} /> {L('Done ✓', 'Selesai ✓', 'Selesai ✓')}
            </button>
            <div className="mb-2 rounded-xl border border-border p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-danger"><AlertCircle size={15} /> {L('Not done (reason required)', 'Belum siap (perlu sebab)', 'Belum selesai (perlu alasan)')}</p>
              <div className="flex gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={L('Why not done?', 'Kenapa belum siap?', 'Kenapa belum selesai?')}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => reason.trim() && setStatus(sheet.id, { status: 'notdone', reason: reason.trim() },
                    L('Marked not done — leader can see the reason', 'Ditanda belum siap — leader boleh lihat sebab', 'Ditandai belum selesai — leader bisa lihat alasan'))}
                  className="h-10 cursor-pointer rounded-xl border border-danger/50 px-3.5 text-xs font-bold text-danger disabled:opacity-40"
                  disabled={!reason.trim()}
                >
                  {L('Save', 'Simpan', 'Simpan')}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStatus(sheet.id, { status: 'postponed', postponedTo: 'tomorrow', carried: true },
                L('⏭ Postponed — it will be waiting for you tomorrow', '⏭ Ditangguh — ia menunggu anda esok', '⏭ Ditunda — akan menunggumu besok'))}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/50 py-3 text-xs font-bold text-warning"
            >
              <Clock size={13} /> {L('Postpone to tomorrow', 'Tangguh ke esok', 'Tunda ke besok')}
            </button>
            <button
              type="button"
              onClick={() => { const id = sheet.id; setSheet(null); removeTask(id); onToast(L('Task removed', 'Tugasan dipadam', 'Tugas dihapus')) }}
              className="mt-2 w-full cursor-pointer py-2 text-center text-xs font-semibold text-danger"
            >
              {L('Delete task', 'Padam tugasan', 'Hapus tugas')}
            </button>
            <button
              type="button"
              onClick={() => setStatus(sheet.id, { status: 'pending', reason: undefined, postponedTo: undefined },
                L('Reset to pending', 'Diset semula ke belum buat', 'Direset ke belum selesai'))}
              className="w-full cursor-pointer py-2 text-center text-xs font-semibold text-muted"
            >
              {L('Reset to pending', 'Set semula ke belum buat', 'Reset ke belum selesai')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
