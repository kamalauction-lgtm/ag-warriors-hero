/* Certificate tab inside an event (075) — ATTENDANCE CREATES ELIGIBILITY ·
   ADMIN AUTHORISES ISSUANCE. Config (ON/OFF, template, language, email
   template) + eligibility table (registered → present → eligible → issued →
   sent/failed/revoked) + Issue / Send / Resend / Revoke / Reissue + preview.
   Bulk = sequential RPC calls with a progress line (idempotent: the RPC returns
   the existing certificate instead of creating a second one). */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { exportCsv } from '../../lib/csv'
import { Card, Chip } from '../../components/ui'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev'
const APP = 'https://hero.iqiaggroup.com'
type Lang = 'en' | 'ms-MY' | 'id-ID'
interface Ev { id: string; country: 'MY' | 'ID'; title: string; slug: string }
interface Cfg { event_id: string; enabled: boolean; template_version_id: string | null; language: Lang; email_template_id: string | null; number_prefix: string | null; certificate_title: string | null; overrides_json: Record<string, unknown> }
interface Tpl { id: string; name: string; orientation: string; status: string; current_version: number; country: string }
interface TplVer { id: string; template_id: string; version: number }
interface ETpl { id: string; name: string; language: Lang; subject: string; status: string; country: string }
interface Row {
  session_id: number; session_title: string; starts_at: string; type: string
  lead_id: number; name: string | null; phone_norm: string | null; email: string | null
  attended: string; attended_at: string | null; checkin_method: string | null; source: string
  eligible: boolean; certificate_id: string | null; certificate_number: string | null; cert_status: string | null
  recipient_name: string | null; has_pdf: boolean; issued_at: string | null
  email_status: string | null; email_sent_at: string | null; email_attempts: number
  /* 093 — a revoked certificate can now be replaced, so a row carries the
     history of what came before the certificate it is currently showing. */
  revoke_reason: string | null; replaces_number: string | null; revoked_count: number
  /* 094 — why the last send ended the way it did, in words. */
  email_error: string | null
}
interface TplChoice {
  template_version_id: string; template_id: string; name: string
  version: number; orientation: string; is_event_default: boolean
}
type Filter = 'all' | 'eligible' | 'not_issued' | 'issued' | 'sent' | 'failed' | 'revoked' | 'present'

