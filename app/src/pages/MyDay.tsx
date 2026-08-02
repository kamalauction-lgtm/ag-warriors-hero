import { useState } from 'react'
import { Bell, Flame, Moon, Sun, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { useBrand } from '../lib/brand'
import './elite.css'
import { COUNTRY_CFG, compactMoney } from '../lib/format'
import { TASKS, getDeals, pipelineValue } from '../lib/mockData'
import { Avatar, Bar, Card, Chip, ProgressRing } from '../components/ui'
import TimeBox from '../components/TimeBox'
import type { Locale } from '../lib/types'

const LOCALES: { v: Locale; label: string }[] = [
  { v: 'en', label: 'EN' },
  { v: 'bm', label: 'BM' },
  { v: 'id', label: 'ID' },
]

export default function MyDay() {
  const { user, t, theme, toggleTheme, locale, setLocale } = useApp()
  const mascot = useBrand(user?.country ?? 'MY', 'mascot_home')
  const [toast, setToast] = useState('')
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

  // MY shows BM optionally; ID shows ID; EN always
  const allowed = LOCALES.filter(
    (l) => l.v === 'en' || (user.country === 'MY' ? l.v === 'bm' : l.v === 'id'),
  )

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
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors duration-200 hover:text-ink"
          >
            <Bell size={16} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger" />
          </button>
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
                Elite Team Command
              </p>
              <p className="text-[11px]" style={{ color: '#c9c2a8' }}>
                Enter your command center
              </p>
            </div>
            <span className="text-lg" style={{ color: '#d8b25a' }}>
              →
            </span>
          </div>
        </Link>
      )}

      {/* Hero stats — brand moment (mascot = uploadable Brand Studio slot) */}
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

      {/* Time-Boxing — full M5: statuses, reasons, postpone, calendar, reminders */}
      <TimeBox onToast={say} />

      {/* Reward teaser */}
      <Card className="mb-2 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">🎯 {t('common.target')}: Dubai Elite Trip</p>
          <span className="font-display text-sm font-extrabold text-accent">68%</span>
        </div>
        <Bar pct={68} />
      </Card>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
