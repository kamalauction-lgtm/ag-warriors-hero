/* WIN POSTER studio — mechanics ported from production poster.js:
   540×675 DOM poster (exported 1080×1350 via html-to-image, pixelRatio 2),
   nation MY/ID (logos + caption language + date locale), 4 deal types with
   accent colors, agent search (anti-duplicate), photo upload, wishes, share. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search, Upload, X, Download, Share2, RefreshCw, Send } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase, supabaseReady } from '../lib/supabase'
import { Card, Chip, SectionTitle } from '../components/ui'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev'
interface Channel { id: string; label: string; country: string }

type Nation = 'MY' | 'ID'
type Deal = 'EXSIM' | 'PROJECT' | 'SALE' | 'RENTAL'

const DEALS: { key: Deal; label: string; acc: string; accD: string; trophy: string }[] = [
  { key: 'EXSIM', label: 'EXSIM', acc: '#00B3A6', accD: '#053B3A', trophy: '🏆' },
  { key: 'PROJECT', label: 'PROJECT', acc: '#2E7CF6', accD: '#0A2A5E', trophy: '🎯' },
  { key: 'SALE', label: 'SUBSALE · SALE', acc: '#22C55E', accD: '#0A3A1F', trophy: '🔑' },
  { key: 'RENTAL', label: 'SUBSALE · RENTAL', acc: '#FF7A18', accD: '#5A2600', trophy: '🏠' },
]
const LOGOS: Record<string, string> = {
  IQI_MY: '/brand/iqi-my.png',
  IQI_ID: '/brand/iqi-id.png',
  AG_MY: '/brand/ag-my.png',
  AG_ID: '/brand/ag-id.png',
}
const CURRENCY: Record<Nation, string> = { MY: 'RM ', ID: 'Rp ' }

/* production formatPrice: adopt typed RM/Rp, re-insert thousand separators.
   A decimal part is preserved, not swallowed — "1,230,000.00" used to collapse
   into 123,000,000 because the old regex stripped the dot with the commas. */
