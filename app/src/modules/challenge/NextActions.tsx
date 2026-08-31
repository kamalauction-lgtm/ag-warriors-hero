/* P1 — Next-Action Discipline.
   Six buckets, every one a structural fact about the warrior's own records:
   overdue · due today · upcoming · no next action · qualified with no
   appointment · viewing completed with no follow-up.
   Nothing is judged, nothing is scored — each row is a thing you can act on. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CalendarDays, HelpCircle, Target, Eye, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface Row { id: string; name?: string; lead_name?: string; stage?: string; next_action?: string | null; next_action_at?: string | null; days_late?: number; last_contact_at?: string | null; interest?: string | null; kind?: string; when?: string }
export interface NextActionData {
  as_of: string
  overdue: Row[]; due_today: Row[]; upcoming: Row[]
  no_next_action: Row[]; qualified_no_appointment: Row[]; viewing_no_followup: Row[]
}

export default function NextActions({ participantId, compact }: { participantId: string; compact?: boolean }) {
  const { locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [d, setD] = useState<NextActionData | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.rpc('fn_next_actions', { p_participant: participantId })
      .then(({ data }) => setD((data as NextActionData) ?? null))
  }, [participantId])

  if (!d) return null

  const BUCKETS = [
    { k: 'overdue', rows: d.overdue, icon: AlertTriangle, tone: 'danger',
      label: L('Overdue', 'Tertunggak', 'Terlambat'),
      why: L('The date you agreed has passed.', 'Tarikh yang anda janjikan sudah berlalu.', 'Tanggal yang Anda janjikan sudah lewat.') },
    { k: 'due_today', rows: d.due_today, icon: CalendarClock, tone: 'warning',
      label: L('Due today', 'Perlu hari ini', 'Jatuh tempo hari ini'),
      why: L('Clear these before the day ends.', 'Selesaikan sebelum hari berakhir.', 'Selesaikan sebelum hari berakhir.') },
    { k: 'no_next_action', rows: d.no_next_action, icon: HelpCircle, tone: 'warning',
      label: L('No next action', 'Tiada tindakan seterusnya', 'Tanpa tindakan berikutnya'),
      why: L('An active lead with no next action is the most common reason pipeline goes quiet.',
             'Lead aktif tanpa tindakan seterusnya ialah sebab paling kerap pipeline menjadi sepi.',
             'Lead aktif tanpa tindakan berikutnya adalah alasan paling umum pipeline menjadi sepi.') },
    { k: 'qualified_no_appointment', rows: d.qualified_no_appointment, icon: Target, tone: 'accent',
      label: L('Qualified — no appointment', 'Layak — tiada temujanji', 'Qualified — tanpa janji temu'),
      why: L('This is where pipeline most often stalls.', 'Di sinilah pipeline paling kerap tersekat.', 'Di sinilah pipeline paling sering macet.') },
    { k: 'viewing_no_followup', rows: d.viewing_no_followup, icon: Eye, tone: 'accent',
      label: L('Viewing done — no follow-up', 'Viewing selesai — tiada susulan', 'Viewing selesai — tanpa follow-up'),
      why: L('The effort is already spent. Follow up while they remember.',
             'Usaha sudah dibelanjakan. Susul semasa mereka masih ingat.',
             'Usahanya sudah terpakai. Follow up selagi mereka ingat.') },
    { k: 'upcoming', rows: d.upcoming, icon: CalendarDays, tone: 'default',
      label: L('Next 7 days', '7 hari akan datang', '7 hari ke depan'), why: '' },
  ] as const

  const live = BUCKETS.filter((b) => b.rows.length > 0)
  const total = live.filter((b) => b.k !== 'upcoming').reduce((t, b) => t + b.rows.length, 0)

  if (live.length === 0) {
    return (
      <Card className="mb-3 border-success/40 bg-success/10 p-3.5">
        <p className="text-xs font-extrabold text-success">
          ✓ {L('Every active lead has a next action, and nothing is overdue.',
               'Setiap lead aktif ada tindakan seterusnya, dan tiada yang tertunggak.',
               'Setiap lead aktif punya tindakan berikutnya, dan tidak ada yang terlambat.')}
        </p>
      </Card>
    )
  }

  return (
    <>
      {!compact && (
        <SectionTitle>
          {L('Next actions', 'Tindakan seterusnya', 'Tindakan berikutnya')}
          {total > 0 && <Chip tone="warning" className="ml-2">{total}</Chip>}
        </SectionTitle>
      )}
      <div className="mb-3 space-y-2">
        {live.map((b) => (
          <Card key={b.k} className="overflow-hidden">
            <button type="button" onClick={() => setOpen(open === b.k ? null : b.k)}
              className="flex w-full cursor-pointer items-center gap-3 p-3 text-left">
              <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                b.tone === 'danger' ? 'bg-danger/15 text-danger'
                : b.tone === 'warning' ? 'bg-warning/15 text-warning'
                : b.tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-surface2 text-muted')}>
                <b.icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{b.label}</span>
                {b.why && <span className="block text-[11px] leading-snug text-muted">{b.why}</span>}
              </span>
              <span className="font-display text-lg font-extrabold">{b.rows.length}</span>
              <ChevronRight size={15} className={clsx('shrink-0 text-muted transition-transform', open === b.k && 'rotate-90')} />
            </button>
            {open === b.k && (
              <div className="divide-y divide-border border-t border-border">
                {b.rows.slice(0, 12).map((r) => (
                  <Link key={r.id} to="/pipeline" className="flex items-center gap-2 p-2.5 no-underline">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.lead_name ?? r.name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {r.next_action ?? r.stage ?? r.kind ?? '—'}
                        {r.days_late != null && r.days_late > 0 &&
                          ` · ${r.days_late} ${L('days late', 'hari lewat', 'hari terlambat')}`}
                        {r.next_action_at && b.k === 'upcoming' && ` · ${r.next_action_at}`}
                      </span>
                    </span>
                    <Chip tone={b.tone === 'danger' ? 'danger' : b.tone === 'warning' ? 'warning' : 'accent'}>
                      {L('Open', 'Buka', 'Buka')}
                    </Chip>
                  </Link>
                ))}
                {b.rows.length > 12 && (
                  <Link to="/pipeline" className="block p-2.5 text-center text-[11px] font-bold text-accent no-underline">
                    +{b.rows.length - 12} {L('more in your pipeline', 'lagi dalam pipeline anda', 'lagi di pipeline Anda')} →
                  </Link>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}
