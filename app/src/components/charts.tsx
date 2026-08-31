/* Shared inline-SVG chart primitives — no chart library, theme-aware via CSS vars.
   CallerAdmin keeps its own private copies on purpose: it is live and working, and
   this close to launch it is not worth refactoring a screen that already ships. */

export const PALETTE = ['#d4ac4a', '#4f9cf9', '#43c59e', '#f4826d', '#a78bfa', '#f2b544', '#6ee7b7', '#fb7185', '#60a5fa', '#facc15', '#94a3b8']

export interface Datum { label: string; value: number }

/* Turns a score key like `ent.risk_tolerance` into `Risk tolerance`.
   Deliberately generic so new question banks need no label table. */
export function prettyKey(key: string): string {
  const tail = key.includes('.') ? key.slice(key.indexOf('.') + 1) : key
  const words = tail.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/* showTotal: the centre number is only meaningful when the values genuinely sum
   to something (counts of people). For 0-100 scores the sum is noise, so it is
   suppressed and the segment count is shown instead. */
export function Donut({ data, size = 168, unit = '', showTotal = true }: {
  data: Datum[]; size?: number; unit?: string; showTotal?: boolean
}) {
  const total = data.reduce((t, d) => t + d.value, 0) || 1
  const r = size / 2 - 14, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} role="img" aria-label={`${unit || 'value'} distribution`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={18} />
        {data.map((d, i) => {
          const frac = d.value / total
          const el = (
            <circle key={`${d.label}-${i}`} cx={cx} cy={cy} r={r} fill="none" stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={18} strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-acc * C} transform={`rotate(-90 ${cx} ${cy})`}>
              <title>{d.label}: {d.value} ({Math.round(frac * 100)}%)</title>
            </circle>
          )
          acc += frac
          return el
        })}
        {showTotal && (
          <text x={cx} y={cy - 2} textAnchor="middle" className="fill-ink" style={{ fontSize: 22, fontWeight: 800 }}>{total}</text>
        )}
        {unit && <text x={cx} y={showTotal ? cy + 16 : cy + 4} textAnchor="middle" className="fill-muted" style={{ fontSize: 10 }}>{unit}</text>}
      </svg>
      <ul className="min-w-[150px] flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={`${d.label}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="flex-1 truncate text-muted">{d.label}</span>
            <b>{d.value}</b>
            <span className="w-9 text-right text-[10px] text-muted">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* Counts: bar length is relative to the largest value in the set. */
export function Bars({ data, onPick, suffix = '' }: { data: Datum[]; onPick?: (l: string) => void; suffix?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (!data.length) return <p className="py-4 text-center text-xs text-muted">No data yet.</p>
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <button key={`${d.label}-${i}`} type="button" onClick={() => onPick?.(d.label)}
          className={`flex w-full items-center gap-2 text-left text-xs ${onPick ? 'cursor-pointer' : 'cursor-default'}`}>
          <span className="w-36 shrink-0 truncate text-muted" title={d.label}>{d.label}</span>
          <span className="h-4 flex-1 overflow-hidden rounded bg-surface2">
            <span className="block h-full rounded transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
          </span>
          <b className="w-12 text-right">{d.value}{suffix}</b>
        </button>
      ))}
    </div>
  )
}

/* Scores: the scale is a fixed 0–100, so a weak group reads as weak rather than
   being stretched to fill the bar the way a relative scale would. */
export function ScoreBars({ data, tone = 'accent' }: { data: Datum[]; tone?: 'accent' | 'warn' }) {
  if (!data.length) return <p className="py-4 text-center text-xs text-muted">Not enough completed attempts yet.</p>
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-xs">
          <span className="w-36 shrink-0 truncate text-muted" title={d.label}>{d.label}</span>
          <span className="h-4 flex-1 overflow-hidden rounded bg-surface2">
            <span className="block h-full rounded transition-all duration-500"
              style={{ width: `${Math.max(0, Math.min(100, d.value))}%`,
                       background: tone === 'warn' ? '#f4826d' : 'var(--accent)' }} />
          </span>
          <b className="w-12 text-right">{d.value}</b>
        </div>
      ))}
    </div>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  )
}
