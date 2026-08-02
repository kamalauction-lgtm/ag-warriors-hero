/* Career Path — data 1:1 from production career_ladder.json (MY ren / ID indo).
   Clickable ranks → full requirements. Career ladder = REN→VP (GVP is income-only). */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Lock, Users2, User, Wallet, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { compactMoney } from '../lib/format'
import { Bar, Card, Chip } from '../components/ui'

interface Rank {
  code: string; name: string; color: string; personal: number | null; group: number | null
  dn: string | null; focus: string; approval?: boolean; note?: string
}
const COMMON = [
  'Personal & group sales must be converted by 15 January of the subsequent year.',
  'TM and VP ranks require an interview with management and are subject to management approval.',
  'Maintenance: each rank must sustain 50% of its eligibility criteria to hold the rank.',
]
const LADDERS: Record<'MY' | 'ID', Rank[]> = {
  MY: [
    { code: 'VP', name: 'Vice President (VP)', color: '#C8102E', personal: null, group: 250000000, dn: '5 TM', focus: 'Top of the ladder — lead a network of managers. Requires management interview + approval.', approval: true, note: 'KL' },
    { code: 'TM', name: 'Team Manager (TM)', color: '#8C5BB0', personal: null, group: 120000000, dn: '3 HOT', focus: 'Builder rank — you now grow leaders, not just personal sales. Requires management interview + approval.', approval: true },
    { code: 'HOT', name: 'Head of Team (HOT)', color: '#C8A064', personal: 10000000, group: 50000000, dn: '6 REN', focus: 'Peak personal producer — strong personal sales plus a sizeable group.' },
    { code: 'TL', name: 'Team Leader (TL)', color: '#4FA3D1', personal: 5000000, group: 25000000, dn: '3 REN', focus: 'Grow your group sales and expand your direct team.' },
    { code: 'L', name: 'Leader (L)', color: '#CD7F32', personal: 3000000, group: 15000000, dn: '2 REN', focus: 'Your first leadership rung — hit personal sales and start a small team.' },
    { code: 'REN', name: 'REN — Real Estate Negotiator', color: '#C0C0C0', personal: null, group: null, dn: null, focus: 'Start here. Build your first sales and learn the journey.' },
  ],
  ID: [
    { code: 'VP', name: 'Vice President (VP)', color: '#C8102E', personal: null, group: 850000000000, dn: '5 TM', focus: 'Top of the ladder — lead a network of managers. Requires management interview + approval.', approval: true },
    { code: 'TM', name: 'Team Manager (TM)', color: '#8C5BB0', personal: null, group: 400000000000, dn: '3 HOT', focus: 'Builder rank — you now grow leaders, not just personal sales. Requires management interview + approval.', approval: true },
    { code: 'HOT', name: 'Head of Team (HOT)', color: '#C8A064', personal: 30000000000, group: 150000000000, dn: '6 REN', focus: 'Peak personal producer — strong personal sales plus a sizeable group.' },
    { code: 'TL', name: 'Team Leader (TL)', color: '#4FA3D1', personal: 15000000000, group: 60000000000, dn: '3 REN', focus: 'Grow your group sales and expand your direct team.' },
    { code: 'L', name: 'Leader (L)', color: '#CD7F32', personal: 8000000000, group: 30000000000, dn: '2 REN', focus: 'Your first leadership rung — hit personal sales and start a small team.' },
    { code: 'REN', name: 'REN — Real Estate Negotiator', color: '#C0C0C0', personal: null, group: null, dn: null, focus: 'Start here. Build your first sales and learn the journey.' },
  ],
}

