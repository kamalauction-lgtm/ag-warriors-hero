/* Command HQ → ATLAS Library — CRUD over the resource shelf.
   Trilingual fields, country scope, uploads into the private `atlas` bucket
   (50MB, any document type), publish/draft/archive. Audited via the shared
   onb_audit trigger. */
import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, X, Eye, EyeOff, Archive, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'
import { ATLAS_CATS, type AtlasItem } from './Atlas'

type TX = Record<string, string>
const tx = (en = '', ms = '', id = '') => ({ en, ms, id })
const LANGS = ['en', 'ms', 'id'] as const

interface Item extends Omit<AtlasItem, 'title' | 'description'> {
  title: TX; description: TX | null; status: string
}

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-80)

function TriInput({ label, value, onChange, rows }: {
  label: string; value: TX; onChange: (v: TX) => void; rows?: number
}) {
  return (
    <div className="mb-2.5">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</p>
      {LANGS.map((l) => rows ? (
        <textarea key={l} value={value?.[l] ?? ''} rows={rows} placeholder={l.toUpperCase()}
          onChange={(e) => onChange({ ...value, [l]: e.target.value })}
          className="mb-1.5 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs outline-none focus:border-accent" />
      ) : (
        <input key={l} value={value?.[l] ?? ''} placeholder={l.toUpperCase()}
          onChange={(e) => onChange({ ...value, [l]: e.target.value })}
          className="mb-1.5 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-accent" />
      ))}
    </div>
  )
}

export default function AtlasAdmin() {
  const [items, setItems] = useState<Item[]>([])
  const [edit, setEdit] = useState<Item | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('atlas_items').select('*')
      .neq('status', 'archived').order('category').order('sort')
    setItems((data as Item[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (it: Item) => {
    if (!supabase) return
    setBusy(true)
    const row = { category: it.category, title: it.title, description: it.description,
      media: it.media, country_scope: it.country_scope, sort: it.sort, status: it.status,
      updated_at: new Date().toISOString() }
    const call = it.id > 0
      ? supabase.from('atlas_items').update(row).eq('id', it.id)
      : supabase.from('atlas_items').insert(row)
    const { error } = await call
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say('Saved'); setEdit(null); load()
  }

  const setStatus = async (id: number, status: string) => {
    if (!supabase) return
    await supabase.from('atlas_items').update({ status }).eq('id', id)
    load()
  }

  const upload = async (file: File) => {
    if (!supabase || !edit) return
    setBusy(true)
    const path = `${edit.category}/${Date.now()}_${safeName(file.name)}`
    const { error } = await supabase.storage.from('atlas').upload(path, file)
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    const media = { ...(edit.media ?? {}) }
    media.files = [...(media.files ?? []), { path, name: file.name }]
    setEdit({ ...edit, media })
    say('Uploaded — remember to Save')
  }

  return (
    <>
      <button type="button"
        onClick={() => setEdit({ id: 0, category: 'guide', title: tx(), description: tx(),
          media: null, country_scope: 'ALL', sort: 100, status: 'published' })}
        className="mb-3 flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-extrabold text-on-accent">
        <Plus size={13} /> New resource
      </button>

      {ATLAS_CATS.map((c) => {
        const list = items.filter((it) => it.category === c.key)
        if (!list.length) return null
        return (
          <div key={c.key} className="mb-4">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">
              <c.icon size={12} /> {c.label.en}
            </p>
            <Card className="divide-y divide-border">
              {list.map((it) => (
                <div key={it.id} className="flex items-center gap-2 p-3 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{it.title.en || '(untitled)'}</span>
                    <span className="text-[10px] text-muted">
                      {(it.media?.files?.length ?? 0) > 0 && `${it.media!.files!.length} file · `}
                      {it.media?.url && 'link · '}{it.media?.youtube && 'video · '}
                      {['ms', 'en', 'id'].filter((k) => it.title[k]?.trim()).map((k) => k.toUpperCase()).join(' ')}
                    </span>
                  </span>
                  {it.country_scope !== 'ALL' && <Chip tone="accent">{it.country_scope === 'MY' ? '🇲🇾' : '🇮🇩'}</Chip>}
                  <Chip tone={it.status === 'published' ? 'success' : 'default'}>{it.status}</Chip>
                  <button type="button" aria-label="Toggle publish"
                    onClick={() => setStatus(it.id, it.status === 'published' ? 'draft' : 'published')}
                    className="cursor-pointer text-muted hover:text-ink">
                    {it.status === 'published' ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button type="button" onClick={() => setEdit(it)} aria-label="Edit"
                    className="cursor-pointer rounded-full border border-border px-2 py-0.5"><Pencil size={11} /></button>
                </div>
              ))}
            </Card>
          </div>
        )
      })}
      {items.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted">Empty shelf — add the first resource.</Card>
      )}

      {edit && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">{edit.id ? 'Edit resource' : 'New resource'}</h2>
              <button type="button" onClick={() => setEdit(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={15} /></button>
            </div>
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <select value={edit.category} aria-label="Category"
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                {ATLAS_CATS.map((c) => <option key={c.key} value={c.key}>{c.label.en}</option>)}
              </select>
              <select value={edit.country_scope} aria-label="Country"
                onChange={(e) => setEdit({ ...edit, country_scope: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                <option value="ALL">🌐 Both countries</option>
                <option value="MY">🇲🇾 Malaysia only</option>
                <option value="ID">🇮🇩 Indonesia only</option>
              </select>
            </div>
            <TriInput label="Title" value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} />
            <TriInput label="Description" value={edit.description ?? tx()} rows={2}
              onChange={(v) => setEdit({ ...edit, description: v })} />

            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted hover:border-accent hover:text-accent">
                <Upload size={12} /> Upload file (max 50MB)
                <input type="file" className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              {busy && <span className="text-[11px] text-muted">Uploading…</span>}
            </div>
            {(edit.media?.files ?? []).map((f, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-muted">📄 {f.name}</span>
                <button type="button" aria-label="Remove"
                  onClick={() => setEdit({ ...edit, media: { ...(edit.media ?? {}),
                    files: (edit.media?.files ?? []).filter((_, j) => j !== i) } })}
                  className="cursor-pointer text-muted hover:text-danger"><X size={12} /></button>
              </div>
            ))}
            <input value={edit.media?.url ?? ''} placeholder="External URL (optional)"
              onChange={(e) => setEdit({ ...edit, media: { ...(edit.media ?? {}), url: e.target.value || undefined } })}
              className="mb-2 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
            <input value={edit.media?.youtube ?? ''} placeholder="YouTube URL (optional)"
              onChange={(e) => setEdit({ ...edit, media: { ...(edit.media ?? {}), youtube: e.target.value || undefined } })}
              className="mb-3 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />

            <div className="flex gap-2">
              <button type="button" disabled={busy || !edit.title.en?.trim()} onClick={() => save(edit)}
                className="h-11 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                {busy ? 'Working…' : 'Save'}
              </button>
              {edit.id > 0 && (
                <button type="button" onClick={() => { setStatus(edit.id, 'archived'); setEdit(null) }}
                  aria-label="Archive"
                  className="h-11 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold text-muted hover:border-danger/50 hover:text-danger">
                  <Archive size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
