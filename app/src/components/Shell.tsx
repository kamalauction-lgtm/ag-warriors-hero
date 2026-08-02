import { NavLink, useLocation } from 'react-router-dom'
import {
  Sunrise,
  TrendingUp,
  Target,
  Users,
  Sprout,
  ShieldCheck,
} from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useApp } from '../lib/store'

const TABS = [
  { to: '/', key: 'nav.myday', icon: Sunrise },
  { to: '/sales', key: 'nav.sales', icon: TrendingUp },
  { to: '/leads', key: 'nav.leads', icon: Target },
  { to: '/team', key: 'nav.team', icon: Users },
  { to: '/grow', key: 'nav.grow', icon: Sprout },
]

export default function Shell({ children }: { children: ReactNode }) {
  const { t, user } = useApp()
  const location = useLocation()
  const isAdmin =
    user && (user.role === 'master_admin' || user.role === 'country_admin')

  return (
    <div className="mx-auto flex h-full max-w-lg flex-col md:max-w-5xl">
      <main className="flex-1 overflow-y-auto pb-24" key={location.pathname}>
        {children}
      </main>

      <nav
        aria-label="Main navigation"
        className="safe-b fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/90 backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around md:max-w-5xl">
          {TABS.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex min-w-[56px] flex-col items-center gap-0.5 px-2 pb-2 pt-2.5 text-[10px] font-semibold transition-colors duration-200',
                  isActive ? 'text-accent' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200',
                      isActive && 'bg-accent-soft',
                    )}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {t(key)}
                </>
              )}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                clsx(
                  'flex min-w-[56px] flex-col items-center gap-0.5 px-2 pb-2 pt-2.5 text-[10px] font-semibold transition-colors duration-200',
                  isActive ? 'text-accent' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200',
                      isActive && 'bg-accent-soft',
                    )}
                  >
                    <ShieldCheck size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  Admin
                </>
              )}
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  )
}