const LANGS: { v: Lang; label: string }[] = [{ v: 'en', label: 'English' }, { v: 'ms-MY', label: 'Bahasa Malaysia' }, { v: 'id-ID', label: 'Bahasa Indonesia' }]
const fmtDT = (iso: string, c: string) => new Date(iso).toLocaleString('en-GB', { timeZone: c === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function CertificatePanel({ ev, say }: { ev: Ev; say: (m: string) => void }) {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [tpls, setTpls] = useState<Tpl[]>([])
  const [vers, setVers] = useState<TplVer[]>([])
  const [etpls, setEtpls] = useState<ETpl[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [sessF, setSessF] = useState<'all' | number>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null)
  const [preview, setPreview] = useState<Row | null>(null)
  const [nameFix, setNameFix] = useState<{ row: Row; name: string; reason: string } | null>(null)
  const [revoke, setRevoke] = useState<{ row: Row; reason: string } | null>(null)
  /* tplVer = the template the replacement is issued on. '' means "the event's
     default"; picking another one affects THIS certificate only, never the
     event config, so everyone issued afterwards is unaffected. */
  const [reissue, setReissue] = useState<{ row: Row; name: string; reason: string; tplVer: string } | null>(null)
  const [tplChoices, setTplChoices] = useState<TplChoice[]>([])

  const key = (r: Row) => `${r.session_id}:${r.lead_id}`

  const load = useCallback(async () => {
    if (!supabase) return
    const [c, t, v, e, b, tc] = await Promise.all([
      supabase.from('event_certificate_configs').select('*').eq('event_id', ev.id).maybeSingle(),
      supabase.from('certificate_templates').select('id,name,orientation,status,current_version,country').eq('country', ev.country).eq('status', 'active').order('name'),
      supabase.from('certificate_template_versions').select('id,template_id,version').order('version', { ascending: false }),
      supabase.from('certificate_email_templates').select('id,name,language,subject,status,country').eq('country', ev.country).eq('status', 'active').order('name'),
      supabase.rpc('cert_eligibility', { p_event: ev.id }),
      supabase.rpc('cert_template_choices', { p_event: ev.id }),
    ])
    setCfg((c.data as Cfg | null) ?? null)
    setTpls((t.data as Tpl[]) ?? [])
    setVers((v.data as TplVer[]) ?? [])
    setEtpls((e.data as ETpl[]) ?? [])
    setRows((b.data as Row[]) ?? [])
    setTplChoices((tc.data as unknown as TplChoice[]) ?? [])
  }, [ev.id, ev.country])
  useEffect(() => { load() }, [load])

  const latestVersionOf = (templateId: string) => vers.find((x) => x.template_id === templateId)?.id ?? null
  const templateOfVersion = (verId: string | null) => vers.find((x) => x.id === verId)?.template_id ?? ''

  const saveCfg = async (patch: Partial<Cfg>) => {
    if (!supabase) return
    const { data: u } = await supabase.auth.getUser()
    const base: Cfg = cfg ?? { event_id: ev.id, enabled: false, template_version_id: null, language: ev.country === 'ID' ? 'id-ID' : 'ms-MY', email_template_id: null, number_prefix: null, certificate_title: null, overrides_json: {} }
    const next = { ...base, ...patch }
    const { error } = await supabase.from('event_certificate_configs').upsert({ ...next, updated_by: u.user?.id, updated_at: new Date().toISOString() })
    if (error) { say('⚠ ' + error.message); return }
    await supabase.from('events').update({ certificate_enabled: next.enabled }).eq('id', ev.id)
    setCfg(next); say(patch.enabled === true ? '🎓 Certificates ON for this event' : 'Certificate settings saved'); load()
  }

  /* quick default template so an event can go live without the editor */
  const createDefaultTemplate = async () => {
    if (!supabase) return
    const { data: u } = await supabase.auth.getUser()
    const { data: t, error } = await supabase.from('certificate_templates').insert({
      country: ev.country, name: `${ev.country} Attendance Certificate`, orientation: 'landscape', current_version: 1, created_by: u.user?.id,
    }).select('*').single()
    if (error) { say('⚠ ' + error.message); return }
    const { data: v, error: e2 } = await supabase.from('certificate_template_versions').insert({
      template_id: (t as Tpl).id, version: 1, created_by: u.user?.id,
      layout_json: { accent: '#b08a3a' },
      text_json: {
        en: { title: 'Certificate of Attendance', heading: 'This is to certify that', attendance: 'attended', footer: 'Become Better · Build Better · Give Better' },
        'ms-MY': { title: 'Sijil Kehadiran', heading: 'Dengan ini disahkan bahawa', attendance: 'telah menghadiri', footer: 'Become Better · Build Better · Give Better' },
        'id-ID': { title: 'Sertifikat Kehadiran', heading: 'Dengan ini menyatakan bahwa', attendance: 'telah menghadiri', footer: 'Become Better · Build Better · Give Better' },
      },
      signatories_json: [{ name: 'PMgr Ts Kamal AG', title: 'Commander, IQI AG Group' }],
    }).select('*').single()
    if (e2) { say('⚠ ' + e2.message); return }
    say('Default template created'); await load(); saveCfg({ template_version_id: (v as TplVer).id })
  }

  /* ---------- issue / send ---------- */
  const issueOne = async (r: Row, nameOverride?: string, reason?: string): Promise<boolean> => {
    if (!supabase) return false
    const { data, error } = await supabase.rpc('cert_issue', { p_session: r.session_id, p_lead: r.lead_id, p_name_override: nameOverride ?? null, p_override_reason: reason ?? null })
    if (error) { say('⚠ ' + error.message); return false }
    const out = data as { ok: boolean; certificate_id: string; already?: boolean }
    if (!out.already) {
      const { data: s } = await supabase.auth.getSession()
      await fetch(`${WORKER}/cert/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ certificate_id: out.certificate_id }) }).catch(() => {})
    }
    return true
  }
  const issueMany = async (list: Row[]) => {
    if (!list.length) return
    if (!window.confirm(`Issue ${list.length} certificate(s)? Each valid attendance gets exactly one.`)) return
    setBusy('issue'); setProgress({ done: 0, total: list.length, failed: 0 })
    let failed = 0
    for (let i = 0; i < list.length; i++) {
      const ok = await issueOne(list[i]); if (!ok) failed++
      setProgress({ done: i + 1, total: list.length, failed })
    }
    setBusy(''); say(`Issued ${list.length - failed} · failed ${failed}`); setSel(new Set()); load()
  }
  const sendMany = async (list: Row[], label = 'Send') => {
    const ids = list.filter((r) => r.certificate_id && r.cert_status === 'issued').map((r) => r.certificate_id as string)
    const noEmail = list.filter((r) => !r.email).length
    if (!ids.length) { say('Nothing to send — issue first'); return }
    if (!window.confirm(`${label} ${ids.length} email(s)?${noEmail ? ` ${noEmail} have no email and will be skipped.` : ''}`)) return
    setBusy('send')
    const { data, error } = await supabase!.rpc('cert_queue_email', { p_certs: ids, p_template: cfg?.email_template_id ?? null })
    if (error) { setBusy(''); say('⚠ ' + error.message); return }
    const out = data as { queued: number; skipped: number }
    if (!out.queued) { setBusy(''); say(`Nothing queued · skipped ${out.skipped}`); load(); return }

    /* Queueing alone used to be the whole action, and the row then sat on
       "Queued" until the 5-minute cron came round — with no way to tell whether
       anything was happening. Send now, and report what actually happened. The
       cron stays as the safety net if this call never lands. */
    say(`📧 Sending ${out.queued}…`)
    try {
      const { data: s } = await supabase!.auth.getSession()
      const res = await fetch(`${WORKER}/cert/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
        body: JSON.stringify({ certificate_ids: ids }),
      })
      const r = await res.json() as { sent?: number; failed?: number; cancelled?: number; error?: string }
      if (!res.ok) {
        say(`Queued ${out.queued} — ${r.error ?? 'could not send now'}; the 5-minute sweep will retry`)
      } else {
        const bits = [`✅ Sent ${r.sent ?? 0}`]
        if (r.failed) bits.push(`failed ${r.failed}`)
        if (r.cancelled) bits.push(`not sent ${r.cancelled}`)
        if (out.skipped) bits.push(`skipped ${out.skipped}`)
        say(bits.join(' · '))
      }
    } catch {
      say(`Queued ${out.queued} — could not reach the mail service; the 5-minute sweep will retry`)
    }
    setBusy(''); setSel(new Set()); load()
  }
  const doRevoke = async () => {
    if (!supabase || !revoke?.row.certificate_id || !revoke.reason.trim()) return
    const { error } = await supabase.rpc('cert_revoke', { p_cert: revoke.row.certificate_id, p_reason: revoke.reason.trim() })
    if (error) { say('⚠ ' + error.message); return }
    say('Certificate revoked'); setRevoke(null); load()
  }
  const doReissue = async () => {
    if (!supabase || !reissue?.row.certificate_id || !reissue.reason.trim()) return
    const wasRevoked = reissue.row.cert_status === 'revoked'
    const { data, error } = await supabase.rpc('cert_reissue_v2', {
      p_cert: reissue.row.certificate_id,
      p_new_name: reissue.name.trim() || null,
      p_reason: reissue.reason.trim(),
      p_template_version: reissue.tplVer || null,
    })
    if (error) { say('⚠ ' + error.message); return }
    const out = data as { certificate_id: string; certificate_number: string }
    const { data: s } = await supabase.auth.getSession()
    await fetch(`${WORKER}/cert/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` }, body: JSON.stringify({ certificate_id: out.certificate_id }) }).catch(() => {})
    say(wasRevoked
      ? `Replacement issued ${out.certificate_number} — ${reissue.row.certificate_number} stays revoked`
      : `Reissued as ${out.certificate_number} — ${reissue.row.certificate_number} superseded`)
    setReissue(null); load()
  }
  const openPdf = async (r: Row) => {
    if (!supabase || !r.certificate_id) return
    const { data: s } = await supabase.auth.getSession()
    const res = await fetch(`${WORKER}/cert/render`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` }, body: JSON.stringify({ certificate_id: r.certificate_id }) })
    const out = await res.json().catch(() => null)
    if (out?.url) window.open(out.url, '_blank'); else say('⚠ ' + (out?.error ?? 'PDF failed'))
  }

  /* ---------- derived ---------- */
  const shown = useMemo(() => rows.filter((r) => {
    if (sessF !== 'all' && r.session_id !== sessF) return false
    switch (filter) {
      case 'eligible': return r.eligible && !r.certificate_id
      case 'not_issued': return r.eligible && !r.certificate_id
      case 'issued': return !!r.certificate_id && r.cert_status === 'issued'
      case 'sent': return r.email_status === 'sent'
      case 'failed': return r.email_status === 'failed'
      case 'revoked': return r.cert_status === 'revoked'
      case 'present': return r.attended === 'attended'
      default: return true
    }
  }), [rows, filter, sessF])
  const sessions = useMemo(() => {
    const m = new Map<number, { title: string; starts_at: string }>()
    rows.forEach((r) => m.set(r.session_id, { title: r.session_title, starts_at: r.starts_at }))
    return [...m.entries()]
  }, [rows])
  const stats = {
    registered: rows.length, present: rows.filter((r) => r.attended === 'attended').length,
    eligible: rows.filter((r) => r.eligible).length,
    issued: rows.filter((r) => r.certificate_id && r.cert_status === 'issued').length,
    sent: rows.filter((r) => r.email_status === 'sent').length,
    failed: rows.filter((r) => r.email_status === 'failed').length,
  }
  const selected = rows.filter((r) => sel.has(key(r)))
  const toggleAll = (list: Row[]) => setSel(new Set(list.map(key)))

  const inp = 'h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent'
  const btn = 'cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink disabled:opacity-40'
  const gold = 'cursor-pointer rounded-xl bg-accent px-3.5 py-2 text-xs font-extrabold text-on-accent hover:opacity-90 disabled:opacity-40'
  const certStatusChip = (r: Row) => {
    if (!r.certificate_id) return r.eligible ? <Chip tone="accent">Eligible</Chip> : <Chip>Not eligible</Chip>
    if (r.cert_status === 'revoked') return <Chip tone="danger">Revoked</Chip>
    if (r.cert_status === 'superseded') return <Chip>Superseded</Chip>
    return <Chip tone="success">Issued</Chip>
  }
  /* 094 — 'cancelled' means we called the send off ourselves (the certificate
     was revoked or replaced first). That is not a delivery problem and must not
     look like one, or the admin goes hunting for a bounce that never happened. */
  const emailChip = (r: Row) => !r.certificate_id ? null
    : r.email_status === 'sent' ? <Chip tone="success">Sent{r.email_attempts > 1 ? ` ×${r.email_attempts}` : ''}</Chip>
    : r.email_status === 'failed' ? <Chip tone="danger">Failed</Chip>
    : r.email_status === 'cancelled' ? <Chip>Not sent</Chip>
    : r.email_status === 'queued' ? <Chip tone="warning">Queued</Chip>
    : <Chip>Not sent</Chip>

  return (
    <div className="mt-4">
      {/* ---------- config ---------- */}
      <Card className="mb-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-extrabold">🎓 Certificate</p>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-bold">
            <input type="checkbox" checked={!!cfg?.enabled} onChange={(e) => saveCfg({ enabled: e.target.checked })} className="h-4 w-4" style={{ accentColor: 'var(--accent)' }} />
            {cfg?.enabled ? 'ON — present attendees become eligible' : 'OFF'}
          </label>
          <span className="flex-1" />
          <select className={inp} value={cfg?.language ?? (ev.country === 'ID' ? 'id-ID' : 'ms-MY')} onChange={(e) => saveCfg({ language: e.target.value as Lang })} aria-label="Certificate language">
            {LANGS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
          </select>
          <select className={inp} value={templateOfVersion(cfg?.template_version_id ?? null)} aria-label="Template"
            onChange={(e) => e.target.value && saveCfg({ template_version_id: latestVersionOf(e.target.value) })}>
            <option value="">— template —</option>
            {tpls.map((t) => <option key={t.id} value={t.id}>{t.name} · v{t.current_version}</option>)}
          </select>
          {tpls.length === 0 && <button type="button" onClick={createDefaultTemplate} className={btn}>+ Default template</button>}
          <select className={inp} value={cfg?.email_template_id ?? ''} aria-label="Email template" onChange={(e) => saveCfg({ email_template_id: e.target.value || null })}>
            <option value="">Email: built-in ({cfg?.language ?? 'lang'})</option>
            {etpls.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language}</option>)}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className={`${inp} flex-1`} placeholder="Certificate title override (optional) — e.g. Sijil Kehadiran Program Kerjaya" defaultValue={cfg?.certificate_title ?? ''}
            onBlur={(e) => e.target.value !== (cfg?.certificate_title ?? '') && saveCfg({ certificate_title: e.target.value || null })} />
          <input className={`${inp} w-44`} placeholder={`Number prefix (AG-${ev.country}-${new Date().getFullYear()})`} defaultValue={cfg?.number_prefix ?? ''}
            onBlur={(e) => e.target.value !== (cfg?.number_prefix ?? '') && saveCfg({ number_prefix: e.target.value || null })} />
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div>
            <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-muted">Event name on certificate</label>
            <input className={`${inp} w-full`} placeholder={`blank = "${ev.title}"`} defaultValue={(cfg?.overrides_json?.event_title as string) ?? ''}
              onBlur={(e) => e.target.value !== ((cfg?.overrides_json?.event_title as string) ?? '') && saveCfg({ overrides_json: { ...(cfg?.overrides_json ?? {}), event_title: e.target.value || undefined } })} />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-muted">Details line under it</label>
            <input className={`${inp} w-full`} placeholder="blank = auto: session · mode · date · venue" defaultValue={(cfg?.overrides_json?.details_line as string) ?? ''}
              onBlur={(e) => e.target.value !== ((cfg?.overrides_json?.details_line as string) ?? '') && saveCfg({ overrides_json: { ...(cfg?.overrides_json ?? {}), details_line: e.target.value || undefined } })} />
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted">Country: {ev.country} (fixed by the event). Attendance (QR / Present toggle) creates eligibility; nothing is issued or emailed until you click.</p>
      </Card>

      {/* ---------- stats ---------- */}
      <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
        {[['Registered', stats.registered, 'var(--accent)'], ['Present', stats.present, '#43c59e'], ['Cert eligible', stats.eligible, '#4f9cf9'],
          ['Issued', stats.issued, '#a78bfa'], ['Sent', stats.sent, '#43c59e'], ['Delivery issues', stats.failed, '#f4826d']].map(([l, v, c]) => (
          <Card key={String(l)} className="p-3">
            <p className="font-display text-lg font-extrabold" style={{ color: String(c) }}>{v as number}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted">{l}</p>
          </Card>
        ))}
      </div>

      {/* ---------- filters + bulk ---------- */}
      <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
        <select className={inp} value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filter">
          {(['all', 'eligible', 'issued', 'sent', 'failed', 'revoked', 'present'] as Filter[]).map((f) => <option key={f} value={f}>{f === 'all' ? 'All' : f === 'failed' ? 'Failed delivery' : f[0].toUpperCase() + f.slice(1)}</option>)}
        </select>
        <select className={inp} value={String(sessF)} onChange={(e) => setSessF(e.target.value === 'all' ? 'all' : Number(e.target.value))} aria-label="Session">
          <option value="all">All dates</option>
          {sessions.map(([id, s]) => <option key={id} value={id}>{fmtDT(s.starts_at, ev.country)} · {s.title}</option>)}
        </select>
        <button type="button" className={btn} onClick={() => toggleAll(shown.filter((r) => r.eligible && !r.certificate_id))}>Select all eligible</button>
        <span className="text-xs text-muted">{sel.size} selected</span>
        <span className="flex-1" />
        <button type="button" className={gold} disabled={!!busy || !cfg?.enabled || !cfg?.template_version_id}
          onClick={() => issueMany(selected.filter((r) => r.eligible && !r.certificate_id))}>Issue selected</button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => sendMany(selected)}>Send selected</button>
        <button type="button" className={btn} disabled={!!busy} onClick={() => sendMany(selected.filter((r) => r.email_status === 'sent' || r.email_status === 'failed'), 'Resend')}>Resend selected</button>
        <button type="button" className={btn} onClick={() => {
          if (!shown.length) { say('Nothing to export'); return }
          exportCsv(`${ev.slug}-certificates`, shown.map((r) => ({ name: r.name, email: r.email, phone: r.phone_norm, session: r.session_title, attended: r.attended,
            certificate_number: r.certificate_number, cert_status: r.cert_status, recipient_name: r.recipient_name, issued_at: r.issued_at, email_status: r.email_status, email_sent_at: r.email_sent_at })))
        }}>⬇ CSV</button>
        {progress && <span className="text-xs font-bold text-accent">Processing {progress.done}/{progress.total} · failed {progress.failed}</span>}
      </Card>
      {!cfg?.template_version_id && cfg?.enabled && <p className="mb-2 text-xs font-bold text-warning">⚠ Pick a template (or create the default) before issuing.</p>}

      {/* ---------- table ---------- */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
              <th className="px-3 py-2.5"><input type="checkbox" aria-label="Select all shown" checked={shown.length > 0 && shown.every((r) => sel.has(key(r)))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map(key)) : new Set())} /></th>
              <th className="px-3 py-2.5">Participant</th><th className="px-3 py-2.5">Session</th><th className="px-3 py-2.5">Attendance</th>
              <th className="px-3 py-2.5">Certificate</th><th className="px-3 py-2.5">Email</th><th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={key(r)} className="border-b border-border last:border-0 hover:bg-surface2/50">
                <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(key(r))} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(key(r)); else n.delete(key(r)); setSel(n) }} /></td>
                <td className="px-3 py-2.5">
                  <p className="font-bold">{r.recipient_name ?? r.name ?? 'Unnamed'}{r.recipient_name && r.recipient_name !== r.name && <span className="ml-1 font-normal text-muted" title={`registered as ${r.name}`}>(corrected)</span>}</p>
                  <p className={r.email ? 'text-muted' : 'text-danger'}>{r.email ?? 'no email'}</p>
                </td>
                <td className="px-3 py-2.5 text-muted">{fmtDT(r.starts_at, ev.country)}<br />{r.type}</td>
                <td className="px-3 py-2.5">
                  {r.attended === 'attended' ? <Chip tone="success">Present{r.checkin_method ? ` · ${r.checkin_method}` : ''}</Chip>
                    : r.attended === 'no_show' ? <Chip tone="danger">No-show</Chip> : <Chip>Registered</Chip>}
                </td>
                <td className="px-3 py-2.5">
                  {certStatusChip(r)}
                  {r.certificate_number && <p className="mt-0.5 font-mono text-[10px] text-muted">{r.certificate_number}</p>}
                  {/* the trail: what this document replaced, and why the old one went */}
                  {r.replaces_number && <p className="font-mono text-[10px] text-muted">replaces {r.replaces_number}</p>}
                  {r.cert_status === 'revoked' && r.revoke_reason && <p className="text-[10px] text-danger">{r.revoke_reason}</p>}
                  {r.cert_status === 'issued' && r.revoked_count > 0 && (
                    <p className="text-[10px] text-muted">{r.revoked_count} revoked earlier</p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {emailChip(r)}
                  {r.email_sent_at && <p className="mt-0.5 text-[10px] text-muted">{fmtDT(r.email_sent_at, ev.country)}</p>}
                  {/* the reason, in words — this used to be a bare red chip */}
                  {r.email_error && (r.email_status === 'failed' || r.email_status === 'cancelled') && (
                    <p className={`mt-0.5 max-w-[220px] text-[10px] ${r.email_status === 'failed' ? 'text-danger' : 'text-muted'}`}>
                      {r.email_error}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {r.eligible && !r.certificate_id && <>
                      <button type="button" className={btn} onClick={() => setPreview(r)}>Preview</button>
                      <button type="button" className={gold} disabled={!!busy || !cfg?.template_version_id} onClick={() => issueMany([r])}>Issue</button>
                      <button type="button" className={btn} onClick={() => setNameFix({ row: r, name: r.name ?? '', reason: '' })} title="Correct spelling before issue">✎ name</button>
                    </>}
                    {r.certificate_id && r.cert_status === 'issued' && <>
                      <button type="button" className={btn} onClick={() => openPdf(r)}>PDF</button>
                      <a href={`${APP}/certificate/verify?n=${encodeURIComponent(r.certificate_number ?? '')}`} target="_blank" rel="noreferrer" className={`${btn} no-underline`}>Verify</a>
                      <button type="button" className={gold} disabled={!!busy || !r.email} onClick={() => sendMany([r], r.email_status ? 'Resend' : 'Send')}>{r.email_status ? 'Resend' : 'Send'}</button>
                      <button type="button" className={btn} onClick={() => setReissue({ row: r, name: r.recipient_name ?? '', reason: '', tplVer: '' })}>Reissue</button>
                      <button type="button" className="cursor-pointer rounded-xl border border-danger/50 px-3 py-2 text-xs font-bold text-danger hover:bg-danger/10" onClick={() => setRevoke({ row: r, reason: '' })}>Revoke</button>
                    </>}
                    {/* A revocation is final for THAT document — the number stays
                        revoked in public verification. What it no longer does is
                        trap the person: a replacement can be issued on any active
                        template, with its own new number. */}
                    {r.certificate_id && r.cert_status === 'revoked' && <>
                      <button type="button" className={btn} onClick={() => openPdf(r)}>PDF (revoked)</button>
                      <button type="button" className={gold} disabled={!!busy || !r.eligible}
                        title={r.eligible ? 'Issue a replacement with a new number' : 'Attendance is the eligibility source — mark Present first'}
                        onClick={() => setReissue({ row: r, name: r.recipient_name ?? r.name ?? '', reason: '', tplVer: '' })}>
                        Issue replacement
                      </button>
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="p-6 text-center text-xs text-muted">No participants in this view.</p>}
      </Card>

      {/* ---------- preview sheet (no number is minted) ---------- */}
      {preview && (
        <Modal onClose={() => setPreview(null)} title="Preview — not issued yet">
          <div className="rounded-2xl border-2 p-6 text-center" style={{ borderColor: '#b08a3a', background: '#fdfcf7', color: '#1a1a1f' }}>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.25em]" style={{ color: '#8a6d1f' }}>IQI AG Group</p>
            <p className="mt-2 font-display text-2xl font-extrabold" style={{ color: '#b08a3a' }}>
              {cfg?.certificate_title || (cfg?.language === 'ms-MY' ? 'Sijil Kehadiran' : cfg?.language === 'id-ID' ? 'Sertifikat Kehadiran' : 'Certificate of Attendance')}
            </p>
            <p className="mt-3 text-[11px] italic text-[#666]">{cfg?.language === 'ms-MY' ? 'Dengan ini disahkan bahawa' : cfg?.language === 'id-ID' ? 'Dengan ini menyatakan bahwa' : 'This is to certify that'}</p>
            <p className="mt-1 font-display text-xl font-extrabold">{preview.name}</p>
            <div className="mx-auto my-2 h-px w-40" style={{ background: '#b08a3a' }} />
            <p className="text-[11px] italic text-[#666]">{cfg?.language === 'en' ? 'attended' : 'telah menghadiri'}</p>
            <p className="mt-1 text-sm font-bold">{(cfg?.overrides_json?.event_title as string) || ev.title}</p>
            <p className="text-[11px] text-[#666]">{(cfg?.overrides_json?.details_line as string) || `${preview.session_title} · ${fmtDT(preview.starts_at, ev.country)}`}</p>
            <p className="mt-4 font-mono text-[10px] text-[#999]">AG-{ev.country}-{new Date().getFullYear()}-XXXXXX · QR ▪▪▪</p>
          </div>
          <button type="button" className={`${gold} mt-3 w-full`} onClick={() => { const r = preview; setPreview(null); issueMany([r]) }}>Confirm & issue</button>
        </Modal>
      )}
      {nameFix && (
        <Modal onClose={() => setNameFix(null)} title="Correct certificate name (audited)">
          <p className="mb-2 text-xs text-muted">Registered as <b>{nameFix.row.name}</b>. The registration record is kept; only the certificate display name changes.</p>
          <input className={`${inp} mb-2 w-full`} value={nameFix.name} onChange={(e) => setNameFix({ ...nameFix, name: e.target.value })} placeholder="Name as it must appear" />
          <input className={`${inp} mb-3 w-full`} value={nameFix.reason} onChange={(e) => setNameFix({ ...nameFix, reason: e.target.value })} placeholder="Reason (e.g. spelling)" />
          <button type="button" className={`${gold} w-full`} disabled={!nameFix.name.trim()} onClick={async () => { const n = nameFix; setNameFix(null); if (await issueOne(n.row, n.name.trim(), n.reason.trim() || 'name correction')) { say('Issued with corrected name'); load() } }}>Issue with this name</button>
        </Modal>
      )}
      {revoke && (
        <Modal onClose={() => setRevoke(null)} title="Revoke certificate">
          <p className="mb-2 text-xs text-muted">{revoke.row.certificate_number} · {revoke.row.recipient_name}. Public verification will show REVOKED. History is kept.</p>
          <input className={`${inp} mb-3 w-full`} value={revoke.reason} onChange={(e) => setRevoke({ ...revoke, reason: e.target.value })} placeholder="Reason (required, internal)" />
          <button type="button" className="w-full cursor-pointer rounded-xl bg-danger py-2.5 text-xs font-extrabold text-white disabled:opacity-40" disabled={!revoke.reason.trim()} onClick={doRevoke}>Revoke</button>
        </Modal>
      )}
      {reissue && (() => {
        const wasRevoked = reissue.row.cert_status === 'revoked'
        return (
          <Modal onClose={() => setReissue(null)} title={wasRevoked ? 'Issue a replacement certificate' : 'Reissue certificate'}>
            <p className="mb-3 text-xs text-muted">
              {wasRevoked ? <>
                <b className="text-danger">{reissue.row.certificate_number}</b> stays <b>revoked</b> — anyone verifying that number
                will still be told so, and its reason is kept. This creates a separate, new certificate with its own number.
              </> : <>
                Creates a corrected certificate with a NEW number; <b>{reissue.row.certificate_number}</b> becomes superseded.
              </>}
            </p>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">Name on the certificate</label>
            <input className={`${inp} mb-3 w-full`} value={reissue.name} onChange={(e) => setReissue({ ...reissue, name: e.target.value })} placeholder="Name as it must appear" />
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">Template</label>
            <select className={`${inp} mb-1 w-full`} value={reissue.tplVer} aria-label="Template for this certificate"
              onChange={(e) => setReissue({ ...reissue, tplVer: e.target.value })}>
              <option value="">Event default{tplChoices.find((t) => t.is_event_default) ? ` — ${tplChoices.find((t) => t.is_event_default)!.name}` : ''}</option>
              {tplChoices.map((t) => (
                <option key={t.template_version_id} value={t.template_version_id}>
                  {t.name} · v{t.version} · {t.orientation}{t.is_event_default ? ' (event default)' : ''}
                </option>
              ))}
            </select>
            <p className="mb-3 text-[10px] text-muted">Applies to this certificate only — the event's own template setting is not changed.</p>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted">Reason</label>
            <input className={`${inp} mb-3 w-full`} value={reissue.reason} onChange={(e) => setReissue({ ...reissue, reason: e.target.value })} placeholder="Reason (required, audited)" />
            <button type="button" className={`${gold} w-full`} disabled={!!busy || !reissue.reason.trim() || !reissue.name.trim()} onClick={doReissue}>
              {wasRevoked ? 'Issue replacement with a new number' : 'Reissue with a new number'}
            </button>
          </Modal>
        )
      })()}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/60 sm:items-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-2xl border border-border bg-bg p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-extrabold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
