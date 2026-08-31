/* Command HQ → Grow → Onboarding Management (spec §5/§16).
   Full CRUD over programmes / sections / lessons, trilingual fields, uploads
   into the PRIVATE `onboarding` bucket, publish/draft/archive (soft delete),
   reorder, duplicate, content-version bump for material edits, and the
   participant-progress board fed by onb_team_progress(). Every insert/update
   is audited by the onb_audit trigger — no extra client bookkeeping. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Copy, ArrowUp, ArrowDown, Upload, X, Eye, EyeOff,
  Archive, Users, BarChart3, GraduationCap,
} from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip, Bar } from '../../components/ui'

type TX = Record<string, string>
interface Prog { id: number; country_scope: string; title: TX; subtitle: TX | null; status: string }
interface Sec { id: number; program_id: number; title: TX; sort: number; status: string }
interface Les {
  id: number; section_id: number; type: string; title: TX; subtitle: TX | null; body: TX | null
  media: { youtube?: string; url?: string; images?: { path: string; caption?: string }[]
    files?: { path: string; name: string }[] } | null
  duration_min: number | null; required: boolean; min_seconds: number; ack_required: boolean
  quiz: { question: TX; options: TX[]; correct: number; explanation?: TX; retry?: boolean } | null
  prerequisite_id: number | null; country_scope: string; sort: number; status: string; content_version: number
}

/* country first, language second: a country-scoped lesson cannot publish
   without its country's DEFAULT language (MY→BM, ID→Bahasa Indonesia). */
function publishProblem(l: { country_scope?: string; status: string; title: TX }): string | null {
  if (l.status !== 'published') return null
  const cs = l.country_scope ?? 'ALL'
  if (cs === 'MY' && !l.title.ms?.trim()) return 'Malaysia content needs its Bahasa Malaysia title before publishing'
  if (cs === 'ID' && !l.title.id?.trim()) return 'Indonesia content needs its Bahasa Indonesia title before publishing'
  return null
}
interface TeamRow {
  id: string; name: string; country: string; required_total: number; required_done: number
  pct: number; last_activity: string | null; completed_at: string | null
}

const tx = (en = '', ms = '', id = '') => ({ en, ms, id })
const LANGS = ['en', 'ms', 'id'] as const

/* one labelled trilingual input group */
function TriInput({ label, value, onChange, rows }: {
  label: string; value: TX; onChange: (v: TX) => void; rows?: number
}) {
  return (
    <div className="mb-2.5">
      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-muted">{label}</p>
      {LANGS.map((l) => rows ? (
        <textarea key={l} value={value?.[l] ?? ''} rows={rows}
          onChange={(e) => onChange({ ...value, [l]: e.target.value })}
          placeholder={l.toUpperCase()}
          className="mb-1.5 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-xs outline-none focus:border-accent" />
      ) : (
        <input key={l} value={value?.[l] ?? ''}
          onChange={(e) => onChange({ ...value, [l]: e.target.value })}
          placeholder={l.toUpperCase()}
          className="mb-1.5 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none focus:border-accent" />
      ))}
    </div>
  )
}

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-80)

