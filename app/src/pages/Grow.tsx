import {
  BookOpen,
  Camera,
  GraduationCap,
  Gift,
  Library,
  Rocket,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { getRewards } from '../lib/mockData'
import { Bar, Card, Chip, SectionTitle } from '../components/ui'

const TILES = [
  { icon: Rocket, title: '30-Day Closing Challenge', sub: 'Live module — enrol now', accent: true, to: '/challenge' },
  { icon: GraduationCap, title: 'AG Academy', sub: 'Playbook · Calling → Closing' },
  { icon: Camera, title: 'Social Coaching', sub: 'Captions & daily activity' },
  { icon: Library, title: 'ATLAS Library', sub: 'Guides, docs & tools' },
  { icon: BookOpen, title: 'Onboarding', sub: 'Completed ✓' },
]

export default function Grow() {
  const { user, t, logout } = useApp()
  const nav = useNavigate()
  if (!user) return null
  const rewards = getRewards(user.country)

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          {t('grow.title')}
        </h1>
        <p className="mt-0.5 text-xs text-muted">
          Become Better · Build Better · Give Better
        </p>
      </header>

      <div className="mb-4 space-y-2.5">
        {(user.role === 'master_admin' || user.role === 'country_admin' || user.role === 'leader') && (
          <Card onClick={() => nav('/coach')} className="flex items-center gap-3 border-warning/50 bg-warning/10 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
              <GraduationCap size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Coach Review Queue</p>
              <p className="text-xs text-muted">Approve readiness & evidence — human only</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Card>
        )}
        {TILES.map((tile) => (
          <Card
            key={tile.title}
            onClick={() => { if ('to' in tile && tile.to) nav(tile.to) }}
            className={
              tile.accent
                ? 'flex items-center gap-3 border-accent/40 bg-accent-soft p-4'
                : 'flex items-center gap-3 p-4'
            }
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <tile.icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{tile.title}</p>
              <p className="text-xs text-muted">{tile.sub}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Card>
        ))}
      </div>

      <SectionTitle
        action={
          <Chip tone="accent">
            <Gift size={11} /> {user.country === 'MY' ? 'Malaysia' : 'Indonesia'}
          </Chip>
        }
      >
        Rewards 2026
      </SectionTitle>
      <div className="space-y-2.5 pb-4">
        {rewards.map((r) => (
          <Card key={r.id} onClick={() => {}} className="p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="truncate text-[15px] font-semibold">{r.title}</p>
              <Chip tone="accent" className="shrink-0">{r.tier}</Chip>
            </div>
            <p className="mb-2.5 text-xs text-muted">
              {r.category} · {t('common.target')}: {r.targetLabel}
            </p>
            <div className="flex items-center gap-3">
              <Bar pct={r.progress} className="flex-1" />
              <span className="font-display text-sm font-extrabold text-accent">
                {r.progress}%
              </span>
            </div>
          </Card>
        ))}
      </div>

      <button
        type="button"
        onClick={logout}
        className="mb-2 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-muted transition-colors duration-200 hover:border-danger/50 hover:text-danger"
      >
        <LogOut size={16} /> Sign out
      </button>
    </div>
  )
}
