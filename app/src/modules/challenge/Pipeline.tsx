/* Challenge CRM (§12–15) — participant-private pipeline.
   Leads → activities → appointments/viewings → closing record.
   Closing COMPLETED is unreachable from here: human verification only (fn_verify_closing). */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Phone, CalendarDays, Flag, Trophy } from 'lucide-react'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

const STAGES = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'APPOINTMENT_SET', 'PRESENTATION_OR_VIEWING',
  'FOLLOW_UP', 'NEGOTIATION', 'CLOSING_PROCESS', 'CLOSED_WON', 'CLOSED_LOST', 'NURTURE', 'DISQUALIFIED'] as const
const ACTIVITIES = ['call', 'message', 'email', 'meeting', 'appointment', 'presentation', 'viewing', 'follow_up',
  'document_request', 'coach_consultation', 'negotiation', 'closing_update', 'nurture_action'] as const
const APPT_STATUS = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'FOLLOW_UP_REQUIRED'] as const
// participant-reachable closing statuses (§15: COMPLETED = human verify only)
const CLOSE_STATUS = ['NOT_STARTED', 'PREPARING', 'DOCUMENTATION', 'CUSTOMER_DECISION', 'DELAYED', 'CANCELLED', 'UNSUCCESSFUL'] as const

const stageTone = (s: string) =>
  s === 'CLOSED_WON' ? 'success' : s === 'CLOSED_LOST' || s === 'DISQUALIFIED' ? 'danger'
    : s === 'CLOSING_PROCESS' || s === 'NEGOTIATION' ? 'accent' : 'muted'

interface Lead {
  id: string; name: string; contact: string | null; source: string | null; interest: string | null
  stage: string; next_action: string | null; next_action_at: string | null; notes: string | null
}
interface Act { id: string; activity_type: string; outcome: string | null; happened_at: string }
interface Appt { id: string; kind: string; status: string; starts_at: string | null; location: string | null }
interface Closing { id: string; status: string; required_steps: string | null; missing_items: string | null; verified_at: string | null }

