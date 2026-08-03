/* Honest placeholder for zones that are still prototypes.
   Shown to REAL accounts so nobody mistakes sample data for their own.
   Demo personas keep the full showcase. */
import { Link } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { Card } from './ui'

export default function ComingSoon({ title, what, when }: { title: string; what: string; when?: string }) {
  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-xs text-muted">IQI AG Hero</p>
      </header>
      <Card className="p-6 text-center">
        <Hammer size={26} className="mx-auto mb-3 text-muted" />
        <p className="font-display text-base font-extrabold">Coming soon</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{what}</p>
        {when && <p className="mx-auto mt-2 max-w-xs text-xs text-muted">{when}</p>}
        <Link to="/challenge"
          className="mt-4 inline-flex h-11 cursor-pointer items-center justify-center rounded-xl bg-accent px-5 text-sm font-extrabold text-on-accent no-underline">
          Go to my Challenge →
        </Link>
      </Card>
      <p className="mt-3 text-center text-[11px] text-muted">
        We only show numbers that are real. Nothing here yet — so nothing is shown.
      </p>
    </div>
  )
}
