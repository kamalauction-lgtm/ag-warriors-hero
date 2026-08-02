/* WIN POSTER studio — mechanics ported from production poster.js:
   540×675 DOM poster (exported 1080×1350 via html-to-image, pixelRatio 2),
   nation MY/ID (logos + caption language + date locale), 4 deal types with
   accent colors, agent search (anti-duplicate), photo upload, wishes, share. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search, Upload, X, Download, Share2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { Card, Chip, SectionTitle } from '../components/ui'

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

/* production formatPrice: adopt typed RM/Rp, re-insert thousand separators */
function formatPrice(raw: string, nation: Nation): string {
  let cur = CURRENCY[nation]
  let s = raw.trim()
  const m = s.match(/^(rm|rp)\s*/i)
  if (m) {
    cur = m[1].toUpperCase() === 'RM' ? 'RM ' : 'Rp '
    s = s.slice(m[0].length)
  }
  const digits = s.replace(/[.,\s]/g, '')
  if (/^\d+$/.test(digits) && digits.length > 0)
    return cur + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return s ? cur + s : '—'
}

/* wishes — {a} agent {pod} pod {proj} project; language bound to NATION */
const WISH: Record<'EN' | 'BI', Record<Deal, string[]>> = {
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
}

const ROSTER = [
  { id: 'a_aisyah', name: 'Aisyah Rahman', phone: '+60 13-888 2020' },
  { id: 'a_faizal', name: 'Faizal Hassan', phone: '+60 17-220 4455' },
  { id: 'a_wong', name: 'Wong Li Ping', phone: '+60 12-334 5566' },
  { id: 'a_budi', name: 'Budi Santoso', phone: '+62 812-3456-789' },
  { id: 'a_dewi', name: 'Dewi Anggraini', phone: '+62 813-9988-776' },
]

export default function Poster() {
  const { user } = useApp()
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
  const lang: 'EN' | 'BI' = nation === 'MY' ? 'EN' : 'BI'

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

  const results = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return []
    return ROSTER.filter((a) => a.name.toLowerCase().includes(n)).slice(0, 25)
  }, [q])

  const wishes = useMemo(() => {
    const t = WISH[lang][deal]
    const a = agent || (lang === 'EN' ? 'Warrior' : 'Warrior')
    return t.map((s) =>
      s.replaceAll('{a}', a).replaceAll('{pod}', pod || 'AG').replaceAll('{proj}', project || (lang === 'EN' ? 'the deal' : 'deal ini')),
    )
  }, [lang, deal, agent, pod, project, wishSeed])

  const say = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 3200)
  }

  const onPhoto = (f: File) => {
    const r = new FileReader()
    r.onload = () => {
      setPhoto(String(r.result))
      setPhotoMsg('Photo saved. (Production also removes the background automatically.)')
    }
    r.readAsDataURL(f)
  }

  const renderPNG = async (): Promise<string> => {
    const h2i = await import('https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js' as string).catch(() => null)
    const lib = (h2i as { toPng?: Function })?.toPng ? h2i : (window as { htmlToImage?: unknown }).htmlToImage
    if (!lib) {
      // fallback: load UMD build
      await new Promise<void>((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js'
        s.onload = () => res()
        s.onerror = () => rej(new Error('CDN load failed'))
        document.head.appendChild(s)
      })
    }
    const H = (window as unknown as { htmlToImage: { toPng: (n: HTMLElement, o: object) => Promise<string> } }).htmlToImage
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    return H.toPng(posterRef.current!, { pixelRatio: 2, cacheBust: true, width: 540, height: 675 })
  }

  const download = async () => {
    setBusy(true)
    try {
      const url = await renderPNG()
      const a = document.createElement('a')
      a.download = `AG_WIN_${(agent || 'poster').replace(/\s+/g, '_')}.png`
      a.href = url
      a.click()
      say('⬇ Poster downloaded (1080×1350)')
    } catch (e) {
      say(`Render failed: ${(e as Error).message}`)
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
        say('Poster downloaded & caption copied. Open WhatsApp → attach poster → paste caption.')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') say(`Share failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null
  const price = formatPrice(priceRaw, nation)
  const initials = (agent || 'AG').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const dateStr = new Date().toLocaleDateString(lang === 'BI' ? 'id-ID' : 'ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/team" aria-label="Back to Team" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors duration-200 hover:text-ink">
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Win Poster</h1>
          <p className="text-xs text-muted">Leader studio · build a poster · share to WhatsApp / Telegram</p>
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
      <SectionTitle>🔎 Search agent (avoid double entry)</SectionTitle>
      <div className="relative mb-2">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name…"
          className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none transition-colors duration-200 focus:border-accent" />
      </div>
      {q && (
        <Card className="mb-3 divide-y divide-border">
          {results.length ? results.map((a) => (
            <button key={a.id} type="button" className="flex w-full cursor-pointer items-center justify-between p-3 text-left text-sm transition-colors duration-200 hover:bg-surface2/60"
              onClick={() => { setAgentId(a.id); setAgent(a.name); setQ(''); }}>
              <span>{a.name} · <span className="text-muted">{a.phone}</span></span>
              <Chip tone="success">✓ use existing</Chip>
            </button>
          )) : (
            <p className="p-3 text-xs text-muted">No match — this will be a NEW agent when you save.</p>
          )}
        </Card>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-muted">Agent name</label>
          <input value={agent} onChange={(e) => { setAgent(e.target.value); setAgentId(null) }}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          {agentId && <p className="mt-1 text-[10px] text-success">Linked to existing agent — no duplicate created.</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Pod / Team</label>
          <input value={pod} onChange={(e) => setPod(e.target.value)} placeholder="ALPHA"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">Price</label>
          <input value={priceRaw} onChange={(e) => setPriceRaw(e.target.value)} placeholder={nation === 'MY' ? '620000' : '2400000000'}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </div>
        <div className="col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-muted">Project / Property</label>
          <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="EXSIM Residensi"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        </div>
      </div>

      {/* Photo */}
      <div className="mb-4 flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3.5 text-xs font-bold transition-colors duration-200 hover:border-accent/60">
          <Upload size={14} /> Upload photo
        </button>
        {photo && (
          <button type="button" onClick={() => { setPhoto(null); setPhotoMsg('') }} className="flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-border px-3 text-xs font-bold text-muted hover:text-danger">
            <X size={14} /> Remove
          </button>
        )}
        <span className="text-[10px] text-muted">{photoMsg}</span>
      </div>

      {/* Wishes */}
      <SectionTitle action={
        <button type="button" onClick={() => setWishSeed((s) => s + 1)} className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-accent">
          <RefreshCw size={12} /> Generate 3
        </button>
      }>✦ AI wishes — tap one to use</SectionTitle>
      <div className="mb-4 space-y-2">
        {wishes.map((w, i) => (
          <button key={i} type="button" onClick={() => setWishIdx(i)}
            className={clsx('block w-full cursor-pointer rounded-xl border p-3 text-left text-xs leading-relaxed transition-colors duration-200',
              wishIdx === i ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent/50')}>
            {w}
          </button>
        ))}
      </div>

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
          <Download size={16} /> {busy ? 'Rendering…' : 'Download PNG'}
        </button>
        <button type="button" disabled={busy} onClick={share} className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold transition-colors duration-200 hover:border-accent/60 disabled:opacity-50">
          <Share2 size={16} /> Share
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] w-[90%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent">
          {toast}
        </div>
      )}
    </div>
  )
}
