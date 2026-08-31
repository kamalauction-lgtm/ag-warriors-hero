import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Crown, ImagePlus, Medal, Swords } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { compactMoney } from '../lib/format'
import { getLeaders } from '../lib/mockData'
import { Avatar, Card, SectionTitle } from '../components/ui'
import BoothDuty from '../modules/booths/BoothDuty'

const COLORS = ['#e0a52f', '#8b5cf6', '#10b981', '#3b82f6', '#f43f5e', '#14b8a6']

export default function Team() {
  const { user, t, locale } = useApp()
  /* one tiny trilingual helper — BM for MY warriors, ID for Indonesia */
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [board, setBoard] = useState<{ id: string; name: string; xp: number }[]>([])

  const loadBoard = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data } = await supabase.from('points_ledger')
      .select('user_id, amount, profiles!points_ledger_user_id_fkey(name)').eq('status', 'verified')
    const agg: Record<string, { id: string; name: string; xp: number }> = {}
    ;((data ?? []) as unknown as { user_id: string; amount: number; profiles: { name: string } | null }[])
      .forEach((r) => {
        agg[r.user_id] = { id: r.user_id, name: r.profiles?.name ?? 'Warrior', xp: (agg[r.user_id]?.xp ?? 0) + r.amount }
      })
    setBoard(Object.values(agg).sort((a, b) => b.xp - a.xp))
  }, [isReal])
  useEffect(() => { loadBoard() }, [loadBoard])

  if (!user) return null

  // Real accounts: leaderboard built from human-verified XP only.
  if (isReal) return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight">{t('team.title')}</h1>
        <p className="text-xs text-muted">{L('Verified XP only · 30 Days Closing Challenge', 'XP disahkan sahaja · Cabaran Closing 30 Hari', 'Hanya XP terverifikasi · Tantangan Closing 30 Hari')}</p>
      </header>
      <Card className="mb-3 divide-y divide-border">
        {board.length === 0 && (
          <p className="p-5 text-center text-xs text-muted">
            {L('No verified XP yet. The board fills as Coaches approve real work 🔥', 'Belum ada XP disahkan. Papan ini terisi apabila Coach meluluskan kerja sebenar 🔥', 'Belum ada XP terverifikasi. Papan terisi saat Coach menyetujui kerja nyata 🔥')}
          </p>
        )}
        {board.map((b, i) => (
          <div key={b.id} className={clsx('flex items-center gap-3 p-3', b.id === user.id && 'bg-accent-soft')}>
            <span className="w-6 text-center font-display font-extrabold">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
            <Avatar name={b.name} color={COLORS[i % COLORS.length]} size={32} />
            <span className="flex-1 text-sm font-semibold">{b.name}{b.id === user.id ? ` (${L('you', 'anda', 'kamu')})` : ''}</span>
            <span className="font-display text-sm font-extrabold text-accent">{b.xp} XP</span>
          </div>
        ))}
      </Card>
      <Link to="/team/career" className="block">
        <Card className="flex items-center gap-3 p-4">
          <Medal size={18} className="text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{L('Career Path', 'Laluan Kerjaya', 'Jenjang Karier')}</p>
            <p className="text-[11px] text-muted">{L('REN → GVP ladder · your progress to the next rank', 'Tangga REN → GVP · kemajuan anda ke pangkat seterusnya', 'Tangga REN → GVP · progres kamu ke peringkat berikutnya')}</p>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </Card>
      </Link>
      {(user.isElite || user.role === 'master_admin' || user.role === 'country_admin') && (
        <Link to="/team/elite" className="mt-3 block">
          <Card className="flex items-center gap-3 border-accent/40 bg-accent-soft p-4">
            <Swords size={18} className="text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{L('Tim Elit Command', 'Komando Tim Elit', 'Komando Tim Elit')}</p>
              <p className="text-[11px] text-muted">{L('Pods · captain board · balang', 'Pod · papan kapten · balang', 'Pod · papan kapten · balang')}</p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Card>
        </Link>
      )}
      {(user.role !== 'agent' || user.isElite || user.careerRank !== 'REN') && (
        <Link to="/team/poster" className="mt-3 block">
          <Card className="flex items-center gap-3 p-4">
            <ImagePlus size={18} className="text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Win Poster Studio</p>
              <p className="text-[11px] text-muted">{L('Closing posters — leadership', 'Poster closing — kepimpinan', 'Poster closing — pimpinan')}</p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Card>
        </Link>
      )}
      <div className="mt-4">
        <BoothDuty />
      </div>
    </div>
  )
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
                    {L('Command Center', 'Pusat Komando', 'Pusat Komando')} · {rows.filter((r) => r.isElite).length} {L('Captains', 'Kapten', 'Kapten')}
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
                    {L('Closing poster studio · share wins', 'Studio poster closing · kongsi kemenangan', 'Studio poster closing · bagikan kemenangan')}
                  </p>
                </Card>
              </Link>
            )}
          </div>
        )
      })()}

      {/* Booth duty — self signup (schema 043, UI new) */}
      <BoothDuty />

      {/* Full ranking */}
      <Link to="/team/career" className="block">
        <Card className="lift mb-4 flex cursor-pointer items-center gap-3 p-3.5 hover:border-accent/60">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg">🎖</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">{L('Career Path', 'Laluan Kerjaya', 'Jenjang Karier')}</span>
            <span className="block text-[11px] text-muted">{L('REN → VP builder ranks · your progress to the next rank', 'Pangkat pembina REN → VP · kemajuan anda ke pangkat seterusnya', 'Peringkat builder REN → VP · progres kamu ke peringkat berikutnya')}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </Card>
      </Link>

      <SectionTitle>{L('Full ranking', 'Kedudukan penuh', 'Peringkat lengkap')}</SectionTitle>
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
