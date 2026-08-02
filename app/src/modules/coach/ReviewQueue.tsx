/* Coach Review Queue — human-only approvals (readiness + evidence).
   Visible to elite_coach / master_mentor / super_admin. Self-review blocked server-side. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Check, RotateCcw } from 'lucide-react'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface ReadyRow { id: string; status: string; submitted_at: string; enrolments: { participant_id: string; goal_30d: string; profiles: { name: string } | null } | null }
interface SubRow { id: string; day_no: number; version: number; response: string; reflection: string; submitted_at: string; enrolments: { participant_id: string; profiles: { name: string } | null } | null }

export default function ReviewQueue() {
  const { user } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [ready, setReady] = useState<ReadyRow[]>([])
  const [subs, setSubs] = useState<SubRow[]>([])
  const [note, setNote] = useState('')
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data: r } = await supabase.from('readiness_submissions')
      .select('id,status,submitted_at,enrolments(participant_id,goal_30d,profiles(name))')
      .in('status', ['submitted', 'under_review']).order('submitted_at')
    setReady((r as unknown as ReadyRow[]) ?? [])
    const { data: s } = await supabase.from('task_submissions')
      .select('id,day_no,version,response,reflection,submitted_at,enrolments(participant_id,profiles(name))')
      .in('status', ['submitted', 'under_review']).order('submitted_at')
    setSubs((s as unknown as SubRow[]) ?? [])
  }, [isReal])
  useEffect(() => { load() }, [load])

  const act = async (fn: string, args: object, ok: string) => {
    if (!supabase) return
    const { error } = await supabase.rpc(fn, args)
    if (error) say('⚠ ' + error.message)
    else { say(ok); setNote(''); load() }
  }

  if (!user) return null
  return (
    <div className="animate-rise px-4 pt-5">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/team" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Coach Review Queue</h1>
          <p className="text-xs text-muted">Human approval only — every decision is audit-logged</p>
        </div>
        <Chip tone="accent"><ShieldCheck size={11} /> Coach</Chip>
      </header>

      {!isReal ? (
        <Card className="p-6 text-center text-sm text-muted">Sign in with a real Coach/Admin account to review.</Card>
      ) : (
        <>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (shared with participant)…"
            className="mb-4 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />

          <SectionTitle>Readiness approvals ({ready.length})</SectionTitle>
          {ready.length === 0 && <Card className="mb-4 p-4 text-center text-xs text-muted">Queue clear ✓</Card>}
          {ready.map((r) => (
            <Card key={r.id} className="mb-2.5 p-3.5">
              <p className="text-sm font-bold">{r.enrolments?.profiles?.name ?? 'Warrior'}</p>
              <p className="mb-2 text-xs text-muted">Goal: {r.enrolments?.goal_30d ?? '—'}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => act('fn_review_readiness', { p_readiness: r.id, p_approve: true, p_note: note }, '✅ Readiness approved — enrolment ACTIVE')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white"><Check size={14} /> Approve</button>
                <button type="button" onClick={() => act('fn_review_readiness', { p_readiness: r.id, p_approve: false, p_note: note }, 'Revision requested')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning"><RotateCcw size={14} /> Revision</button>
              </div>
            </Card>
          ))}

          <SectionTitle className="mt-4">Evidence review ({subs.length})</SectionTitle>
          {subs.length === 0 && <Card className="p-4 text-center text-xs text-muted">Queue clear ✓</Card>}
          {subs.map((s) => (
            <Card key={s.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-sm font-bold">{s.enrolments?.profiles?.name ?? 'Warrior'}</p>
                <Chip tone="accent">Day {s.day_no}</Chip>
                {s.version > 1 && <Chip tone="warning">v{s.version}</Chip>}
              </div>
              <p className="mb-1 rounded-lg bg-surface2 p-2 text-xs">{s.response}</p>
              {s.reflection && <p className="mb-2 text-[11px] italic text-muted">"{s.reflection}"</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => act('fn_review_submission', { p_submission: s.id, p_approve: true, p_note: note }, '✅ Approved — verified XP written to ledger')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white"><Check size={14} /> Approve + XP</button>
                <button type="button" onClick={() => act('fn_review_submission', { p_submission: s.id, p_approve: false, p_note: note }, 'Revision requested — original preserved')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning"><RotateCcw size={14} /> Revision</button>
              </div>
            </Card>
          ))}
        </>
      )}
      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
