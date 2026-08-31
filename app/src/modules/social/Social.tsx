/* GROW → Social Coaching (old M2, evolved) — the daily content coach.
   One mission a day, copy-ready captions with {project} auto-fill, honest
   handoff (posting happens on the platforms — no fake publisher), and a
   SELF-DECLARED streak worth a small provisional reward. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Flame, Camera, MessageCircle, Sparkles, Wand2, Undo2, Palette } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'
import { useTLocale, useL, type TX } from '../learn/LessonEngine'

interface Caption { id: number; category: string; text: TX; tip: TX | null; sort: number }
interface Mission { dow: number; category: string; title: TX; brief: TX }
interface Mine { declared_today: boolean; streak: number; social_xp: number; last7: number }

export const CATS: { key: string; label: { en: string; ms: string; id: string }; emoji: string }[] = [
  { key: 'property', label: { en: 'Property', ms: 'Hartanah', id: 'Properti' }, emoji: '🏡' },
  { key: 'education', label: { en: 'Education', ms: 'Edukasi', id: 'Edukasi' }, emoji: '📚' },
  { key: 'testimonial', label: { en: 'Testimonial', ms: 'Testimoni', id: 'Testimoni' }, emoji: '⭐' },
  { key: 'market', label: { en: 'Market Update', ms: 'Info Pasaran', id: 'Update Pasar' }, emoji: '📈' },
  { key: 'recruitment', label: { en: 'Recruitment', ms: 'Perekrutan', id: 'Rekrutmen' }, emoji: '🤝' },
  { key: 'activity', label: { en: 'Daily Activity', ms: 'Aktiviti Harian', id: 'Aktivitas Harian' }, emoji: '💪' },
  { key: 'branding', label: { en: 'Personal Branding', ms: 'Jenama Peribadi', id: 'Personal Branding' }, emoji: '✨' },
]

export default function Social() {
  const { user, locale } = useApp()
  const T = useTLocale()
  const L = useL()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [captions, setCaptions] = useState<Caption[]>([])
  const [mission, setMission] = useState<Mission | null>(null)
  const [mine, setMine] = useState<Mine | null>(null)
  const [projects, setProjects] = useState<string[]>([])
  const [project, setProject] = useState('')
  const [cat, setCat] = useState<string>('')
  const [copied, setCopied] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [polished, setPolished] = useState<Record<number, string>>({})
  const [polishing, setPolishing] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  const nav = useNavigate()
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }
  const canPoster = user && (user.role === 'master_admin' || user.role === 'country_admin'
    || user.role === 'leader' || user.isElite || user.careerRank !== 'REN')

  const load = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    const dow = new Date().getDay()
    const [c, m, me, g] = await Promise.all([
      supabase.from('social_captions').select('id,category,text,tip,sort')
        .eq('status', 'published').order('category').order('sort'),
      supabase.from('social_missions').select('*').eq('dow', dow).eq('active', true),
      supabase.rpc('social_mine'),
      supabase.from('m4u_grants').select('active,approved,m4u_properties(name)').eq('agent_id', user.id),
    ])
    setCaptions((c.data as Caption[]) ?? [])
    const ms = (m.data as Mission[]) ?? []
    const todays = ms.find((x) => (x as Mission & { country_scope?: string }).country_scope !== 'ALL') ?? ms[0]
    setMission(todays ?? null)
    setMine((me.data as Mine) ?? null)
    const names = (((g.data ?? []) as unknown as { active: boolean; approved: boolean; m4u_properties: { name: string } | null }[])
      .filter((x) => x.approved && x.active && x.m4u_properties)
      .map((x) => x.m4u_properties!.name)).filter((n) => !n.startsWith('__'))
    setProjects(names)
    setProject((p) => p || names[0] || '')
    if (todays) setCat((k) => k || todays.category)
  }, [isReal, user])
  useEffect(() => { load() }, [load])

  const fill = useCallback((t: string) =>
    t.replaceAll('{project}', project || L('your project', 'projek anda', 'proyek Anda')), [project, L])

  const capText = (c: Caption) => polished[c.id] ?? fill(T(c.text))

  const copy = async (c: Caption) => {
    await navigator.clipboard.writeText(capText(c))
    setCopied(c.id)
    setTimeout(() => setCopied(null), 2000)
  }

  /* AI rewrite "in my voice" — optional; the seed caption always stands */
  const polish = async (c: Caption) => {
    if (!supabase || !user) return
    setPolishing(c.id)
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch('https://m4u-api.iqiaggroup.workers.dev/social/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ text: fill(T(c.text)), name: user.name, project,
          lang: locale === 'bm' ? 'ms' : locale }),
      })
      const out = await res.json()
      if (out.generated_by === 'ai' && out.text) {
        setPolished((p) => ({ ...p, [c.id]: out.text }))
        say('✨ ' + L('Rewritten in your voice — edit before posting', 'Ditulis semula dalam suara anda — semak sebelum post', 'Ditulis ulang dengan suara Anda — periksa sebelum posting'))
      } else {
        say(L('AI busy — the original caption is still great', 'AI sibuk — caption asal tetap mantap', 'AI sibuk — caption asli tetap bagus'))
      }
    } catch { say(L('AI unavailable right now', 'AI tidak tersedia sekarang', 'AI tidak tersedia sekarang')) }
    setPolishing(null)
  }

  const declare = async () => {
    if (!supabase) return
    setBusy(true)
    const { data, error } = await supabase.rpc('social_declare',
      { p_category: cat || mission?.category || null })
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    const out = data as { streak: number; social_xp: number }
    say(`🔥 ${L('Streak', 'Streak', 'Streak')} ${out.streak} ${L('days', 'hari', 'hari')} · +5 XP`)
    load()
  }

  const catLabel = (k: string) => {
    const c = CATS.find((x) => x.key === k)
    return c ? c.label[locale === 'bm' ? 'ms' : locale === 'id' ? 'id' : 'en'] : k
  }
  const shown = useMemo(() => captions.filter((c) => !cat || c.category === cat), [captions, cat])
  const hasProjectVar = shown.some((c) => (c.text?.en ?? '').includes('{project}'))

  if (!user) return null

  return (
    <div className="animate-rise px-4 pt-5 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/grow" aria-label="Back"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">
            <Camera size={18} className="mr-1 inline text-accent" /> Social Coaching
          </h1>
          <p className="text-xs text-muted">
            {L('Captions & daily consistency', 'Caption & konsistensi harian', 'Caption & konsistensi harian')}
          </p>
        </div>
        {mine && mine.streak > 0 && (
          <Chip tone="warning"><Flame size={11} /> {mine.streak} {L('days', 'hari', 'hari')}</Chip>
        )}
      </header>

      {/* today's mission */}
      {mission && (
        <div className="hero-user mb-4 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#c9c2a8]">
            {L("Today's mission", 'Misi hari ini', 'Misi hari ini')}
          </p>
          <p className="gold-text font-display text-lg font-extrabold">{T(mission.title)}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#c9c2a8]">{T(mission.brief)}</p>
          <button type="button" onClick={() => setCat(mission.category)}
            className="mt-2.5 cursor-pointer rounded-full bg-[#d4ac4a] px-4 py-2 text-xs font-extrabold text-[#151821]">
            {L('See captions', 'Lihat caption', 'Lihat caption')} → {catLabel(mission.category)}
          </button>
        </div>
      )}

      {/* declare */}
      <Card className={clsx('mb-4 p-3.5', mine?.declared_today ? 'border-success/40' : 'border-accent/40')}>
        {mine?.declared_today ? (
          <p className="flex items-center gap-2 text-sm font-bold text-success">
            <Check size={16} /> {L('Posted today — streak alive!', 'Sudah post hari ini — streak hidup!', 'Sudah posting hari ini — streak hidup!')}
            <span className="ml-auto text-xs font-normal text-muted">{mine.social_xp} XP · {mine.last7}/7 {L('this week', 'minggu ini', 'minggu ini')}</span>
          </p>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={declare}
              className="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              📣 {L('I posted today', 'Saya dah post hari ini', 'Saya sudah posting hari ini')} (+5 XP)
            </button>
            <p className="mt-1.5 text-center text-[10px] text-muted">
              {L('Self-declared — your Coach sees your consistency, not the post itself.',
                 'Isytihar sendiri — Coach anda nampak konsistensi, bukan post itu sendiri.',
                 'Deklarasi sendiri — Coach Anda melihat konsistensi, bukan postingannya.')}
            </p>
          </>
        )}
      </Card>

      {/* project auto-fill */}
      {projects.length > 0 && hasProjectVar && (
        <div className="mb-3 flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-bold text-muted">{L('My project', 'Projek saya', 'Proyek saya')}:</span>
          <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project"
            className="h-9 min-w-0 flex-1 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs font-semibold outline-none">
            {projects.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}

      {/* categories */}
      <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => setCat(cat === c.key ? '' : c.key)}
            className={clsx('shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
              cat === c.key ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
            {c.emoji} {catLabel(c.key)}
          </button>
        ))}
      </div>

      {/* captions */}
      {shown.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted">
          {L('No captions here yet — admin adds them in Command HQ.', 'Belum ada caption di sini — admin tambah di Command HQ.', 'Belum ada caption di sini — admin menambahkannya di Command HQ.')}
        </Card>
      )}
      {shown.map((c) => (
        <Card key={c.id} className="mb-3 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Chip tone="accent">{CATS.find((x) => x.key === c.category)?.emoji} {catLabel(c.category)}</Chip>
          </div>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{capText(c)}</p>
          {polished[c.id] && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-accent">
              <Wand2 size={11} /> {L('AI version — check before posting', 'Versi AI — semak sebelum post', 'Versi AI — periksa sebelum posting')}
              <button type="button"
                onClick={() => setPolished((p) => { const q = { ...p }; delete q[c.id]; return q })}
                className="ml-1 flex cursor-pointer items-center gap-1 text-muted underline hover:text-ink">
                <Undo2 size={10} /> {L('original', 'asal', 'asli')}
              </button>
            </p>
          )}
          {c.tip && (
            <p className="mt-2 rounded-lg bg-surface2 p-2.5 text-[11px] leading-relaxed text-muted">
              <Sparkles size={11} className="mr-1 inline text-accent" /> {T(c.tip)}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => copy(c)}
              className={clsx('flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl text-xs font-extrabold transition-colors',
                copied === c.id ? 'bg-success text-white' : 'bg-accent text-on-accent')}>
              {copied === c.id ? <><Check size={14} /> {L('Copied!', 'Disalin!', 'Tersalin!')}</> : <><Copy size={14} /> {L('Copy caption', 'Salin caption', 'Salin caption')}</>}
            </button>
            <button type="button" disabled={polishing === c.id} onClick={() => polish(c)}
              title={L('Rewrite in my voice', 'Tulis semula dalam suara saya', 'Tulis ulang dengan suara saya')}
              className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-accent/50 px-3.5 text-xs font-bold text-accent disabled:opacity-50">
              <Wand2 size={14} className={clsx(polishing === c.id && 'animate-pulse')} />
              {polishing === c.id ? '…' : 'AI'}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(capText(c))}`} target="_blank" rel="noreferrer"
              className="flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold no-underline hover:border-accent/60">
              <MessageCircle size={14} /> WA
            </a>
            {canPoster && c.category === 'property' && (
              <button type="button" onClick={() => nav('/poster')}
                title={L('Pair with a Win Poster', 'Gandingkan dengan poster', 'Padukan dengan poster')}
                className="flex h-10 cursor-pointer items-center justify-center rounded-xl border border-border px-3 text-xs font-bold hover:border-accent/60">
                <Palette size={14} />
              </button>
            )}
          </div>
        </Card>
      ))}

      <p className="mt-1 text-center text-[10px] leading-relaxed text-muted">
        {L('Posting happens on your own platforms (IG/TikTok/Facebook) — copy, personalise, post.',
           'Posting berlaku di platform anda sendiri (IG/TikTok/Facebook) — salin, ubah suai, siarkan.',
           'Posting terjadi di platform Anda sendiri (IG/TikTok/Facebook) — salin, sesuaikan, unggah.')}
      </p>

      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
