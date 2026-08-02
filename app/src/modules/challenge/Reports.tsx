/* Reporting (§24) — programme + participant reports.
   MVP per spec: print-friendly page + Markdown/CSV export. No PDF generation. */
import { useCallback, useEffect, useState } from 'react'
import { Download, Printer, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Card, SectionTitle } from '../../components/ui'

interface WRow {
  pid: string; name: string; country: string; cohort: string; status: string
  daysApproved: number; xp: number; leadsActive: number; leadsWon: number
  appts: number; closingsDone: number; mp: number; badges: number
}

const dl = (filename: string, text: string, mime: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: mime }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function ChallengeReports({ realId }: { realId: boolean }) {
  const [rows, setRows] = useState<WRow[]>([])
  const [stamp, setStamp] = useState('')

  const load = useCallback(async () => {
    if (!realId || !supabase) return
    const [en, subs, pl, leads, appts, closes, mp, badges] = await Promise.all([
      supabase.from('enrolments').select('id,participant_id,status,cohorts(name),profiles!enrolments_participant_id_fkey(name,country)'),
      supabase.from('task_submissions').select('enrolment_id,day_no,version,status'),
      supabase.from('points_ledger').select('user_id,amount,status'),
      supabase.from('ch_leads').select('participant_id,stage'),
      supabase.from('ch_appointments').select('participant_id'),
      supabase.from('ch_closings').select('participant_id,status'),
      supabase.from('mentor_points_ledger').select('user_id,amount,status'),
      supabase.from('user_badges').select('user_id'),
    ])
    const out: WRow[] = ((en.data ?? []) as unknown as {
      id: string; participant_id: string; status: string
      cohorts: { name: string } | null; profiles: { name: string; country: string | null } | null
    }[]).map((e) => {
      const byDay: Record<number, { version: number; status: string }> = {}
      ;((subs.data ?? []) as { enrolment_id: string; day_no: number; version: number; status: string }[])
        .filter((s) => s.enrolment_id === e.id)
        .forEach((s) => { if (!byDay[s.day_no] || s.version > byDay[s.day_no].version) byDay[s.day_no] = s })
      const p = e.participant_id
      return {
        pid: p,
        name: e.profiles?.name ?? 'Warrior',
        country: e.profiles?.country ?? '—',
        cohort: e.cohorts?.name ?? '—',
        status: e.status,
        daysApproved: Object.values(byDay).filter((s) => s.status === 'approved').length,
        xp: ((pl.data ?? []) as { user_id: string; amount: number; status: string }[])
          .filter((r) => r.user_id === p && r.status === 'verified').reduce((t, r) => t + r.amount, 0),
        leadsActive: ((leads.data ?? []) as { participant_id: string; stage: string }[])
          .filter((l) => l.participant_id === p && !['CLOSED_WON', 'CLOSED_LOST', 'DISQUALIFIED'].includes(l.stage)).length,
        leadsWon: ((leads.data ?? []) as { participant_id: string; stage: string }[])
          .filter((l) => l.participant_id === p && l.stage === 'CLOSED_WON').length,
        appts: ((appts.data ?? []) as { participant_id: string }[]).filter((a) => a.participant_id === p).length,
        closingsDone: ((closes.data ?? []) as { participant_id: string; status: string }[])
          .filter((c) => c.participant_id === p && c.status === 'COMPLETED').length,
        mp: ((mp.data ?? []) as { user_id: string; amount: number; status: string }[])
          .filter((r) => r.user_id === p && r.status === 'verified').reduce((t, r) => t + r.amount, 0),
        badges: ((badges.data ?? []) as { user_id: string }[]).filter((b) => b.user_id === p).length,
      }
    })
    setRows(out)
    setStamp(new Date().toLocaleString())
  }, [realId])
  useEffect(() => { load() }, [load])

  const agg = (list: WRow[]) => ({
    n: list.length,
    active: list.filter((r) => r.status === 'active').length,
    days: list.reduce((t, r) => t + r.daysApproved, 0),
    xp: list.reduce((t, r) => t + r.xp, 0),
    leads: list.reduce((t, r) => t + r.leadsActive + r.leadsWon, 0),
    won: list.reduce((t, r) => t + r.leadsWon, 0),
    closings: list.reduce((t, r) => t + r.closingsDone, 0),
    mp: list.reduce((t, r) => t + r.mp, 0),
  })
  const my = agg(rows.filter((r) => r.country === 'MY'))
  const id = agg(rows.filter((r) => r.country === 'ID'))
  const all = agg(rows)

  const csv = () => dl(`30dc-report-${Date.now()}.csv`,
    ['name,country,cohort,status,days_approved,verified_xp,leads_active,leads_won,appointments,verified_closings,mentor_points,badges',
      ...rows.map((r) => [r.name, r.country, r.cohort, r.status, r.daysApproved, r.xp, r.leadsActive, r.leadsWon, r.appts, r.closingsDone, r.mp, r.badges]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))].join('\n'),
    'text/csv')

  const md = () => dl(`30dc-report-${Date.now()}.md`, [
    '# 30 Days Closing Challenge — Programme Report',
    `Generated: ${stamp}`,
    '',
    '## Programme summary',
    '| | All | 🇲🇾 MY | 🇮🇩 ID |', '|---|---|---|---|',
    `| Enrolled | ${all.n} | ${my.n} | ${id.n} |`,
    `| Active | ${all.active} | ${my.active} | ${id.active} |`,
    `| Days approved | ${all.days} | ${my.days} | ${id.days} |`,
    `| Verified XP | ${all.xp} | ${my.xp} | ${id.xp} |`,
    `| Leads | ${all.leads} | ${my.leads} | ${id.leads} |`,
    `| Won | ${all.won} | ${my.won} | ${id.won} |`,
    `| Verified closings | ${all.closings} | ${my.closings} | ${id.closings} |`,
    `| Mentor Points | ${all.mp} | ${my.mp} | ${id.mp} |`,
    '',
    '## Warriors',
    '| Warrior | Country | Cohort | Status | Days | XP | Leads | Won | Closings | MP | Badges |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.country} | ${r.cohort} | ${r.status} | ${r.daysApproved}/30 | ${r.xp} | ${r.leadsActive} | ${r.leadsWon} | ${r.closingsDone} | ${r.mp} | ${r.badges} |`),
    '',
    '_All XP and closings are human-verified. Generated by IQI AG Hero._',
  ].join('\n'), 'text/markdown')

  if (!realId) return <Card className="p-6 text-center text-sm text-muted">Reports need a live admin session.</Card>

  return (
    <div className="print-report">
      <div className="mb-3 flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={md} className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-extrabold hover:border-accent"><FileText size={13} /> Markdown</button>
        <button type="button" onClick={csv} className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-extrabold hover:border-accent"><Download size={13} /> CSV</button>
        <button type="button" onClick={() => window.print()} className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-extrabold hover:border-accent"><Printer size={13} /> Print</button>
        <span className="ml-auto self-center text-[10px] text-muted">Generated {stamp}</span>
      </div>

      <SectionTitle>Programme summary — 🇲🇾 vs 🇮🇩</SectionTitle>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead><tr className="border-b border-border text-muted">
            <th className="py-2">Metric</th><th>All</th><th>🇲🇾 MY</th><th>🇮🇩 ID</th></tr></thead>
          <tbody>
            {([['Enrolled', 'n'], ['Active', 'active'], ['Days approved', 'days'], ['Verified XP', 'xp'],
              ['Leads', 'leads'], ['Won', 'won'], ['Verified closings', 'closings'], ['Mentor Points', 'mp']] as const)
              .map(([label, k]) => (
                <tr key={k} className="border-b border-border/50">
                  <td className="py-1.5 font-bold">{label}</td><td>{all[k]}</td><td>{my[k]}</td><td>{id[k]}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Warriors ({rows.length})</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead><tr className="border-b border-border text-muted">
            <th className="py-2">Warrior</th><th>Cohort</th><th>Status</th><th>Days</th><th>XP</th>
            <th>Leads</th><th>Won</th><th>Appts</th><th>Closings</th><th>MP</th><th>Badges</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.pid} className="border-b border-border/50">
                <td className="py-1.5 font-bold">{r.country === 'ID' ? '🇮🇩' : '🇲🇾'} {r.name}</td>
                <td>{r.cohort}</td><td>{r.status}</td><td>{r.daysApproved}/30</td><td>{r.xp}</td>
                <td>{r.leadsActive}</td><td>{r.leadsWon}</td><td>{r.appts}</td><td>{r.closingsDone}</td>
                <td>{r.mp}</td><td>{r.badges}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] text-muted">All XP and closings are human-verified (§28). Export is MVP Markdown/CSV per §24.</p>
    </div>
  )
}
