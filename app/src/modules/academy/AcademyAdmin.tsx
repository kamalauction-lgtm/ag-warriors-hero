/* Command HQ → Grow → Diag Academy (spec §23/§24/§25).
   Four tabs: Diagnostic (dimensions + question bank), Content (tracks →
   modules → lessons, same editor patterns as Onboarding admin), Rules (the
   prescription matrix: dimension×band→module and role→module), Participants
   (team development board + human "assign module" override, audited). */
import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Pencil, X, Eye, EyeOff, Archive, Upload, Users, Compass,
  BookOpen, GitBranch, ArrowUp, ArrowDown, Copy,
} from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'

type TX = Record<string, string>
const tx = (en = '', ms = '', id = '') => ({ en, ms, id })
const LANGS = ['en', 'ms', 'id'] as const
const BANDS = ['foundation', 'developing', 'working', 'ready', 'accelerator'] as const
const ROLES = ['content_creator', 'live_host', 'advertiser', 'team_growth_funder', 'prospector',
  'relationship_builder', 'presenter', 'closer', 'financing_coordinator', 'recruiter',
  'coach_trainer', 'leader'] as const

interface Dim { key: string; category: string; title: TX; sort: number; active: boolean }
interface Q {
  id: number; dimension_key: string; qtype: string; question: TX; options: TX[]
  correct: number | null; explanation: TX | null; difficulty: number
  country_scope: string; status: string
}
interface Track { id: number; title: TX; sort: number; status: string }
interface Mod { id: number; track_id: number; title: TX; dimension_key: string | null; sort: number; status: string }
interface Les {
  id: number; module_id: number; type: string; title: TX; subtitle: TX | null; body: TX | null
  media: { youtube?: string; url?: string; images?: { path: string; caption?: string }[]
    files?: { path: string; name: string }[] } | null
  duration_min: number | null; required: boolean; min_seconds: number; ack_required: boolean
  quiz: { question: TX; options: TX[]; correct: number; explanation?: TX; retry?: boolean } | null
  country_scope: string; sort: number; status: string; content_version: number
}
interface DimRule { dimension_key: string; band: string; module_id: number; country_scope?: string }
interface RoleRule { role_key: string; module_id: number; rank: number; country_scope?: string }
interface TeamRow {
  id: string; name: string; country: string; diag_done: boolean
  priorities: string[] | null; lessons_done: number; last_activity: string | null
}

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

const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-80)

