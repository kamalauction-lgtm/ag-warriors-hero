import type { ReactNode } from 'react'
import clsx from 'clsx'

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-xl border border-border bg-surface',
        onClick &&
          'cursor-pointer transition-colors duration-200 hover:border-accent/50 active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('mb-3 flex items-center justify-between', className)}>
      <h2 className="font-display text-[15px] font-bold tracking-tight">{children}</h2>
      {action}
    </div>
  )
}

export function Chip({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode
  tone?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}) {
  const tones: Record<string, string> = {
    default: 'bg-surface2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/12 text-warning',
    danger: 'bg-danger/12 text-danger',
    info: 'bg-info/12 text-info',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Avatar({
  name,
  color,
  size = 40,
  className,
}: {
  name: string
  color: string
  size?: number
  className?: string
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <div
      aria-hidden
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white',
        className,
      )}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

export function ProgressRing({
  pct,
  size = 64,
  stroke = 6,
  label,
}: {
  pct: number
  size?: number
  stroke?: number
  label?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-sm font-extrabold">{Math.round(pct)}%</span>
        {label && <span className="text-[9px] text-muted">{label}</span>}
      </div>
    </div>
  )
}

export function Bar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-surface2', className)}>
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${Math.min(100, pct)}%`, transition: 'width 0.5s ease' }}
      />
    </div>
  )
}
