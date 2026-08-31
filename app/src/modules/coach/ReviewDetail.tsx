/* P0.6 — Evidence review. A Coach may not approve evidence they cannot see.
   Everything the reviewer needs comes from ONE authorised call, fn_review_detail:
   the day's requirement + coach guidance, the participant's answer, the attached
   evidence (signed URLs from the private bucket), the system evidence Hero already
   owns, and the full revision history. Decisions: approve / revision / reject. */
import { useCallback, useEffect, useState } from 'react'
import { X, Check, RotateCcw, Ban, FileText, ImageIcon, Database, History } from 'lucide-react'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'

const LKEY: Record<string, string> = { en: 'en', bm: 'ms-MY', id: 'id-ID' }
const jt = (j: Record<string, string> | null | undefined, loc: string) =>
  j?.[LKEY[loc] ?? 'en'] ?? j?.en ?? ''

interface Evidence { id: string; kind: string; storage_path: string | null; url: string | null; note: string | null; created_at: string }
interface HistoryRow { id: string; version: number; status: string; response: string | null; reflection: string | null; submitted_at: string | null; reviewed_at: string | null; review_note: string | null }
interface Detail {
  submission: { id: string; day_no: number; version: number; status: string; response: string | null; reflection: string | null; submitted_at: string | null }
  participant: { id: string; name: string; country: string | null }
  enrolment: { id: string; status: string; cohort_day: number; accessible_day: number }
  day: Record<string, unknown> | null
  evidence: Evidence[]
  system_evidence: Record<string, number>
  history: HistoryRow[]
}

/* The rubric is a structure, not a score. Thresholds are an OPEN DECISION —
   these flags record what the reviewer actually checked, nothing is auto-computed. */
const RUBRIC = [
  { k: 'action_done', en: 'The required action was genuinely done', bm: 'Tindakan yang diminta benar-benar dilakukan', id: 'Tindakan yang diminta benar-benar dilakukan' },
  { k: 'evidence_matches', en: 'Evidence matches the requirement', bm: 'Bukti menepati keperluan', id: 'Bukti sesuai dengan persyaratan' },
  { k: 'reflection_honest', en: 'Reflection is specific and honest', bm: 'Refleksi spesifik dan jujur', id: 'Refleksi spesifik dan jujur' },
  { k: 'system_record', en: 'A real Hero record backs it up', bm: 'Ada rekod Hero sebenar menyokongnya', id: 'Ada catatan Hero nyata yang mendukung' },
] as const