function formatPrice(raw: string, nation: Nation): string {
  let cur = CURRENCY[nation]
  let s = raw.trim()
  const m = s.match(/^(rm|rp)\s*/i)
  if (m) {
    cur = m[1].toUpperCase() === 'RM' ? 'RM ' : 'Rp '
    s = s.slice(m[0].length)
  }
  const n = s.replace(/[,\s]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (n)
    return cur + n[1].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (n[2] ? '.' + n[2] : '')
  return s ? cur + s : '—'
}

/* Live grouping as the leader types: 1230000 renders as 1,230,000 in the field
   itself, with an optional .00 kept to two places. */
function groupPriceInput(v: string): string {
  const cleaned = v.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  const int = (dot === -1 ? cleaned : cleaned.slice(0, dot)).slice(0, 15)
  const dec = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec === null ? grouped : `${grouped}.${dec}`
}

/* wishes — {a} agent {pod} pod {proj} project; language bound to NATION,
   except MY warriors browsing in BM get the BM caption variant. */
const WISH: Record<'EN' | 'BI' | 'BM', Record<Deal, string[]>> = {
  EN: {
    EXSIM: [
      'Another EXSIM win for {a}! {pod} keeps charging. 🔥',
      '{a} just closed {proj} — discipline pays. 🏆',
      'Congratulations {a}! One more EXSIM unit down. 💪',
    ],
    PROJECT: [
      '{a} strikes again — {proj} CLOSED! 🎯',
      'Big win by {a} of {pod}. Project closed, momentum on!',
      'Target hit. {a} closes {proj}. Onwards! 🚀',
    ],
    SALE: [
      'Keys handed over — {a} closes another subsale! 🔑',
      '{a} turns a listing into a WIN. {pod} proud!',
      'Sold! {proj} closed by {a}. Respect. 👏',
    ],
    RENTAL: [
      'Another unit rented by {a}! Cashflow secured. 🏠',
      '{a} matches tenant & owner — deal done!',
      'Rental closed by {a} of {pod}. Keep going! 🔥',
    ],
  },
  BI: {
    EXSIM: [
      'Satu lagi unit EXSIM ditutup {a}! {pod} terus maju. 🔥',
      '{a} baru closing {proj} — disiplin membuahkan hasil. 🏆',
      'Selamat {a}! EXSIM win lagi. 💪',
    ],
    PROJECT: [
      '{a} closing lagi — {proj} SAH! 🎯',
      'Kemenangan besar {a} dari {pod}. Teruskan!',
      'Sasaran tercapai. {a} tutup {proj}. Maju! 🚀',
    ],
    SALE: [
      'Kunci diserahkan — {a} closing subsale lagi! 🔑',
      '{a} ubah listing jadi KEMENANGAN. {pod} bangga!',
      'Terjual! {proj} ditutup oleh {a}. Hormat. 👏',
    ],
    RENTAL: [
      'Satu lagi unit disewakan {a}! 🏠',
      '{a} padankan penyewa & pemilik — deal siap!',
      'Sewa ditutup oleh {a} dari {pod}. Teruskan! 🔥',
    ],
  },
  /* BM — Malay mirrors of the EN captions, for MY nation + locale 'bm' */
  BM: {
    EXSIM: [
      'Satu lagi kemenangan EXSIM untuk {a}! {pod} terus mara. 🔥',
      '{a} baru sahaja closing {proj} — disiplin membuahkan hasil. 🏆',
      'Tahniah {a}! Satu lagi unit EXSIM selesai. 💪',
    ],
    PROJECT: [
      '{a} beraksi lagi — {proj} CLOSED! 🎯',
      'Kemenangan besar oleh {a} dari {pod}. Projek closed, momentum berterusan!',
      'Sasaran tercapai. {a} closing {proj}. Mara ke hadapan! 🚀',
    ],
    SALE: [
      'Kunci diserahkan — {a} closing subsale lagi! 🔑',
      '{a} jadikan listing satu KEMENANGAN. {pod} bangga!',
      'Terjual! {proj} di-closing oleh {a}. Hormat. 👏',
    ],
    RENTAL: [
      'Satu lagi unit disewakan oleh {a}! Aliran tunai terjamin. 🏠',
      '{a} padankan penyewa & pemilik — deal selesai!',
      'Sewaan di-closing oleh {a} dari {pod}. Teruskan! 🔥',
    ],
  },
}

/* Kept only as the demo-persona roster. A real account searches the actual
   agent list — otherwise a leader making a winning poster literally cannot pick
   the agent who won, which made the studio unusable in production. */
const ROSTER = [
  { id: 'a_aisyah', name: 'Aisyah Rahman', phone: '+60 13-888 2020' },
  { id: 'a_faizal', name: 'Faizal Hassan', phone: '+60 17-220 4455' },
  { id: 'a_wong', name: 'Wong Li Ping', phone: '+60 12-334 5566' },
  { id: 'a_budi', name: 'Budi Santoso', phone: '+62 812-3456-789' },
  { id: 'a_dewi', name: 'Dewi Anggraini', phone: '+62 813-9988-776' },
]

export default function Poster() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [nation, setNation] = useState<Nation>(user?.country ?? 'MY')
  const [deal, setDeal] = useState<Deal>('EXSIM')
  const [agent, setAgent] = useState('')
  const [agentId, setAgentId] = useState<string | null>(null)
  const [pod, setPod] = useState('')
  const [priceRaw, setPriceRaw] = useState('')
  const [project, setProject] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoMsg, setPhotoMsg] = useState('')
  const [q, setQ] = useState('')
  const [wishIdx, setWishIdx] = useState(0)
  const [wishSeed, setWishSeed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const posterRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const d = DEALS.find((x) => x.key === deal)!
  /* `lang` drives the poster canvas + date locale (bound to NATION, unchanged);
     `wishLang` drives the caption — MY warriors in BM get the Malay variant. */
  const lang: 'EN' | 'BI' = nation === 'MY' ? 'EN' : 'BI'
  const wishLang: 'EN' | 'BI' | 'BM' = nation === 'MY' && locale === 'bm' ? 'BM' : lang

  /* responsive fit: scale the fixed 540×675 node to the frame width */
  useEffect(() => {
    const fit = () => {
      const w = frameRef.current?.clientWidth ?? 540
      setScale(Math.min(1, w / 540))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  /* Real agent list, loaded once. Country-scoped by RLS, so a MY leader searches
     MY warriors and an ID leader searches ID warriors without extra filtering. */
  const [roster, setRoster] = useState<{ id: string; name: string; phone: string }[]>([])
  useEffect(() => {
    const isReal = supabaseReady && !!user && user.id.includes('-')
    if (!isReal || !supabase) { setRoster(ROSTER); return }
    ;(async () => {
      const { data } = await supabase.from('profiles')
        .select('id,name,phone').eq('status', 'active').order('name')
      setRoster(((data ?? []) as { id: string; name: string; phone: string | null }[])
        .map((r) => ({ id: r.id, name: r.name, phone: r.phone ?? '' })))
    })()
  }, [user])

  const results = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return []
    return roster.filter((a) => a.name.toLowerCase().includes(n)).slice(0, 25)
  }, [q, roster])

  /* The built-in lines. Until 095 these WERE the "AI wishes" — three fixed
     strings with {a}/{pod}/{proj} swapped in, which is why leaders saw the same
     wording every time. They are now the fallback for when the model is
     unavailable, so the studio still works with no AI at all. */
  const templateWishes = useMemo(() => {
    const t = WISH[wishLang][deal]
    const a = agent || 'Warrior'
    return t.map((s) =>
      s.replaceAll('{a}', a).replaceAll('{pod}', pod || 'AG').replaceAll('{proj}', project || (wishLang === 'EN' ? 'the deal' : 'deal ini')),
    )
  }, [wishLang, deal, agent, pod, project, wishSeed])

  const [aiWishes, setAiWishes] = useState<string[] | null>(null)
  const [aiSource, setAiSource] = useState<'ai' | 'template'>('template')
  const [aiBusy, setAiBusy] = useState(false)
  const [customCaption, setCustomCaption] = useState<string | null>(null)
  const wishes = aiWishes ?? templateWishes

  /* A new agent/deal/project invalidates whatever the model wrote before. */
  useEffect(() => { setAiWishes(null); setAiSource('template'); setCustomCaption(null); setWishIdx(0) },
    [agent, pod, project, deal, wishLang])

  const caption = customCaption ?? wishes[wishIdx] ?? ''
  const captionSource: 'ai' | 'template' | 'edited' =
    customCaption != null ? 'edited' : aiSource

  const generateCaptions = useCallback(async () => {
    if (!supabase) { setWishSeed((s) => s + 1); return }
    setAiBusy(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(`${WORKER}/poster/caption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ deal, lang: wishLang, agent, pod, project }),
      })
      const out = await res.json() as { captions?: string[]; generated_by?: string; error?: string }
      if (!res.ok || !out.captions?.length) {
        setWishSeed((v) => v + 1)
        say(out.error ?? L('Could not reach the writer — using the built-in lines',
          'Tidak dapat hubungi penulis — guna ayat tersedia', 'Tidak bisa hubungi penulis — pakai kalimat bawaan'))
        return
      }
      setAiWishes(out.captions)
      setAiSource(out.generated_by === 'ai' ? 'ai' : 'template')
      setCustomCaption(null); setWishIdx(0)
    } catch {
      setWishSeed((v) => v + 1)
      say(L('Offline — using the built-in lines', 'Luar talian — guna ayat tersedia', 'Offline — pakai kalimat bawaan'))
    } finally { setAiBusy(false) }
  }, [deal, wishLang, agent, pod, project])

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3200)
  }

  /* ---- delivery (095) ----------------------------------------------------
     Telegram posts through the worker, which holds the bot token. WhatsApp is
     the phone's own share sheet: GHL's API cannot post into WhatsApp GROUPS,
     only to individual contacts, so "broadcast to the group" is not something
     we can honestly automate. Nothing leaves the app without a confirm step. */
  const [channels, setChannels] = useState<Channel[]>([])
  const [confirmSend, setConfirmSend] = useState<{ png: string; channel: Channel } | null>(null)
  useEffect(() => {
    if (!supabase) return
    supabase.rpc('fn_poster_context').then(({ data }) => {
      const ctx = data as unknown as { channels?: Channel[] } | null
      setChannels(ctx?.channels ?? [])
    })
  }, [])

  const openSend = async (channel: Channel) => {
    if (!agent.trim()) { say(L('Pick the agent first', 'Pilih ejen dahulu', 'Pilih agen dulu')); return }
    setBusy(true)
    try {
      setConfirmSend({ png: await renderPNG(), channel })
    } catch (e) {
      say(`${L('Render failed:', 'Gagal jana:', 'Gagal render:')} ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  const doSend = async () => {
    if (!confirmSend || !supabase) return
    setBusy(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(`${WORKER}/poster/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({
          channel_id: confirmSend.channel.id,
          caption,
          image: confirmSend.png,
          meta: { deal, agent, pod, project, nation, caption_source: captionSource },
        }),
      })
      const out = await res.json() as { ok?: boolean; channel?: string; error?: string; hint?: string }
      if (!res.ok || !out.ok) {
        say(`⚠ ${out.error ?? 'send failed'}${out.hint ? ` — ${out.hint}` : ''}`)
        return
      }
      say(L(`✅ Posted to ${out.channel}`, `✅ Dihantar ke ${out.channel}`, `✅ Terkirim ke ${out.channel}`))
      setConfirmSend(null)
    } catch (e) {
      say(`⚠ ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  const onPhoto = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      setPhoto(String(r.result))
      /* Say what actually happens. This used to promise automatic background
         removal, which Hero has never done (that was the old app) — a false
         claim on a production screen. Honest tip until the remover is ported. */
      setPhotoMsg(L(
        'Photo saved. Tip: a PNG with a transparent background looks best.',
        'Foto disimpan. Tip: PNG berlatar telus nampak paling kemas.',
        'Foto tersimpan. Tips: PNG berlatar transparan terlihat paling rapi.',
      ))
    }
    r.readAsDataURL(f)
  }

  /* html-to-image is BUNDLED, not fetched from cdnjs. The CDN version broke the
     moment Hero got its Content-Security-Policy (26 Aug): script-src blocks
     third-party hosts by design, so every render button died with "CDN load
     failed". Bundling keeps the security policy strict AND works offline. */
  const renderPNG = async (): Promise<string> => {
    const h2i = await import('html-to-image')
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    /* html-to-image awaits a requestAnimationFrame internally, and a hidden
       page never fires one — a render started right as the screen locks or the
       tab goes background would hang forever, stuck on "Rendering…". While
       hidden, rAF is stood in for by a timer; restored afterwards. */
    const raf = window.requestAnimationFrame
    if (document.hidden) {
      window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
        window.setTimeout(() => cb(performance.now()), 16)) as typeof window.requestAnimationFrame
    }
    try {
      return await h2i.toPng(posterRef.current!, { pixelRatio: 2, cacheBust: true, width: 540, height: 675 })
    } finally {
      window.requestAnimationFrame = raf
    }
  }

  const download = async () => {
    setBusy(true)
    try {
      const url = await renderPNG()
      const a = document.createElement('a')
      a.download = `AG_WIN_${(agent || 'poster').replace(/\s+/g, '_')}.png`
      a.href = url
      a.click()
      say(L('⬇ Poster downloaded (1080×1350)', '⬇ Poster dimuat turun (1080×1350)', '⬇ Poster terunduh (1080×1350)'))
    } catch (e) {
      say(`${L('Render failed:', 'Gagal jana:', 'Gagal render:')} ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    setBusy(true)
    try {
      const url = await renderPNG()
      const blob = await fetch(url).then((r) => r.blob())
      const file = new File([blob], 'AG_WIN.png', { type: 'image/png' })
      const caption = wishes[wishIdx]
      const n = navigator as Navigator & { canShare?: (d: object) => boolean }
      if (n.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: caption })
      } else {
        const a = document.createElement('a')
        a.download = 'AG_WIN.png'
        a.href = url
        a.click()
        await navigator.clipboard.writeText(caption)
        say(L(
          'Poster downloaded & caption copied. Open WhatsApp → attach poster → paste caption.',
          'Poster dimuat turun & kapsyen disalin. Buka WhatsApp → lampirkan poster → tampal kapsyen.',
          'Poster terunduh & caption tersalin. Buka WhatsApp → lampirkan poster → tempel caption.',
        ))
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') say(`${L('Share failed:', 'Gagal kongsi:', 'Gagal bagikan:')} ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null
  const price = formatPrice(priceRaw, nation)
  const initials = (agent || 'AG').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  /* Month names come from our own lists, matched to the POSTER's language:
     the MY canvas is English ("CONGRATS! ANOTHER WIN CLOSED"), so its date is
     English too; the ID canvas is Indonesian. Spelled out in full — browser
     locale "short" months produced misspellings like "Ogo" on shared posters. */
  const MONTHS = {
    EN: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    BI: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'],
  } as const
  const now = new Date()
  const dateStr = `${now.getDate()} ${MONTHS[lang][now.getMonth()]} ${now.getFullYear()}`

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/team" aria-label="Back to Team" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors duration-200 hover:text-ink">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Win Poster</h1>
          <p className="text-xs text-muted">{L(
            'Leader studio · build a poster · share to WhatsApp / Telegram',
            'Studio leader · bina poster · kongsi ke WhatsApp / Telegram',
            'Studio leader · buat poster · bagikan ke WhatsApp / Telegram',
          )}</p>
        </div>
      </header>

      {/* Nation + deal type */}
      <div className="mb-3 flex gap-2">
        {(['MY', 'ID'] as Nation[]).map((n) => (
          <button key={n} type="button" onClick={() => setNation(n)}
            className={clsx('flex-1 cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-extrabold transition-colors duration-200',
              nation === n ? 'border-transparent text-white' : 'border-border text-muted hover:text-ink')}
            style={nation === n ? { background: n === 'MY' ? '#CC0001' : '#C8102E' } : undefined}>
            {n === 'MY' ? '🇲🇾 MALAYSIA' : '🇮🇩 INDONESIA'}
          </button>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {DEALS.map((x) => (
          <button key={x.key} type="button" onClick={() => setDeal(x.key)}
            className={clsx('cursor-pointer rounded-xl border px-3 py-2.5 text-xs font-extrabold transition-colors duration-200',
              deal === x.key ? 'border-transparent text-white' : 'border-border text-muted hover:text-ink')}
            style={deal === x.key ? { background: x.acc } : undefined}>
            {x.trophy} {x.label}
          </button>
        ))}
      </div>

      {/* Agent search — anti-duplicate */}
      <SectionTitle>{L('🔎 Search agent (avoid double entry)', '🔎 Cari ejen (elak entri berganda)', '🔎 Cari agen (hindari entri ganda)')}</SectionTitle>
      <div className="relative mb-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Type a name…', 'Taip nama…', 'Ketik nama…')}
          className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none transition-colors duration-200 focus:border-accent" />
      </div>
      {q && (
        <Card className="mb-3 divide-y divide-border">
          {results.length ? results.map((a) => (
            <button key={a.id} type="button" className="flex w-full cursor-pointer items-center justify-between p-3 text-left text-sm transition-colors duration-200 hover:bg-surface2/60"
              onClick={() => { setAgentId(a.id); setAgent(a.name); setQ(''); }}>
              <span>{a.name} · <span className="text-muted">{a.phone}</span></span>
              <Chip tone="success">{L('✓ use existing', '✓ guna sedia ada', '✓ pakai yang ada')}</Chip>
            </button>
          )) : (
            <p className="p-3 text-xs text-muted">{L(
              'No match — this will be a NEW agent when you save.',
              'Tiada padanan — ini akan jadi ejen BARU apabila anda simpan.',
              'Tidak ada yang cocok — ini akan jadi agen BARU saat kamu simpan.',
            )}</p>
          )}
        </Card>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-muted">{L('Agent name', 'Nama ejen', 'Nama agen')}</label>
          <input value={agent} onChange={(e) => { setAgent(e.target.value); setAgentId(null) }}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          {agentId && <p className="mt-1 text-[10px] text-success">{L(
            'Linked to existing agent — no duplicate created.',
            'Dipautkan ke ejen sedia ada — tiada pendua dicipta.',
            'Tertaut ke agen yang ada — tidak ada duplikat dibuat.',
          )}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">{L('Pod / Team', 'Pod / Pasukan', 'Pod / Tim')}</label>
          <input value={pod} onChange={(e) => setPod(e.target.value)} placeholder="ALPHA"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">{L('Price', 'Harga', 'Harga')}</label>
          <input value={priceRaw} onChange={(e) => setPriceRaw(groupPriceInput(e.target.value))}
            inputMode="decimal" placeholder={nation === 'MY' ? '620,000' : '2,400,000,000'}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </div>
        <div className="col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-muted">{L('Project / Property', 'Projek / Hartanah', 'Proyek / Properti')}</label>
          <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="EXSIM Residensi"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </div>
      </div>

      {/* Photo */}
      <div className="mb-4 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold transition-colors duration-200 hover:border-accent/60">
          <Upload size={14} /> {L('Upload photo', 'Muat naik foto', 'Unggah foto')}
        </button>
        {photo && (
          <button type="button" onClick={() => { setPhoto(null); setPhotoMsg('') }} className="flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-border px-3 text-xs font-bold text-muted hover:text-danger">
            <X size={14} /> {L('Remove', 'Buang', 'Hapus')}
          </button>
        )}
        <span className="text-[10px] text-muted">{photoMsg}</span>
      </div>

      {/* Caption. The label used to claim "AI wishes" over three fixed strings;
          it now says which of the two you are actually looking at. */}
      <SectionTitle action={
        <button type="button" onClick={generateCaptions} disabled={aiBusy}
          className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-accent disabled:opacity-40">
          <RefreshCw size={12} className={aiBusy ? 'animate-spin' : ''} />
          {aiBusy ? L('Writing…', 'Menulis…', 'Menulis…') : L('Write 3 for me', 'Tulis 3 untuk saya', 'Tulis 3 untuk saya')}
        </button>
      }>{L('Caption — tap one to use', 'Kapsyen — tekan satu untuk guna', 'Caption — ketuk satu untuk dipakai')}</SectionTitle>
      <div className="mb-2 flex items-center gap-2">
        {aiSource === 'ai'
          ? <Chip tone="accent">✦ {L('written for this closing', 'ditulis untuk closing ini', 'ditulis untuk closing ini')}</Chip>
          : <Chip>{L('built-in lines', 'ayat tersedia', 'kalimat bawaan')}</Chip>}
        {customCaption != null && <Chip tone="warning">{L('edited by you', 'disunting anda', 'diedit Anda')}</Chip>}
      </div>
      <div className="mb-3 space-y-2">
        {wishes.map((w, i) => (
          <button key={i} type="button" onClick={() => { setWishIdx(i); setCustomCaption(null) }}
            className={clsx('block w-full cursor-pointer rounded-xl border p-3 text-left text-xs leading-relaxed transition-colors duration-200',
              wishIdx === i && customCaption == null ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50')}>
            {w}
          </button>
        ))}
      </div>
      {/* Nothing is published that a human has not read; make it editable too. */}
      <textarea value={caption} rows={3}
        onChange={(e) => setCustomCaption(e.target.value)}
        aria-label={L('Caption to send', 'Kapsyen untuk dihantar', 'Caption untuk dikirim')}
        className="mb-4 w-full rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed outline-none focus:border-accent" />

      {/* ---------- LIVE POSTER (540×675 → PNG 1080×1350) ---------- */}
      <div ref={frameRef} className="mb-4 overflow-hidden" style={{ height: 675 * scale }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 540 }}>
          <div ref={posterRef}
            style={{
              width: 540, height: 675, position: 'relative', overflow: 'hidden',
              background: `radial-gradient(circle at 80% 10%, ${d.acc}33 0%, transparent 45%), linear-gradient(160deg, #0A1128 0%, ${d.accD} 100%)`,
              color: '#fff', fontFamily: 'Inter, sans-serif',
            }}>
            {/* rays / slash / grain */}
            <div style={{ position: 'absolute', width: 520, height: 520, right: -140, top: -140, opacity: 0.16, background: `repeating-conic-gradient(${d.acc} 0 8deg, transparent 8deg 16deg)`, borderRadius: '50%' }} />
            <div style={{ position: 'absolute', inset: 0, opacity: 0.14, background: `linear-gradient(0deg, transparent 44%, ${d.acc} 44%, ${d.acc} 56%, transparent 56%)`, transform: 'rotate(-8deg) scale(1.4)' }} />
            {/* head */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px 0' }}>
              <img src={LOGOS['IQI_' + nation]} alt="IQI" style={{ height: 40, maxWidth: 120, objectFit: 'contain' }} />
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,.5)' }} />
              <img src={LOGOS['AG_' + nation]} alt="AG" style={{ height: 40, maxWidth: 120, objectFit: 'contain' }} />
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', background: 'rgba(255,255,255,.12)', padding: '5px 10px', borderRadius: 999 }}>
                {nation === 'MY' ? '🇲🇾 MALAYSIA' : '🇮🇩 INDONESIA'}
              </span>
            </div>
            {/* stage */}
            <div style={{ position: 'relative', padding: '22px 20px 0', width: '58%' }}>
              <p style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.14em', color: d.acc }}>
                {d.trophy} {lang === 'EN' ? 'DEAL CLOSED' : 'DEAL CLOSING'}
              </p>
              <div style={{ fontFamily: 'Anton, Oswald, sans-serif', lineHeight: 1.02, marginTop: 8, textTransform: 'uppercase' }}>
                <div style={{ fontSize: 46 }}>{lang === 'EN' ? 'CONGRATS!' : 'SELAMAT!'}</div>
                <div style={{ fontSize: 46, color: '#FFC53D', transform: 'skewX(-6deg)' }}>{lang === 'EN' ? 'ANOTHER' : 'SATU LAGI'}</div>
                <div style={{ fontSize: 46, color: 'transparent', WebkitTextStroke: '2px #FFC53D' }}>{lang === 'EN' ? 'WIN CLOSED' : 'KEMENANGAN'}</div>
              </div>
              <p style={{ marginTop: 16, fontSize: 11, letterSpacing: '.18em', color: 'rgba(255,255,255,.65)', fontWeight: 700 }}>
                {lang === 'EN' ? 'CLOSED BY' : 'DITUTUP OLEH'}
              </p>
              <p style={{ fontFamily: 'Anton, Oswald, sans-serif', fontSize: 30, marginTop: 2 }}>{agent || '—'}</p>
              {pod && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 800, color: '#0A1128', background: d.acc, borderRadius: 999, padding: '4px 12px' }}>{pod}</span>}
            </div>
            {/* cutout / initials */}
            <div style={{ position: 'absolute', right: photo ? -8 : 24, bottom: photo ? 120 : 170 }}>
              {photo ? (
                <img src={photo} alt="" style={{ width: 250, height: 320, objectFit: 'cover', objectPosition: 'top', filter: 'drop-shadow(0 12px 24px rgba(0,0,0,.5))', borderRadius: 14 }} />
              ) : (
                <div style={{ width: 120, height: 120, borderRadius: '50%', border: '3px solid #FFC53D', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Anton, sans-serif', fontSize: 42, background: 'rgba(255,255,255,.08)' }}>
                  {initials}
                </div>
              )}
            </div>
            {/* card */}
            <div style={{ position: 'absolute', left: 20, right: 20, bottom: 52, background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(4px)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#0A1128', background: d.acc, borderRadius: 999, padding: '3px 10px' }}>{d.label}</span>
                <p style={{ fontSize: 16, fontWeight: 700, marginTop: 7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project || '—'}</p>
                <p style={{ fontFamily: 'Anton, Oswald, sans-serif', fontSize: 28, color: '#FFC53D', marginTop: 2 }}>{price}</p>
              </div>
              <img src={LOGOS['IQI_' + nation]} alt="" style={{ height: 44, maxWidth: 90, objectFit: 'contain', opacity: 0.9 }} />
            </div>
            {/* foot */}
            <div style={{ position: 'absolute', left: 20, right: 20, bottom: 16, display: 'flex', justifyContent: 'space-between', fontSize: 10.5, letterSpacing: '.12em', fontWeight: 700, color: 'rgba(255,255,255,.7)' }}>
              <span>STRONGER TOGETHER · AG WARRIORS</span>
              <span>{dateStr}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2.5 pb-2">
        <button type="button" disabled={busy} onClick={download} className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-on-accent transition-opacity duration-200 hover:opacity-90 disabled:opacity-50">
          <Download size={16} /> {busy ? L('Rendering…', 'Menjana…', 'Merender…') : L('Download PNG', 'Muat turun PNG', 'Unduh PNG')}
        </button>
        <button type="button" disabled={busy} onClick={share} className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold transition-colors duration-200 hover:border-accent/60 disabled:opacity-50">
          <Share2 size={16} /> {L('WhatsApp / share', 'WhatsApp / kongsi', 'WhatsApp / bagikan')}
        </button>
      </div>

      {/* ---------- publish to a team channel ----------
          WhatsApp stays the share sheet above: it hands the poster and caption
          to the phone so a leader can drop it into any group in one tap. GHL's
          API can only message individual contacts, never a WhatsApp group, so
          automating "post to the group" is not something we can honestly do. */}
      <SectionTitle>{L('Post to a team channel', 'Hantar ke saluran pasukan', 'Kirim ke channel tim')}</SectionTitle>
      {channels.length === 0 ? (
        <Card className="mb-4 p-4 text-xs text-muted">
          {L('No Telegram group is connected yet. An admin adds one in Command HQ → App Content → Poster channels.',
             'Belum ada kumpulan Telegram disambung. Admin boleh tambah di Command HQ → App Content → Poster channels.',
             'Belum ada grup Telegram terhubung. Admin menambahkannya di Command HQ → App Content → Poster channels.')}
        </Card>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {channels.map((c) => (
            <button key={c.id} type="button" disabled={busy} onClick={() => openSend(c)}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-accent/60 px-4 text-xs font-bold text-accent disabled:opacity-40">
              <Send size={14} /> {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Preview and confirm — nothing reaches a group of agents until a human
          has seen the exact image and the exact words that will go out. */}
      {confirmSend && (
        <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/70 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && setConfirmSend(null)}>
          <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-bg p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-extrabold">{L('Send this to', 'Hantar ini ke', 'Kirim ini ke')} {confirmSend.channel.label}?</p>
              <button type="button" onClick={() => setConfirmSend(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted">✕</button>
            </div>
            <img src={confirmSend.png} alt="" className="mb-3 w-full rounded-xl border border-border" />
            {/* Only a master admin can see both countries' groups, so only they
                can cross them. Loud, but not blocked — there may be a reason. */}
            {confirmSend.channel.country !== nation && (
              <p className="mb-3 rounded-xl border border-warning/60 bg-warning/10 p-3 text-xs font-semibold text-warning">
                {L(`This poster is branded ${nation}, but ${confirmSend.channel.label} is a ${confirmSend.channel.country} group.`,
                   `Poster ini berjenama ${nation}, tetapi ${confirmSend.channel.label} ialah kumpulan ${confirmSend.channel.country}.`,
                   `Poster ini bermerek ${nation}, tetapi ${confirmSend.channel.label} adalah grup ${confirmSend.channel.country}.`)}
              </p>
            )}
            <p className="mb-3 whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-xs leading-relaxed">{caption}</p>
            <p className="mb-3 text-[11px] text-muted">
              {L('This posts to the whole group and cannot be unsent from here. Check the name, the project and the wording.',
                 'Ini dihantar ke seluruh kumpulan dan tidak boleh ditarik balik dari sini. Semak nama, projek dan ayat.',
                 'Ini terkirim ke seluruh grup dan tidak bisa ditarik dari sini. Periksa nama, proyek dan kalimatnya.')}
            </p>
            <button type="button" disabled={busy} onClick={doSend}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-50">
              {busy ? L('Sending…', 'Menghantar…', 'Mengirim…') : L('Send now', 'Hantar sekarang', 'Kirim sekarang')}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] w-[90%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent">
          {toast}
        </div>
      )}
    </div>
  )
}