export default function OnbAdmin() {
  const [prog, setProg] = useState<Prog | null>(null)
  const [secs, setSecs] = useState<Sec[]>([])
  const [lessons, setLessons] = useState<Les[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [lstats, setLstats] = useState<{ lesson_id: number; title: TX; completed: number; started: number; avg_seconds: number | null }[]>([])
  const [edit, setEdit] = useState<Les | null>(null)
  const [tab, setTab] = useState<'content' | 'participants'>('content')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    if (!supabase) return
    const { data: p } = await supabase.from('onb_programs').select('*')
      .neq('status', 'archived').order('created_at', { ascending: false }).limit(1)
    const pr = (p as Prog[])?.[0] ?? null
    setProg(pr)
    if (!pr) return
    const [s, l, t, st] = await Promise.all([
      supabase.from('onb_sections').select('*').eq('program_id', pr.id).neq('status', 'archived').order('sort'),
      supabase.from('onb_lessons').select('*').neq('status', 'archived').order('sort'),
      supabase.rpc('onb_team_progress'),
      supabase.rpc('onb_admin_lesson_stats'),
    ])
    const secRows = (s.data as Sec[]) ?? []
    setSecs(secRows)
    const secIds = new Set(secRows.map((x) => x.id))
    setLessons(((l.data as Les[]) ?? []).filter((x) => secIds.has(x.section_id)))
    setTeam((t.data as TeamRow[]) ?? [])
    setLstats((st.data as typeof lstats) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const stats = useMemo(() => {
    const started = team.filter((r) => r.required_done > 0 || r.last_activity)
    const completed = team.filter((r) => r.completed_at)
    const notStarted = team.filter((r) => !r.last_activity && r.required_done === 0)
    const avg = team.length ? Math.round(team.reduce((s, r) => s + r.pct, 0) / team.length) : 0
    // most frequently incomplete required lesson
    const worst = [...lstats].filter((x) => (x as { required?: boolean }).required !== false)
      .sort((a, b) => (a.completed - b.completed))[0]
    return { started: started.length - completed.length, completed: completed.length,
      notStarted: notStarted.length, avg, worst }
  }, [team, lstats])

  /* ---------- mutations ---------- */
  const saveLesson = async (l: Les, bumpVersion = false) => {
    if (!supabase) return
    const problem = publishProblem(l)
    if (problem) { say('⚠ ' + problem); return }
    if (l.status === 'published' && l.country_scope === 'ALL' && (!l.title.ms?.trim() || !l.title.id?.trim()))
      say('⚠ Note: a BOTH-countries lesson is missing BM or ID — users fall back to their country default/EN')
    setBusy(true)
    const row = {
      section_id: l.section_id, type: l.type, title: l.title, subtitle: l.subtitle,
      body: l.body, media: l.media, duration_min: l.duration_min, required: l.required,
      min_seconds: l.min_seconds, ack_required: l.ack_required, quiz: l.quiz,
      prerequisite_id: l.prerequisite_id, country_scope: l.country_scope ?? 'ALL',
      sort: l.sort, status: l.status,
      content_version: bumpVersion ? l.content_version + 1 : l.content_version,
      updated_at: new Date().toISOString(),
    }
    const q = l.id > 0
      ? supabase.from('onb_lessons').update(row).eq('id', l.id)
      : supabase.from('onb_lessons').insert(row)
    const { error } = await q
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say(bumpVersion ? 'Saved — version bumped, re-acknowledgement required' : 'Saved')
    setEdit(null); load()
  }

  const move = async (l: Les, dir: -1 | 1) => {
    if (!supabase) return
    const peers = lessons.filter((x) => x.section_id === l.section_id).sort((a, b) => a.sort - b.sort)
    const i = peers.findIndex((x) => x.id === l.id)
    const other = peers[i + dir]
    if (!other) return
    await supabase.from('onb_lessons').update({ sort: other.sort }).eq('id', l.id)
    await supabase.from('onb_lessons').update({ sort: l.sort }).eq('id', other.id)
    load()
  }

  const duplicate = async (l: Les) => {
    if (!supabase) return
    const { error } = await supabase.from('onb_lessons').insert({
      section_id: l.section_id, type: l.type,
      title: Object.fromEntries(Object.entries(l.title).map(([k, v]) => [k, v + ' (copy)'])),
      subtitle: l.subtitle, body: l.body, media: l.media, duration_min: l.duration_min,
      required: l.required, min_seconds: l.min_seconds, ack_required: l.ack_required,
      quiz: l.quiz, sort: l.sort + 1, status: 'draft',
    })
    if (error) say('⚠ ' + error.message); else { say('Duplicated as draft'); load() }
  }

  const setStatus = async (table: string, id: number, status: string) => {
    if (!supabase) return
    const { error } = await supabase.from(table).update({ status }).eq('id', id)
    if (error) say('⚠ ' + error.message); else load()
  }

  const addSection = async () => {
    if (!supabase || !prog) return
    const title = prompt('Section title (English)')
    if (!title?.trim()) return
    await supabase.from('onb_sections').insert({
      program_id: prog.id, title: tx(title.trim(), title.trim(), title.trim()),
      sort: (Math.max(0, ...secs.map((s) => s.sort)) + 1),
    })
    load()
  }

  const upload = async (file: File, kind: 'images' | 'files') => {
    if (!supabase || !edit) return
    setBusy(true)
    const path = `lessons/${edit.section_id}/${Date.now()}_${safeName(file.name)}`
    const { error } = await supabase.storage.from('onboarding').upload(path, file)
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    const media = { ...(edit.media ?? {}) }
    if (kind === 'images') media.images = [...(media.images ?? []), { path, caption: '' }]
    else media.files = [...(media.files ?? []), { path, name: file.name }]
    setEdit({ ...edit, media })
    say('Uploaded — remember to Save')
  }

  if (!prog) return (
    <Card className="p-6 text-center text-sm text-muted">
      No onboarding programme found — run migration 053 first.
    </Card>
  )

  return (
    <>
      {/* programme header */}
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <GraduationCap size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold">{prog.title.en}</p>
          <p className="text-xs text-muted">{prog.country_scope} · {prog.status}</p>
        </div>
        <button type="button"
          onClick={() => setStatus('onb_programs', prog.id, prog.status === 'published' ? 'draft' : 'published')}
          className={clsx('cursor-pointer rounded-full px-4 py-2 text-xs font-extrabold',
            prog.status === 'published' ? 'border border-border text-muted' : 'bg-accent text-on-accent')}>
          {prog.status === 'published' ? 'Unpublish' : 'Publish'}
        </button>
      </Card>

      {/* stats tiles */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {([['Not started', stats.notStarted, '#94a3b8'], ['In progress', stats.started, '#f2b544'],
           ['Completed', stats.completed, '#43c59e'], ['Avg completion', `${stats.avg}%`, '#d4ac4a']] as const)
          .map(([l, v, c]) => (
          <Card key={l} className="p-3.5">
            <p className="font-display text-xl font-extrabold" style={{ color: c }}>{v}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted">{l}</p>
          </Card>
        ))}
      </div>
      {stats.worst && stats.worst.started > 0 && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
          <BarChart3 size={12} className="mr-1 inline text-warning" />
          Most stuck lesson: <b>{stats.worst.title?.en}</b> — {stats.worst.completed}/{stats.worst.started} completed
          {stats.worst.avg_seconds ? ` · avg ${stats.worst.avg_seconds}s active` : ''}
        </p>
      )}

      <div className="mb-4 flex gap-1.5">
        {(['content', 'participants'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={clsx('cursor-pointer rounded-full border px-3.5 py-2 text-xs font-extrabold capitalize',
              tab === t ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
            {t === 'participants' ? <><Users size={11} className="mr-1 inline" />Participants ({team.length})</> : 'Content'}
          </button>
        ))}
      </div>

      {/* ---------------- CONTENT ---------------- */}
      {tab === 'content' && (
        <>
          {secs.map((s) => (
            <div key={s.id} className="mb-4">
              <div className="mb-1.5 flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                  {s.title.en}
                </p>
                <button type="button" onClick={() => setStatus('onb_sections', s.id, 'archived')}
                  aria-label="Archive section" className="cursor-pointer text-muted hover:text-danger"><Archive size={13} /></button>
                <button type="button" aria-label="Add lesson"
                  onClick={() => setEdit({ id: 0, section_id: s.id, type: 'article', title: tx(), subtitle: null,
                    body: tx(), media: null, duration_min: 3, required: true, min_seconds: 60,
                    ack_required: false, quiz: null, prerequisite_id: null, country_scope: 'ALL',
                    sort: Math.max(0, ...lessons.filter((x) => x.section_id === s.id).map((x) => x.sort)) + 1,
                    status: 'draft', content_version: 1 })}
                  className="flex cursor-pointer items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-extrabold text-on-accent">
                  <Plus size={11} /> Lesson
                </button>
              </div>
              <Card className="divide-y divide-border">
                {lessons.filter((l) => l.section_id === s.id).sort((a, b) => a.sort - b.sort).map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{l.title.en || '(untitled)'}</span>
                      <span className="text-[10px] text-muted">
                        <b className={clsx((l.country_scope ?? 'ALL') !== 'ALL' && 'text-accent')}>
                          {(l.country_scope ?? 'ALL') === 'ALL' ? '🌐 MY+ID' : l.country_scope === 'MY' ? '🇲🇾 MY' : '🇮🇩 ID'}
                        </b>
                        {' · '}{l.type} · v{l.content_version}
                        {l.required ? ' · required' : ' · optional'}
                        {l.min_seconds ? ` · ${l.min_seconds}s min` : ''}
                        {l.ack_required ? ' · ack' : ''}{l.quiz ? ' · quiz' : ''}
                        {' · '}{['ms', 'en', 'id'].filter((k) => l.title[k]?.trim()).map((k) => k.toUpperCase()).join(' ')}
                      </span>
                    </span>
                    <Chip tone={l.status === 'published' ? 'success' : 'default'}>{l.status}</Chip>
                    <button type="button" onClick={() => move(l, -1)} aria-label="Up" className="cursor-pointer text-muted hover:text-ink"><ArrowUp size={13} /></button>
                    <button type="button" onClick={() => move(l, 1)} aria-label="Down" className="cursor-pointer text-muted hover:text-ink"><ArrowDown size={13} /></button>
                    <button type="button" onClick={() => duplicate(l)} aria-label="Duplicate" className="cursor-pointer text-muted hover:text-ink"><Copy size={13} /></button>
                    <button type="button" aria-label={l.status === 'published' ? 'Unpublish' : 'Publish'}
                      onClick={() => setStatus('onb_lessons', l.id, l.status === 'published' ? 'draft' : 'published')}
                      className="cursor-pointer text-muted hover:text-ink">
                      {l.status === 'published' ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button type="button" onClick={() => setEdit(l)} aria-label="Edit"
                      className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[10px] font-bold"><Pencil size={11} /></button>
                  </div>
                ))}
              </Card>
            </div>
          ))}
          <button type="button" onClick={addSection}
            className="mb-4 flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-bold text-muted hover:border-accent hover:text-accent">
            <Plus size={13} /> Add section
          </button>
        </>
      )}

      {/* ---------------- PARTICIPANTS ---------------- */}
      {tab === 'participants' && (
        <Card className="divide-y divide-border">
          {team.length === 0 && <p className="p-5 text-center text-xs text-muted">No participants in scope.</p>}
          {[...team].sort((a, b) => a.pct - b.pct).map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{r.name}
                  <span className="ml-1.5 text-[10px] font-normal text-muted">{r.country}</span>
                </span>
                <span className="text-[10px] text-muted">
                  {r.required_done}/{r.required_total}
                  {r.last_activity ? ` · last active ${new Date(r.last_activity).toLocaleDateString()}` : ' · not started'}
                </span>
              </span>
              <div className="w-24"><Bar pct={r.pct} /></div>
              {r.completed_at
                ? <Chip tone="success">🎓 done</Chip>
                : <b className="w-10 text-right text-xs">{r.pct}%</b>}
            </div>
          ))}
        </Card>
      )}

      {/* ---------------- LESSON EDITOR ---------------- */}
      {edit && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => setEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">
                {edit.id ? 'Edit lesson' : 'New lesson'}
              </h2>
              <button type="button" onClick={() => setEdit(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={15} /></button>
            </div>

            <div className="mb-2.5 grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Type</span>
                <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                  {['article', 'video', 'image', 'carousel', 'slides', 'document', 'link', 'ack'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Content country</span>
                <select value={edit.country_scope ?? 'ALL'}
                  onChange={(e) => setEdit({ ...edit, country_scope: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                  <option value="ALL">🌐 Both countries</option>
                  <option value="MY">🇲🇾 Malaysia only</option>
                  <option value="ID">🇮🇩 Indonesia only</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Est. minutes</span>
                <input type="number" value={edit.duration_min ?? ''} min={0}
                  onChange={(e) => setEdit({ ...edit, duration_min: Number(e.target.value) || null })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
              </label>
            </div>
            <p className="mb-2.5 rounded-lg bg-surface2 p-2 text-[10px] leading-relaxed text-muted">
              {(edit.country_scope ?? 'ALL') === 'MY' ? '🇲🇾 Languages: Bahasa Malaysia (default, required) + English. Fill the MS and EN fields.'
                : (edit.country_scope ?? 'ALL') === 'ID' ? '🇮🇩 Languages: Bahasa Indonesia (default, required) + English. Fill the ID and EN fields.'
                : '🌐 Both countries share this lesson. If Malaysia and Indonesia need DIFFERENT content or media, create two lessons — one MY-only, one ID-only.'}
            </p>

            <TriInput label="Title" value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} />
            <TriInput label="Body (blank line = new paragraph)" value={edit.body ?? tx()} rows={4}
              onChange={(v) => setEdit({ ...edit, body: v })} />

            {(edit.type === 'video') && (
              <label className="mb-2.5 block">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">YouTube URL (unlisted supported — note: unlisted is not truly private)</span>
                <input value={edit.media?.youtube ?? ''}
                  onChange={(e) => setEdit({ ...edit, media: { ...(edit.media ?? {}), youtube: e.target.value } })}
                  placeholder="https://youtu.be/…"
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
              </label>
            )}
            {(edit.type === 'link') && (
              <label className="mb-2.5 block">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">External URL</span>
                <input value={edit.media?.url ?? ''}
                  onChange={(e) => setEdit({ ...edit, media: { ...(edit.media ?? {}), url: e.target.value } })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
              </label>
            )}

            {/* uploads: images for image/carousel/slides, files for document/slides */}
            {['image', 'carousel', 'slides', 'document', 'article', 'video'].includes(edit.type) && (
              <div className="mb-2.5 flex flex-wrap gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted hover:border-accent hover:text-accent">
                  <Upload size={12} /> Image
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'images')} />
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted hover:border-accent hover:text-accent">
                  <Upload size={12} /> PDF / document
                  <input type="file" accept="application/pdf,.doc,.docx,.ppt,.pptx" className="hidden"
                    onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'files')} />
                </label>
              </div>
            )}
            {(edit.media?.images ?? []).map((im, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-muted">🖼 {im.path.split('/').pop()}</span>
                <input value={im.caption ?? ''} placeholder="caption"
                  onChange={(e) => {
                    const images = [...(edit.media?.images ?? [])]
                    images[i] = { ...images[i], caption: e.target.value }
                    setEdit({ ...edit, media: { ...(edit.media ?? {}), images } })
                  }}
                  className="h-8 w-32 rounded-lg border border-border bg-surface px-2 text-[11px] outline-none" />
                <button type="button" aria-label="Remove"
                  onClick={() => setEdit({ ...edit, media: { ...(edit.media ?? {}),
                    images: (edit.media?.images ?? []).filter((_, j) => j !== i) } })}
                  className="cursor-pointer text-muted hover:text-danger"><X size={12} /></button>
              </div>
            ))}
            {(edit.media?.files ?? []).map((f, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate text-muted">📄 {f.name}</span>
                <button type="button" aria-label="Remove"
                  onClick={() => setEdit({ ...edit, media: { ...(edit.media ?? {}),
                    files: (edit.media?.files ?? []).filter((_, j) => j !== i) } })}
                  className="cursor-pointer text-muted hover:text-danger"><X size={12} /></button>
              </div>
            ))}

            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-xs font-bold">
                <input type="checkbox" checked={edit.required}
                  onChange={(e) => setEdit({ ...edit, required: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]" /> Required
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-xs font-bold">
                <input type="checkbox" checked={edit.ack_required}
                  onChange={(e) => setEdit({ ...edit, ack_required: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]" /> "I understand" required
              </label>
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Min active seconds</span>
                <input type="number" value={edit.min_seconds} min={0}
                  onChange={(e) => setEdit({ ...edit, min_seconds: Number(e.target.value) || 0 })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
              </label>
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted">Prerequisite lesson id</span>
                <input type="number" value={edit.prerequisite_id ?? ''}
                  onChange={(e) => setEdit({ ...edit, prerequisite_id: Number(e.target.value) || null })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
              </label>
            </div>

            {/* simple knowledge check builder */}
            <div className="mb-3 rounded-xl border border-border p-3">
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={!!edit.quiz}
                  onChange={(e) => setEdit({ ...edit, quiz: e.target.checked
                    ? { question: tx(), options: [tx(), tx(), tx(), tx()], correct: 0, explanation: tx(), retry: true }
                    : null })}
                  className="h-4 w-4 accent-[var(--accent)]" /> Knowledge check
              </label>
              {edit.quiz && (
                <>
                  <TriInput label="Question" value={edit.quiz.question} onChange={(v) => setEdit({ ...edit, quiz: { ...edit.quiz!, question: v } })} />
                  {edit.quiz.options.map((o, i) => (
                    <div key={i} className="mb-1.5 flex items-start gap-2">
                      <input type="radio" name="correct" checked={edit.quiz!.correct === i}
                        onChange={() => setEdit({ ...edit, quiz: { ...edit.quiz!, correct: i } })}
                        title="correct answer" className="mt-2.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                      <div className="flex-1">
                        {LANGS.map((l) => (
                          <input key={l} value={o[l] ?? ''} placeholder={`${String.fromCharCode(65 + i)} · ${l.toUpperCase()}`}
                            onChange={(e) => {
                              const options = [...edit.quiz!.options]
                              options[i] = { ...options[i], [l]: e.target.value }
                              setEdit({ ...edit, quiz: { ...edit.quiz!, options } })
                            }}
                            className="mb-1 h-8 w-full rounded-lg border border-border bg-surface px-2 text-[11px] outline-none" />
                        ))}
                      </div>
                    </div>
                  ))}
                  <TriInput label="Explanation (shown on pass)" value={edit.quiz.explanation ?? tx()}
                    onChange={(v) => setEdit({ ...edit, quiz: { ...edit.quiz!, explanation: v } })} />
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !edit.title.en?.trim()} onClick={() => saveLesson(edit)}
                className="h-11 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                {busy ? 'Saving…' : 'Save'}
              </button>
              {edit.id > 0 && (
                <button type="button" disabled={busy} onClick={() => saveLesson(edit, true)}
                  title="Material change: everyone must re-acknowledge"
                  className="h-11 cursor-pointer rounded-xl border border-warning/60 px-3 text-xs font-bold text-warning disabled:opacity-40">
                  Save as material change
                </button>
              )}
              {edit.id > 0 && (
                <button type="button" disabled={busy}
                  onClick={() => { setStatus('onb_lessons', edit.id, 'archived'); setEdit(null) }}
                  className="h-11 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold text-muted hover:border-danger/50 hover:text-danger">
                  Archive
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