export default function Career() {
  const { user } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  if (!user) return null
  const ladder = LADDERS[user.country]
  const myIdx = ladder.findIndex((r) => r.code === user.careerRank)
  const next = myIdx > 0 ? ladder[myIdx - 1] : null
  const fmt = (v: number) => compactMoney(v, user.country)

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/team" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Career Path</h1>
          <p className="text-xs text-muted">{user.country === 'MY' ? '🇲🇾 project sales track' : '🇮🇩 jalur project sales'} · tap a rank for requirements</p>
        </div>
        <Chip tone="accent">{user.careerRank}</Chip>
      </header>

      {/* next-rank hero */}
      {next && (
        <div className="hero-user mb-4 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">Next rank</p>
          <p className="gold-text font-display text-2xl font-extrabold">{next.name}</p>
          <div className="mt-3 space-y-2.5 text-xs">
            {next.group != null && (
              <div>
                <div className="mb-1 flex justify-between"><span>Group sales {fmt(next.group)}</span><b>64%</b></div>
                <Bar pct={64} />
              </div>
            )}
            {next.personal != null && (
              <div>
                <div className="mb-1 flex justify-between"><span>Personal sales {fmt(next.personal)}</span><b>81%</b></div>
                <Bar pct={81} />
              </div>
            )}
            {next.dn && <p className="text-[11px] text-[#c9c2a8]">+ downline: {next.dn}{next.approval ? ' · interview + approval required' : ''}</p>}
          </div>
        </div>
      )}

      {/* ladder — clickable */}
      <div className="space-y-2.5">
        {ladder.map((r, i) => {
          const mine = r.code === user.careerRank
          const isOpen = open === r.code
          const builder = r.code === 'TM' || r.code === 'VP'
          return (
            <div key={r.code}>
              {r.code === 'TM' && (
                <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 p-2.5 text-[11px] font-semibold">
                  🧠 <b>Builder ranks</b> — from TM upward, personal sales are no longer the target. Your job becomes growing and leading other leaders.
                </div>
              )}
              <Card
                onClick={() => setOpen(isOpen ? null : r.code)}
                className={clsx('overflow-hidden', mine && 'border-accent')}
              >
                <div className="flex items-center gap-3 p-3.5">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-xs font-extrabold text-white"
                    style={{ background: `linear-gradient(160deg, ${r.color}, ${r.color}99)` }}
                  >
                    {r.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {r.name} {mine && <Chip tone="accent">you</Chip>} {builder && <Lock size={11} className="inline text-muted" />}
                    </p>
                    <p className="text-[11px] text-muted">
                      {r.group != null ? `group ${fmt(r.group)}${r.note ? ` (${r.note})` : ''}` : 'entry rank'}
                      {r.dn ? ` · ${r.dn}` : ''}
                    </p>
                  </div>
                  <ChevronDown size={16} className={clsx('shrink-0 text-muted transition-transform duration-200', isOpen && 'rotate-180')} />
                </div>
                {isOpen && (
                  <div className="animate-rise border-t border-border bg-surface2/40 p-4">
                    <p className="mb-3 text-xs italic leading-relaxed text-muted">"{r.focus}"</p>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><User size={11} /> Personal sales</p>
                        <p className="font-display text-sm font-extrabold">{r.personal != null ? fmt(r.personal) : '—'}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><Wallet size={11} /> Group sales</p>
                        <p className="font-display text-sm font-extrabold">{r.group != null ? fmt(r.group) : '—'}{r.note ? ` (${r.note})` : ''}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><Users2 size={11} /> Downline</p>
                        <p className="font-display text-sm font-extrabold">{r.dn ?? '—'}</p>
                      </div>
                      <div className="rounded-xl bg-surface p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted"><ShieldCheck size={11} /> Maintenance</p>
                        <p className="font-display text-sm font-extrabold">{i === ladder.length - 1 ? '—' : '50% of criteria'}</p>
                      </div>
                    </div>
                    {r.approval && (
                      <p className="mt-2.5 rounded-lg border border-warning/50 bg-warning/10 p-2 text-[11px] font-bold text-warning">
                        🔏 Requires management interview + approval
                      </p>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )
        })}
      </div>

      {/* common rules */}
      <Card className="mb-4 mt-4 p-4">
        <p className="mb-2 border-l-2 border-accent pl-2 font-display text-sm font-extrabold">Rules of the track</p>
        {COMMON.map((c) => (
          <p key={c} className="mb-1.5 text-[11px] leading-relaxed text-muted">• {c}</p>
        ))}
      </Card>
    </div>
  )
}
