/* P1 — Fast CRM entry. NO DUPLICATE ENTRY: this single sheet writes the activity,
   moves the lead stage and sets the next action in one RPC (fn_log_touch), and that
   record then serves as evidence, funnel input, mission progress and coach signal.
   The warrior never enters the same fact twice.
   Advanced fields use progressive disclosure — three taps is the normal path. */
import { useCallback, useEffect, useState } from 'react'
import { X, PhoneCall, MessageSquare, Users, Plus, Check } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '../../lib/store'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'

interface Lead { id: string; name: string; stage: string; next_action_at: string | null; contact: string | null }

export default function QuickLog({ enrolmentId, onClose, onDone }: {
  enrolmentId: string | null; onClose: () => void; onDone: (m: string) => void
}) {
  const { user, locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const [leads, setLeads] = useState<Lead[]>([])
  const [lead, setLead] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [newContact, setNewContact] = useState('')
  const [type, setType] = useState('call')
  const [outcome, setOutcome] = useState('')
  const [when, setWhen] = useState<'tomorrow' | '3days' | 'pick' | 'none'>('tomorrow')
  const [pickDate, setPickDate] = useState('')
  const [more, setMore] = useState(false)
  const [notes, setNotes] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !user) return
    const { data } = await supabase.from('ch_leads')
      .select('id,name,stage,next_action_at,contact')
      .eq('participant_id', user.id)
      .not('stage', 'in', '("CLOSED_WON","CLOSED_LOST","DISQUALIFIED")')
      .order('next_action_at', { nullsFirst: false })
    setLeads((data as Lead[]) ?? [])
  }, [user])
  useEffect(() => { load() }, [load])

  /* Outcome drives the stage — the warrior picks what happened, not a CRM enum. */
  const OUTCOMES: { k: string; stage: string; en: string; bm: string; id: string }[] = [
    { k: 'no_reply',   stage: 'CONTACTED', en: 'No reply',     bm: 'Tiada jawapan',  id: 'Tidak dibalas' },
    { k: 'engaged',    stage: 'ENGAGED',   en: 'Engaged',      bm: 'Melayan',        id: 'Merespons' },
    { k: 'follow_up',  stage: 'FOLLOW_UP', en: 'Follow up',    bm: 'Perlu susulan',  id: 'Perlu follow-up' },
    { k: 'qualified',  stage: 'QUALIFIED', en: 'Qualified',    bm: 'Layak',          id: 'Qualified' },
    { k: 'not_suit',   stage: 'NURTURE',   en: 'Not suitable', bm: 'Tidak sesuai',   id: 'Belum cocok' },
  ]
  const TYPES: { k: string; icon: typeof PhoneCall; en: string; bm: string; id: string }[] = [
    { k: 'call',    icon: PhoneCall,      en: 'Call',    bm: 'Panggil',  id: 'Telepon' },
    { k: 'message', icon: MessageSquare,  en: 'Message', bm: 'Mesej',    id: 'Pesan' },
    { k: 'meeting', icon: Users,          en: 'Meeting', bm: 'Jumpa',    id: 'Bertemu' },
  ]

  const nextDate = () => {
    if (when === 'none') return null
    if (when === 'pick') return pickDate || null
    const d = new Date()
    d.setDate(d.getDate() + (when === 'tomorrow' ? 1 : 3))
    return new Intl.DateTimeFormat('en-CA').format(d)      // local date, never toISOString
  }

  const save = async () => {
    if (!supabase || !user) return
    setBusy(true); setErr('')
    let leadId = lead
    try {
      if (!leadId) {
        if (!newName.trim()) { setErr(L('Give the person a name.', 'Beri nama orang itu.', 'Beri nama orangnya.')); setBusy(false); return }
        const { data, error } = await supabase.from('ch_leads').insert({
          enrolment_id: enrolmentId, participant_id: user.id, country: user.country,
          name: newName.trim(), contact: newContact.trim() || null, stage: 'NEW', source: 'quick_log',
        }).select('id').single()
        if (error) throw error
        leadId = (data as { id: string }).id
      }
      const chosen = OUTCOMES.find((o) => o.k === outcome)
      const { error } = await supabase.rpc('fn_log_touch', {
        p_lead: leadId, p_type: type, p_outcome: chosen ? chosen.k : null,
        p_notes: notes || null, p_next_action: nextAction || null,
        p_next_date: nextDate(), p_stage: chosen?.stage ?? null,
      })
      if (error) throw error
      onDone(L('✅ Logged — your pipeline is updated', '✅ Direkod — pipeline anda dikemas kini', '✅ Tercatat — pipeline Anda diperbarui'))
    } catch (e) {
      setErr((e as { message?: string }).message ?? 'error')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-bg p-4 sm:rounded-3xl">
        <header className="mb-3 flex items-center gap-2">
          <p className="flex-1 font-display text-base font-extrabold">{L('Log conversation', 'Rekod perbualan', 'Catat percakapan')}</p>
          <button type="button" onClick={onClose} aria-label={L('Close', 'Tutup', 'Tutup')}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border text-muted"><X size={16} /></button>
        </header>

        {err && <Card className="mb-3 border-danger/50 bg-danger/10 p-2.5 text-xs font-bold text-danger">{err}</Card>}

        {/* who */}
        <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">{L('Who', 'Siapa', 'Siapa')}</p>
        <select value={lead} onChange={(e) => setLead(e.target.value)}
          className="mb-2 h-12 w-full cursor-pointer rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent">
          <option value="">➕ {L('New person', 'Orang baharu', 'Orang baru')}</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}{l.next_action_at ? ` · ${L('due', 'perlu', 'jatuh tempo')} ${l.next_action_at}` : ''}
            </option>
          ))}
        </select>
        {!lead && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={L('Name', 'Nama', 'Nama')}
              className="h-12 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <input value={newContact} onChange={(e) => setNewContact(e.target.value)} placeholder={L('Phone / handle', 'Telefon / handle', 'Telepon / handle')}
              className="h-12 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
          </div>
        )}

        {/* type */}
        <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">{L('Type', 'Jenis', 'Jenis')}</p>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {TYPES.map((tp) => (
            <button key={tp.k} type="button" onClick={() => setType(tp.k)}
              className={clsx('flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border text-xs font-extrabold',
                type === tp.k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}>
              <tp.icon size={14} /> {L(tp.en, tp.bm, tp.id)}
            </button>
          ))}
        </div>

        {/* outcome */}
        <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">{L('Outcome', 'Keputusan', 'Hasil')}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <button key={o.k} type="button" onClick={() => setOutcome(o.k)}
              className={clsx('h-10 cursor-pointer rounded-xl border px-3 text-xs font-extrabold',
                outcome === o.k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}>
              {L(o.en, o.bm, o.id)}
            </button>
          ))}
        </div>

        {/* next action */}
        <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-muted">{L('Next action', 'Tindakan seterusnya', 'Tindakan berikutnya')}</p>
        <div className="mb-2 grid grid-cols-4 gap-2">
          {([['tomorrow', L('Tomorrow', 'Esok', 'Besok')], ['3days', L('3 days', '3 hari', '3 hari')],
             ['pick', L('Pick', 'Pilih', 'Pilih')], ['none', L('None', 'Tiada', 'Tidak')]] as const).map(([k, lbl]) => (
            <button key={k} type="button" onClick={() => setWhen(k)}
              className={clsx('h-11 cursor-pointer rounded-xl border text-[11px] font-extrabold',
                when === k ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}>
              {lbl}
            </button>
          ))}
        </div>
        {when === 'pick' && (
          <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} aria-label={L('Next action date', 'Tarikh tindakan', 'Tanggal tindakan')}
            className="mb-2 h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
        )}
        {when === 'none' && (
          <p className="mb-2 rounded-lg bg-warning/10 p-2 text-[11px] font-semibold text-warning">
            {L('An active lead with no next action is the most common reason pipeline goes quiet.',
               'Lead aktif tanpa tindakan seterusnya ialah sebab paling kerap pipeline menjadi sepi.',
               'Lead aktif tanpa tindakan berikutnya adalah alasan paling umum pipeline menjadi sepi.')}
          </p>
        )}

        {/* progressive disclosure */}
        {!more
          ? <button type="button" onClick={() => setMore(true)}
              className="mb-3 flex cursor-pointer items-center gap-1 text-xs font-bold text-accent"><Plus size={13} /> {L('Add detail', 'Tambah butiran', 'Tambah detail')}</button>
          : (
            <>
              <input value={nextAction} onChange={(e) => setNextAction(e.target.value)}
                placeholder={L('What exactly is the next step?', 'Apakah langkah seterusnya?', 'Apa langkah berikutnya?')}
                className="mb-2 h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={L('Notes — need, timing, budget, objection…', 'Nota — keperluan, masa, bajet, bantahan…', 'Catatan — kebutuhan, waktu, anggaran, keberatan…')}
                className="mb-3 w-full rounded-xl border border-border bg-surface p-3 text-sm outline-none focus:border-accent" />
            </>
          )}

        <button type="button" disabled={busy || (!lead && !newName.trim())} onClick={save}
          className="flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-extrabold text-on-accent disabled:opacity-40">
          <Check size={16} /> {busy ? L('Saving…', 'Menyimpan…', 'Menyimpan…') : L('Save', 'Simpan', 'Simpan')}
        </button>
        <p className="mt-2 pb-2 text-center text-[10px] text-muted">
          <Chip>{L('No duplicate entry', 'Tiada kemasukan berganda', 'Tanpa entri ganda')}</Chip>{' '}
          {L('This one record updates your pipeline, your day and your Coach view.',
             'Satu rekod ini mengemas kini pipeline, hari anda dan paparan Coach.',
             'Satu catatan ini memperbarui pipeline, hari Anda dan tampilan Coach.')}
        </p>
      </div>
    </div>
  )
}