export default function Pipeline() {
  const { user } = useApp()
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [leads, setLeads] = useState<Lead[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [acts, setActs] = useState<Act[]>([])
  const [appts, setAppts] = useState<Appt[]>([])
  const [closing, setClosing] = useState<Closing | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [nl, setNl] = useState({ name: '', contact: '', source: 'Referral', interest: '' })
  const [na, setNa] = useState({ type: 'call', outcome: '' })
  const [nap, setNap] = useState({ kind: 'appointment', when: '', location: '' })
  const [toast, setToast] = useState('')
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data, error } = await supabase.from('ch_leads').select('*')
      .eq('participant_id', user!.id).order('updated_at', { ascending: false })
    if (error) say('⚠ ' + error.message)
    setLeads((data as Lead[]) ?? [])
  }, [isReal, user])
  useEffect(() => { load() }, [load])

  const loadDetail = useCallback(async (leadId: string) => {
    if (!supabase) return
    const [a, p, c] = await Promise.all([
      supabase.from('ch_lead_activities').select('id,activity_type,outcome,happened_at')
        .eq('lead_id', leadId).order('happened_at', { ascending: false }).limit(5),
      supabase.from('ch_appointments').select('id,kind,status,starts_at,location')
        .eq('lead_id', leadId).order('starts_at'),
      supabase.from('ch_closings').select('id,status,required_steps,missing_items,verified_at')
        .eq('lead_id', leadId).limit(1),
    ])
    setActs((a.data as Act[]) ?? [])
    setAppts((p.data as Appt[]) ?? [])
    setClosing((c.data?.[0] as Closing) ?? null)
  }, [])
  useEffect(() => { if (open) loadDetail(open) }, [open, loadDetail])

  const patchLead = async (id: string, patch: object, ok = 'Saved') => {
    if (!supabase) return
    const { error } = await supabase.from('ch_leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) say('⚠ ' + error.message); else { say(ok); load() }
  }

  const addLead = async () => {
    if (!supabase || !nl.name) return
    const { error } = await supabase.from('ch_leads').insert({
      participant_id: user!.id, country: user!.country, name: nl.name,
      contact: nl.contact, source: nl.source, interest: nl.interest,
    })
    if (error) say('⚠ ' + error.message)
    else { say('📇 Lead added'); setNl({ name: '', contact: '', source: 'Referral', interest: '' }); setShowAdd(false); load() }
  }

  const logActivity = async (lead: Lead) => {
    if (!supabase || !na.outcome) return
    const { error } = await supabase.from('ch_lead_activities').insert({
      lead_id: lead.id, participant_id: user!.id, activity_type: na.type, outcome: na.outcome,
    })
    if (error) { say('⚠ ' + error.message); return }
    await patchLead(lead.id, { last_contact_at: new Date().toISOString().slice(0, 10) }, '📞 Activity logged')
    setNa({ type: 'call', outcome: '' })
    loadDetail(lead.id)
  }

  const addAppt = async (lead: Lead) => {
    if (!supabase || !nap.when) return
    const { error } = await supabase.from('ch_appointments').insert({
      lead_id: lead.id, participant_id: user!.id, kind: nap.kind, status: 'SCHEDULED',
      starts_at: new Date(nap.when).toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: nap.location,
    })
    if (error) say('⚠ ' + error.message)
    else { say('📅 ' + nap.kind + ' scheduled'); setNap({ kind: 'appointment', when: '', location: '' }); loadDetail(lead.id) }
  }

  const startClosing = async (lead: Lead) => {
    if (!supabase) return
    const { error } = await supabase.from('ch_closings').insert({
      lead_id: lead.id, participant_id: user!.id, country: user!.country, status: 'PREPARING',
    })
    if (error) say('⚠ ' + error.message)
    else { say('🏁 Closing record started'); patchLead(lead.id, { stage: 'CLOSING_PROCESS' }, '🏁 Closing record started'); loadDetail(lead.id) }
  }

  const patchClosing = async (patch: object, ok = 'Saved') => {
    if (!supabase || !closing || !open) return
    const { error } = await supabase.from('ch_closings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', closing.id)
    if (error) say('⚠ ' + error.message); else { say(ok); loadDetail(open) }
  }

  const submitClosing = async () => {
    if (!supabase || !closing || !open) return
    const { error } = await supabase.rpc('fn_submit_closing', { p_closing: closing.id })
    if (error) say('⚠ ' + error.message)
    else { say('🏁 Submitted — Coach will verify'); loadDetail(open) }
  }

  if (!user) return null
  const won = leads.filter((l) => l.stage === 'CLOSED_WON').length
  const active = leads.filter((l) => !['CLOSED_WON', 'CLOSED_LOST', 'DISQUALIFIED'].includes(l.stage)).length

  return (
    <div className="animate-rise px-4 pt-5 pb-8">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/challenge" aria-label="Back" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">My Pipeline</h1>
          <p className="text-xs text-muted">30DC CRM — private to you & your Coach</p>
        </div>
        <Chip tone="accent">{active} active</Chip>
        {won > 0 && <Chip tone="success"><Trophy size={11} /> {won} won</Chip>}
      </header>

      {!isReal ? (
        <Card className="p-6 text-center text-sm text-muted">Sign in with a real account to use the live pipeline.</Card>
      ) : (
        <>
          <button type="button" onClick={() => setShowAdd(!showAdd)}
            className="mb-3 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-sm font-extrabold text-on-accent">
            <Plus size={16} /> New lead
          </button>
          {showAdd && (
            <Card className="mb-4 p-4">
              {([['name', 'Name / approved identifier *'], ['contact', 'Contact (phone / WhatsApp)'], ['interest', 'Project / interest']] as const).map(([k, ph]) => (
                <input key={k} value={nl[k]} placeholder={ph} onChange={(e) => setNl({ ...nl, [k]: e.target.value })}
                  className="mb-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              ))}
              <select value={nl.source} onChange={(e) => setNl({ ...nl, source: e.target.value })}
                className="mb-3 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
                {['Referral', 'Social media', 'Cold outreach', 'Event / booth', 'Personal network', 'Company lead', 'Other'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <button type="button" disabled={!nl.name} onClick={addLead}
                className="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">Save lead</button>
            </Card>
          )}

          <SectionTitle>Leads ({leads.length})</SectionTitle>
          {leads.length === 0 && <Card className="p-5 text-center text-xs text-muted">No leads yet — prospecting is Day 1 discipline. Add your first lead 💪</Card>}
          {leads.map((l) => (
            <Card key={l.id} className="mb-2.5 p-3.5">
              <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} className="flex w-full cursor-pointer items-center gap-2 text-left">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{l.name}</p>
                  <p className="truncate text-[11px] text-muted">{l.interest || l.source || '—'}{l.next_action ? ` · Next: ${l.next_action}` : ''}</p>
                </div>
                <Chip tone={stageTone(l.stage)}>{l.stage.replaceAll('_', ' ')}</Chip>
              </button>

              {open === l.id && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <select value={l.stage} onChange={(e) => patchLead(l.id, { stage: e.target.value }, 'Stage → ' + e.target.value)}
                      className="h-10 cursor-pointer rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent">
                      {STAGES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <input defaultValue={l.next_action ?? ''} placeholder="Next action" onBlur={(e) => e.target.value !== (l.next_action ?? '') && patchLead(l.id, { next_action: e.target.value })}
                      className="h-10 rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent" />
                  </div>

                  {/* activity log */}
                  <p className="mb-1 mt-3 text-[11px] font-bold text-muted"><Phone size={10} className="mr-1 inline" />LOG ACTIVITY</p>
                  <div className="mb-2 flex gap-2">
                    <select value={na.type} onChange={(e) => setNa({ ...na, type: e.target.value })}
                      className="h-10 w-32 cursor-pointer rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent">
                      {ACTIVITIES.map((a) => <option key={a} value={a}>{a.replaceAll('_', ' ')}</option>)}
                    </select>
                    <input value={na.outcome} placeholder="Outcome…" onChange={(e) => setNa({ ...na, outcome: e.target.value })}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent" />
                    <button type="button" disabled={!na.outcome} onClick={() => logActivity(l)}
                      className="h-10 cursor-pointer rounded-xl bg-accent px-3 text-xs font-extrabold text-on-accent disabled:opacity-40">Log</button>
                  </div>
                  {acts.map((a) => (
                    <p key={a.id} className="text-[11px] text-muted">· {a.activity_type.replaceAll('_', ' ')} — {a.outcome} <span className="opacity-60">({new Date(a.happened_at).toLocaleDateString()})</span></p>
                  ))}

                  {/* appointments */}
                  <p className="mb-1 mt-3 text-[11px] font-bold text-muted"><CalendarDays size={10} className="mr-1 inline" />APPOINTMENTS & VIEWINGS</p>
                  <div className="mb-2 flex gap-2">
                    <select value={nap.kind} onChange={(e) => setNap({ ...nap, kind: e.target.value })}
                      className="h-10 w-28 cursor-pointer rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent">
                      {['appointment', 'viewing', 'presentation'].map((k) => <option key={k}>{k}</option>)}
                    </select>
                    <input type="datetime-local" value={nap.when} onChange={(e) => setNap({ ...nap, when: e.target.value })} aria-label="When"
                      className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent" />
                    <button type="button" disabled={!nap.when} onClick={() => addAppt(l)}
                      className="h-10 cursor-pointer rounded-xl bg-accent px-3 text-xs font-extrabold text-on-accent disabled:opacity-40">Set</button>
                  </div>
                  {appts.map((p) => (
                    <div key={p.id} className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                      <span className="flex-1">· {p.kind} {p.starts_at ? new Date(p.starts_at).toLocaleString() : ''} {p.location ?? ''}</span>
                      <select value={p.status} onChange={async (e) => { await supabase!.from('ch_appointments').update({ status: e.target.value, updated_at: new Date().toISOString() }).eq('id', p.id); loadDetail(l.id) }}
                        className="h-7 cursor-pointer rounded-lg border border-border bg-surface px-1 text-[10px] outline-none">
                        {APPT_STATUS.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  ))}

                  {/* closing record */}
                  <p className="mb-1 mt-3 text-[11px] font-bold text-muted"><Flag size={10} className="mr-1 inline" />CLOSING RECORD</p>
                  {!closing ? (
                    <button type="button" onClick={() => startClosing(l)}
                      className="h-10 w-full cursor-pointer rounded-xl border border-accent/60 text-xs font-extrabold text-accent">🏁 Start closing record</button>
                  ) : closing.status === 'COMPLETED' ? (
                    <Card className="border-success/40 bg-success/10 p-3 text-center">
                      <p className="text-sm font-extrabold text-success">🏆 CLOSING VERIFIED</p>
                      <p className="text-[11px] text-muted">Human-verified {closing.verified_at ? new Date(closing.verified_at).toLocaleDateString() : ''}</p>
                    </Card>
                  ) : closing.status === 'INTERNAL_REVIEW' ? (
                    <Card className="border-warning/40 p-3 text-center">
                      <p className="text-xs font-bold text-warning">⏳ Awaiting human verification</p>
                    </Card>
                  ) : (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <select value={closing.status} onChange={(e) => patchClosing({ status: e.target.value }, 'Closing → ' + e.target.value)}
                          className="h-10 flex-1 cursor-pointer rounded-xl border border-border bg-surface px-2 text-xs outline-none focus:border-accent">
                          {CLOSE_STATUS.map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
                        </select>
                      </div>
                      {closing.missing_items && <p className="mb-2 rounded-lg bg-warning/10 p-2 text-[11px] text-warning">🔄 Reviewer: {closing.missing_items}</p>}
                      <textarea rows={2} defaultValue={closing.required_steps ?? ''} placeholder="Required steps / documents status…"
                        onBlur={(e) => e.target.value !== (closing.required_steps ?? '') && patchClosing({ required_steps: e.target.value })}
                        className="mb-2 w-full rounded-xl border border-border bg-surface p-2 text-xs outline-none focus:border-accent" />
                      <button type="button" onClick={submitClosing}
                        className="h-11 w-full cursor-pointer rounded-xl bg-accent text-xs font-extrabold text-on-accent">
                        Submit for human verification
                      </button>
                      <p className="mt-1 text-center text-[10px] text-muted">A closing only counts after a human reviewer verifies it (§15)</p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </>
      )}
      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
