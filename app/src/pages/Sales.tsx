/* Sales pipeline. Real accounts: live deals table (RLS scopes rows — agent
   own, leader their team, admin country). Full CRUD: add deal, move stage,
   edit, delete. Closed deals feed career_progress() (062) automatically.
   Demo personas keep the showcase pipeline below. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, ChevronRight, Calculator, X } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { compactMoney, money } from '../lib/format'
import { STAGES, getDeals } from '../lib/mockData'
import { Card, Chip, SectionTitle } from '../components/ui'
import type { DealStage } from '../lib/types'

interface DbDeal {
  id: string; agent_id: string; client_name: string; client_phone: string | null
  project: string | null; unit_no: string | null; price: number; commission: number
  stage: DealStage; stage_changed_at: string; created_at: string
  profiles: { name: string } | null
}

const ago = (iso: string) => {
  const d = Math.round((Date.now() - +new Date(iso)) / 864e5)
  return d <= 0 ? 'today' : d === 1 ? '1d ago' : `${d}d ago`
}

export default function Sales() {
  const { user, t } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [active, setActive] = useState<DealStage | 'all'>('all')
  const [rows, setRows] = useState<DbDeal[]>([])
  const [editing, setEditing] = useState<DbDeal | 'new' | null>(null)
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data } = await supabase.from('deals')
      .select('*, profiles!deals_agent_id_fkey(name)')
      .order('updated_at', { ascending: false }).limit(300)
    setRows((data as unknown as DbDeal[]) ?? [])
  }, [isReal])
  useEffect(() => { load() }, [load])

  if (!user) return null

  const saveDeal = async (d: Partial<DbDeal> & { client_name: string }) => {
    if (!supabase) return
    if (editing === 'new') {
      const { error } = await supabase.from('deals').insert({
        country: user.country, agent_id: user.id, client_name: d.client_name,
        client_phone: d.client_phone || null, project: d.project || null,
        unit_no: d.unit_no || null, price: d.price ?? 0, commission: d.commission ?? 0,
        stage: d.stage ?? 'calling',
      })
      say(error ? `⚠ ${error.message}` : '✅ Deal added')
    } else if (editing) {
      const stageChanged = d.stage && d.stage !== editing.stage
      const { error } = await supabase.from('deals').update({
        client_name: d.client_name, client_phone: d.client_phone || null,
        project: d.project || null, unit_no: d.unit_no || null,
        price: d.price ?? 0, commission: d.commission ?? 0, stage: d.stage,
        ...(stageChanged ? { stage_changed_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id)
      say(error ? `⚠ ${error.message}` : stageChanged && d.stage === 'closed' ? t('sl.closedToast') : 'OK ✓')
    }
    setEditing(null); load()
  }

  const deleteDeal = async (id: string) => {
    if (!supabase || !window.confirm('Delete this deal?')) return
    const { error } = await supabase.from('deals').delete().eq('id', id)
    say(error ? `⚠ ${error.message}` : 'Deleted')
    setEditing(null); load()
  }

  /* demo personas keep the sample pipeline */
  const deals: { id: string; client: string; project: string; unit?: string; agentName: string; ago: string; price: number; commission: number; stage: DealStage }[] =
    isReal
      ? rows.map((r) => ({
          id: r.id, client: r.client_name, project: r.project ?? '—', unit: r.unit_no ?? undefined,
          agentName: r.agent_id === user.id ? 'you' : r.profiles?.name ?? 'agent',
          ago: ago(r.stage_changed_at ?? r.created_at), price: r.price, commission: r.commission, stage: r.stage,
        }))
      : getDeals(user.country)

  const filtered = active === 'all' ? deals : deals.filter((d) => d.stage === active)
  const closedComm = deals.filter((d) => d.stage === 'closed').reduce((s, d) => s + d.commission, 0)
  const pipeline = deals.filter((d) => d.stage !== 'closed')

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          {t('sales.title')}
        </h1>
        <button
          type="button"
          onClick={() => isReal ? setEditing('new') : say('Sign in with a real account to add deals')}
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
            <span className="block text-sm font-bold">{t('sl.calc')}</span>
            <span className="block text-[11px] text-muted">{t('sl.calcSub')}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Card>
      </Link>

      {isReal && (
        <Link to="/pipeline" className="block">
          <Card className="lift mb-4 flex cursor-pointer items-center gap-3 p-3.5 hover:border-accent/60">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Building2 size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{t('sl.chPipeline')}</span>
              <span className="block text-[11px] text-muted">{t('sl.chPipelineSub')}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Card>
        </Link>
      )}

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
              <span className="h-2 w-2 rounded-full" style={{ background: s.tint }} />
              {s.label} · {count}
            </button>
          )
        })}
      </div>

      {/* Funnel strip */}
      {deals.length > 0 && (
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
      )}

      {/* Deal cards */}
      <SectionTitle>{active === 'all' ? t('sl.allDeals') : STAGES.find((s) => s.key === active)?.label}</SectionTitle>
      {isReal && filtered.length === 0 && (
        <Card className="mb-2 p-6 text-center">
          <p className="text-sm font-bold">{t('sl.noDeals')}</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">{t('sl.noDealsBody')}</p>
        </Card>
      )}
      <div className="space-y-2.5 pb-2">
        {filtered.map((d) => {
          const stage = STAGES.find((s) => s.key === d.stage)!
          return (
            <Card
              key={d.id}
              onClick={() => isReal && setEditing(rows.find((r) => r.id === d.id) ?? null)}
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

      {editing && (
        <DealSheet
          deal={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={saveDeal}
          onDelete={editing !== 'new' ? () => deleteDeal(editing.id) : undefined}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-xs font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

/* Add / edit deal — bottom sheet */
function DealSheet({ deal, onClose, onSave, onDelete }: {
  deal: DbDeal | null
  onClose: () => void
  onSave: (d: Partial<DbDeal> & { client_name: string }) => void
  onDelete?: () => void
}) {
  const { t } = useApp()
  const [f, setF] = useState({
    client_name: deal?.client_name ?? '', client_phone: deal?.client_phone ?? '',
    project: deal?.project ?? '', unit_no: deal?.unit_no ?? '',
    price: deal?.price ?? 0, commission: deal?.commission ?? 0,
    stage: (deal?.stage ?? 'calling') as DealStage,
  })
  const inp = 'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent'
  const lbl = 'mb-1 block text-xs font-bold text-muted'
  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-b-0 border-border bg-bg p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-extrabold">{deal ? t('sl.editDeal') : t('sl.newDeal')}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><X size={14} /></button>
        </div>
        <label className={lbl}>{t('sl.client')} *</label>
        <input className={clsx(inp, 'mb-3')} value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} placeholder="—" />
        <label className={lbl}>{t('sl.clientPhone')}</label>
        <input className={clsx(inp, 'mb-3')} type="tel" value={f.client_phone} onChange={(e) => setF({ ...f, client_phone: e.target.value })} placeholder="+60…" />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('sl.project')}</label>
            <input className={inp} value={f.project} onChange={(e) => setF({ ...f, project: e.target.value })} placeholder="—" />
          </div>
          <div>
            <label className={lbl}>{t('sl.unit')}</label>
            <input className={inp} value={f.unit_no} onChange={(e) => setF({ ...f, unit_no: e.target.value })} placeholder="A-12-3" />
          </div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>{t('sl.price')}</label>
            <input className={inp} type="number" value={f.price || ''} onChange={(e) => setF({ ...f, price: Number(e.target.value) || 0 })} placeholder="0" />
          </div>
          <div>
            <label className={lbl}>{t('sl.myComm')}</label>
            <input className={inp} type="number" value={f.commission || ''} onChange={(e) => setF({ ...f, commission: Number(e.target.value) || 0 })} placeholder="0" />
          </div>
        </div>
        <label className={lbl}>{t('sl.stage')}</label>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button key={s.key} type="button" onClick={() => setF({ ...f, stage: s.key })}
              className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold',
                f.stage === s.key ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted')}>
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" disabled={!f.client_name.trim()} onClick={() => onSave(f)}
          className="w-full cursor-pointer rounded-xl bg-accent py-3 text-sm font-bold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40">
          {deal ? t('sl.save') : t('sl.add')}
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete}
            className="mt-2 w-full cursor-pointer rounded-xl border border-danger/40 py-2.5 text-xs font-bold text-danger hover:bg-danger/10">
            {t('sl.delete')}
          </button>
        )}
      </div>
    </div>
  )
}
