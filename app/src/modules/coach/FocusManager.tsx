/* Development focus manager — the human side of the grooming loop.
   The AI proposes each week's focus from the participant's weakest dimension;
   this card is where the Coach sees that proposal and overrides it. The
   database (w_agent_focus_coach, 046) only accepts rows for the coach's own
   assigned participants, so this UI never has to police that itself. */
import { useCallback, useEffect, useState } from 'react'
import { Target } from 'lucide-react'
import { supabase, supabaseReady } from '../../lib/supabase'
import { useApp } from '../../lib/store'
import { Card, Chip, SectionTitle } from '../../components/ui'

/* The dimension vocabulary both banks emit. Grouped so the dropdown reads like
   the report, not like a database. */
const DIMENSIONS: { group: string; keys: string[] }[] = [
  { group: 'Working style', keys: [
    'style.social_energy', 'style.visibility', 'style.planning', 'style.adaptability',
    'style.decision_speed', 'style.detail', 'style.collaboration', 'style.autonomy', 'style.learning'] },
  { group: 'Entrepreneurial', keys: [
    'ent.initiative', 'ent.ownership', 'ent.resourcefulness', 'ent.calculated_risk',
    'ent.persistence', 'ent.opportunity', 'ent.income_variability', 'ent.results_orientation'] },
  { group: 'Success drive', keys: [
    'success.accountability', 'success.coachability', 'success.consistency',
    'success.goal_focus', 'success.resilience', 'success.self_management'] },
]
const pretty = (k: string) => {
  const t = k.split('.').pop()!.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
/* Monday of the current week, Asia/Kuala_Lumpur — must match coach_facts */
const weekStart = () => {
  const kl = new Date(Date.now() + 8 * 36e5)
  const d = new Date(Date.UTC(kl.getUTCFullYear(), kl.getUTCMonth(), kl.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/* Trilingual labels for the dimension groups (EN, BM, ID) */
const GROUP_LABEL: Record<string, [string, string, string]> = {
  'Working style': ['Working style', 'Gaya kerja', 'Gaya kerja'],
  Entrepreneurial: ['Entrepreneurial', 'Keusahawanan', 'Kewirausahaan'],
  'Success drive': ['Success drive', 'Dorongan kejayaan', 'Dorongan sukses'],
}

interface Row { participant_id: string; name: string; focus: string | null; set_by: string | null }

export default function FocusManager() {
  const { user, locale } = useApp()
  /* one tiny trilingual helper — BM for MY coaches, ID for Indonesia */
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    if (!isReal || !supabase || !user) return
    const wk = weekStart()
    const [{ data: ca }, { data: af }] = await Promise.all([
      supabase.from('coach_assignments')
        .select('participant_id, profiles!coach_assignments_participant_id_fkey(name)')
        .eq('coach_id', user.id).eq('active', true),
      supabase.from('agent_focus').select('agent_id,dimension_key,set_by').eq('week_start', wk),
    ])
    const focusOf = Object.fromEntries(((af ?? []) as { agent_id: string; dimension_key: string; set_by: string }[])
      .map((f) => [f.agent_id, f]))
    setRows(((ca ?? []) as unknown as { participant_id: string; profiles: { name: string } | null }[])
      .map((c) => ({
        participant_id: c.participant_id,
        name: c.profiles?.name ?? 'Warrior',
        focus: focusOf[c.participant_id]?.dimension_key ?? null,
        set_by: focusOf[c.participant_id]?.set_by ?? null,
      })))
  }, [isReal, user])
  useEffect(() => { load() }, [load])

  const setFocus = async (participantId: string, key: string) => {
    if (!supabase || !user || !key) return
    setBusy(participantId)
    const { error } = await supabase.from('agent_focus')
      .upsert({ agent_id: participantId, week_start: weekStart(), dimension_key: key,
                set_by: 'coach', coach_id: user.id },
              { onConflict: 'agent_id,week_start' })
    setBusy('')
    if (error) { setToast('⚠ ' + error.message) } else { setToast(L('Focus set — it appears in their next daily brief', 'Fokus ditetapkan — muncul dalam taklimat harian mereka seterusnya', 'Fokus diatur — muncul di brief harian mereka berikutnya')); load() }
    setTimeout(() => setToast(''), 3000)
  }

  if (!isReal || rows.length === 0) return null

  return (
    <>
      <SectionTitle>{L('Development focus — this week', 'Fokus pembangunan — minggu ini', 'Fokus pengembangan — minggu ini')}</SectionTitle>
      <Card className="mb-4 divide-y divide-border">
        {rows.map((r) => (
          <div key={r.participant_id} className="flex flex-wrap items-center gap-2 p-3">
            <Target size={14} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
            {r.focus && (
              <Chip tone={r.set_by === 'coach' ? 'accent' : 'default'}>
                {pretty(r.focus)} · {r.set_by === 'coach' ? L('you', 'anda', 'kamu') : 'AI'}
              </Chip>
            )}
            <select value="" disabled={busy === r.participant_id} aria-label={`Set focus for ${r.name}`}
              onChange={(e) => setFocus(r.participant_id, e.target.value)}
              className="h-9 cursor-pointer rounded-lg border border-border bg-surface px-2 text-xs outline-none">
              <option value="">{r.focus ? L('Change…', 'Tukar…', 'Ubah…') : L('Set focus…', 'Tetapkan fokus…', 'Atur fokus…')}</option>
              {DIMENSIONS.map((g) => (
                <optgroup key={g.group} label={GROUP_LABEL[g.group] ? L(...GROUP_LABEL[g.group]) : g.group}>
                  {g.keys.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        ))}
        <p className="p-3 text-[11px] text-muted">
          {L('The AI proposes each warrior’s weakest dimension automatically; anything you set here overrides it for the week and drives their daily drill.',
            'AI mencadangkan dimensi paling lemah setiap warrior secara automatik; apa yang anda tetapkan di sini mengatasinya untuk minggu ini dan memandu latihan harian mereka.',
            'AI mengusulkan dimensi terlemah tiap warrior secara otomatis; apa pun yang kamu atur di sini menggantikannya untuk minggu ini dan mengarahkan latihan harian mereka.')}
        </p>
      </Card>
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
