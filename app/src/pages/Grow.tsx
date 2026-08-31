import {
  BookUser,
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
import { supabase, supabaseReady } from '../lib/supabase'
import { useCallback, useEffect, useState } from 'react'
import { Bar, Card, Chip, SectionTitle } from '../components/ui'
import { onbSummary, useOnbLocale, type OnbData } from '../modules/onboarding/GrowOnboarding'
import { acaSummary, type AcaData } from '../modules/academy/Academy'
import { Compass, Lock } from 'lucide-react'

export default function Grow() {
  const { user, t, logout, locale } = useApp()
  const nav = useNavigate()
  const T = useOnbLocale()
  /* one tiny trilingual helper — BM for MY warriors, ID for Indonesia */
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const TILES = [
    { icon: Rocket, title: L('30-Day Closing Challenge', 'Cabaran Closing 30 Hari', 'Tantangan Closing 30 Hari'), sub: L('Live module — enrol now', 'Modul live — daftar sekarang', 'Modul live — daftar sekarang'), accent: true, to: '/challenge' },
    { icon: Camera, title: 'Social Coaching', sub: L('Captions & daily activity', 'Kapsyen & aktiviti harian', 'Caption & aktivitas harian'), to: '/grow/social' },
    { icon: Library, title: L('ATLAS Library', 'Perpustakaan ATLAS', 'Perpustakaan ATLAS'), sub: L('Guides, docs & tools', 'Panduan, dokumen & alat', 'Panduan, dokumen & alat'), to: '/grow/atlas' },
    { icon: BookUser, title: L('Directory', 'Direktori', 'Direktori'), sub: L('Leadership · hotlines · PICs', 'Kepimpinan · talian · PIC', 'Pimpinan · hotline · PIC'), to: '/directory' },
  ]
  /* P0.7 — the /coach card used to be gated on profiles.role, so an Elite Coach
     whose profile role was the default 'agent' could see neither this card nor
     Command HQ. Gate on the canonical resolver instead. */
  const [canCoach, setCanCoach] = useState(false)
  useEffect(() => {
    if (!supabaseReady || !supabase || !user?.id?.includes('-')) { setCanCoach(false); return }
    supabase.rpc('my_challenge_roles').then(({ data }) => {
      setCanCoach(((data ?? []) as string[])
        .some((r) => ['elite_coach', 'master_mentor', 'super_admin'].includes(r)))
    })
  }, [user])

  /* GROW onboarding (learning) — separate from global app onboarding and the
     30-day challenge readiness. Card #1: dominant until complete (spec §3). */
  const [onb, setOnb] = useState<OnbData | null>(null)
  const [aca, setAca] = useState<AcaData | null>(null)
  useEffect(() => {
    if (!supabaseReady || !supabase || !user || !user.id.includes('-')) return
    supabase.rpc('onb_my_program').then(({ data }) => setOnb((data as OnbData) ?? null))
    supabase.rpc('aca_my').then(({ data }) => setAca((data as AcaData) ?? null))
  }, [user])
  /* Real catalogue for a real account. Demo personas keep the showcase list.
     There is no per-agent progress source yet, so the card shows the TARGET
     rather than an invented percentage — a made-up progress bar on someone's
     reward is worse than no bar at all.
     NOTE: these hooks sit ABOVE the early return on purpose — they used to be
     below it, which is a rules-of-hooks violation (oxlint react-hooks). */
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [live, setLive] = useState<{ id: string; title: string; tier: string | null;
    category: string | null; target_label: string | null; poster_path: string | null }[] | null>(null)
  useEffect(() => {
    if (!isReal || !supabase) return
    ;(async () => {
      const { data } = await supabase.from('rewards').select('id,title,tier,category,target_label,poster_path')
        .eq('active', true).order('sort')
      setLive(data ?? [])
    })()
  }, [isReal])

  if (!user) return null
  const sum = onbSummary(onb)
  const aSum = acaSummary(aca)
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
        {/* card #1 — Onboarding. Dominant while incomplete; quiet once done. */}
        {sum && !sum.complete && (
          <Card onClick={() => nav('/grow/onboarding')}
            className="border-accent/60 bg-accent-soft p-4">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
                <BookOpen size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-accent">Onboarding</p>
                <p className="text-xs text-muted">{T(onb!.program.subtitle) || L('Your AG journey starts here', 'Perjalanan AG anda bermula di sini', 'Perjalanan AG kamu dimulai di sini')}</p>
              </div>
              <p className="shrink-0 font-display text-lg font-extrabold text-accent">{sum.pct}%</p>
            </div>
            <Bar pct={sum.pct} className="mb-2" />
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted">{sum.done} / {sum.total} {L('completed', 'selesai', 'selesai')}</span>
              {sum.next && <span className="min-w-0 truncate font-bold">{L('Next', 'Seterusnya', 'Berikutnya')}: {T(sum.next.title)}</span>}
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); nav('/grow/onboarding') }}
              className="mt-2.5 h-10 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent">
              {L('Continue Onboarding →', 'Teruskan Onboarding →', 'Lanjutkan Onboarding →')}
            </button>
          </Card>
        )}
        {/* AG Academy — locked behind onboarding; then it takes card #1 */}
        {sum && !sum.complete && aca && (
          <Card className="flex items-center gap-3 p-4 opacity-70">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface2 text-muted">
              <Lock size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">AG Academy</p>
              <p className="text-xs text-muted">{L('Unlocks after Onboarding — your personalised learning path', 'Terbuka selepas Onboarding — laluan pembelajaran peribadi anda', 'Terbuka setelah Onboarding — jalur belajar personal kamu')}</p>
            </div>
          </Card>
        )}
        {sum?.complete && aSum?.state === 'diagnostic' && (
          <Card onClick={() => nav('/grow/academy')} className="border-accent/60 bg-accent-soft p-4">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
                <Compass size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-accent">AG Academy</p>
                <p className="text-xs text-muted">{L('Discover what to learn next', 'Temui apa yang perlu dipelajari seterusnya', 'Temukan apa yang perlu dipelajari berikutnya')}</p>
              </div>
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); nav('/grow/academy') }}
              className="mt-1.5 h-10 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent">
              {L('Start Learning Diagnostic →', 'Mula Diagnostik Pembelajaran →', 'Mulai Diagnostik Belajar →')}
            </button>
          </Card>
        )}
        {sum?.complete && aSum?.state === 'learning' && (
          <Card onClick={() => nav('/grow/academy')} className="border-accent/60 bg-accent-soft p-4">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
                <Compass size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-accent">AG Academy</p>
                {aSum.focus && <p className="truncate text-xs text-muted">{L('Focus', 'Fokus', 'Fokus')}: {T(aSum.focus.title)}</p>}
              </div>
              <p className="shrink-0 font-display text-lg font-extrabold text-accent">{aSum.pct}%</p>
            </div>
            <Bar pct={aSum.pct} className="mb-2" />
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted">{aSum.done} / {aSum.total} {L('lessons', 'pelajaran', 'pelajaran')}</span>
              {aSum.next && <span className="min-w-0 truncate font-bold">{L('Next', 'Seterusnya', 'Berikutnya')}: {T(aSum.next.title)}</span>}
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); nav('/grow/academy') }}
              className="mt-2.5 h-10 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent">
              {L('Continue Learning →', 'Teruskan Belajar →', 'Lanjutkan Belajar →')}
            </button>
          </Card>
        )}
        {sum?.complete && (
          <Card onClick={() => nav('/grow/onboarding')} className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
              <BookOpen size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">Onboarding</p>
              <p className="text-xs text-success">{L('Completed 🎓 — reopen any lesson anytime', 'Selesai 🎓 — buka semula mana-mana pelajaran bila-bila masa', 'Selesai 🎓 — buka lagi pelajaran kapan saja')}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </Card>
        )}
        {canCoach && (
          <Card onClick={() => nav('/coach')} className="flex items-center gap-3 border-warning/50 bg-warning/10 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
              <GraduationCap size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{L('Coach Review Queue', 'Barisan Semakan Coach', 'Antrean Tinjauan Coach')}</p>
              <p className="text-xs text-muted">{L('Approve readiness & evidence — human only', 'Luluskan kesediaan & bukti — manusia sahaja', 'Setujui kesiapan & bukti — hanya manusia')}</p>
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
        {isReal && live !== null && live.length === 0 && (
          <Card className="p-6 text-center">
            <Gift size={26} className="mx-auto mb-2 text-muted" />
            <p className="text-sm font-bold">{L('No campaigns running yet', 'Belum ada kempen berjalan', 'Belum ada kampanye berjalan')}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
              {L('Reward campaigns appear here once your country admin publishes them.', 'Kempen ganjaran muncul di sini apabila admin negara anda menerbitkannya.', 'Kampanye reward muncul di sini setelah admin negara kamu menerbitkannya.')}
            </p>
          </Card>
        )}
        {isReal && (live ?? []).map((r) => (
          <Card key={r.id} className="overflow-hidden">
            {r.poster_path && (
              <img src={r.poster_path} alt={r.title} loading="lazy"
                className="max-h-56 w-full object-cover" />
            )}
            <div className="p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="truncate text-[15px] font-semibold">{r.title}</p>
              {r.tier && <Chip tone="accent" className="shrink-0">{r.tier}</Chip>}
            </div>
            {(r.category || r.target_label) && (
              <p className="text-xs text-muted">
                {[r.category, r.target_label && `${t('common.target')}: ${r.target_label}`]
                  .filter(Boolean).join(' · ')}
              </p>
            )}
            </div>
          </Card>
        ))}
        {!isReal && rewards.map((r) => (
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
        <LogOut size={16} /> {L('Sign out', 'Log keluar', 'Keluar')}
      </button>
    </div>
  )
}
