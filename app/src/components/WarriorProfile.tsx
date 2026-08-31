/* Warrior profile drawer — click a person in People & Roles and everything
   leadership needs is in one place: activity numbers, lead hygiene, talent
   profile (at the consent they granted), weekly focus, assessment history,
   and an AI advisory answering the leader's actual question: "how do I help
   this person with what they are doing right now?" */
import { useEffect, useState } from 'react'
import { X, BrainCircuit, PhoneCall, Trophy, Clock, AlertTriangle, Compass } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Card, Chip, Avatar } from './ui'
import { BadgeRow } from './Badges'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev/coach/advise'

interface Facts {
  agent?: { name: string; country: string | null }
  calls_today?: number; calls_30d?: number; wins_30d?: number
  expired_callbacks?: { name: string | null; phone: string | null; days: number }[]
  neglected?: { name: string | null; phone: string | null; days: number }[]
  timebox?: { planned: number; done: number; notdone: number }
  bop_booked_30d?: number
  projects?: string[]
  focus?: { dimension_key: string; set_by: string } | null
  talent_person?: {
    low_confidence: boolean
    weakest?: { key: string; score: number }[]
    motivations?: { key: string; score: number }[]
    demotivators?: { key: string; score: number }[]
  } | null
  talent_task?: { low_confidence: boolean; pathways?: { key: string; score: number }[] } | null
}
interface Advise { summary: string; actions: string[] }

const pretty = (k: string) => k.split('.').pop()!.replace(/_/g, ' ')

export default function WarriorProfile({ person, onClose }: {
  person: { id: string; name: string; email: string | null; country: string | null
    career_rank: string | null; is_elite?: boolean; captain?: boolean; positions?: string[] }
  onClose: () => void
}) {
  const [facts, setFacts] = useState<Facts | null>(null)
  const [advice, setAdvice] = useState<Advise | null>(null)
  const [advBusy, setAdvBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!supabase) return
    ;(async () => {
      const { data, error } = await supabase.rpc('coach_facts', { p_agent: person.id })
      if (error) { setErr(error.message); return }
      setFacts(data as Facts)
    })()
  }, [person.id])

  const askAdvice = async () => {
    if (!supabase) return
    setAdvBusy(true); setErr('')
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ agent_id: person.id }),
      })
      if (!res.ok) throw new Error(`advisory unavailable (${res.status})`)
      const out = await res.json()
      setAdvice(out.advice as Advise)
    } catch (e) { setErr((e as Error).message) }
    setAdvBusy(false)
  }

  const tp = facts?.talent_person
  const tt = facts?.talent_task

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-bg p-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={person.name} color="var(--accent)" size={44} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-base font-extrabold">
              {person.name}
              <BadgeRow rank={person.career_rank} captain={person.captain}
                elite={person.is_elite} positions={person.positions} />
            </p>
            <p className="text-[11px] text-muted">{person.email ?? '—'} · {person.country ?? '—'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
            <X size={15} />
          </button>
        </div>

        {err && <p className="mb-3 rounded-lg bg-danger/10 p-2 text-xs text-danger">{err}</p>}

        {/* ---------- the AI advisory, front and centre ---------- */}
        <button type="button" disabled={advBusy} onClick={askAdvice}
          className="mb-4 flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-accent/50 bg-accent-soft p-3.5 text-left hover:opacity-90 disabled:opacity-50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent">
            <BrainCircuit size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-accent">
              {advBusy ? 'Thinking…' : 'How can I help this warrior?'}
            </span>
            <span className="block text-[11px] text-muted">
              AI advisory for leadership — support actions, not verdicts
            </span>
          </span>
        </button>

        {advice && (
          <Card className="mb-4 border-accent/40 p-4">
            <p className="mb-2 text-[13px] font-bold">{advice.summary}</p>
            <ul className="space-y-2">
              {advice.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                  <span className="mt-0.5 font-extrabold text-accent">{i + 1}.</span>{a}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ---------- activity ---------- */}
        {facts === null ? (
          <Card className="p-6 text-center text-xs text-muted">Loading…</Card>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[
                { l: 'Calls today', v: facts.calls_today ?? 0, icon: PhoneCall },
                { l: 'Calls 30d', v: facts.calls_30d ?? 0, icon: PhoneCall },
                { l: 'Wins 30d', v: facts.wins_30d ?? 0, icon: Trophy },
              ].map((k) => (
                <div key={k.l} className="rounded-xl border border-border bg-surface p-3 text-center">
                  <k.icon size={14} className="mx-auto mb-1 text-accent" />
                  <p className="font-display text-xl font-extrabold">{k.v}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{k.l}</p>
                </div>
              ))}
            </div>

            {/* lead hygiene */}
            {((facts.expired_callbacks?.length ?? 0) > 0 || (facts.neglected?.length ?? 0) > 0) && (
              <Card className="mb-3 border-warning/40 p-3.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                  <AlertTriangle size={13} className="text-warning" /> Leads needing attention
                </p>
                {(facts.expired_callbacks ?? []).map((l, i) => (
                  <p key={`c${i}`} className="text-[11px] text-muted">
                    ⏰ {l.name ?? 'Lead'} — callback lapsed {l.days}d
                  </p>
                ))}
                {(facts.neglected ?? []).map((l, i) => (
                  <p key={`n${i}`} className="text-[11px] text-muted">
                    💤 {l.name ?? 'Lead'} — untouched {l.days}d
                  </p>
                ))}
              </Card>
            )}

            {/* today's plan + focus */}
            <Card className="mb-3 p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                <Clock size={13} className="text-accent" /> Today
              </p>
              <p className="text-[11px] text-muted">
                Plan: {facts.timebox?.done ?? 0}/{facts.timebox?.planned ?? 0} tasks done
                {facts.bop_booked_30d ? ` · ${facts.bop_booked_30d} BOP bookings (30d)` : ''}
              </p>
              {facts.focus?.dimension_key && (
                <p className="mt-1.5 text-[11px]">
                  🎯 Focus this week: <b className="capitalize">{pretty(facts.focus.dimension_key)}</b>
                  <span className="text-muted"> · set by {facts.focus.set_by === 'coach' ? 'Coach' : 'AI'}</span>
                </p>
              )}
            </Card>

            {/* talent, at consent */}
            <Card className="mb-3 p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                <Compass size={13} className="text-accent" /> Talent Compass
              </p>
              {!tp && !tt && (
                <p className="text-[11px] text-muted">
                  No linked profile — either not taken yet, a different email, or consent set to private.
                </p>
              )}
              {tp?.low_confidence && (
                <Chip tone="warning" className="mb-1.5">low confidence — worth a retake</Chip>
              )}
              {tt?.pathways && !tt.low_confidence && (
                <p className="text-[11px]">
                  Task fit: {tt.pathways.map((p) => (
                    <Chip key={p.key} tone="accent" className="mb-1 mr-1 capitalize">{pretty(p.key)} {Math.round(p.score)}</Chip>
                  ))}
                </p>
              )}
              {tp?.weakest && !tp.low_confidence && (
                <p className="mt-1 text-[11px] text-muted">
                  Growth areas: {tp.weakest.map((w) => pretty(w.key)).join(' · ')}
                </p>
              )}
              {tp?.demotivators?.length ? (
                <p className="mt-1 text-[11px] text-muted">
                  Drains them: <span className="capitalize">{pretty(tp.demotivators[0].key)}</span>
                </p>
              ) : null}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
