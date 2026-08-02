/* Post-Closing Journey (§20) — DB-driven steps, human-reviewed, verified Mentor Points (§19).
   Eligibility for Elite Coach is decided by leadership — the system only shows indicators. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Lock, GraduationCap } from 'lucide-react'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

const LKEY: Record<string, string> = { en: 'en', bm: 'ms-MY', id: 'id-ID' }
const jt = (j: Record<string, string> | null | undefined, loc: string) =>
  j?.[LKEY[loc] ?? 'en'] ?? j?.en ?? ''

interface Step {
  code: string; step_no: number; title: Record<string, string>
  description: Record<string, string>; mentor_points: number; open_without_closing: boolean
}
interface Prog { step_code: string; status: string; response: string | null; review_note: string | null }

export default function Journey() {
  const { user, locale } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [steps, setSteps] = useState<Step[]>([])
  const [prog, setProg] = useState<Record<string, Prog>>({})
  const [hasClosing, setHasClosing] = useState(false)
  const [mp, setMp] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [resp, setResp] = useState('')
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const [s, p, c, m] = await Promise.all([
      supabase.from('pcj_steps').select('*').eq('active', true).order('step_no'),
      supabase.from('pcj_progress').select('step_code,status,response,review_note').eq('participant_id', user!.id),
      supabase.from('ch_closings').select('id').eq('participant_id', user!.id).eq('status', 'COMPLETED').limit(1),
      supabase.from('mentor_points_ledger').select('amount').eq('user_id', user!.id).eq('status', 'verified'),
    ])
    if (s.error) say('⚠ steps: ' + s.error.message)
    setSteps((s.data as Step[]) ?? [])
    const map: Record<string, Prog> = {}
    ;((p.data as Prog[]) ?? []).forEach((r) => { map[r.step_code] = r })
    setProg(map)
    setHasClosing((c.data ?? []).length > 0)
    setMp(((m.data as { amount: number }[]) ?? []).reduce((t, r) => t + r.amount, 0))
  }, [isReal, user])
  useEffect(() => { load() }, [load])

  const submit = async (code: string) => {
    if (!supabase || !resp) return
    const { error } = await supabase.rpc('fn_submit_pcj', { p_step: code, p_response: resp })
    if (error) say('⚠ ' + error.message)
    else { say('🎓 Submitted for human review'); setResp(''); setOpen(null); load() }
  }

  if (!user) return null
  const approved = Object.values(prog).filter((p) => p.status === 'approved').length

  return (
    <div className="animate-rise px-4 pt-5 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/challenge" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">Post-Closing Journey</h1>
          <p className="text-xs text-muted">Closing → helping → leading. The Elite Coach path.</p>
        </div>
        <Chip tone="accent"><GraduationCap size={11} /> {mp} MP</Chip>
      </header>

      {!isReal ? (
        <Card className="p-6 text-center text-sm text-muted">Sign in with a real account to walk the journey.</Card>
      ) : (
        <>
          <Card className="mb-4 p-3.5 text-center">
            <p className="text-xs text-muted">
              {hasClosing
                ? `Verified closing unlocked your journey · ${approved}/${steps.length} steps approved`
                : 'Most steps unlock after your first verified closing — 🔓 steps are open now'}
            </p>
          </Card>

          <SectionTitle>The journey</SectionTitle>
          {steps.map((s) => {
            const p = prog[s.code]
            const locked = !hasClosing && !s.open_without_closing
            const tone = p?.status === 'approved' ? 'success' : p?.status === 'submitted' ? 'warning'
              : p?.status === 'revision_required' ? 'danger' : 'muted'
            return (
              <Card key={s.code} className="mb-2.5 p-3.5">
                <button type="button" disabled={locked} onClick={() => { setOpen(open === s.code ? null : s.code); setResp(p?.response ?? '') }}
                  className="flex w-full cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-extrabold">
                    {locked ? <Lock size={12} className="text-muted" /> : s.step_no}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{jt(s.title, locale)}</p>
                    {s.mentor_points > 0 && <p className="text-[10px] text-muted">+{s.mentor_points} Mentor Points on approval</p>}
                  </div>
                  {p ? <Chip tone={tone}>{p.status.replaceAll('_', ' ')}</Chip>
                    : locked ? <Chip tone="muted">🔒</Chip> : <Chip tone="accent">open</Chip>}
                </button>

                {open === s.code && !locked && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 text-xs text-muted">{jt(s.description, locale)}</p>
                    {p?.status === 'revision_required' && p.review_note && (
                      <p className="mb-2 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">🔄 Reviewer: {p.review_note}</p>
                    )}
                    {p?.status === 'approved' ? (
                      <p className="rounded-lg bg-success/10 p-2 text-xs text-success">✅ Approved — {p.response}</p>
                    ) : (
                      <>
                        <textarea rows={3} value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Your response…"
                          className="mb-2 w-full rounded-xl border border-border bg-surface p-2.5 text-sm outline-none focus:border-accent" />
                        <button type="button" disabled={!resp} onClick={() => submit(s.code)}
                          className="h-11 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent disabled:opacity-40">
                          {p?.status === 'submitted' ? 'Resubmit for review' : 'Submit for human review'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
          <p className="mt-3 text-center text-[10px] text-muted">
            Elite Coach eligibility is reviewed and decided by leadership (§19) — Mentor Points are indicators, never automatic appointment.
          </p>
        </>
      )}
      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
