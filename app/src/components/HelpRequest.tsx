/* Minta Bantuan — the agent raises a hand, the AI makes sure help arrives
   informed. On submit: the worker packs their full in-app context, returns
   immediate first-aid steps, and notifies the chosen human (Coach / Leader /
   admin) with a situation summary — no re-explaining needed. */
import { useCallback, useState } from 'react'
import { HandHelping, X, CheckCircle2 } from 'lucide-react'
import { supabase, supabaseReady } from '../lib/supabase'
import { useApp } from '../lib/store'
import { Card } from './ui'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev/coach/help'

type LFn = (en: string, bm: string, id: string) => string

const TOPICS = (L: LFn) => [
  { v: 'closing', label: L('🤝 Closing a deal', '🤝 Closing deal', '🤝 Closing deal') },
  { v: 'leads', label: L('📞 Leads & follow-up', '📞 Leads & susulan', '📞 Leads & tindak lanjut') },
  { v: 'motivation', label: L('🔥 Motivation & mindset', '🔥 Motivasi & minda', '🔥 Motivasi & mindset') },
  { v: 'technical', label: L('🛠 App / technical', '🛠 Apl / teknikal', '🛠 Aplikasi / teknis') },
  { v: 'other', label: L('💬 Something else', '💬 Lain-lain', '💬 Lainnya') },
]
const TARGETS = (L: LFn) => [
  { v: 'coach', label: L('My Coach', 'Coach saya', 'Coach saya') },
  { v: 'leader', label: L('My Leader', 'Leader saya', 'Leader saya') },
  { v: 'admin', label: 'Admin / HQ' },
]

export default function HelpRequest() {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('closing')
  const [target, setTarget] = useState('coach')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ steps: string[]; notified: number } | null>(null)

  const submit = async () => {
    if (!supabase || !msg.trim()) return
    setBusy(true); setErr('')
    try {
      const { data: s } = await supabase.auth.getSession()
      const res = await fetch(WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ topic, message: msg.trim(), to_role: target,
          lang: locale === 'bm' ? 'ms' : locale }),
      })
      if (!res.ok) throw new Error(`${L('help unavailable', 'bantuan tidak tersedia', 'bantuan tidak tersedia')} (${res.status})`)
      const out = await res.json()
      setDone({ steps: out.for_agent?.steps ?? [], notified: out.notified ?? 0 })
      setMsg('')
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  if (!isReal) return null

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setDone(null) }}
        className="mb-4 flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left transition-colors hover:border-accent/50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface2 text-accent">
          <HandHelping size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">{L('Ask for Help', 'Minta Bantuan', 'Minta Bantuan')}</span>
          <span className="block text-[11px] text-muted">
            {L('Stuck on something? Your Coach gets your full context — no re-explaining.',
              'Tersekat? Coach anda terima konteks penuh — tak perlu jelaskan semula.',
              'Lagi buntu? Coach kamu menerima konteks lengkap — tanpa menjelaskan ulang.')}
          </span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}>
          <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-bg p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">
                {done
                  ? L('Help is on the way', 'Bantuan dalam perjalanan', 'Bantuan sedang menuju')
                  : L('Ask for Help', 'Minta Bantuan', 'Minta Bantuan')}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={L('Close', 'Tutup', 'Tutup')}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">
                <X size={15} />
              </button>
            </div>

            {done ? (
              <>
                <Card className="mb-3 border-success/40 p-3.5">
                  <p className="text-sm">
                    ✅ {done.notified > 0
                      ? L(`${done.notified} ${done.notified === 1 ? 'person has' : 'people have'} been notified with your full situation.`,
                          `${done.notified} orang telah dimaklumkan dengan situasi penuh anda.`,
                          `${done.notified} orang telah diberi tahu dengan situasi lengkapmu.`)
                      : L('Your request is logged and visible to your leadership.',
                          'Permintaan anda direkodkan dan boleh dilihat oleh leader anda.',
                          'Permintaanmu tercatat dan bisa dilihat oleh leader.')}
                  </p>
                </Card>
                {done.steps.length > 0 && (
                  <Card className="mb-3 p-4">
                    <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-accent">
                      {L('While you wait — try this', 'Sementara menunggu — cuba ini', 'Sambil menunggu — coba ini')}
                    </p>
                    <ol className="space-y-2">
                      {done.steps.map((st, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-muted" />
                          <span>{st}</span>
                        </li>
                      ))}
                    </ol>
                  </Card>
                )}
                <button type="button" onClick={() => setOpen(false)}
                  className="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent">
                  {L('Got it 💪', 'Faham 💪', 'Siap 💪')}
                </button>
              </>
            ) : (
              <>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">{L('Topic', 'Topik', 'Topik')}</label>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {TOPICS(L).map((t) => (
                    <button key={t.v} type="button" onClick={() => setTopic(t.v)}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold ${
                        topic === t.v ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">
                  {L('What is happening?', 'Apa yang berlaku?', 'Apa yang terjadi?')}
                </label>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4}
                  placeholder={L('Tell it like it is — your helper sees your calls, leads and plan automatically.',
                    'Cerita terus terang — pembantu anda nampak panggilan, leads dan rancangan anda secara automatik.',
                    'Ceritakan apa adanya — penolongmu otomatis melihat panggilan, leads dan rencanamu.')}
                  className="mb-3 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent" />

                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">{L('Ask', 'Minta kepada', 'Minta ke')}</label>
                <div className="mb-4 flex gap-1.5">
                  {TARGETS(L).map((t) => (
                    <button key={t.v} type="button" onClick={() => setTarget(t.v)}
                      className={`flex-1 cursor-pointer rounded-xl border px-2 py-2 text-xs font-bold ${
                        target === t.v ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {err && <p className="mb-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">{err}</p>}
                <button type="button" disabled={busy || !msg.trim()} onClick={submit}
                  className="h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                  {busy
                    ? L('Sending with your context…', 'Menghantar dengan konteks anda…', 'Mengirim dengan konteksmu…')
                    : L('🆘 Send request', '🆘 Hantar permintaan', '🆘 Kirim permintaan')}
                </button>
                <p className="mt-2 text-center text-[10px] text-muted">
                  {L('Your calls, leads and plan are attached automatically so help arrives informed.',
                    'Panggilan, leads dan rancangan anda dilampirkan secara automatik supaya bantuan tiba dengan maklumat.',
                    'Panggilan, leads dan rencanamu dilampirkan otomatis agar bantuan datang dengan informasi lengkap.')}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
