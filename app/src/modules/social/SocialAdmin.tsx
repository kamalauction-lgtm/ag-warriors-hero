/* Command HQ → Social Coaching — captions CRUD (trilingual, country-scoped),
   the 7-day mission rotation, and the team consistency board (self-declared,
   labelled as such). Audited via the social_captions trigger. */
import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, X, Eye, EyeOff, Archive, Users, Flame, CalendarDays, MessageSquareText } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'
import { CATS } from './Social'

type TX = Record<string, string>
const tx = (en = '', ms = '', id = '') => ({ en, ms, id })
const LANGS = ['en', 'ms', 'id'] as const

interface Cap { id: number; category: string; country_scope: string; text: TX; tip: TX | null; sort: number; status: string }
interface Mis { dow: number; country_scope: string; category: string; title: TX; brief: TX | null; active: boolean }
interface TeamRow { id: string; name: string; country: string; last7: number; declared_today: boolean }

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

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

export default function SocialAdmin() {
  const [tab, setTab] = useState<'captions' | 'missions' | 'team'>('captions')
  const [caps, setCaps] = useState<Cap[]>([])
  const [missions, setMissions] = useState<Mis[]>([])
  const [team, setTeam] = useState<TeamRow[]>([])
  const [edit, setEdit] = useState<Cap | null>(null)
  const [editM, setEditM] = useState<Mis | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    if (!supabase) return
    const [c, m, t] = await Promise.all([
      supabase.from('social_captions').select('*').neq('status', 'archived').order('category').order('sort'),
      supabase.from('social_missions').select('*').order('dow'),
      supabase.rpc('social_team'),
    ])
    setCaps((c.data as Cap[]) ?? [])
    setMissions((m.data as Mis[]) ?? [])
    setTeam((t.data as TeamRow[]) ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const saveCap = async (c: Cap) => {
    if (!supabase) return
    setBusy(true)
    const row = { category: c.category, country_scope: c.country_scope, text: c.text,
      tip: c.tip, sort: c.sort, status: c.status, updated_at: new Date().toISOString() }
    const call = c.id > 0
      ? supabase.from('social_captions').update(row).eq('id', c.id)
      : supabase.from('social_captions').insert(row)
    const { error } = await call
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say('Saved'); setEdit(null); load()
  }

  const saveMission = async (m: Mis) => {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.from('social_missions')
      .update({ category: m.category, title: m.title, brief: m.brief, active: m.active })
      .eq('dow', m.dow).eq('country_scope', m.country_scope)
    setBusy(false)
    if (error) { say('⚠ ' + error.message); return }
    say('Saved'); setEditM(null); load()
  }

  const setStatus = async (id: number, status: string) => {
    if (!supabase) return
    await supabase.from('social_captions').update({ status }).eq('id', id)
    load()
  }

  return (
    <>
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {([['captions', `Captions (${caps.length})`, MessageSquareText],
           ['missions', '7-Day Rotation', CalendarDays],
           ['team', `Consistency (${team.length})`, Users]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={clsx('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-extrabold',
              tab === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* ---------------- CAPTIONS ---------------- */}
      {tab === 'captions' && (
        <>
          <button type="button"
            onClick={() => setEdit({ id: 0, category: 'property', country_scope: 'ALL',
              text: tx(), tip: tx(), sort: 100, status: 'published' })}
            className="mb-3 flex cursor-pointer items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-extrabold text-on-accent">
            <Plus size={13} /> New caption
          </button>
          {CATS.map((catDef) => {
            const list = caps.filter((c) => c.category === catDef.key)
            if (!list.length) return null
            return (
              <div key={catDef.key} className="mb-4">
                <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-muted">
                  {catDef.emoji} {catDef.label.en}
                </p>
                <Card className="divide-y divide-border">
                  {list.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 p-3 text-xs">
                      <span className="min-w-0 flex-1 truncate">{c.text.en || '(untitled)'}</span>
                      {c.country_scope !== 'ALL' && <Chip tone="accent">{c.country_scope === 'MY' ? '🇲🇾' : '🇮🇩'}</Chip>}
                      <Chip tone={c.status === 'published' ? 'success' : 'default'}>{c.status}</Chip>
                      <button type="button" aria-label="Toggle publish"
                        onClick={() => setStatus(c.id, c.status === 'published' ? 'draft' : 'published')}
                        className="cursor-pointer text-muted hover:text-ink">
                        {c.status === 'published' ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button type="button" onClick={() => setEdit(c)} aria-label="Edit"
                        className="cursor-pointer rounded-full border border-border px-2 py-0.5"><Pencil size={11} /></button>
                    </div>
                  ))}
                </Card>
              </div>
            )
          })}
        </>
      )}

      {/* ---------------- MISSIONS ---------------- */}
      {tab === 'missions' && (
        <Card className="divide-y divide-border">
          {missions.map((m) => (
            <div key={`${m.dow}-${m.country_scope}`} className="flex items-center gap-2 p-3 text-xs">
              <b className="w-20 shrink-0">{DOW[m.dow]}</b>
              <span className="min-w-0 flex-1 truncate">
                {CATS.find((x) => x.key === m.category)?.emoji} <b>{m.title.en}</b>
                <span className="text-muted"> — {m.brief?.en}</span>
              </span>
              {!m.active && <Chip>off</Chip>}
              <button type="button" onClick={() => setEditM(m)} aria-label="Edit"
                className="cursor-pointer rounded-full border border-border px-2 py-0.5"><Pencil size={11} /></button>
            </div>
          ))}
        </Card>
      )}

      {/* ---------------- TEAM CONSISTENCY ---------------- */}
      {tab === 'team' && (
        <>
          <p className="mb-2 text-[11px] text-muted">
            Self-declared posting — a consistency signal, not verified evidence.
          </p>
          <Card className="divide-y divide-border">
            {team.length === 0 && <p className="p-5 text-center text-xs text-muted">No one in scope yet.</p>}
            {team.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}
                    <span className="ml-1.5 text-[10px] font-normal text-muted">{r.country}</span>
                  </span>
                </span>
                {r.declared_today && <Chip tone="success">today ✓</Chip>}
                <Chip tone={r.last7 >= 5 ? 'success' : r.last7 >= 3 ? 'warning' : 'default'}>
                  <Flame size={11} /> {r.last7}/7
                </Chip>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* ---------------- CAPTION EDITOR ---------------- */}
      {edit && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">{edit.id ? 'Edit caption' : 'New caption'}</h2>
              <button type="button" onClick={() => setEdit(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={15} /></button>
            </div>
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <select value={edit.category} aria-label="Category"
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                {CATS.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label.en}</option>)}
              </select>
              <select value={edit.country_scope} aria-label="Country"
                onChange={(e) => setEdit({ ...edit, country_scope: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                <option value="ALL">🌐 Both countries</option>
                <option value="MY">🇲🇾 Malaysia only</option>
                <option value="ID">🇮🇩 Indonesia only</option>
              </select>
            </div>
            <p className="mb-2 rounded-lg bg-surface2 p-2 text-[10px] text-muted">
              Tip: use <b>{'{project}'}</b> anywhere — the agent's own project name fills in automatically.
            </p>
            <TriInput label="Caption" value={edit.text} rows={4} onChange={(v) => setEdit({ ...edit, text: v })} />
            <TriInput label="Coaching tip (optional)" value={edit.tip ?? tx()} rows={2}
              onChange={(v) => setEdit({ ...edit, tip: v })} />
            <div className="flex gap-2">
              <button type="button" disabled={busy || !edit.text.en?.trim()} onClick={() => saveCap(edit)}
                className="h-11 flex-1 cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                {busy ? 'Saving…' : 'Save'}
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

      {/* ---------------- MISSION EDITOR ---------------- */}
      {editM && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setEditM(null)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">{DOW[editM.dow]} mission</h2>
              <button type="button" onClick={() => setEditM(null)} aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={15} /></button>
            </div>
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <select value={editM.category} aria-label="Category"
                onChange={(e) => setEditM({ ...editM, category: e.target.value })}
                className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
                {CATS.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label.en}</option>)}
              </select>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 text-xs font-bold">
                <input type="checkbox" checked={editM.active}
                  onChange={(e) => setEditM({ ...editM, active: e.target.checked })}
                  className="h-4 w-4 accent-[var(--accent)]" /> Active
              </label>
            </div>
            <TriInput label="Title" value={editM.title} onChange={(v) => setEditM({ ...editM, title: v })} />
            <TriInput label="Brief" value={editM.brief ?? tx()} rows={2} onChange={(v) => setEditM({ ...editM, brief: v })} />
            <button type="button" disabled={busy} onClick={() => saveMission(editM)}
              className="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
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
