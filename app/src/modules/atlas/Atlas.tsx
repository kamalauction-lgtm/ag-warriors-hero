/* GROW → ATLAS Library (old M3) — the resource shelf.
   Guides, forms, links, tools and videos, country-scoped, in the agent's
   language. Files live in the private `atlas` bucket and open through signed
   URLs — nothing is ever a permanent public link. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, Search, FileText, Download, ExternalLink, Library,
  BookOpen, ClipboardList, Wrench, PlayCircle, Link2,
} from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'
import { useTLocale, useL, useSignedUrl, type TX } from '../learn/LessonEngine'

export interface AtlasItem {
  id: number; category: string; title: TX; description: TX | null
  media: { files?: { path: string; name: string }[]; url?: string; youtube?: string } | null
  country_scope: string; sort: number
}

export const ATLAS_CATS = [
  { key: 'guide', label: { en: 'Guides', ms: 'Panduan', id: 'Panduan' }, icon: BookOpen },
  { key: 'form', label: { en: 'Forms', ms: 'Borang', id: 'Formulir' }, icon: ClipboardList },
  { key: 'link', label: { en: 'Links', ms: 'Pautan', id: 'Tautan' }, icon: Link2 },
  { key: 'tool', label: { en: 'Tools', ms: 'Alatan', id: 'Alat' }, icon: Wrench },
  { key: 'video', label: { en: 'Videos', ms: 'Video', id: 'Video' }, icon: PlayCircle },
] as const

function FileLink({ f }: { f: { path: string; name: string } }) {
  const url = useSignedUrl('atlas', f.path)
  return (
    <a href={url ?? '#'} target="_blank" rel="noreferrer"
      className={clsx('mt-2 flex items-center gap-2.5 rounded-xl border border-border p-3 text-sm font-bold no-underline transition-colors hover:border-accent/60',
        !url && 'pointer-events-none opacity-50')}>
      <FileText size={16} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">{f.name}</span>
      <Download size={14} className="shrink-0 text-muted" />
    </a>
  )
}

const ytId = (url: string) =>
  url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null

export default function Atlas() {
  const { user, locale } = useApp()
  const T = useTLocale()
  const L = useL()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [items, setItems] = useState<AtlasItem[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    if (!isReal || !supabase) { setLoading(false); return }
    const { data } = await supabase.from('atlas_items')
      .select('id,category,title,description,media,country_scope,sort')
      .eq('status', 'published').order('category').order('sort')
    setItems((data as AtlasItem[]) ?? [])
    setLoading(false)
  }, [isReal])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => items.filter((it) =>
    (!cat || it.category === cat)
    && (!q || (T(it.title) + ' ' + T(it.description)).toLowerCase().includes(q.toLowerCase()))),
  [items, cat, q, T])

  const catLabel = (k: string) => {
    const c = ATLAS_CATS.find((x) => x.key === k)
    return c ? c.label[locale === 'bm' ? 'ms' : locale === 'id' ? 'id' : 'en'] : k
  }

  if (!user) return null

  return (
    <div className="animate-rise px-4 pt-5 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/grow" aria-label="Back"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">
            <Library size={18} className="mr-1 inline text-accent" /> ATLAS Library
          </h1>
          <p className="text-xs text-muted">{L('Guides, docs & tools', 'Panduan, dokumen & alatan', 'Panduan, dokumen & alat')}</p>
        </div>
      </header>

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={L('Search resources…', 'Cari sumber…', 'Cari sumber…')}
          className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent" />
      </div>

      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {ATLAS_CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => setCat(cat === c.key ? '' : c.key)}
            className={clsx('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
              cat === c.key ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
            <c.icon size={12} /> {catLabel(c.key)}
          </button>
        ))}
      </div>

      {loading && <Card className="p-6 text-center text-xs text-muted">Loading…</Card>}
      {!loading && shown.length === 0 && (
        <Card className="p-8 text-center">
          <Library size={26} className="mx-auto mb-2 text-muted" />
          <p className="text-sm font-bold">{L('Nothing here yet', 'Belum ada apa-apa di sini', 'Belum ada apa pun di sini')}</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            {L('Resources appear once your admin uploads them in Command HQ.',
               'Sumber akan muncul setelah admin memuat naik di Command HQ.',
               'Sumber akan muncul setelah admin mengunggahnya di Command HQ.')}
          </p>
        </Card>
      )}

      {shown.map((it) => {
        const yid = it.media?.youtube ? ytId(it.media.youtube) : null
        return (
          <Card key={it.id} className="mb-3 overflow-hidden">
            {yid && (
              <div className="aspect-video w-full bg-black">
                <iframe title={T(it.title)} src={`https://www.youtube-nocookie.com/embed/${yid}?rel=0`}
                  className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen />
              </div>
            )}
            <div className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-extrabold">{T(it.title)}</p>
                <Chip tone="accent">{catLabel(it.category)}</Chip>
                {it.country_scope !== 'ALL' && <Chip>{it.country_scope === 'MY' ? '🇲🇾' : '🇮🇩'}</Chip>}
              </div>
              {it.description && T(it.description) && (
                <p className="text-xs leading-relaxed text-muted">{T(it.description)}</p>
              )}
              {(it.media?.files ?? []).map((f, i) => <FileLink key={i} f={f} />)}
              {it.media?.url && (
                <a href={it.media.url} target="_blank" rel="noreferrer"
                  className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-accent/50 p-3 text-sm font-bold text-accent no-underline">
                  <ExternalLink size={15} /> {L('Open', 'Buka', 'Buka')}
                </a>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