export default function AcademyAdmin() {
  const [tab, setTab] = useState<'diagnostic' | 'content' | 'rules' | 'participants'>('content')
  const [dims, setDims] = useState<Dim[]>([])
  const [qs, setQs] = useState<Q[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [mods, setMods] = useState<Mod[]>([])
  const [lessons, setLessons] = useState<Les[]>([])
  const [dimRules, setDimRules] = useState<DimRule[]>([])
  const [roleRules, setRoleRules] = useState<RoleRule[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [editQ, setEditQ] = useState<Q | null>(null)
  const [editL, setEditL] = useState<Les | null>(null)
  const [assign, setAssign] = useState<{ agent: TeamRow; module: number; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    if (!supabase) return
    const [d, q, t, m, l, dr, rr, tp] = await Promise.all([
      supabase.from('diag_dimensions').select('*').order('sort'),
      supabase.from('diag_questions').select('*').neq('status', 'archived').order('dimension_key'),
      supabase.from('academy_tracks').select('*').neq('status', 'archived').order('sort'),
      supabase.from('academy_modules').select('*').neq('status', 'archived').order('sort'),
      supabase.from('academy_lessons').select('*').neq('status', 'archived').order('sort'),
      supabase.from('academy_dimension_rules').select('*'),
      supabase.from('academy_role_rules').select('*').order('role_key'),
      supabase.rpc('aca_team_progress'),
    ])
    setDims((d.data as Dim[]) ?? []); setQs((q.data as Q[]) ?? [])
    setTracks((t.data as Track[]) ?? []); setMods((m.data as Mod[]) ?? [])
    setLessons((l.data as Les[]) ?? [])
    setDimRules((dr.data as DimRule[]) ?? []); setRoleRules((rr.data as RoleRule[]) ?? [])
    setTeam((tp.data as TeamRow[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const modName = (id: number) => mods.find((m) => m.id === id)?.title.en ?? `#${id}`
  const dimName = (k: string | null) => dims.find((d) => d.key === k)?.title.en ?? k ?? '—'

  const setStatus = async (table: string, idCol: string, id: number | string, status: string) => {
    if (!supabase) return
    const { error } = await supabase.from(table).update({ status }).eq(idCol, id)
    if (error) say('⚠ ' + error.message); else load()
  }

  /* ---------- question CRUD ---------- */
  const saveQ = async (q: Q) => {
    if (!supabase) return
    setBusy(true)
    const row = {
      dimension_key: q.dimension_key, qtype: q.qtype, question: q.question,
      options: q.options, correct: q.qtype === 'confidence' ? null : q.correct,
      explanation: q.explanation, difficulty: q.difficulty,
      country_scope: q.country_scope, status: q.status,
    }
    const call = q.id > 0
      ? supabase.from('diag_questions').update(row).eq('id', q.id)
      : supabase.from('diag_questions').insert(row)
    const { error } = await call
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say('Saved'); setEditQ(null); load()
  }

  /* ---------- lesson CRUD (academy) ---------- */
  const saveL = async (l: Les, bump = false) => {
    if (!supabase) return
    // country first, language second: MY needs BM, ID needs Bahasa Indonesia
    if (l.status === 'published') {
      if (l.country_scope === 'MY' && !l.title.ms?.trim()) { say('⚠ Malaysia content needs its Bahasa Malaysia title before publishing'); return }
      if (l.country_scope === 'ID' && !l.title.id?.trim()) { say('⚠ Indonesia content needs its Bahasa Indonesia title before publishing'); return }
      if (l.country_scope === 'ALL' && (!l.title.ms?.trim() || !l.title.id?.trim()))
        say('⚠ Note: BOTH-countries lesson missing BM or ID — users fall back to country default/EN')
    }
    setBusy(true)
    const row = {
      module_id: l.module_id, type: l.type, title: l.title, subtitle: l.subtitle,
      body: l.body, media: l.media, duration_min: l.duration_min, required: l.required,
      min_seconds: l.min_seconds, ack_required: l.ack_required, quiz: l.quiz,
      country_scope: l.country_scope, sort: l.sort, status: l.status,
      content_version: bump ? l.content_version + 1 : l.content_version,
      updated_at: new Date().toISOString(),
    }
    const call = l.id > 0
      ? supabase.from('academy_lessons').update(row).eq('id', l.id)
      : supabase.from('academy_lessons').insert(row)
    const { error } = await call
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say(bump ? 'Saved — version bumped' : 'Saved'); setEditL(null); load()
  }

  const upload = async (file: File, kind: 'images' | 'files') => {
    if (!supabase || !editL) return
    setBusy(true)
    const path = `lessons/${editL.module_id}/${Date.now()}_${safeName(file.name)}`
    const { error } = await supabase.storage.from('academy').upload(path, file)
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    const media = { ...(editL.media ?? {}) }
    if (kind === 'images') media.images = [...(media.images ?? []), { path, caption: '' }]
    else media.files = [...(media.files ?? []), { path, name: file.name }]
    setEditL({ ...editL, media })
    say('Uploaded — remember to Save')
  }

  const moveL = async (l: Les, dir: -1 | 1) => {
    if (!supabase) return
    const peers = lessons.filter((x) => x.module_id === l.module_id).sort((a, b) => a.sort - b.sort)
    const i = peers.findIndex((x) => x.id === l.id)
    const other = peers[i + dir]
    if (!other) return
    await supabase.from('academy_lessons').update({ sort: other.sort }).eq('id', l.id)
    await supabase.from('academy_lessons').update({ sort: l.sort }).eq('id', other.id)
    load()
  }

  /* ---------- rules ---------- */
  const [newDimRule, setNewDimRule] = useState({ dimension_key: '', band: 'developing', module_id: 0, country_scope: 'ALL' })
  const [newRoleRule, setNewRoleRule] = useState({ role_key: '', module_id: 0, country_scope: 'ALL' })

  const addDimRule = async () => {
    if (!supabase || !newDimRule.dimension_key || !newDimRule.module_id) return
    const { error } = await supabase.from('academy_dimension_rules').insert(newDimRule)
    if (error) say('⚠ ' + error.message); else { say('Rule added'); load() }
  }
  const delDimRule = async (r: DimRule) => {
    if (!supabase) return
    await supabase.from('academy_dimension_rules').delete()
      .eq('dimension_key', r.dimension_key).eq('band', r.band).eq('module_id', r.module_id)
    load()
  }
  const addRoleRule = async () => {
    if (!supabase || !newRoleRule.role_key || !newRoleRule.module_id) return
    const { error } = await supabase.from('academy_role_rules').insert({ ...newRoleRule, rank: 1 })
    if (error) say('⚠ ' + error.message); else { say('Rule added'); load() }
  }
  const delRoleRule = async (r: RoleRule) => {
    if (!supabase) return
    await supabase.from('academy_role_rules').delete()
      .eq('role_key', r.role_key).eq('module_id', r.module_id)
    load()
  }

  const doAssign = async () => {
    if (!supabase || !assign?.module) return
    setBusy(true)
    const { error } = await supabase.rpc('aca_prescribe_add', {
      p_agent: assign.agent.id, p_module: assign.module, p_reason: assign.reason || null,
    })
    setBusy(false)
    if (error) say('⚠ ' + error.message)
    else say(`Module assigned to ${assign.agent.name} — audited`)
    setAssign(null)
  }

  return (
    <>
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {([['content', 'Content', BookOpen], ['diagnostic', 'Diagnostic', Compass],
           ['rules', 'Prescription Rules', GitBranch], ['participants', `Participants (${team.length})`, Users]] as const)
          .map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={clsx('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-extrabold',
              tab === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* ---------------- CONTENT ---------------- */}
      {tab === 'content' && tracks.map((t) => (
        <div key={t.id} className="mb-4">
          <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">{t.title.en}</p>
          {mods.filter((m) => m.track_id === t.id).map((m) => (
            <Card key={m.id} className="mb-2">
              <div className="flex flex-wrap items-center gap-2 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold">{m.title.en}</span>
                  <span className="text-[10px] text-muted">{dimName(m.dimension_key)}</span>
                </span>
                <Chip tone={m.status === 'published' ? 'success' : 'default'}>{m.status}</Chip>
                <button type="button" aria-label="Toggle publish"
                  onClick={() => setStatus('academy_modules', 'id', m.id, m.status === 'published' ? 'draft' : 'published')}
                  className="cursor-pointer text-muted hover:text-ink">
                  {m.status === 'published' ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button type="button" aria-label="Add lesson"
                  onClick={() => setEditL({ id: 0, module_id: m.id, type: 'article', title: tx(), subtitle: null,
                    body: tx(), media: null, duration_min: 3, required: true, min_seconds: 60,
                    ack_required: false, quiz: null, country_scope: 'ALL',
                    sort: Math.max(0, ...lessons.filter((x) => x.module_id === m.id).map((x) => x.sort)) + 1,
                    status: 'draft', content_version: 1 })}
                  className="flex cursor-pointer items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[10px] font-extrabold text-on-accent">
                  <Plus size={11} /> Lesson
                </button>
              </div>
              {lessons.filter((l) => l.module_id === m.id).sort((a, b) => a.sort - b.sort).map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-2 border-t border-border p-2.5 pl-4 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{l.title.en || '(untitled)'}</span>
                    <span className="text-[10px] text-muted">
                      {l.type} · v{l.content_version}{l.quiz ? ' · quiz' : ''}{l.ack_required ? ' · ack' : ''}
                      {l.country_scope !== 'ALL' ? ` · ${l.country_scope}` : ''}
                    </span>
                  </span>
                  <Chip tone={l.status === 'published' ? 'success' : 'default'}>{l.status}</Chip>
                  <button type="button" onClick={() => moveL(l, -1)} aria-label="Up" className="cursor-pointer text-muted hover:text-ink"><ArrowUp size={12} /></button>
                  <button type="button" onClick={() => moveL(l, 1)} aria-label="Down" className="cursor-pointer text-muted hover:text-ink"><ArrowDown size={12} /></button>
                  <button type="button" aria-label="Duplicate" className="cursor-pointer text-muted hover:text-ink"
                    onClick={async () => {
                      if (!supabase) return
                      await supabase.from('academy_lessons').insert({
                        module_id: l.module_id, type: l.type,
                        title: Object.fromEntries(Object.entries(l.title).map(([k, v]) => [k, v + ' (copy)'])),
                        subtitle: l.subtitle, body: l.body, media: l.media, duration_min: l.duration_min,
                        required: l.required, min_seconds: l.min_seconds, ack_required: l.ack_required,
                        quiz: l.quiz, country_scope: l.country_scope, sort: l.sort + 1, status: 'draft',
                      })
                      load()
                    }}><Copy size={12} /></button>
                  <button type="button" aria-label="Toggle publish"
                    onClick={() => setStatus('academy_lessons', 'id', l.id, l.status === 'published' ? 'draft' : 'published')}
                    className="cursor-pointer text-muted hover:text-ink">
                    {l.status === 'published' ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button type="button" onClick={() => setEditL(l)} aria-label="Edit"
                    className="cursor-pointer rounded-full border border-border px-2 py-0.5"><Pencil size={11} /></button>
                </div>
              ))}
            </Card>
          ))}
        </div>
      ))}

      {/* ---------------- DIAGNOSTIC ---------------- */}
      {tab === 'diagnostic' && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-muted">{qs.length} questions · {dims.filter((d) => d.active).length} active dimensions</p>
            <button type="button"
              onClick={() => setEditQ({ id: 0, dimension_key: dims[0]?.key ?? '', qtype: 'single',
                question: tx(), options: [tx(), tx(), tx(), tx()], correct: 0, explanation: tx(),
                difficulty: 1, country_scope: 'ALL', status: 'published' })}
              className="flex cursor-pointer items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[11px] font-extrabold text-on-accent">
              <Plus size={12} /> Question
            </button>
          </div>
          {dims.map((d) => {
            const dqs = qs.filter((q) => q.dimension_key === d.key)
            if (!dqs.length) return null
            return (
              <div key={d.key} className="mb-3">
                <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                  {d.title.en} <span className="font-normal">· {d.category}</span>
                </p>
                <Card className="divide-y divide-border">
                  {dqs.map((q) => (
                    <div key={q.id} className="flex items-center gap-2 p-3 text-xs">
                      <span className="min-w-0 flex-1 truncate">{q.question.en}</span>
                      <Chip tone={q.qtype === 'confidence' ? 'info' : 'default'}>{q.qtype}</Chip>
                      <Chip tone={q.status === 'published' ? 'success' : 'default'}>{q.status}</Chip>
                      <button type="button" onClick={() => setEditQ(q)} aria-label="Edit"
                        className="cursor-pointer rounded-full border border-border px-2 py-0.5"><Pencil size={11} /></button>
                    </div>
                  ))}
                </Card>
              </div>
            )
          })}
        </>
      )}

      {/* ---------------- RULES ---------------- */}
      {tab === 'rules' && (
        <>
          <Card className="mb-4 p-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              Dimension × Band → Module
            </p>
            {dimRules.map((r, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-border py-1.5 text-xs last:border-0">
                <span className="min-w-0 flex-1 truncate">
                  <b>{dimName(r.dimension_key)}</b> · {r.band} → {modName(r.module_id)}
                </span>
                <Chip tone={(r.country_scope ?? 'ALL') === 'ALL' ? 'default' : 'accent'}>
                  {(r.country_scope ?? 'ALL') === 'ALL' ? '🌐' : r.country_scope === 'MY' ? '🇲🇾 MY' : '🇮🇩 ID'}
                </Chip>
                <button type="button" onClick={() => delDimRule(r)} aria-label="Remove"
                  className="cursor-pointer text-muted hover:text-danger"><X size={12} /></button>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <select value={newDimRule.country_scope} aria-label="Rule country"
                onChange={(e) => setNewDimRule({ ...newDimRule, country_scope: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                <option value="ALL">🌐 Both</option><option value="MY">🇲🇾 MY</option><option value="ID">🇮🇩 ID</option>
              </select>
              <select value={newDimRule.dimension_key} aria-label="Dimension"
                onChange={(e) => setNewDimRule({ ...newDimRule, dimension_key: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                <option value="">dimension…</option>
                {dims.map((d) => <option key={d.key} value={d.key}>{d.title.en}</option>)}
              </select>
              <select value={newDimRule.band} aria-label="Band"
                onChange={(e) => setNewDimRule({ ...newDimRule, band: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                {BANDS.map((b) => <option key={b}>{b}</option>)}
              </select>
              <select value={newDimRule.module_id} aria-label="Module"
                onChange={(e) => setNewDimRule({ ...newDimRule, module_id: Number(e.target.value) })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                <option value={0}>module…</option>
                {mods.map((m) => <option key={m.id} value={m.id}>{m.title.en}</option>)}
              </select>
              <button type="button" onClick={addDimRule}
                className="cursor-pointer rounded-lg bg-accent px-3 text-xs font-extrabold text-on-accent">Add</button>
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
              Talent Role → Accelerator Modules
            </p>
            {roleRules.map((r, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-border py-1.5 text-xs last:border-0">
                <span className="min-w-0 flex-1 truncate">
                  <b className="capitalize">{r.role_key.replace(/_/g, ' ')}</b> → {modName(r.module_id)}
                </span>
                <Chip tone={(r.country_scope ?? 'ALL') === 'ALL' ? 'default' : 'accent'}>
                  {(r.country_scope ?? 'ALL') === 'ALL' ? '🌐' : r.country_scope === 'MY' ? '🇲🇾 MY' : '🇮🇩 ID'}
                </Chip>
                <button type="button" onClick={() => delRoleRule(r)} aria-label="Remove"
                  className="cursor-pointer text-muted hover:text-danger"><X size={12} /></button>
              </div>
            ))}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <select value={newRoleRule.country_scope} aria-label="Rule country"
                onChange={(e) => setNewRoleRule({ ...newRoleRule, country_scope: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                <option value="ALL">🌐 Both</option><option value="MY">🇲🇾 MY</option><option value="ID">🇮🇩 ID</option>
              </select>
              <select value={newRoleRule.role_key} aria-label="Role"
                onChange={(e) => setNewRoleRule({ ...newRoleRule, role_key: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs capitalize outline-none">
                <option value="">role…</option>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
              <select value={newRoleRule.module_id} aria-label="Module"
                onChange={(e) => setNewRoleRule({ ...newRoleRule, module_id: Number(e.target.value) })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                <option value={0}>module…</option>
                {mods.map((m) => <option key={m.id} value={m.id}>{m.title.en}</option>)}
              </select>
              <button type="button" onClick={addRoleRule}
                className="cursor-pointer rounded-lg bg-accent px-3 text-xs font-extrabold text-on-accent">Add</button>
            </div>
          </Card>
        </>
      )}

      {/* ---------------- PARTICIPANTS ---------------- */}
      {tab === 'participants' && (
        <Card className="divide-y divide-border">
          {team.length === 0 && <p className="p-5 text-center text-xs text-muted">No participants in scope.</p>}
          {team.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{r.name}
                  <span className="ml-1.5 text-[10px] font-normal text-muted">{r.country}</span>
                </span>
                <span className="text-[10px] text-muted">
                  {r.diag_done
                    ? `priorities: ${(r.priorities ?? []).join(', ') || '—'}`
                    : 'diagnostic not taken'}
                  {' · '}{r.lessons_done} lessons done
                  {r.last_activity ? ` · active ${new Date(r.last_activity).toLocaleDateString()}` : ''}
                </span>
              </span>
              <Chip tone={r.diag_done ? 'success' : 'default'}>{r.diag_done ? 'diagnosed' : 'pending'}</Chip>
              <button type="button" onClick={() => setAssign({ agent: r, module: 0, reason: '' })}
                className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-[10px] font-bold text-muted hover:border-accent hover:text-accent">
                ＋ Assign module
              </button>
            </div>
          ))}
        </Card>
      )}

      {/* ---------------- ASSIGN OVERRIDE ---------------- */}
      {assign && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setAssign(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-bg p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 font-display text-base font-extrabold">Assign to {assign.agent.name}</p>
            <p className="mb-3 text-[11px] text-muted">Human recommendation — recorded with your name and reason, never overwrites their diagnostic.</p>
            <select value={assign.module} aria-label="Module"
              onChange={(e) => setAssign({ ...assign, module: Number(e.target.value) })}
              className="mb-2 h-10 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
              <option value={0}>Pick a module…</option>
              {mods.filter((m) => m.status === 'published').map((m) => <option key={m.id} value={m.id}>{m.title.en}</option>)}
            </select>
            <input value={assign.reason} onChange={(e) => setAssign({ ...assign, reason: e.target.value })}
              placeholder="Reason (recommended)"
              className="mb-3 h-10 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
            <button type="button" disabled={busy || !assign.module} onClick={doAssign}
              className="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              Assign — audited
            </button>
          </div>
        </div>
      )}

      {/* ---------------- QUESTION EDITOR ---------------- */}
      {editQ && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setEditQ(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">{editQ.id ? 'Edit question' : 'New question'}</h2>
              <button type="button" onClick={() => setEditQ(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={15} /></button>
            </div>
            <div className="mb-2.5 grid grid-cols-3 gap-2">
              <select value={editQ.dimension_key} aria-label="Dimension"
                onChange={(e) => setEditQ({ ...editQ, dimension_key: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                {dims.map((d) => <option key={d.key} value={d.key}>{d.title.en}</option>)}
              </select>
              <select value={editQ.qtype} aria-label="Type"
                onChange={(e) => setEditQ({ ...editQ, qtype: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                {['single', 'scenario', 'confidence'].map((t) => <option key={t}>{t}</option>)}
              </select>
              <select value={editQ.country_scope} aria-label="Country"
                onChange={(e) => setEditQ({ ...editQ, country_scope: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                {['ALL', 'MY', 'ID'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <TriInput label="Question" value={editQ.question} rows={2} onChange={(v) => setEditQ({ ...editQ, question: v })} />
            {editQ.options.map((o, i) => (
              <div key={i} className="mb-1.5 flex items-start gap-2">
                {editQ.qtype !== 'confidence' && (
                  <input type="radio" name="qcorrect" checked={editQ.correct === i}
                    onChange={() => setEditQ({ ...editQ, correct: i })} title="correct"
                    className="mt-2.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                )}
                <div className="flex-1">
                  {LANGS.map((l) => (
                    <input key={l} value={o[l] ?? ''} placeholder={`${String.fromCharCode(65 + i)} · ${l.toUpperCase()}`}
                      onChange={(e) => {
                        const options = [...editQ.options]
                        options[i] = { ...options[i], [l]: e.target.value }
                        setEditQ({ ...editQ, options })
                      }}
                      className="mb-1 h-8 w-full rounded-lg border border-border bg-surface px-2 text-[11px] outline-none" />
                  ))}
                </div>
              </div>
            ))}
            {editQ.qtype !== 'confidence' && (
              <TriInput label="Explanation" value={editQ.explanation ?? tx()} rows={2}
                onChange={(v) => setEditQ({ ...editQ, explanation: v })} />
            )}
            <div className="flex gap-2">
              <button type="button" disabled={busy || !editQ.question.en?.trim()} onClick={() => saveQ(editQ)}
                className="h-11 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                {busy ? 'Saving…' : 'Save'}
              </button>
              {editQ.id > 0 && (
                <button type="button" onClick={() => { setStatus('diag_questions', 'id', editQ.id, 'archived'); setEditQ(null) }}
                  className="h-11 cursor-pointer rounded-xl border border-border px-3 text-xs font-bold text-muted hover:border-danger/50 hover:text-danger">
                  <Archive size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- LESSON EDITOR ---------------- */}
      {editL && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setEditL(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">{editL.id ? 'Edit lesson' : 'New lesson'}</h2>
              <button type="button" onClick={() => setEditL(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={15} /></button>
            </div>
            <div className="mb-2.5 grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase text-muted">Type</span>
                <select value={editL.type} onChange={(e) => setEditL({ ...editL, type: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                  {['article', 'video', 'image', 'carousel', 'slides', 'document', 'link', 'ack', 'practice', 'scenario', 'reflection', 'action'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase text-muted">Country</span>
                <select value={editL.country_scope} onChange={(e) => setEditL({ ...editL, country_scope: e.target.value })}
                  className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                  {['ALL', 'MY', 'ID'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase text-muted">Est. min</span>
                <input type="number" value={editL.duration_min ?? ''} min={0}
                  onChange={(e) => setEditL({ ...editL, duration_min: Number(e.target.value) || null })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
              </label>
            </div>
            <TriInput label="Title" value={editL.title} onChange={(v) => setEditL({ ...editL, title: v })} />
            <TriInput label="Body (blank line = new paragraph)" value={editL.body ?? tx()} rows={4}
              onChange={(v) => setEditL({ ...editL, body: v })} />
            {editL.type === 'video' && (
              <input value={editL.media?.youtube ?? ''} placeholder="YouTube URL (unlisted ≠ private)"
                onChange={(e) => setEditL({ ...editL, media: { ...(editL.media ?? {}), youtube: e.target.value } })}
                className="mb-2.5 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
            )}
            {editL.type === 'link' && (
              <input value={editL.media?.url ?? ''} placeholder="External URL"
                onChange={(e) => setEditL({ ...editL, media: { ...(editL.media ?? {}), url: e.target.value } })}
                className="mb-2.5 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
            )}
            <div className="mb-2.5 flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted hover:border-accent hover:text-accent">
                <Upload size={12} /> Image
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'images')} />
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-muted hover:border-accent hover:text-accent">
                <Upload size={12} /> PDF / doc
                <input type="file" accept="application/pdf,.doc,.docx,.ppt,.pptx" className="hidden"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], 'files')} />
              </label>
            </div>
            {(editL.media?.images ?? []).map((im, i) => (
              <p key={i} className="mb-1 truncate text-[11px] text-muted">🖼 {im.path.split('/').pop()}</p>
            ))}
            {(editL.media?.files ?? []).map((f, i) => (
              <p key={i} className="mb-1 truncate text-[11px] text-muted">📄 {f.name}</p>
            ))}
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-xs font-bold">
                <input type="checkbox" checked={editL.required}
                  onChange={(e) => setEditL({ ...editL, required: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]" /> Required
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-xs font-bold">
                <input type="checkbox" checked={editL.ack_required}
                  onChange={(e) => setEditL({ ...editL, ack_required: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]" /> "I understand"
              </label>
              <label className="block">
                <span className="text-[10px] font-extrabold uppercase text-muted">Min active seconds</span>
                <input type="number" value={editL.min_seconds} min={0}
                  onChange={(e) => setEditL({ ...editL, min_seconds: Number(e.target.value) || 0 })}
                  className="mt-1 h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs outline-none" />
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2.5 text-xs font-bold">
                <input type="checkbox" checked={!!editL.quiz}
                  onChange={(e) => setEditL({ ...editL, quiz: e.target.checked
                    ? { question: tx(), options: [tx(), tx(), tx(), tx()], correct: 0, explanation: tx(), retry: true }
                    : null })}
                  className="h-4 w-4 accent-[var(--accent)]" /> Knowledge check
              </label>
            </div>
            {editL.quiz && (
              <div className="mb-3 rounded-xl border border-border p-3">
                <TriInput label="Quiz question" value={editL.quiz.question}
                  onChange={(v) => setEditL({ ...editL, quiz: { ...editL.quiz!, question: v } })} />
                {editL.quiz.options.map((o, i) => (
                  <div key={i} className="mb-1.5 flex items-start gap-2">
                    <input type="radio" name="lcorrect" checked={editL.quiz!.correct === i}
                      onChange={() => setEditL({ ...editL, quiz: { ...editL.quiz!, correct: i } })}
                      title="correct" className="mt-2.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                    <div className="flex-1">
                      {LANGS.map((l) => (
                        <input key={l} value={o[l] ?? ''} placeholder={`${String.fromCharCode(65 + i)} · ${l.toUpperCase()}`}
                          onChange={(e) => {
                            const options = [...editL.quiz!.options]
                            options[i] = { ...options[i], [l]: e.target.value }
                            setEditL({ ...editL, quiz: { ...editL.quiz!, options } })
                          }}
                          className="mb-1 h-8 w-full rounded-lg border border-border bg-surface px-2 text-[11px] outline-none" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !editL.title.en?.trim()} onClick={() => saveL(editL)}
                className="h-11 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                {busy ? 'Saving…' : 'Save'}
              </button>
              {editL.id > 0 && (
                <button type="button" disabled={busy} onClick={() => saveL(editL, true)}
                  title="Material change: everyone must re-acknowledge"
                  className="h-11 cursor-pointer rounded-xl border border-warning/60 px-3 text-xs font-bold text-warning disabled:opacity-40">
                  Material change
                </button>
              )}
              {editL.id > 0 && (
                <button type="button"
                  onClick={() => { setStatus('academy_lessons', 'id', editL.id, 'archived'); setEditL(null) }}
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