export default function ReviewDetail({ submissionId, onClose, onDone }: {
  submissionId: string; onClose: () => void; onDone: (msg: string) => void
}) {
  const { locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState('')
  const [signed, setSigned] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [rubric, setRubric] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!supabase) return
      setErr(''); setD(null)
      const { data, error } = await supabase.rpc('fn_review_detail', { p_submission: submissionId })
      if (!alive) return
      if (error) { setErr(error.message); return }
      const det = data as unknown as Detail
      setD(det)
      // private bucket → short-lived signed URLs, one per attachment
      const urls: Record<string, string> = {}
      for (const a of det.evidence ?? []) {
        if (!a.storage_path) continue
        const { data: s } = await supabase.storage.from('evidence').createSignedUrl(a.storage_path, 600)
        if (s?.signedUrl) urls[a.id] = s.signedUrl
      }
      if (alive) setSigned(urls)
    })()
    return () => { alive = false }
  }, [submissionId])

  const decide = async (decision: 'approve' | 'revision' | 'reject') => {
    if (!supabase) return
    if (decision !== 'approve' && note.trim().length < 3) {
      setErr(L('A reason is required when not approving.', 'Sebab diperlukan jika tidak meluluskan.', 'Alasan wajib jika tidak menyetujui.')); return
    }
    setBusy(true)
    const { error } = await supabase.rpc('fn_review_submission_v2', {
      p_submission: submissionId, p_decision: decision,
      p_note: note || null, p_rubric: Object.keys(rubric).length ? rubric : null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone(decision === 'approve'
      ? L('✅ Approved — XP written once', '✅ Diluluskan — XP direkod sekali sahaja', '✅ Disetujui — XP dicatat sekali saja')
      : decision === 'revision'
        ? L('🔄 Revision requested', '🔄 Semakan semula diminta', '🔄 Revisi diminta')
        : L('⛔ Not accepted', '⛔ Tidak diterima', '⛔ Tidak diterima'))
  }

  const day = (d?.day ?? {}) as Record<string, Record<string, string> | number | null>

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-bg p-4 sm:rounded-3xl">
        <header className="mb-3 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-extrabold">
              {d ? `${L('Day', 'Hari', 'Hari')} ${d.submission.day_no} — ${d.participant.name}` : L('Loading…', 'Memuatkan…', 'Memuat…')}
            </p>
            {d && (
              <p className="text-[11px] text-muted">
                v{d.submission.version} · {L('cohort day', 'hari kohort', 'hari cohort')} {d.enrolment.cohort_day}
                {' · '}{L('their day', 'hari mereka', 'hari mereka')} {d.enrolment.accessible_day}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={L('Close', 'Tutup', 'Tutup')}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={16} /></button>
        </header>

        {err && <Card className="mb-3 border-danger/50 bg-danger/10 p-3 text-xs font-bold text-danger">{err}</Card>}
        {!d && !err && <Card className="p-6 text-center text-xs text-muted">{L('Loading review…', 'Memuatkan semakan…', 'Memuat tinjauan…')}</Card>}

        {d && (
          <>
            {/* what was actually asked for */}
            <SectionTitle>{L('What was required', 'Apa yang diminta', 'Apa yang diminta')}</SectionTitle>
            <Card className="mb-3 space-y-2 p-3.5">
              <p className="text-sm font-bold">{jt(day.title as Record<string, string>, locale)}</p>
              {!!jt(day.required_action as Record<string, string>, locale) && (
                <p className="text-xs"><b>{L('Action', 'Tindakan', 'Tindakan')}:</b> {jt(day.required_action as Record<string, string>, locale)}</p>)}
              {!!jt(day.evidence_requirement as Record<string, string>, locale) && (
                <p className="text-xs"><b>{L('Evidence', 'Bukti', 'Bukti')}:</b> {jt(day.evidence_requirement as Record<string, string>, locale)}</p>)}
              {jt(day.coach_guidance as Record<string, string>, locale)
                ? <p className="rounded-lg bg-accent-soft p-2 text-xs"><b>{L('Coach guidance', 'Panduan Coach', 'Panduan Coach')}:</b> {jt(day.coach_guidance as Record<string, string>, locale)}</p>
                : <p className="rounded-lg bg-warning/10 p-2 text-[11px] font-semibold text-warning">
                    {L('No coach guidance published for this day yet — use your own judgement and say why in the note.',
                       'Panduan Coach belum diterbitkan untuk hari ini — gunakan pertimbangan anda dan nyatakan sebabnya dalam nota.',
                       'Panduan Coach belum tersedia untuk hari ini — gunakan penilaian Anda dan jelaskan alasannya di catatan.')}
                  </p>}
            </Card>

            {/* what the warrior said */}
            <SectionTitle>{L('Their answer', 'Jawapan mereka', 'Jawaban mereka')}</SectionTitle>
            <Card className="mb-3 p-3.5">
              <p className="whitespace-pre-wrap rounded-lg bg-surface2 p-2.5 text-sm">{d.submission.response || '—'}</p>
              {d.submission.reflection && <p className="mt-2 text-xs italic text-muted">"{d.submission.reflection}"</p>}
            </Card>

            {/* attachments — the thing coaches could never see before */}
            <SectionTitle>{L('Attached evidence', 'Bukti dilampirkan', 'Bukti terlampir')} ({d.evidence.length})</SectionTitle>
            <Card className="mb-3 p-3.5">
              {d.evidence.length === 0 && (
                <p className="py-2 text-center text-xs text-muted">{L('No attachment on this submission.', 'Tiada lampiran pada penghantaran ini.', 'Tidak ada lampiran pada pengiriman ini.')}</p>)}
              <div className="space-y-2">
                {d.evidence.map((a) => (
                  <div key={a.id} className="rounded-xl border border-border p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-muted">
                      {a.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />} {a.kind}
                    </div>
                    {a.kind === 'image' && signed[a.id]
                      ? <img src={signed[a.id]} alt={a.note ?? 'evidence'} className="max-h-72 w-full rounded-lg object-contain" />
                      : signed[a.id]
                        ? <a href={signed[a.id]} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent">{L('Open attachment', 'Buka lampiran', 'Buka lampiran')} →</a>
                        : a.url
                          ? <a href={a.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-accent">{a.url}</a>
                          : <p className="text-[11px] text-muted">{L('Preparing secure link…', 'Menyediakan pautan selamat…', 'Menyiapkan tautan aman…')}</p>}
                    {a.note && <p className="mt-1 text-[11px] text-muted">{a.note}</p>}
                  </div>
                ))}
              </div>
            </Card>

            {/* evidence Hero already owns — preferred over screenshots */}
            <SectionTitle><Database size={12} className="mr-1 inline" />{L('System evidence', 'Bukti sistem', 'Bukti sistem')}</SectionTitle>
            <Card className="mb-3 grid grid-cols-3 gap-2 p-3.5 text-center">
              {([
                ['leads_total', L('Leads', 'Lead', 'Lead')],
                ['leads_next_action', L('With next action', 'Ada tindakan', 'Ada tindakan')],
                ['activities_7d', L('Activity 7d', 'Aktiviti 7h', 'Aktivitas 7h')],
                ['appointments', L('Appointments', 'Temujanji', 'Janji temu')],
                ['closings', L('Closings', 'Closing', 'Closing')],
              ] as const).map(([k, label]) => (
                <div key={k}>
                  <p className="font-display text-lg font-extrabold text-accent">{d.system_evidence?.[k] ?? 0}</p>
                  <p className="text-[10px] text-muted">{label}</p>
                </div>
              ))}
            </Card>

            {/* history */}
            {d.history.length > 1 && (
              <>
                <button type="button" onClick={() => setShowHistory((v) => !v)}
                  className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs font-bold text-accent">
                  <History size={12} /> {showHistory ? L('Hide', 'Sembunyi', 'Sembunyikan') : L('Show', 'Papar', 'Tampilkan')} {L('revision history', 'sejarah semakan', 'riwayat revisi')} ({d.history.length})
                </button>
                {showHistory && (
                  <Card className="mb-3 divide-y divide-border">
                    {d.history.map((h) => (
                      <div key={h.id} className="p-2.5">
                        <div className="mb-1 flex items-center gap-2">
                          <Chip>v{h.version}</Chip><Chip tone={h.status === 'approved' ? 'success' : 'warning'}>{h.status}</Chip>
                        </div>
                        <p className="text-[11px] text-muted">{h.response}</p>
                        {h.review_note && <p className="mt-1 text-[11px] italic">↳ {h.review_note}</p>}
                      </div>
                    ))}
                  </Card>
                )}
              </>
            )}

            {/* rubric + decision */}
            <SectionTitle>{L('Reviewer checklist', 'Senarai semak penyemak', 'Daftar periksa peninjau')}</SectionTitle>
            <Card className="mb-3 space-y-1.5 p-3.5">
              {RUBRIC.map((r) => (
                <label key={r.k} className="flex cursor-pointer items-center gap-2 text-xs">
                  <input type="checkbox" checked={!!rubric[r.k]} className="h-4 w-4 accent-[var(--accent)]"
                    onChange={(e) => setRubric({ ...rubric, [r.k]: e.target.checked })} />
                  {L(r.en, r.bm, r.id)}
                </label>
              ))}
            </Card>

            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={L('Note to the warrior (required unless approving)…', 'Nota kepada warrior (wajib jika tidak lulus)…', 'Catatan untuk warrior (wajib jika tidak disetujui)…')}
              className="mb-3 w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent" />

            <div className="mb-2 flex gap-2">
              <button type="button" disabled={busy} onClick={() => decide('approve')}
                className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white disabled:opacity-40">
                <Check size={15} /> {L('Approve', 'Lulus', 'Setujui')}</button>
              <button type="button" disabled={busy} onClick={() => decide('revision')}
                className="flex h-12 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning disabled:opacity-40">
                <RotateCcw size={15} /> {L('Revision', 'Semak semula', 'Revisi')}</button>
              <button type="button" disabled={busy} onClick={() => decide('reject')}
                className="flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-danger/60 px-4 text-xs font-extrabold text-danger disabled:opacity-40">
                <Ban size={15} /> {L('Reject', 'Tolak', 'Tolak')}</button>
            </div>
            <p className="pb-3 text-center text-[10px] text-muted">
              {L('XP is written once per day, no matter how many revisions. Withdrawing an approval reverses the XP — it is never deleted.',
                 'XP direkod sekali sahaja setiap hari, tidak kira berapa kali semakan. Menarik balik kelulusan akan membalikkan XP — ia tidak pernah dipadam.',
                 'XP dicatat sekali per hari, berapa pun revisinya. Menarik persetujuan akan membalik XP — tidak pernah dihapus.')}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
