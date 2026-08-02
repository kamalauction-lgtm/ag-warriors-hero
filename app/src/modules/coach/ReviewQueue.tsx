/* Coach Review Queue — human-only approvals (readiness + evidence).
   Visible to elite_coach / master_mentor / super_admin. Self-review blocked server-side. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Check, RotateCcw } from 'lucide-react'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'
import CoachBoard from './CoachBoard'

interface Participant { participant_id: string; name: string }
interface ReadyRow { id: string; status: string; submitted_at: string; enrolments: { participant_id: string; goal_30d: string; profiles: { name: string } | null } | null }
interface SubRow { id: string; day_no: number; version: number; response: string; reflection: string; submitted_at: string; enrolments: { participant_id: string; profiles: { name: string } | null } | null }
interface CloseRow { id: string; status: string; required_steps: string | null; project: string | null; ch_leads: { name: string } | null; profiles: { name: string } | null }
interface PcjRow { id: string; step_code: string; response: string | null; profiles: { name: string } | null }

export default function ReviewQueue() {
  const { user } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [ready, setReady] = useState<ReadyRow[]>([])
  const [subs, setSubs] = useState<SubRow[]>([])
  const [note, setNote] = useState('')
  const [toast, setToast] = useState('')
  const [closings, setClosings] = useState<CloseRow[]>([])
  const [pcj, setPcj] = useState<PcjRow[]>([])
  const [people, setPeople] = useState<Participant[]>([])
  const [rp, setRp] = useState({ who: '', period: 'Week 1', strengths: '', progress: '', barriers: '', actions: '', next: '' })
  const [nv, setNv] = useState({ name: '', phone: '', country: 'MY', cohort: '' })
  const [nvCohorts, setNvCohorts] = useState<{ id: string; name: string }[]>([])
  const [lastInvite, setLastInvite] = useState<{ code: string; name: string; phone: string } | null>(null)
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data: r, error: e1 } = await supabase.from('readiness_submissions')
      .select('id,status,submitted_at,enrolments(participant_id,goal_30d,profiles!enrolments_participant_id_fkey(name))')
      .in('status', ['submitted', 'under_review']).order('submitted_at')
    if (e1) say('⚠ ' + e1.message)
    setReady((r as unknown as ReadyRow[]) ?? [])
    const { data: s, error: e2 } = await supabase.from('task_submissions')
      .select('id,day_no,version,response,reflection,submitted_at,enrolments(participant_id,profiles!enrolments_participant_id_fkey(name))')
      .in('status', ['submitted', 'under_review']).order('submitted_at')
    if (e2) say('⚠ ' + e2.message)
    setSubs((s as unknown as SubRow[]) ?? [])
    const { data: cl, error: e3 } = await supabase.from('ch_closings')
      .select('id,status,required_steps,project,ch_leads(name),profiles!ch_closings_participant_id_fkey(name)')
      .eq('status', 'INTERNAL_REVIEW').order('updated_at')
    if (e3) say('⚠ ' + e3.message)
    setClosings((cl as unknown as CloseRow[]) ?? [])
    const { data: pj, error: e4 } = await supabase.from('pcj_progress')
      .select('id,step_code,response,profiles!pcj_progress_participant_id_fkey(name)')
      .eq('status', 'submitted').order('updated_at')
    if (e4) say('⚠ ' + e4.message)
    setPcj((pj as unknown as PcjRow[]) ?? [])
    const { data: es } = await supabase.from('enrolments')
      .select('participant_id,profiles!enrolments_participant_id_fkey(name)')
    setPeople(((es ?? []) as unknown as { participant_id: string; profiles: { name: string } | null }[])
      .map((e) => ({ participant_id: e.participant_id, name: e.profiles?.name ?? 'Warrior' })))
    const { data: cos } = await supabase.from('cohorts').select('id,name').in('status', ['open', 'active'])
    setNvCohorts((cos as { id: string; name: string }[]) ?? [])
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
          <CoachBoard />
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
          {/* ---- Closing verification (§15) — human-only ---- */}
          <SectionTitle className="mt-4">🏁 Closing verification ({closings.length})</SectionTitle>
          {closings.length === 0 && <Card className="p-4 text-center text-xs text-muted">Queue clear ✓</Card>}
          {closings.map((c) => (
            <Card key={c.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-sm font-bold">{c.profiles?.name ?? 'Warrior'}</p>
                <Chip tone="accent">Lead: {c.ch_leads?.name ?? '—'}</Chip>
              </div>
              {c.required_steps && <p className="mb-2 rounded-lg bg-surface2 p-2 text-xs">{c.required_steps}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => act('fn_verify_closing', { p_closing: c.id, p_approve: true, p_note: note }, '🏆 Closing VERIFIED — +XP written to ledger')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white"><Check size={14} /> Verify closing</button>
                <button type="button" onClick={() => act('fn_verify_closing', { p_closing: c.id, p_approve: false, p_note: note }, 'Sent back — more documentation needed')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning"><RotateCcw size={14} /> Not yet</button>
              </div>
            </Card>
          ))}

          {/* ---- Post-closing journey review (§20) ---- */}
          <SectionTitle className="mt-4">🎓 Journey steps ({pcj.length})</SectionTitle>
          {pcj.length === 0 && <Card className="p-4 text-center text-xs text-muted">Queue clear ✓</Card>}
          {pcj.map((j) => (
            <Card key={j.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-sm font-bold">{j.profiles?.name ?? 'Warrior'}</p>
                <Chip tone="accent">{j.step_code.replaceAll('_', ' ')}</Chip>
              </div>
              {j.response && <p className="mb-2 rounded-lg bg-surface2 p-2 text-xs">{j.response}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => act('fn_review_pcj', { p_progress: j.id, p_approve: true, p_note: note }, '🎓 Step approved — Mentor Points awarded if configured')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white"><Check size={14} /> Approve</button>
                <button type="button" onClick={() => act('fn_review_pcj', { p_progress: j.id, p_approve: false, p_note: note }, 'Revision requested')}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning"><RotateCcw size={14} /> Revision</button>
              </div>
            </Card>
          ))}

          {/* ---- Invite a warrior (§6 INVITED / §21) — WhatsApp delivery only ---- */}
          <SectionTitle className="mt-5">➕ Invite a warrior</SectionTitle>
          <Card className="mb-4 p-4">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input value={nv.name} placeholder="Full name" onChange={(e) => setNv({ ...nv, name: e.target.value })}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <input value={nv.phone} placeholder="+60 / +62 phone" onChange={(e) => setNv({ ...nv, phone: e.target.value })}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <select value={nv.country} onChange={(e) => setNv({ ...nv, country: e.target.value })}
                className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
                <option value="MY">🇲🇾 Malaysia</option><option value="ID">🇮🇩 Indonesia</option>
              </select>
              <select value={nv.cohort} onChange={(e) => setNv({ ...nv, cohort: e.target.value })}
                className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
                <option value="">Cohort (optional)</option>
                {nvCohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="button" disabled={!nv.name || !nv.phone}
              onClick={async () => {
                if (!supabase) return
                const { data, error } = await supabase.rpc('fn_create_invitation', {
                  p_name: nv.name, p_phone: nv.phone.replace(/[\s-]/g, ''),
                  p_country: nv.country, p_cohort: nv.cohort || null,
                })
                if (error) say('⚠ ' + error.message)
                else {
                  setLastInvite({ code: data as string, name: nv.name, phone: nv.phone.replace(/[\s-]/g, '') })
                  setNv({ name: '', phone: '', country: 'MY', cohort: '' })
                  say('✉ Invitation created')
                }
              }}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              Create invitation
            </button>
            {lastInvite && (
              <div className="mt-3 rounded-xl border border-success/40 bg-success/10 p-3 text-center">
                <p className="text-xs font-bold">Invite for {lastInvite.name} — code {lastInvite.code}</p>
                <a target="_blank" rel="noreferrer"
                  href={`https://wa.me/${lastInvite.phone.replace('+', '')}?text=${encodeURIComponent(
                    `Salam ${lastInvite.name}! 🛡 You are invited to join IQI AG Hero — our Warriors platform. Accept here: https://hero.iqiaggroup.com/#/join/${lastInvite.code}`)}`}
                  className="mt-2 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-xl bg-success text-xs font-extrabold text-white">
                  📲 Send via WhatsApp
                </a>
              </div>
            )}
          </Card>

          {/* ---- Coaching report (§16) ---- */}
          <SectionTitle className="mt-5">🧭 Coaching report — write & share</SectionTitle>
          <Card className="mb-6 p-4">
            <select value={rp.who} onChange={(e) => setRp({ ...rp, who: e.target.value })}
              className="mb-2 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
              <option value="">Choose participant…</option>
              {people.map((p) => <option key={p.participant_id} value={p.participant_id}>{p.name}</option>)}
            </select>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input value={rp.period} onChange={(e) => setRp({ ...rp, period: e.target.value })} placeholder="Period (e.g. Week 1)"
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <input type="date" value={rp.next} onChange={(e) => setRp({ ...rp, next: e.target.value })} aria-label="Next review"
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            </div>
            {([['strengths', 'Strengths'], ['progress', 'Progress'], ['barriers', 'Barriers'], ['actions', 'Agreed actions + due dates']] as const).map(([k, ph]) => (
              <textarea key={k} rows={2} value={rp[k]} placeholder={ph}
                onChange={(e) => setRp({ ...rp, [k]: e.target.value })}
                className="mb-2 w-full rounded-xl border border-border bg-surface p-2.5 text-sm outline-none focus:border-accent" />
            ))}
            <button type="button" disabled={!rp.who || !rp.progress}
              onClick={() => act('fn_share_report', {
                p_participant: rp.who, p_period: rp.period,
                p_strengths: rp.strengths, p_progress: rp.progress, p_barriers: rp.barriers,
                p_actions: rp.actions, p_next_review: rp.next || null,
              }, '🧭 Report shared — participant notified')}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              Share report with participant
            </button>
            <p className="mt-2 text-[10px] text-muted">Comments must be professional, specific, linked to observable evidence (§16). No hidden scoring.</p>
          </Card>
        </>
      )}
      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
