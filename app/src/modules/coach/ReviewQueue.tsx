/* Coach Review Queue — human-only approvals (readiness + evidence).
   Visible to elite_coach / master_mentor / super_admin. Self-review blocked server-side. */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Check, RotateCcw, Eye } from 'lucide-react'
import { useApp } from '../../lib/store'
import { supabase, supabaseReady } from '../../lib/supabase'
import { Card, Chip, SectionTitle } from '../../components/ui'
import CoachBoard from './CoachBoard'
import FocusManager from './FocusManager'
import HelpInbox from './HelpInbox'
import ReviewDetail from './ReviewDetail'
import PodToday from './PodToday'
import SlaBoard from './SlaBoard'

interface Participant { participant_id: string; name: string }
interface ReadyRow { id: string; status: string; submitted_at: string; enrolments: { participant_id: string; goal_30d: string | null; profiles: { name: string } | null } | null }
interface SubRow { id: string; day_no: number; version: number; response: string; reflection: string; submitted_at: string; enrolments: { participant_id: string; profiles: { name: string } | null } | null }
interface CloseRow { id: string; status: string; required_steps: string | null; project: string | null; ch_leads: { name: string } | null; profiles: { name: string } | null }
interface RQReady { id: string; participant_id: string; name: string; goal: string | null; submitted_at: string }
interface RQEvidence { id: string; participant_id: string; name: string; day_no: number; version: number; response: string; submitted_at: string }
interface PcjRow { id: string; step_code: string; response: string | null; profiles: { name: string } | null }

