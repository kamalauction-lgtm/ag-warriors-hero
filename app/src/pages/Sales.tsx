import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, ChevronRight, Calculator } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabaseReady } from '../lib/supabase'
import { compactMoney, money } from '../lib/format'
import { STAGES, getDeals } from '../lib/mockData'
import { Card, Chip, SectionTitle } from '../components/ui'
import type { DealStage } from '../lib/types'

export default function Sales() {
  const { user, t } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [active, setActive] = useState<DealStage | 'all'>('all')
  if (!user) return null

  const deals = getDeals(user.country)
  const filtered = active === 'all' ? deals : deals.filter((d) => d.stage === active)
  const closedComm = deals
    .filter((d) => d.stage === 'closed')
    .reduce((s, d) => s + d.commission, 0)
  const pipeline = deals.filter((d) => d.stage !== 'closed')

  // Real accounts: the deal pipeline is not wired to the database yet, so we show
  // nothing rather than sample deals. The Income Calculator below is fully working.
  if (isReal) return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight">{t('sales.title')}</h1>
        <p className="text-xs text-muted">IQI AG Hero</p>
      </header>
      <Link to="/sales/income" className="mb-3 block">
        <Card className="flex items-center gap-3 p-4">
          <Calculator size={20} className="text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Income Calculator</p>
            <p className="text-[11px] text-muted">Primary + Subsale · full MY calculation — ready to use</p>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </Card>
      </Link>
      <Link to="/pipeline" className="mb-3 block">
        <Card className="flex items-center gap-3 p-4">
          <Building2 size={20} className="text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">My Challenge Pipeline</p>
            <p className="text-[11px] text-muted">Leads, appointments and human-verified closings</p>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </Card>
      </Link>
      <Card className="p-5 text-center">
        <p className="text-sm font-bold">Full deal pipeline — coming soon</p>
        <p className="mx-auto mt-2 max-w-xs text-xs text-muted">
          Company-wide deals and commission tracking arrive after Cohort 1. Until then your
          challenge pipeline above is the live one — and we only show real numbers.
        </p>
      </Card>
    </div>
  )

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          {t('sales.title')}
        </h1>
        <button
          type="button"
          className="flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-on-accent transition-opacity duration-200 hover:opacity-90"
        >
          <Plus size={16} strokeWidth={2.6} /> {t('common.addDeal')}
        </button>
      </header>

      {/* Summary — brand moment */}
      <div className="hero-user mb-4 p-4">
        <div className="relative flex divide-x divide-white/10">
          <div className="flex-1 pr-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">
              {t('common.pipeline')} ({pipeline.length})
            </p>
            <p className="gold-text mt-1 font-display text-2xl font-extrabold">
              {compactMoney(pipeline.reduce((s, d) => s + d.price, 0), user.country)}
            </p>
          </div>
          <div className="flex-1 pl-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#c9c2a8]">
              {t('common.commission')} ✓
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-success">
              {compactMoney(closedComm, user.country)}
            </p>
          </div>
        </div>
      </div>

      {/* Income calculator — same engine as deal commissions */}
      <Link to="/sales/income" className="block">
        <Card className="lift mb-4 flex cursor-pointer items-center gap-3 p-3.5 hover:border-accent/60">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Calculator size={19} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Income Calculator</span>
            <span className="block text-[11px] text-muted">
              {user.country === 'MY'
                ? 'Primary + Subsale · full MY calculation'
                : 'ID structure — set in admin settings soon'}
            </span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Card>
      </Link>

      {/* Stage rail — the AG playbook */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => setActive('all')}
          className={clsx(
            'shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-xs font-bold transition-colors duration-200',
            active === 'all'
              ? 'border-accent bg-accent text-on-accent'
              : 'border-border bg-surface text-muted hover:text-ink',
          )}
        >
          All · {deals.length}
        </button>
        {STAGES.map((s) => {
          const count = deals.filter((d) => d.stage === s.key).length
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              className={clsx(
                'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-colors duration-200',
                active === s.key
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-border bg-surface text-muted hover:text-ink',
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.tint }}
              />
              {s.label} · {count}
            </button>
          )
        })}
      </div>

      {/* Funnel strip */}
      <Card className="mb-4 p-3.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full">
          {STAGES.map((s) => {
            const count = deals.filter((d) => d.stage === s.key).length
            if (!count) return null
            return (
              <div
                key={s.key}
                style={{ width: `${(count / deals.length) * 100}%`, background: s.tint }}
                title={`${s.label}: ${count}`}
              />
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Calling → Follow-Up → Appointment → Booking → Loan → Closed
        </p>
      </Card>

      {/* Deal cards */}
      <SectionTitle>{active === 'all' ? 'All deals' : STAGES.find((s) => s.key === active)?.label}</SectionTitle>
      <div className="space-y-2.5 pb-2">
        {filtered.map((d) => {
          const stage = STAGES.find((s) => s.key === d.stage)!
          return (
            <Card
              key={d.id}
              onClick={() => {}}
              className="flex items-center gap-3 p-3.5"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${stage.tint}1f`, color: stage.tint }}
              >
                <Building2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[15px] font-semibold">{d.client}</p>
                  <Chip className="shrink-0" tone={d.stage === 'closed' ? 'success' : 'default'}>
                    {stage.label}
                  </Chip>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {d.project}
                  {d.unit ? ` · ${d.unit}` : ''} · {d.agentName} · {d.ago}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-sm font-extrabold">
                  {compactMoney(d.price, user.country)}
                </p>
                <p className="text-[11px] font-semibold text-success">
                  +{money(d.commission, user.country)}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Card>
          )
        })}
      </div>
    </div>
  )
}
