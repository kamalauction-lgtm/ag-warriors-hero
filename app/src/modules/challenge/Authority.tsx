/* Phase 3 — the surfaces the 28 Aug audit found missing (097):
   1. AUTHORITY: who may verify closings / own country content. Production had
      ZERO closing.verify holders, which silently made every closing
      unverifiable — the banner below stays red until that is fixed.
   2. VERIFIER QUEUE: closings a human must decide (read-only for admins who
      hold no permission; fn_verify_closing enforces the permission itself).
   3. PILOT WATCH: per-warrior alert levels. Built because the live pilot
      missed 7/7 days and no screen showed it.
   4. CONTENT GAPS: the CONTENT_REQUIRED country days still waiting for
      authorised local content. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface Grant { user_id: string; name: string; country: string; permission: string; granted_at: string; granted_by: string | null; note: string | null }
interface QueueRow {
  closing_id: string; status: string; country: string; participant: string
  coach: string | null; project: string | null; lead_name: string | null
  required_steps: string | null; missing_items: string | null
  expected_review: string | null; updated_at: string
}
interface WatchRow {
  enrolment_id: string; participant: string; country: string; status: string
  cohort: string; coach: string | null; activated_at: string; accessible_day: number
  days_approved: number; days_waiting_review: number; days_missed: number
  last_submission_at: string | null; leads: number; touches_7d: number
  alert_level: 'red' | 'amber' | 'green' | 'grey'
}
interface Gap { day_no: number; country: string; title: string }

const PERMS = [
  { key: 'closing.verify', label: 'Verify closings', why: 'May confirm a real closing. Without a holder, no closing can ever be verified.' },
  { key: 'content.own', label: 'Own country content', why: 'Writes the legal/commission curriculum days for their country.' },
  { key: 'content.review', label: 'Review country content', why: 'Second pair of eyes before country content goes live.' },
]
const ALERT: Record<string, { label: string; cls: string }> = {
  red: { label: 'needs intervention', cls: 'bg-danger/15 text-danger' },
  amber: { label: 'slipping', cls: 'bg-warning/15 text-warning' },
  green: { label: 'on track', cls: 'bg-success/15 text-success' },
  grey: { label: 'not active', cls: 'bg-surface2 text-muted' },
}

export default function Authority({ realId, onSaved }: { realId: boolean; onSaved: (m: string) => void }) {
  const [grants, setGrants] = useState<Grant[]>([])
  const [coverage, setCoverage] = useState<Record<string, number>>({})
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [queueNote, setQueueNote] = useState('')
  const [watch, setWatch] = useState<WatchRow[]>([])
  const [gaps, setGaps] = useState<Gap[]>([])
  const [owners, setOwners] = useState<{ name: string; permission: string; country: string }[]>([])
  const [roster, setRoster] = useState<{ id: string; name: string; country: string }[]>([])
  const [form, setForm] = useState({ user: '', permission: 'closing.verify', country: 'MY', note: '' })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!realId || !supabase) { setState('ready'); return }
    setState('loading')
    const [a, v, w, g, r] = await Promise.all([
      supabase.rpc('fn_authority_board'),
      supabase.rpc('fn_verifier_queue'),
      supabase.rpc('fn_pilot_watch'),
      supabase.rpc('fn_content_board'),
      supabase.from('profiles').select('id,name,country').eq('status', 'active').order('name'),
    ])
    if (a.error) { setErr(a.error.message); setState('error'); return }
    const ab = a.data as unknown as { grants: Grant[]; coverage: Record<string, number> }
    setGrants(ab.grants); setCoverage(ab.coverage)
    if (!v.error) {
      const vb = v.data as unknown as { queue: QueueRow[]; is_admin_readonly: boolean; can_verify_countries: string[] }
      setQueue(vb.queue)
      setQueueNote(vb.is_admin_readonly
        ? 'You can SEE this queue as admin, but verifying needs the closing.verify permission — grant it above (to yourself if you are the verifier).'
        : `You may verify for: ${vb.can_verify_countries.join(', ')}`)
    }
    if (!w.error) setWatch(w.data as unknown as WatchRow[])
    if (!g.error) {
      const gb = g.data as unknown as { gaps: Gap[]; owners: typeof owners }
      setGaps(gb.gaps); setOwners(gb.owners)
    }
    setRoster((r.data as typeof roster) ?? [])
    setState('ready')
  }, [realId])
  useEffect(() => { load() }, [load])

  const setGrant = async (user: string, permission: string, country: string, grant: boolean, note: string) => {
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.rpc('fn_admin_grant_permission', {
      p_user: user, p_permission: permission, p_country: country, p_grant: grant, p_note: note || null,
    })
    setBusy(false)
    if (error) { onSaved('⚠ ' + error.message); return }
    onSaved(grant ? 'Authority granted' : 'Authority revoked'); load()
  }

  const verify = async (row: QueueRow, approve: boolean) => {
    if (!supabase) return
    const note = window.prompt(approve
      ? `Verify ${row.participant}'s closing on ${row.project ?? row.lead_name ?? 'this deal'}? Note (optional):`
      : 'Send back — what is missing? (the participant sees this)')
    if (note === null) return
    if (!approve && !note.trim()) { onSaved('A reason is required to send a closing back'); return }
    setBusy(true)
    const { error } = await supabase.rpc('fn_verify_closing',
      { p_closing: row.closing_id, p_approve: approve, p_note: note.trim() || null })
    setBusy(false)
    if (error) { onSaved('⚠ ' + error.message); return }
    onSaved(approve ? `✅ Closing verified — ${row.participant}` : 'Sent back with your note'); load()
  }

  const missing = useMemo(() =>
    (['MY', 'ID'] as const).filter((c) => (coverage[`closing.verify.${c}`] ?? 0) === 0), [coverage])
  const results = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? roster.filter((r) => r.name.toLowerCase().includes(n)).slice(0, 8) : []
  }, [q, roster])

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Sign in with your real account on production.</Card>
  if (state === 'error') return <Card className="p-6 text-center text-sm text-danger">⚠ {err}</Card>

  const btn = 'cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-extrabold disabled:opacity-40'
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={load} disabled={state === 'loading'}
          className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40">
          <RefreshCw size={13} className={state === 'loading' ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* ---------------- 1 · AUTHORITY ---------------- */}
      {missing.length > 0 && (
        <Card className="mb-3 border-danger/60 p-4">
          <p className="text-sm font-extrabold text-danger">⛔ AUTHORITY REQUIRED — {missing.join(' and ')} cannot verify closings</p>
          <p className="mt-1 text-xs text-muted">
            No one holds <b>closing.verify</b> for {missing.join(' / ')}. Until you grant it below, a warrior's
            real closing can never be confirmed and <code>first_closing</code> can never be awarded.
          </p>
        </Card>
      )}

      <SectionTitle>Authority — who may decide what</SectionTitle>
      <Card className="mb-3 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <input value={form.user ? (roster.find((r) => r.id === form.user)?.name ?? '') : q}
              onChange={(e) => { setQ(e.target.value); setForm({ ...form, user: '' }) }}
              placeholder="Search person…"
              className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            {results.length > 0 && !form.user && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-border bg-bg shadow-lg">
                {results.map((r) => (
                  <button key={r.id} type="button"
                    onClick={() => { setForm({ ...form, user: r.id, country: r.country }); setQ('') }}
                    className="block w-full cursor-pointer px-3 py-2 text-left text-xs hover:bg-surface2">
                    {r.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={form.permission} onChange={(e) => setForm({ ...form, permission: e.target.value })}
            aria-label="Permission" className="h-10 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
            {PERMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
            aria-label="Country" className="h-10 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none">
            <option value="MY">🇲🇾 MY</option><option value="ID">🇮🇩 ID</option>
          </select>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Note (why)" className="h-10 min-w-[140px] rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          <button type="button" disabled={busy || !form.user}
            onClick={() => setGrant(form.user, form.permission, form.country, true, form.note)}
            className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
            <ShieldCheck size={14} /> Grant
          </button>
        </div>
        <p className="mb-3 text-[11px] text-muted">{PERMS.find((p) => p.key === form.permission)?.why}</p>

        {grants.length === 0 && <p className="text-xs text-muted">No authority granted yet — nothing can be verified.</p>}
        {grants.map((g) => (
          <div key={`${g.user_id}${g.permission}${g.country}`}
            className="mb-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-xs last:mb-0">
            <span className="font-bold">{g.country === 'ID' ? '🇮🇩' : '🇲🇾'} {g.name}</span>
            <Chip tone="accent">{PERMS.find((p) => p.key === g.permission)?.label ?? g.permission}</Chip>
            <span className="text-muted">by {g.granted_by ?? 'system'}{g.note ? ` · ${g.note}` : ''}</span>
            <span className="flex-1" />
            <button type="button" disabled={busy}
              onClick={() => window.confirm(`Revoke ${g.permission} (${g.country}) from ${g.name}?`)
                && setGrant(g.user_id, g.permission, g.country, false, 'revoked from Command HQ')}
              className={`${btn} border-danger/50 text-danger`}>Revoke</button>
          </div>
        ))}
      </Card>

      {/* ---------------- 2 · VERIFIER QUEUE ---------------- */}
      <SectionTitle>Closings awaiting a human decision</SectionTitle>
      <Card className="mb-3 p-4">
        {queueNote && <p className="mb-3 text-[11px] text-muted">{queueNote}</p>}
        {queue.length === 0 && <p className="text-xs text-muted">Nothing waiting. A closing appears here when it reaches Internal Review or Customer Decision.</p>}
        {queue.map((r) => (
          <div key={r.closing_id} className="mb-2 rounded-xl border border-border p-3 last:mb-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold">{r.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.participant}</span>
              <Chip tone="warning">{r.status.replace('_', ' ').toLowerCase()}</Chip>
              <span className="text-muted">{r.project ?? r.lead_name ?? 'deal'}{r.coach ? ` · coach ${r.coach}` : ''}</span>
              <span className="flex-1" />
              <button type="button" disabled={busy} onClick={() => verify(r, true)}
                className={`${btn} border-success/60 text-success`}>Verify</button>
              <button type="button" disabled={busy} onClick={() => verify(r, false)}
                className={`${btn} border-border text-muted`}>Send back</button>
            </div>
            {(r.missing_items || r.required_steps) && (
              <p className="mt-1.5 text-[11px] text-muted">
                {r.required_steps && <>steps: {r.required_steps} · </>}
                {r.missing_items && <span className="text-warning">missing: {r.missing_items}</span>}
              </p>
            )}
          </div>
        ))}
      </Card>

      {/* ---------------- 3 · PILOT WATCH ---------------- */}
      <SectionTitle>Pilot watch — every warrior, one line, worst first</SectionTitle>
      <Card className="mb-3 divide-y divide-border">
        {watch.length === 0 && <p className="p-4 text-center text-xs text-muted">No enrolments.</p>}
        {watch.map((w) => (
          <div key={w.enrolment_id} className="flex flex-wrap items-center gap-2 p-3 text-xs">
            <span className={clsx('rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase', ALERT[w.alert_level].cls)}>
              {ALERT[w.alert_level].label}
            </span>
            <span className="font-bold">{w.country === 'ID' ? '🇮🇩' : '🇲🇾'} {w.participant}</span>
            <span className="text-muted">{w.cohort}{w.coach ? ` · coach ${w.coach}` : ' · NO COACH'}</span>
            <span className="flex-1" />
            <span className="font-mono text-[11px] text-muted">
              day {w.accessible_day} · ✓{w.days_approved} · ✗{w.days_missed} missed · {w.leads} leads · {w.touches_7d} touches/7d
            </span>
            <span className="text-[11px] text-muted">
              {w.last_submission_at
                ? `last: ${new Date(w.last_submission_at).toLocaleDateString()}`
                : 'never submitted'}
            </span>
          </div>
        ))}
      </Card>

      {/* ---------------- 4 · CONTENT GAPS ---------------- */}
      <SectionTitle>Country content still required ({gaps.length})</SectionTitle>
      <Card className="mb-4 p-4">
        <p className="mb-3 text-[11px] text-muted">
          These days show the generic fallback until authorised local content lands — legal, commission and
          process material is never invented.
          {owners.length === 0
            ? ' No content owner or reviewer is assigned yet — grant content.own above.'
            : ` Owners: ${owners.map((o) => `${o.name} (${o.permission.split('.')[1]} ${o.country})`).join(', ')}.`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {gaps.map((g) => (
            <Chip key={`${g.country}${g.day_no}`} tone="warning">
              {g.country === 'ID' ? '🇮🇩' : '🇲🇾'} Day {g.day_no} · {g.title}
            </Chip>
          ))}
          {gaps.length === 0 && <p className="text-xs text-success">All country days have real content. 🎉</p>}
        </div>
        <p className="mt-3 text-[10px] text-muted">Edit in ✏️ Curriculum once content is sourced; set status OK there.</p>
      </Card>
    </>
  )
}
