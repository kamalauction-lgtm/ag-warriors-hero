/* Help inbox — where raised hands land. RLS shows a request only to the people
   it concerns: the agent's assigned Coach, their Leader, or a country admin.
   Each card carries the AI's situation summary and suggested support plan, so
   the helper starts informed instead of starting with questions. */
import { useCallback, useEffect, useState } from 'react'
import { HandHelping, Check } from 'lucide-react'
import { supabase, supabaseReady } from '../../lib/supabase'
import { useApp } from '../../lib/store'
import { Card, Chip, SectionTitle } from '../../components/ui'

interface HelpRow {
  id: string; agent_id: string; topic: string; message: string; to_role: string
  status: string; created_at: string
  ai_plan: { for_helper?: { situation?: string; support?: string[] } } | null
}

/* Trilingual topic labels (EN, BM, ID) — Closing/Leads stay untranslated by rule */
const TOPIC_LABEL: Record<string, [string, string, string]> = {
  closing: ['🤝 Closing', '🤝 Closing', '🤝 Closing'],
  leads: ['📞 Leads', '📞 Leads', '📞 Leads'],
  motivation: ['🔥 Motivation', '🔥 Motivasi', '🔥 Motivasi'],
  technical: ['🛠 Technical', '🛠 Teknikal', '🛠 Teknis'],
  other: ['💬 Other', '💬 Lain-lain', '💬 Lainnya'],
}

export default function HelpInbox() {
  const { user, locale } = useApp()
  /* one tiny trilingual helper — BM for MY coaches, ID for Indonesia */
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [rows, setRows] = useState<HelpRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    if (!isReal || !supabase) return
    const { data } = await supabase.from('help_requests').select('*')
      .eq('status', 'open').order('created_at', { ascending: false }).limit(20)
    const list = (data as HelpRow[]) ?? []
    setRows(list)
    const ids = [...new Set(list.map((r) => r.agent_id))]
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('id,name').in('id', ids)
      setNames(Object.fromEntries(((p ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])))
    }
  }, [isReal])
  useEffect(() => { load() }, [load])

  const resolve = async (r: HelpRow) => {
    if (!supabase || !user) return
    setBusy(r.id)
    const { error } = await supabase.from('help_requests')
      .update({ status: 'resolved', resolved_by: user.id, resolved_at: new Date().toISOString() })
      .eq('id', r.id)
    setBusy('')
    if (!error) load()
  }

  if (!isReal || rows.length === 0) return null

  return (
    <>
      <SectionTitle>🆘 {L('Help requests', 'Permintaan bantuan', 'Permintaan bantuan')} ({rows.length})</SectionTitle>
      <div className="mb-4 space-y-2">
        {rows.map((r) => (
          <Card key={r.id} className="border-warning/40 p-3.5">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <HandHelping size={14} className="shrink-0 text-warning" />
              <p className="min-w-0 flex-1 text-sm font-bold">{names[r.agent_id] ?? 'Warrior'}</p>
              <Chip>{TOPIC_LABEL[r.topic] ? L(...TOPIC_LABEL[r.topic]) : r.topic}</Chip>
              <span className="text-[10px] text-muted">{new Date(r.created_at).toLocaleString()}</span>
            </div>
            <p className="mb-2 rounded-lg bg-surface2 p-2.5 text-[12.5px] italic leading-relaxed">
              “{r.message}”
            </p>
            {r.ai_plan?.for_helper?.situation && (
              <p className="mb-1.5 text-[11.5px] leading-relaxed text-muted">
                {r.ai_plan.for_helper.situation}
              </p>
            )}
            {(r.ai_plan?.for_helper?.support ?? []).map((sug, i) => (
              <p key={i} className="text-[11.5px] leading-relaxed">
                <b className="text-accent">→</b> {sug}
              </p>
            ))}
            <button type="button" disabled={busy === r.id} onClick={() => resolve(r)}
              className="mt-2.5 flex cursor-pointer items-center gap-1.5 rounded-lg bg-success px-3.5 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
              <Check size={13} /> {L('Helped — mark resolved', 'Dibantu — tanda selesai', 'Dibantu — tandai selesai')}
            </button>
          </Card>
        ))}
      </div>
    </>
  )
}