export default function ReviewQueue() {
  const { user, locale } = useApp()
  /* one tiny trilingual helper — BM for MY coaches, ID for Indonesia */
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const isReal = supabaseReady && !!user && user.id.includes('-')
  const [ready, setReady] = useState<ReadyRow[]>([])
  const [subs, setSubs] = useState<SubRow[]>([])
  const [note, setNote] = useState('')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [canReview, setCanReview] = useState<boolean | null>(null)
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
    /* P0.7 — gate on the CANONICAL authorisation resolver, never on profiles.role
       and never on user_roles alone. my_challenge_roles() folds in the platform
       hierarchy (master_admin / country_admin / leader), which is why real Coaches
       could not reach this page before. */
    const { data: roles } = await supabase.rpc('my_challenge_roles')
    const ok = ((roles ?? []) as string[])
      .some((r) => ['elite_coach', 'master_mentor', 'super_admin'].includes(r))
    setCanReview(ok)
    if (!ok) return
    /* Dual-role fix: a Coach who is ALSO a participant must never be handed their
       own submission as actionable review work. fn_review_queue() applies
       is_reviewer_of(), which excludes self by definition — the client no longer
       filters the raw tables itself. Self-review stays blocked server-side too. */
    const { data: q, error: eq } = await supabase.rpc('fn_review_queue')
    if (eq) say('⚠ ' + eq.message)
    const queue = (q ?? {}) as { readiness?: RQReady[]; evidence?: RQEvidence[] }
    setReady((queue.readiness ?? []).map((x) => ({
      id: x.id, status: 'submitted', submitted_at: x.submitted_at,
      enrolments: { participant_id: x.participant_id, goal_30d: x.goal, profiles: { name: x.name } },
    })))
    setSubs((queue.evidence ?? []).map((x) => ({
      id: x.id, day_no: x.day_no, version: x.version, response: x.response, reflection: '',
      submitted_at: x.submitted_at,
      enrolments: { participant_id: x.participant_id, profiles: { name: x.name } },
    })))
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
  }, [isReal, user])
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
        <Link to="/team" aria-label={L('Back', 'Kembali', 'Kembali')} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink"><ArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold tracking-tight">{L('Coach Review Queue', 'Barisan Semakan Coach', 'Antrean Tinjauan Coach')}</h1>
          <p className="text-xs text-muted">{L('Human approval only — every decision is audit-logged', 'Kelulusan manusia sahaja — setiap keputusan direkod audit', 'Hanya persetujuan manusia — setiap keputusan dicatat audit')}</p>
        </div>
        <Chip tone="accent"><ShieldCheck size={11} /> Coach</Chip>
      </header>

      {!isReal ? (
        <Card className="p-6 text-center text-sm text-muted">{L('Sign in with a real Coach/Admin account to review.', 'Log masuk dengan akaun Coach/Admin sebenar untuk menyemak.', 'Masuk dengan akun Coach/Admin asli untuk meninjau.')}</Card>
      ) : canReview === false ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-bold">{L('This page is for Coaches and Admins', 'Halaman ini untuk Coach dan Admin', 'Halaman ini untuk Coach dan Admin')}</p>
          <p className="mx-auto mt-2 max-w-xs text-xs text-muted">
            {L('Your own challenge lives in', 'Cabaran anda sendiri ada di', 'Tantangan kamu sendiri ada di')} <Link to="/challenge" className="font-bold text-accent">{L('30 Days Closing Challenge', 'Cabaran Closing 30 Hari', 'Tantangan Closing 30 Hari')}</Link>.
          </p>
        </Card>
      ) : (
        <>
          <PodToday />
          <SlaBoard onReview={(_k, id) => setReviewing(id)} />
          <HelpInbox />
          <CoachBoard />
          <FocusManager />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('Review note (shared with participant)…', 'Nota semakan (dikongsi dengan peserta)…', 'Catatan tinjauan (dibagikan ke peserta)…')}
            className="mb-4 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />

          <SectionTitle>{L('Readiness approvals', 'Kelulusan kesediaan', 'Persetujuan kesiapan')} ({ready.length})</SectionTitle>
          {ready.length === 0 && <Card className="mb-4 p-4 text-center text-xs text-muted">{L('Queue clear ✓', 'Barisan kosong ✓', 'Antrean kosong ✓')}</Card>}
          {ready.map((r) => (
            <Card key={r.id} className="mb-2.5 p-3.5">
              <p className="text-sm font-bold">{r.enrolments?.profiles?.name ?? 'Warrior'}</p>
              <p className="mb-2 text-xs text-muted">{L('Goal', 'Matlamat', 'Target')}: {r.enrolments?.goal_30d ?? '—'}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => act('fn_review_readiness', { p_readiness: r.id, p_approve: true, p_note: note }, L('✅ Readiness approved — enrolment ACTIVE', '✅ Kesediaan diluluskan — pendaftaran AKTIF', '✅ Kesiapan disetujui — pendaftaran AKTIF'))}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white"><Check size={14} /> {L('Approve', 'Lulus', 'Setujui')}</button>
                <button type="button" onClick={() => act('fn_review_readiness', { p_readiness: r.id, p_approve: false, p_note: note }, L('Revision requested', 'Semakan semula diminta', 'Revisi diminta'))}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning"><RotateCcw size={14} /> {L('Revision', 'Semak semula', 'Revisi')}</button>
              </div>
            </Card>
          ))}

          <SectionTitle className="mt-4">{L('Evidence review', 'Semakan bukti', 'Tinjauan bukti')} ({subs.length})</SectionTitle>
          {subs.length === 0 && <Card className="p-4 text-center text-xs text-muted">{L('Queue clear ✓', 'Barisan kosong ✓', 'Antrean kosong ✓')}</Card>}
          {subs.map((s) => (
            <Card key={s.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-sm font-bold">{s.enrolments?.profiles?.name ?? 'Warrior'}</p>
                <Chip tone="accent">{L('Day', 'Hari', 'Hari')} {s.day_no}</Chip>
                {s.version > 1 && <Chip tone="warning">v{s.version}</Chip>}
              </div>
              <p className="mb-1 line-clamp-2 rounded-lg bg-surface2 p-2 text-xs">{s.response}</p>
              {/* P0.6 — no blind approvals. Every decision goes through the review
                  sheet where the requirement, the evidence and the history are visible. */}
              <button type="button" onClick={() => setReviewing(s.id)}
                className="mt-2 flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-accent text-xs font-extrabold text-on-accent">
                <Eye size={14} /> {L('Open evidence & review', 'Buka bukti & semak', 'Buka bukti & tinjau')}
              </button>
            </Card>
          ))}
          {reviewing && (
            <ReviewDetail submissionId={reviewing} onClose={() => setReviewing(null)}
              onDone={(m) => { setReviewing(null); say(m); load() }} />
          )}
          {/* ---- Closing verification (§15) — human-only ---- */}
          <SectionTitle className="mt-4">🏁 {L('Closing verification', 'Pengesahan closing', 'Verifikasi closing')} ({closings.length})</SectionTitle>
          {closings.length === 0 && <Card className="p-4 text-center text-xs text-muted">{L('Queue clear ✓', 'Barisan kosong ✓', 'Antrean kosong ✓')}</Card>}
          {closings.map((c) => (
            <Card key={c.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-sm font-bold">{c.profiles?.name ?? 'Warrior'}</p>
                <Chip tone="accent">Lead: {c.ch_leads?.name ?? '—'}</Chip>
              </div>
              {c.required_steps && <p className="mb-2 rounded-lg bg-surface2 p-2 text-xs">{c.required_steps}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => act('fn_verify_closing', { p_closing: c.id, p_approve: true, p_note: note }, L('🏆 Closing VERIFIED — +XP written to ledger', '🏆 Closing DISAHKAN — +XP direkod ke lejar', '🏆 Closing TERVERIFIKASI — +XP dicatat ke buku besar'))}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white"><Check size={14} /> {L('Verify closing', 'Sahkan closing', 'Verifikasi closing')}</button>
                <button type="button" onClick={() => act('fn_verify_closing', { p_closing: c.id, p_approve: false, p_note: note }, L('Sent back — more documentation needed', 'Dikembalikan — perlu dokumen tambahan', 'Dikembalikan — perlu dokumen tambahan'))}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning"><RotateCcw size={14} /> {L('Not yet', 'Belum lagi', 'Belum')}</button>
              </div>
            </Card>
          ))}

          {/* ---- Post-closing journey review (§20) ---- */}
          <SectionTitle className="mt-4">🎓 {L('Journey steps', 'Langkah perjalanan', 'Langkah perjalanan')} ({pcj.length})</SectionTitle>
          {pcj.length === 0 && <Card className="p-4 text-center text-xs text-muted">{L('Queue clear ✓', 'Barisan kosong ✓', 'Antrean kosong ✓')}</Card>}
          {pcj.map((j) => (
            <Card key={j.id} className="mb-2.5 p-3.5">
              <div className="mb-1 flex items-center gap-2">
                <p className="text-sm font-bold">{j.profiles?.name ?? 'Warrior'}</p>
                <Chip tone="accent">{j.step_code.replaceAll('_', ' ')}</Chip>
              </div>
              {j.response && <p className="mb-2 rounded-lg bg-surface2 p-2 text-xs">{j.response}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => act('fn_review_pcj', { p_progress: j.id, p_approve: true, p_note: note }, L('🎓 Step approved — Mentor Points awarded if configured', '🎓 Langkah diluluskan — Mentor Points diberi jika ditetapkan', '🎓 Langkah disetujui — Mentor Points diberikan jika diatur'))}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-success text-xs font-extrabold text-white"><Check size={14} /> {L('Approve', 'Lulus', 'Setujui')}</button>
                <button type="button" onClick={() => act('fn_review_pcj', { p_progress: j.id, p_approve: false, p_note: note }, L('Revision requested', 'Semakan semula diminta', 'Revisi diminta'))}
                  className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-warning/60 text-xs font-extrabold text-warning"><RotateCcw size={14} /> {L('Revision', 'Semak semula', 'Revisi')}</button>
              </div>
            </Card>
          ))}

          {/* ---- Invite a warrior (§6 INVITED / §21) — WhatsApp delivery only ---- */}
          <SectionTitle className="mt-5">➕ {L('Invite a warrior', 'Jemput warrior', 'Undang warrior')}</SectionTitle>
          <Card className="mb-4 p-4">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input value={nv.name} placeholder={L('Full name', 'Nama penuh', 'Nama lengkap')} onChange={(e) => setNv({ ...nv, name: e.target.value })}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <input value={nv.phone} placeholder={L('+60 / +62 phone', 'Telefon +60 / +62', 'Telepon +60 / +62')} onChange={(e) => setNv({ ...nv, phone: e.target.value })}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <select value={nv.country} onChange={(e) => setNv({ ...nv, country: e.target.value })}
                className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
                <option value="MY">🇲🇾 Malaysia</option><option value="ID">🇮🇩 Indonesia</option>
              </select>
              <select value={nv.cohort} onChange={(e) => setNv({ ...nv, cohort: e.target.value })}
                className="h-11 cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
                <option value="">{L('Cohort (optional)', 'Kohort (pilihan)', 'Cohort (opsional)')}</option>
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
                  say(L('✉ Invitation created', '✉ Jemputan dibuat', '✉ Undangan dibuat'))
                }
              }}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {L('Create invitation', 'Buat jemputan', 'Buat undangan')}
            </button>
            {lastInvite && (
              <div className="mt-3 rounded-xl border border-success/40 bg-success/10 p-3 text-center">
                <p className="text-xs font-bold">{L('Invite for', 'Jemputan untuk', 'Undangan untuk')} {lastInvite.name} — {L('code', 'kod', 'kode')} {lastInvite.code}</p>
                <a target="_blank" rel="noreferrer"
                  href={`https://wa.me/${lastInvite.phone.replace('+', '')}?text=${encodeURIComponent(
                    `Salam ${lastInvite.name}! 🛡 You are invited to join IQI AG Hero — our Warriors platform. Accept here: https://hero.iqiaggroup.com/join/${lastInvite.code}`)}`}
                  className="mt-2 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-xl bg-success text-xs font-extrabold text-white">
                  📲 {L('Send via WhatsApp', 'Hantar melalui WhatsApp', 'Kirim via WhatsApp')}
                </a>
              </div>
            )}
          </Card>

          {/* ---- Coaching report (§16) ---- */}
          <SectionTitle className="mt-5">🧭 {L('Coaching report — write & share', 'Laporan coaching — tulis & kongsi', 'Laporan coaching — tulis & bagikan')}</SectionTitle>
          <Card className="mb-6 p-4">
            <select value={rp.who} onChange={(e) => setRp({ ...rp, who: e.target.value })}
              className="mb-2 h-11 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
              <option value="">{L('Choose participant…', 'Pilih peserta…', 'Pilih peserta…')}</option>
              {people.map((p) => <option key={p.participant_id} value={p.participant_id}>{p.name}</option>)}
            </select>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <input value={rp.period} onChange={(e) => setRp({ ...rp, period: e.target.value })} placeholder={L('Period (e.g. Week 1)', 'Tempoh (cth. Minggu 1)', 'Periode (mis. Minggu 1)')}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <input type="date" value={rp.next} onChange={(e) => setRp({ ...rp, next: e.target.value })} aria-label={L('Next review', 'Semakan berikut', 'Tinjauan berikutnya')}
                className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            </div>
            {([['strengths', L('Strengths', 'Kekuatan', 'Kekuatan')], ['progress', L('Progress', 'Kemajuan', 'Progres')], ['barriers', L('Barriers', 'Halangan', 'Hambatan')], ['actions', L('Agreed actions + due dates', 'Tindakan dipersetujui + tarikh akhir', 'Tindakan disepakati + tenggat')]] as const).map(([k, ph]) => (
              <textarea key={k} rows={2} value={rp[k]} placeholder={ph}
                onChange={(e) => setRp({ ...rp, [k]: e.target.value })}
                className="mb-2 w-full rounded-xl border border-border bg-surface p-2.5 text-sm outline-none focus:border-accent" />
            ))}
            <button type="button" disabled={!rp.who || !rp.progress}
              onClick={() => act('fn_share_report', {
                p_participant: rp.who, p_period: rp.period,
                p_strengths: rp.strengths, p_progress: rp.progress, p_barriers: rp.barriers,
                p_actions: rp.actions, p_next_review: rp.next || null,
              }, L('🧭 Report shared — participant notified', '🧭 Laporan dikongsi — peserta dimaklumkan', '🧭 Laporan dibagikan — peserta diberi tahu'))}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {L('Share report with participant', 'Kongsi laporan dengan peserta', 'Bagikan laporan ke peserta')}
            </button>
            <p className="mt-2 text-[10px] text-muted">{L('Comments must be professional, specific, linked to observable evidence (§16). No hidden scoring.', 'Komen mesti profesional, spesifik, berkait bukti yang boleh diperhati (§16). Tiada skor tersembunyi.', 'Komentar harus profesional, spesifik, terkait bukti yang dapat diamati (§16). Tidak ada skor tersembunyi.')}</p>
          </Card>
        </>
      )}
      {toast && <div className="fixed bottom-24 left-1/2 z-[200] w-[92%] max-w-sm -translate-x-1/2 rounded-xl bg-accent px-4 py-2.5 text-center text-xs font-bold text-on-accent shadow-lg">{toast}</div>}
    </div>
  )
}
