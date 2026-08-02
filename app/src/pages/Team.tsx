import { Link } from 'react-router-dom'
import { ChevronRight, Crown, ImagePlus, Medal, Swords } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { compactMoney } from '../lib/format'
import { getLeaders } from '../lib/mockData'
import { Avatar, Card, Chip, SectionTitle } from '../components/ui'

const COLORS = ['#e0a52f', '#8b5cf6', '#10b981', '#3b82f6', '#f43f5e', '#14b8a6']

export default function Team() {
  const { user, t } = useApp()
  if (!user) return null
  const rows = [...getLeaders(user.country)].sort((a, b) => b.points - a.points)
  const podium = rows.slice(0, 3)
  const rest = rows.slice(3)

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          {t('team.title')}
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          {t('common.week')} · {user.country === 'MY' ? 'Malaysia' : 'Indonesia'}
        </p>
      </header>

      {/* Podium */}
      <Card className="mb-4 p-4">
        <div className="flex items-end justify-center gap-3">
          {[podium[1], podium[0], podium[2]].filter(Boolean).map((p, idx) => {
            const isFirst = idx === 1
            return (
              <div
                key={p.id}
                className={clsx('flex flex-1 flex-col items-center', !isFirst && 'pb-1')}
              >
                <div className="relative">
                  {isFirst && (
                    <Crown
                      size={18}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 text-accent"
                    />
                  )}
                  <Avatar
                    name={p.name}
                    color={COLORS[rows.indexOf(p) % COLORS.length]}
                    size={isFirst ? 62 : 48}
                  />
                </div>
                <p className="mt-2 max-w-full truncate text-center text-xs font-bold">
                  {p.isElite && p.captainName ? p.captainName : p.name}
                </p>
                <p className="text-[10px] text-muted">{p.points.toLocaleString()} pts</p>
                <div
                  className={clsx(
                    'mt-2 w-full rounded-t-lg bg-accent-soft text-center font-display font-extrabold text-accent',
                    isFirst ? 'py-3 text-lg' : 'py-1.5 text-sm',
                  )}
                >
                  {rows.indexOf(p) + 1}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Leadership tools — gated like production:
          Tim Elit: elite members only (admins can monitor)
          Win Poster: leadership tier (admin / leader / elite / rank above REN) */}
      {(() => {
        const isAdmin = user.role === 'master_admin' || user.role === 'country_admin'
        const canElite = user.isElite || isAdmin
        const canPoster =
          isAdmin || user.role === 'leader' || user.isElite || user.careerRank !== 'REN'
        if (!canElite && !canPoster) return null
        return (
          <div className={clsx('mb-4 grid gap-3', canElite && canPoster ? 'grid-cols-2' : 'grid-cols-1')}>
            {canElite && (
              <Link to="/team/elite" className="block">
                <Card className="h-full cursor-pointer border-accent/40 bg-accent-soft p-3.5 transition-colors duration-200 hover:border-accent">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-on-accent">
                    <Swords size={19} />
                  </div>
                  <p className="flex items-center gap-1 text-sm font-bold">
                    Tim Elit
                    <ChevronRight size={14} className="text-muted" />
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Command Center · {rows.filter((r) => r.isElite).length} Captains
                  </p>
                </Card>
              </Link>
            )}
            {canPoster && (
              <Link to="/team/poster" className="block">
                <Card className="h-full cursor-pointer p-3.5 transition-colors duration-200 hover:border-accent/60">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <ImagePlus size={19} />
                  </div>
                  <p className="flex items-center gap-1 text-sm font-bold">
                    Win Poster
                    <ChevronRight size={14} className="text-muted" />
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Closing poster studio · share wins
                  </p>
                </Card>
              </Link>
            )}
          </div>
        )
      })()}

      {/* Full ranking */}
      <Link to="/team/career" className="block">
        <Card className="lift mb-4 flex cursor-pointer items-center gap-3 p-3.5 hover:border-accent/60">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg">🎖</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Career Path</span>
            <span className="block text-[11px] text-muted">REN → VP builder ranks · your progress to the next rank</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Card>
      </Link>

      <SectionTitle>Full ranking</SectionTitle>
      <Card className="mb-2 divide-y divide-border">
        {rows.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 p-3.5">
            <span
              className={clsx(
                'w-6 text-center font-display text-sm font-extrabold',
                i < 3 ? 'text-accent' : 'text-muted',
              )}
            >
              {i + 1}
            </span>
            <Avatar name={p.name} color={COLORS[i % COLORS.length]} size={38} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold">
                  {p.isElite && p.captainName ? p.captainName : p.name}
                </p>
                {p.isElite && <Medal size={13} className="shrink-0 text-accent" />}
              </div>
              <p className="truncate text-[11px] text-muted">
                {p.team} · {p.rank} · {p.closings} {t('common.closings').toLowerCase()}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-display text-sm font-extrabold">
                {p.points.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted">
                {compactMoney(p.salesVolume, user.country)}
              </p>
            </div>
          </div>
        ))}
        {rest.length === 0 && null}
      </Card>
    </div>
  )
}
