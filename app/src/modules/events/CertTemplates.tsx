/* Command HQ → Certificate Templates (075 Slice 2).
   Structured editor (no free code): identity, 3-language wording, colour,
   background + logos + signatures (private 'certificate-assets' bucket),
   signatories, live HTML preview that mirrors the PDF, and "Test PDF" rendered
   by the worker with sample data (no number minted). Save = a NEW immutable
   version (issued certificates keep the version they were minted from).
   Duplicate / Archive. Events pick a template in their Certificate tab. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev'
type Team = 'ALL' | 'MY' | 'ID'
type Lang = 'en' | 'ms-MY' | 'id-ID'
interface Tpl { id: string; country: 'MY' | 'ID'; name: string; orientation: 'landscape' | 'portrait'; status: string; current_version: number; created_at: string }
const FONT_PRESETS: { v: string; label: string; css: { title: string; name: string; body: string } }[] = [
  { v: 'classic', label: 'Classic serif (Times)', css: { title: '"Times New Roman", serif', name: '"Times New Roman", serif', body: 'Arial, sans-serif' } },
  { v: 'elegant', label: 'Elegant — Playfair Display', css: { title: 'CertPlayfair, serif', name: 'CertPlayfair, serif', body: 'CertLato, sans-serif' } },
  { v: 'script', label: 'Script name — Great Vibes + Cinzel', css: { title: 'CertCinzel, serif', name: 'CertGreatVibes, cursive', body: 'CertLato, sans-serif' } },
  { v: 'modern', label: 'Modern — Montserrat', css: { title: 'CertMontserrat, sans-serif', name: 'CertMontserrat, sans-serif', body: 'CertMontserrat, sans-serif' } },
  { v: 'garamond', label: 'Garamond — Cormorant', css: { title: 'CertCormorant, serif', name: 'CertCormorant, serif', body: 'CertLato, sans-serif' } },
]
const FONT_FACES = `
@font-face{font-family:CertPlayfair;src:url(/fonts/PlayfairDisplay-Bold.ttf)}
@font-face{font-family:CertCinzel;src:url(/fonts/Cinzel-Bold.ttf)}
@font-face{font-family:CertGreatVibes;src:url(/fonts/GreatVibes-Regular.ttf)}
@font-face{font-family:CertMontserrat;src:url(/fonts/Montserrat-Regular.ttf)}
@font-face{font-family:CertCormorant;src:url(/fonts/CormorantGaramond-Bold.ttf)}
@font-face{font-family:CertLato;src:url(/fonts/Lato-Regular.ttf)}`

interface Ver {
  id: string; template_id: string; version: number
  layout_json: { accent?: string; font?: string }
  text_json: Partial<Record<Lang, Partial<Record<TextKey, string>>>>
  assets_json: { background?: string; logo_left?: string; logo_right?: string }
  signatories_json: { name: string; title: string; signature_path?: string; scale?: number }[]
  created_at: string
}
type TextKey = 'organiser' | 'title' | 'heading' | 'attendance' | 'event_line' | 'details_line' | 'body' | 'footer' | 'verify'
const TEXT_FIELDS: { k: TextKey; label: string; hint: string }[] = [
  { k: 'organiser', label: 'Organiser line (top)', hint: 'IQI AG Group Indonesia / IQI AG Group Malaysia' },
  { k: 'title', label: 'Title', hint: 'Certificate of Attendance / Sijil Kehadiran / Sertifikat Kehadiran' },
  { k: 'heading', label: 'Heading line', hint: 'This is to certify that…' },
  { k: 'attendance', label: 'Attendance statement', hint: 'attended / telah menghadiri' },
  { k: 'event_line', label: 'Event / programme line (line 1)', hint: 'blank = the event’s own title (an event can still override)' },
  { k: 'details_line', label: 'Details line (line 2)', hint: 'blank = auto: session · mode · date · venue' },
  { k: 'body', label: 'Extra line (optional)', hint: 'e.g. organised by IQI AG Group · 8 hours' },
  { k: 'footer', label: 'Footer', hint: 'Become Better · Build Better · Give Better' },
  { k: 'verify', label: 'Verification wording', hint: 'Verify this certificate' },
]
const LANGS: { v: Lang; label: string }[] = [{ v: 'en', label: 'EN' }, { v: 'ms-MY', label: 'BM' }, { v: 'id-ID', label: 'ID' }]
const DEFAULTS: Record<Lang, Partial<Record<TextKey, string>>> = {
  en: { organiser: 'IQI AG Group', title: 'Certificate of Attendance', heading: 'This is to certify that', attendance: 'attended', footer: 'Become Better · Build Better · Give Better', verify: 'Verify this certificate' },
  'ms-MY': { organiser: 'IQI AG Group Malaysia', title: 'Sijil Kehadiran', heading: 'Dengan ini disahkan bahawa', attendance: 'telah menghadiri', footer: 'Become Better · Build Better · Give Better', verify: 'Sahkan sijil ini' },
  'id-ID': { organiser: 'IQI AG Group Indonesia', title: 'Sertifikat Kehadiran', heading: 'Dengan ini menyatakan bahwa', attendance: 'telah menghadiri', footer: 'Become Better · Build Better · Give Better', verify: 'Verifikasi sertifikat ini' },
}

export default function CertTemplates({ team }: { team: Team }) {
  const [tpls, setTpls] = useState<Tpl[]>([])
  const [vers, setVers] = useState<Ver[]>([])
  const [sel, setSel] = useState<Tpl | null>(null)
  const [draft, setDraft] = useState<Ver | null>(null)
  const [tplName, setTplName] = useState('')
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape')
  const [tplCountry, setTplCountry] = useState<'MY' | 'ID'>('MY')
  const [lang, setLang] = useState<Lang>('en')
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToastRaw] = useState('')
  const [previews, setPreviews] = useState<Record<string, string>>({})   // asset path → signed url
  const [sigKnockout, setSigKnockout] = useState(true)                    // remove white paper behind signatures
  const say = (m: string) => { setToastRaw(m); setTimeout(() => setToastRaw(''), 3200) }

  const load = useCallback(async () => {
    if (!supabase) return
    const [{ data: t }, { data: v }] = await Promise.all([
      supabase.from('certificate_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('certificate_template_versions').select('*').order('version', { ascending: false }),
    ])
    setTpls((t as Tpl[]) ?? []); setVers((v as Ver[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const latest = (t: Tpl) => vers.find((v) => v.template_id === t.id)
  const open = (t: Tpl) => {
    const v = latest(t)
    setSel(t); setTplName(t.name); setOrientation(t.orientation); setTplCountry(t.country); setDirty(false); setLang(t.country === 'ID' ? 'id-ID' : 'ms-MY')
    setDraft(v ? { ...v, layout_json: { ...v.layout_json }, text_json: JSON.parse(JSON.stringify(v.text_json || {})), assets_json: { ...v.assets_json }, signatories_json: [...(v.signatories_json || [])] }
      : { id: '', template_id: t.id, version: 0, layout_json: { accent: '#b08a3a' }, text_json: JSON.parse(JSON.stringify(DEFAULTS)), assets_json: {}, signatories_json: [], created_at: '' })
  }

  // signed previews for the private assets
  useEffect(() => {
    if (!supabase || !draft) return
    const paths = [draft.assets_json.background, draft.assets_json.logo_left, draft.assets_json.logo_right,
      ...draft.signatories_json.map((s) => s.signature_path)].filter(Boolean) as string[]
    const missing = paths.filter((p) => !previews[p])
    if (!missing.length) return
    Promise.all(missing.map(async (p) => {
      const { data } = await supabase!.storage.from('certificate-assets').createSignedUrl(p, 3600)
      return [p, data?.signedUrl ?? ''] as const
    })).then((pairs) => setPreviews((prev) => ({ ...prev, ...Object.fromEntries(pairs) })))
  }, [draft, previews])

  const visible = useMemo(() => tpls.filter((t) => (team === 'ALL' || t.country === team) && (showArchived || t.status !== 'archived')), [tpls, team, showArchived])

  /* ---------- actions ---------- */
  const createTemplate = async () => {
    if (!supabase) return
    const { data: u } = await supabase.auth.getUser()
    const country = team !== 'ALL' ? team : 'MY'
    const { data, error } = await supabase.from('certificate_templates').insert({ country, name: 'New certificate template', orientation: 'landscape', current_version: 0, created_by: u.user?.id }).select('*').single()
    if (error) { say('⚠ ' + error.message); return }
    await load(); open(data as Tpl)
  }
  const saveVersion = async () => {
    if (!supabase || !sel || !draft) return
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const nextV = (latest(sel)?.version ?? 0) + 1
    const { error } = await supabase.from('certificate_template_versions').insert({
      template_id: sel.id, version: nextV, layout_json: draft.layout_json, text_json: draft.text_json,
      assets_json: draft.assets_json, signatories_json: draft.signatories_json, created_by: u.user?.id,
    })
    if (error) { setBusy(false); say('⚠ ' + error.message); return }
    await supabase.from('certificate_templates').update({ name: tplName.trim() || sel.name, orientation, country: tplCountry, current_version: nextV, updated_at: new Date().toISOString() }).eq('id', sel.id)
    setBusy(false); setDirty(false); say(`Saved as version ${nextV} — events using v${nextV - 1} keep their issued certificates unchanged`)
    await load()
    setSel({ ...sel, name: tplName.trim() || sel.name, orientation, country: tplCountry, current_version: nextV })
  }
  const duplicate = async (t: Tpl) => {
    if (!supabase) return
    const v = latest(t)
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('certificate_templates').insert({ country: t.country, name: `${t.name} (copy)`, orientation: t.orientation, current_version: v ? 1 : 0, created_by: u.user?.id }).select('*').single()
    if (error) { say('⚠ ' + error.message); return }
    if (v) await supabase.from('certificate_template_versions').insert({ template_id: (data as Tpl).id, version: 1, layout_json: v.layout_json, text_json: v.text_json, assets_json: v.assets_json, signatories_json: v.signatories_json, created_by: u.user?.id })
    say('Duplicated'); await load(); open(data as Tpl)
  }
  const setStatus = async (t: Tpl, status: 'active' | 'archived') => {
    if (!supabase) return
    await supabase.from('certificate_templates').update({ status, updated_at: new Date().toISOString() }).eq('id', t.id)
    say(status === 'archived' ? 'Archived — existing certificates unaffected' : 'Restored'); await load(); if (sel?.id === t.id) setSel({ ...t, status })
  }
  /* signatures: scanned/photographed signatures come with a white (or cream)
     background — make near-white pixels transparent so the ink sits straight
     on the certificate, like a real signature. Output is always PNG. */
  /* logos + signatures: downscale to ≤900px (keeps transparency) — a 1 MB PNG
     logo or four 500 KB signature photos each need decoding in the worker. */
  const shrinkPng = (file: File, max = 900): Promise<Blob> => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => b ? resolve(b) : reject(new Error('canvas')), 'image/png')
    }
    img.onerror = () => reject(new Error('image decode'))
    img.src = URL.createObjectURL(file)
  })
  const knockoutWhite = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0, c.width, c.height)
      const d = ctx.getImageData(0, 0, c.width, c.height); const p = d.data
      for (let i = 0; i < p.length; i += 4) {
        const lum = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114)
        if (lum > 235) p[i + 3] = 0                                   // paper → transparent
        else if (lum > 190) p[i + 3] = Math.round(p[i + 3] * (235 - lum) / 45)   // soft edge
      }
      ctx.putImageData(d, 0, 0)
      c.toBlob((b) => b ? resolve(b) : reject(new Error('canvas')), 'image/png')
    }
    img.onerror = () => reject(new Error('image decode'))
    img.src = URL.createObjectURL(file)
  })

  const upload = async (kind: 'background' | 'logo_left' | 'logo_right' | `sig${number}`, file: File) => {
    if (!supabase || !sel || !draft) return
    if (file.size > 5 * 1024 * 1024) { say('⚠ Max 5 MB'); return }
    let ext = (file.name.split('.').pop() || 'png').toLowerCase()
    if (!['png', 'jpg', 'jpeg'].includes(ext)) { say('⚠ PNG or JPG only'); return }
    let body: Blob = file; let type = file.type
    if (kind.startsWith('sig')) {
      try { body = sigKnockout ? await knockoutWhite(file) : await shrinkPng(file); type = 'image/png'; ext = 'png' } catch { /* upload as-is */ }
    }
    if (kind === 'logo_left' || kind === 'logo_right') {
      try { body = await shrinkPng(file, 900); type = 'image/png'; ext = 'png' } catch { /* upload as-is */ }
    }
    if (kind === 'background') {
      try { body = await toJpegBackground(file); type = 'image/jpeg'; ext = 'jpg' } catch { /* upload as-is */ }
    }
    const path = `${sel.country}/${sel.id}/${kind}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('certificate-assets').upload(path, body, { upsert: true, contentType: type })
    if (error) { say('⚠ ' + error.message); return }
    if (kind.startsWith('sig')) {
      const i = Number(kind.slice(3))
      const sigs = [...draft.signatories_json]; sigs[i] = { ...sigs[i], signature_path: path }
      setDraft({ ...draft, signatories_json: sigs })
    } else setDraft({ ...draft, assets_json: { ...draft.assets_json, [kind]: path } })
    setDirty(true); say('Uploaded')
  }
  const testPdf = async () => {
    if (!supabase || !sel || !draft) return
    setBusy(true)
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(`${WORKER}/cert/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ country: tplCountry, language: lang, orientation, layout_json: draft.layout_json, text_json: draft.text_json, assets_json: draft.assets_json, signatories_json: draft.signatories_json }) })
      if (!res.ok) { say('⚠ ' + ((await res.json().catch(() => ({}))).error ?? `preview failed (${res.status})`)); return }
      const blob = await res.blob(); window.open(URL.createObjectURL(blob), '_blank')
    } catch (e) {
      say('⚠ Test PDF failed — the background may be too heavy; re-upload it (it is now auto-converted to a light JPEG)')
      console.error(e)
    } finally { setBusy(false) }
  }

  /* backgrounds: convert to a ≤2480px JPEG client-side — pdf-lib embeds JPEG
     without decoding pixels (cheap), while a full-size PNG must be decoded in
     the worker and can blow the CPU budget (= the "stuck" Test PDF). */
  const toJpegBackground = (file: File): Promise<Blob> => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const max = 2480; const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
      c.toBlob((b) => b ? resolve(b) : reject(new Error('canvas')), 'image/jpeg', 0.88)
    }
    img.onerror = () => reject(new Error('image decode'))
    img.src = URL.createObjectURL(file)
  })

  const txt = (k: TextKey, l: Lang = lang) => draft?.text_json?.[l]?.[k] ?? DEFAULTS[l][k] ?? ''
  const setTxt = (k: TextKey, v: string) => { if (!draft) return; setDraft({ ...draft, text_json: { ...draft.text_json, [lang]: { ...(draft.text_json[lang] || {}), [k]: v } } }); setDirty(true) }
  const accent = draft?.layout_json.accent || '#b08a3a'
  const fontCss = (FONT_PRESETS.find((f) => f.v === (draft?.layout_json.font || 'classic')) ?? FONT_PRESETS[0]).css

  const inp = 'h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'
  const btn = 'cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink disabled:opacity-40'
  const gold = 'cursor-pointer rounded-xl bg-accent px-3.5 py-2 text-xs font-extrabold text-on-accent hover:opacity-90 disabled:opacity-40'

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-sm font-extrabold">🎓 Certificate Templates · {team === 'ALL' ? 'MY + ID' : team}</p>
        <span className="text-xs text-muted">{visible.length}</span>
        {tpls.some((t) => t.status === 'archived') && <button type="button" className={btn} onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>}
        <span className="flex-1" />
        <button type="button" className={gold} onClick={createTemplate}>+ New template</button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ---------- list ---------- */}
        <Card className="p-2 xl:col-span-1">
          {visible.length === 0 && <p className="p-6 text-center text-xs text-muted">No templates yet — create one, or use "+ Default template" inside an event.</p>}
          {visible.map((t) => (
            <button key={t.id} type="button" onClick={() => open(t)}
              className={`mb-1 flex w-full cursor-pointer items-center gap-2 rounded-xl border p-3 text-left text-xs ${sel?.id === t.id ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-accent/40'}`}>
              <span className="text-lg">{t.orientation === 'portrait' ? '📄' : '🖼'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{t.country === 'MY' ? '🇲🇾' : '🇮🇩'} {t.name}</span>
                <span className="block text-[10px] text-muted">v{t.current_version} · {t.orientation}{t.status === 'archived' ? ' · archived' : ''}</span>
              </span>
            </button>
          ))}
        </Card>

        {/* ---------- editor ---------- */}
        {sel && draft ? (
          <div className="xl:col-span-2">
            <Card className="mb-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${inp} flex-1`} value={tplName} onChange={(e) => { setTplName(e.target.value); setDirty(true) }} placeholder="Template name" />
                <select className={inp + ' w-40'} value={orientation} onChange={(e) => { setOrientation(e.target.value as 'landscape' | 'portrait'); setDirty(true) }}>
                  <option value="landscape">Landscape</option><option value="portrait">Portrait</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted">Accent
                  <input type="color" value={accent} onChange={(e) => { setDraft({ ...draft, layout_json: { ...draft.layout_json, accent: e.target.value } }); setDirty(true) }} className="h-9 w-12 cursor-pointer rounded border border-border bg-surface" />
                </label>
                <select className={inp + ' w-56'} value={draft.layout_json.font || 'classic'} aria-label="Font style"
                  onChange={(e) => { setDraft({ ...draft, layout_json: { ...draft.layout_json, font: e.target.value } }); setDirty(true) }}>
                  {FONT_PRESETS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                </select>
                <select className={inp + ' w-28'} value={tplCountry} aria-label="Template country"
                  onChange={(e) => { setTplCountry(e.target.value as 'MY' | 'ID'); setDirty(true) }}>
                  <option value="MY">🇲🇾 MY</option><option value="ID">🇮🇩 ID</option>
                </select>
                <Chip>v{sel.current_version}</Chip>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" className={gold} disabled={busy || !dirty} onClick={saveVersion}>💾 Save as v{(latest(sel)?.version ?? 0) + 1}</button>
                <button type="button" className={btn} disabled={busy} onClick={testPdf}>⬇ Test PDF ({lang})</button>
                <button type="button" className={btn} onClick={() => duplicate(sel)}>Duplicate</button>
                {sel.status === 'archived'
                  ? <button type="button" className={btn} onClick={() => setStatus(sel, 'active')}>Restore</button>
                  : <button type="button" className={btn} onClick={() => window.confirm('Archive this template? Events already using it keep their issued certificates.') && setStatus(sel, 'archived')}>Archive</button>}
                {dirty && <span className="self-center text-[11px] font-bold text-warning">unsaved changes</span>}
              </div>
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              {/* wording ×3 languages */}
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-1.5">
                  <p className="text-xs font-extrabold">Wording</p>
                  <span className="flex-1" />
                  {LANGS.map((l) => (
                    <button key={l.v} type="button" onClick={() => setLang(l.v)}
                      className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-bold ${lang === l.v ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted'}`}>{l.label}</button>
                  ))}
                </div>
                {TEXT_FIELDS.map((f) => (
                  <div key={f.k} className="mb-2">
                    <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-muted">{f.label}</label>
                    <input className={inp} value={draft.text_json?.[lang]?.[f.k] ?? ''} placeholder={DEFAULTS[lang][f.k] ?? f.hint} onChange={(e) => setTxt(f.k, e.target.value)} />
                  </div>
                ))}
                <p className="text-[10px] text-muted">Blank = built-in default for that language. Participant name, event, date, venue, number and QR are filled automatically.</p>
              </Card>

              {/* branding + signatories */}
              <Card className="p-4">
                <p className="mb-2 text-xs font-extrabold">Branding</p>
                {(['background', 'logo_left', 'logo_right'] as const).map((k) => (
                  <div key={k} className="mb-2 flex items-center gap-2">
                    <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                      {draft.assets_json[k] && previews[draft.assets_json[k]!] ? <img src={previews[draft.assets_json[k]!]} alt="" className="h-full w-full object-contain" /> : <span className="text-[9px] text-muted">none</span>}
                    </div>
                    <span className="w-24 text-[11px] font-bold">{k === 'background' ? 'Background' : k === 'logo_left' ? 'Logo left' : 'Logo right'}</span>
                    <label className={`${btn} cursor-pointer`}>Upload<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && upload(k, e.target.files[0])} /></label>
                    {draft.assets_json[k] && <button type="button" className={btn} onClick={() => { setDraft({ ...draft, assets_json: { ...draft.assets_json, [k]: undefined } }); setDirty(true) }}>✕</button>}
                  </div>
                ))}
                <div className="mb-3 rounded-xl border border-dashed border-accent/50 bg-accent-soft/20 p-2.5 text-[10px] leading-relaxed">
                  <p className="font-bold">🎨 Design the background in Canva</p>
                  <p className="text-muted">Size: <b>{orientation === 'portrait' ? '1754 × 2480' : '2480 × 1754'} px</b> (A4, 300 dpi). Open the guide in Canva as a layer, design around the red "keep clear" zones (the engine prints text, signatures, QR and number there), then export PNG/JPG <b>without</b> the guide layer and Upload as Background.</p>
                  <p className="mt-1 flex flex-wrap gap-2">
                    <a href={`/cert-guides/background-guide-${orientation}.png`} download className="font-bold text-accent underline">⬇ Guide PNG ({orientation})</a>
                    <a href={`/cert-guides/background-blank-${orientation}.png`} download className="font-bold text-accent underline">⬇ Blank canvas</a>
                    <a href="/cert-guides/background-guides.pdf" download className="font-bold text-accent underline">⬇ Both guides (PDF)</a>
                  </p>
                  <p className="mt-1 text-muted">No background = cream paper + accent frame.</p>
                </div>
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-xs font-extrabold">Signatories (max 4)</p>
                  <span className="flex-1" />
                  <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted">
                    <input type="checkbox" checked={sigKnockout} onChange={(e) => setSigKnockout(e.target.checked)} className="h-3.5 w-3.5" style={{ accentColor: 'var(--accent)' }} />
                    Remove white background on upload
                  </label>
                </div>
                {draft.signatories_json.map((s, i) => (
                  <div key={i} className="mb-2 rounded-xl border border-border p-2">
                    <div className="flex gap-2">
                      <input className={inp} placeholder="Name" value={s.name} onChange={(e) => { const a = [...draft.signatories_json]; a[i] = { ...a[i], name: e.target.value }; setDraft({ ...draft, signatories_json: a }); setDirty(true) }} />
                      <input className={inp} placeholder="Title / designation" value={s.title} onChange={(e) => { const a = [...draft.signatories_json]; a[i] = { ...a[i], title: e.target.value }; setDraft({ ...draft, signatories_json: a }); setDirty(true) }} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex h-9 w-20 items-center justify-center overflow-hidden rounded border border-dashed border-border"
                        style={{ background: 'repeating-conic-gradient(#e5e5e5 0 25%, #fff 0 50%) 0 0 / 10px 10px' }} title="transparent preview">
                        {s.signature_path && previews[s.signature_path] ? <img src={previews[s.signature_path]} alt="" className="h-full object-contain" /> : <span className="text-[9px] text-muted">signature</span>}
                      </div>
                      <label className={`${btn} cursor-pointer`}>Upload signature<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && upload(`sig${i}`, e.target.files[0])} /></label>
                      {s.signature_path && (
                        <label className="flex items-center gap-1.5 text-[10px] text-muted">Size
                          <input type="range" min={0.5} max={2.5} step={0.1} value={s.scale ?? 1}
                            onChange={(e) => { const a = [...draft.signatories_json]; a[i] = { ...a[i], scale: Number(e.target.value) }; setDraft({ ...draft, signatories_json: a }); setDirty(true) }}
                            className="w-24" style={{ accentColor: 'var(--accent)' }} />
                          <b>{(s.scale ?? 1).toFixed(1)}×</b>
                        </label>
                      )}
                      <span className="flex-1" />
                      <button type="button" className={btn} onClick={() => { setDraft({ ...draft, signatories_json: draft.signatories_json.filter((_, j) => j !== i) }); setDirty(true) }}>Remove</button>
                    </div>
                  </div>
                ))}
                {draft.signatories_json.length < 4 && <button type="button" className={btn} onClick={() => { setDraft({ ...draft, signatories_json: [...draft.signatories_json, { name: '', title: '' }] }); setDirty(true) }}>+ Add signatory</button>}
              </Card>
            </div>

            {/* live preview — mirrors the PDF layout */}
            <Card className="mt-3 p-4">
              <style>{FONT_FACES}</style>
              <p className="mb-2 text-xs font-extrabold">Live preview · {lang} · {FONT_PRESETS.find((f) => f.v === (draft.layout_json.font || 'classic'))?.label}</p>
              <div className="relative mx-auto overflow-hidden rounded-xl border-2 text-center"
                style={{ borderColor: accent, background: draft.assets_json.background && previews[draft.assets_json.background] ? `url(${previews[draft.assets_json.background]}) center/cover` : '#fdfcf7',
                  color: '#1a1a1f', aspectRatio: orientation === 'portrait' ? '210/297' : '297/210', maxWidth: orientation === 'portrait' ? 420 : 640, padding: '6% 5%' }}>
                {draft.assets_json.logo_left && previews[draft.assets_json.logo_left] && <img src={previews[draft.assets_json.logo_left]} alt="" className="absolute left-[4%] top-[4%] h-[9%] object-contain" />}
                {draft.assets_json.logo_right && previews[draft.assets_json.logo_right] && <img src={previews[draft.assets_json.logo_right]} alt="" className="absolute right-[4%] top-[4%] h-[9%] object-contain" />}
                <p className="text-[9px] font-extrabold uppercase tracking-[0.25em]" style={{ color: '#666' }}>{txt('organiser')}</p>
                <p className="mt-2 text-xl font-extrabold" style={{ color: accent, fontFamily: fontCss.title }}>{txt('title')}</p>
                <p className="mt-2 text-[10px] italic text-[#666]" style={{ fontFamily: fontCss.body }}>{txt('heading')}</p>
                <p className="mt-1 font-extrabold" style={{ fontFamily: fontCss.name, fontSize: (draft.layout_json.font === 'script' ? 28 : 18) }}>Nur Aisyah binti Rahman</p>
                <div className="mx-auto my-1 h-px w-40" style={{ background: accent }} />
                <p className="text-[10px] italic text-[#666]">{txt('attendance')}</p>
                <p className="mt-1 text-xs font-bold" style={{ fontFamily: fontCss.body }}>{draft.text_json?.[lang]?.event_line || 'AG Leadership Programme'}</p>
                <p className="text-[9px] text-[#666]" style={{ fontFamily: fontCss.body }}>{draft.text_json?.[lang]?.details_line || `Day 1 · ${lang === 'ms-MY' ? 'Fizikal' : lang === 'id-ID' ? 'Fisik' : 'Physical'} · ${new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'long', year: 'numeric' })} · IQI HQ`}</p>
                {txt('body') && <p className="mt-1 text-[9px] text-[#666]">{txt('body')}</p>}
                <div className="mt-4 flex justify-center gap-6">
                  {draft.signatories_json.map((s, i) => (
                    <div key={i} className="text-center">
                      {s.signature_path && previews[s.signature_path]
                        ? <img src={previews[s.signature_path]} alt="" className="mx-auto object-contain" style={{ height: 24 * (s.scale ?? 1) }} />
                        : <div className="h-6" />}
                      <div className="mx-auto mt-0.5 w-24 border-t border-[#999]" />
                      <p className="text-[9px] font-bold">{s.name || 'Name'}</p><p className="text-[8px] text-[#666]">{s.title || 'Title'}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-end justify-between text-left">
                  <div className="flex items-center gap-1.5"><div className="h-8 w-8 bg-[#111]" /><div><p className="text-[7px] font-bold text-[#666]">{txt('verify')}</p><p className="text-[7px] font-bold">AG-{sel.country}-{new Date().getFullYear()}-000001</p></div></div>
                  <p className="text-[7px] text-[#666]">{txt('footer')}</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-muted">Approximate — use "Test PDF" for the exact render.</p>
            </Card>
          </div>
        ) : (
          <Card className="p-8 text-center text-xs text-muted xl:col-span-2">Select a template on the left, or create a new one. Each event picks a template in its 🎓 Certificate tab and can override wording there.</Card>
        )}
      </div>

      {toast && <div className="fixed bottom-8 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </>
  )
}
