import { useCallback, useEffect, useState } from 'react'
import { Bell, Flame, Moon, Sun, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { useBrand } from '../lib/brand'
import './elite.css'
import { COUNTRY_CFG, compactMoney } from '../lib/format'
import { TASKS, getDeals, pipelineValue } from '../lib/mockData'
import { Avatar, Bar, Card, Chip, ProgressRing } from '../components/ui'
import TimeBox from '../components/TimeBox'
import CoachBrief from '../components/CoachBrief'
import HelpRequest from '../components/HelpRequest'
import type { Locale } from '../lib/types'

const LOCALES: { v: Locale; label: string }[] = [
  { v: 'en', label: 'EN' },
  { v: 'bm', label: 'BM' },
  { v: 'id', label: 'ID' },
]

interface Live { enrolled: boolean; status: string; day: number; approved: number; xp: number; streak: number }

export default function MyDay() {
  const { user, t, theme, toggleTheme, locale, setLocale } = useApp()
  /* one tiny trilingual helper — BM for MY warriors, ID for Indonesia */
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const mascot = useBrand(user?.country ?? 'MY', 'mascot_home')
  const [toast, setToast] = useState('')
  const [live, setLive] = useState<Live | null>(null)
  const [unread, setUnread] = useState(0)
  // real account = live data only; demo personas keep the showcase numbers
  const isReal = supabaseReady && !!user && user.id.includes('-')

  useEffect(() => {
    if (!isReal || !supabase || !user) return
    supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('to_agent', user.id).eq('read', false)
      .then(({ count }) => setUnread(count ?? 0))
  }, [isReal, user])

  const loadLive = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    const { data: es } = await supabase.from('enrolments').select('id,status,cohort_id')
      .eq('participant_id', user.id).limit(1)
    const e = es?.[0] as { id: string; status: string; cohort_id: string } | undefined
    if (!e) { setLive({ enrolled: false, status: '', day: 0, approved: 0, xp: 0, streak: 0 }); return }
    const [dayR, subs, pl, st] = await Promise.all([
      // P0.2 — the warrior's OWN accessible day, never the cohort calendar day
      supabase.rpc('participant_accessible_day', { p_enrolment: e.id }),
      supabase.from('task_submissions').select('day_no,status').eq('enrolment_id', e.id),
      supabase.from('points_ledger').select('amount').eq('user_id', user.id).eq('status', 'verified'),
      supabase.rpc('challenge_streak', { p_enrolment: e.id }),
    ])
    const days = new Set(((subs.data ?? []) as { day_no: number; status: string }[])
      .filter((s) => s.status === 'approved').map((s) => s.day_no))
    setLive({
      enrolled: true, status: e.status,
      day: (dayR.data as number) ?? 0,
      approved: days.size,
      xp: ((pl.data ?? []) as { amount: number }[]).reduce((tot, r) => tot + r.amount, 0),
      streak: (st.data as number) ?? 0,
    })
  }, [isReal, user])
  useEffect(() => { loadLive() }, [loadLive])

  if (!user) return null

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3000)
  }
  const done = TASKS.filter((x) => x.status === 'done').length
  const pct = (done / TASKS.length) * 100
  const closings = getDeals(user.country).filter((d) => d.stage === 'closed')
  const hour = new Date().getHours()
  const greet =
    hour < 12 ? t('greeting.morning') : hour < 18 ? t('greeting.afternoon') : t('greeting.evening')

  // Kamal (2026-08-10): all three languages selectable for everyone. Country
  // still governs CONTENT; language is presentation only.
  // MY = EN/BM · ID = ID/EN (Kamal, 2026-08-11)
  const allowed = LOCALES.filter((l) =>
    user.country === 'ID' ? l.v !== 'bm' : l.v !== 'id')

  return (
    <div className="animate-rise px-4 pt-5">
      {/* Header */}
      <header className="mb-5 flex items-center gap-3">
        <Avatar name={user.name} color={user.avatarColor} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            {greet} {COUNTRY_CFG[user.country].flag}
          </p>
          <h1 className="truncate font-display text-lg font-extrabold tracking-tight">
            {user.isElite && user.captainName ? user.captainName : user.name}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-full border border-border">
            {allowed.map((l) => (
              <button
                key={l.v}
                type="button"
                onClick={() => setLocale(l.v)}
                className={clsx(
                  'cursor-pointer px-2.5 py-1.5 text-[10px] font-bold transition-colors duration-200',
                  locale === l.v ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors duration-200 hover:text-ink"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link
            to="/notifications"
            aria-label="Notifications"
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors duration-200 hover:text-ink"
          >
            <Bell size={16} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Elite launch — production rule: only isElite || admin see this */}
      {(user.isElite ||
        user.role === 'master_admin' ||
        user.role === 'country_admin') && (
        <Link to="/team/elite" className="block">
          <div className="ez-camo mb-4 flex cursor-pointer items-center gap-3 rounded-2xl p-3.5 transition-opacity duration-200 hover:opacity-90">
            <img
              src="/brand/tim-elit-logo.png"
              alt=""
              className="h-11 w-11 rounded-lg object-contain"
            />
            <div className="min-w-0 flex-1">
              <p
                className="ez-osw text-sm font-bold uppercase tracking-[0.12em]"
                style={{ color: '#d8b25a' }}
              >
                {L('Elite Team Command', 'Komando Tim Elit', 'Komando Tim Elit')}
              </p>
              <p className="text-[11px]" style={{ color: '#c9c2a8' }}>
                {L('Enter your command center', 'Masuk pusat komando anda', 'Masuk pusat komando kamu')}
              </p>
            </div>
            <span className="text-lg" style={{ color: '#d8b25a' }}>
              →
            </span>
          </div>
        </Link>
      )}

      {/* ---- REAL ACCOUNT: live challenge hero (no mock numbers) ---- */}
      {isReal && (
        <div className="hero-user mb-4 p-4">
          {mascot && <img src={mascot} alt="" className="hero-mascot" />}
          <div className="relative flex items-center gap-4">
            <ProgressRing pct={live ? (live.approved / 30) * 100 : 0} size={76} label="30DC" />
            <div className="grid flex-1 grid-cols-2 gap-x-2 gap-y-3 pr-20">
              <div>
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">
                  <Flame size={11} className="text-warning" /> {L('Streak', 'Rentetan', 'Beruntun')}
                </p>
                <p className="font-display text-lg font-extrabold">
                  {live?.streak ?? 0} <span className="text-[10px] font-semibold text-[#c9c2a8]">{t('common.streak')}</span>
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">
                  <Trophy size={11} className="text-accent" /> {L('Verified XP', 'XP Disahkan', 'XP Terverifikasi')}
                </p>
                <p className="gold-text font-display text-lg font-extrabold">{live?.xp ?? 0}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">{L('30 Days Closing Challenge', 'Cabaran Closing 30 Hari', 'Tantangan Closing 30 Hari')}</p>
                <p className="gold-text font-display text-2xl font-extrabold">
                  {!live?.enrolled ? L('Not enrolled', 'Belum daftar', 'Belum terdaftar')
                    : live.status !== 'active' ? L('Awaiting approval', 'Menunggu kelulusan', 'Menunggu persetujuan')
                    : live.day === 0 ? L('Starts 8 Aug', 'Mula 8 Ogos', 'Mulai 8 Agu')
                    : `${L('Day', 'Hari', 'Hari')} ${live.day} ${L('of', 'daripada', 'dari')} 30`}
                </p>
              </div>
            </div>
          </div>
          <div className="relative mt-3 border-t border-white/10 pt-3">
            <Link to="/challenge"
              className="flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-accent text-sm font-extrabold text-on-accent no-underline">
              {!live?.enrolled ? L('Join the Challenge →', 'Sertai Cabaran →', 'Ikut Tantangan →')
                : live.status !== 'active' ? L('View my enrolment →', 'Lihat pendaftaran saya →', 'Lihat pendaftaran saya →')
                : live.day === 0 ? L('View the roadmap →', 'Lihat roadmap →', 'Lihat roadmap →')
                : `${L('Continue Day', 'Teruskan Hari', 'Lanjutkan Hari')} ${live.day} →`}
            </Link>
            {live?.enrolled && live.status === 'active' && (
              <p className="mt-2 text-center text-[11px] text-[#c9c2a8]">
                {live.approved} {L('of 30 days verified by your Coach', 'daripada 30 hari disahkan oleh Coach anda', 'dari 30 hari terverifikasi oleh Coach kamu')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hero stats — brand moment (mascot = uploadable Brand Studio slot) */}
      {!isReal && (
      <div className="hero-user mb-4 p-4">
        {mascot && <img src={mascot} alt="" className="hero-mascot" />}
        <div className="relative flex items-center gap-4">
          <ProgressRing pct={pct} size={76} label={t('common.today')} />
          <div className="grid flex-1 grid-cols-2 gap-x-2 gap-y-3 pr-20">
            <div>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">
                <Flame size={11} className="text-warning" /> Streak
              </p>
              <p className="font-display text-lg font-extrabold">
                12 <span className="text-[10px] font-semibold text-[#c9c2a8]">{t('common.streak')}</span>
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">
                <Trophy size={11} className="text-accent" /> {t('common.points')}
              </p>
              <p className="gold-text font-display text-lg font-extrabold">{user.points.toLocaleString()}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">
                {t('common.pipeline')}
              </p>
              <p className="gold-text font-display text-2xl font-extrabold">
                {compactMoney(pipelineValue(user.country), user.country)}
              </p>
            </div>
          </div>
        </div>
        <div className="relative mt-3 flex items-center gap-2 border-t border-white/10 pt-3">
          <Chip tone="accent">Lv {user.level} · {user.levelName}</Chip>
          <Chip tone="success">{closings.length} {t('common.closings')} {t('common.week')}</Chip>
        </div>
      </div>
      )}

      {/* AG AI Coach — analyse the day against calls, leads and the plan */}
      <CoachBrief />

      {/* Minta Bantuan — raise a hand; help arrives with full context */}
      <HelpRequest />

      {/* Time-Boxing — full M5: statuses, reasons, postpone, calendar, reminders */}
      <TimeBox onToast={say} />

      {/* Reward teaser — sample data, demo personas only */}
      {!isReal && (
        <Card className="mb-2 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">🎯 {t('common.target')}: Dubai Elite Trip</p>
            <span className="font-display text-sm font-extrabold text-accent">68%</span>
          </div>
          <Bar pct={68} />
        </Card>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
