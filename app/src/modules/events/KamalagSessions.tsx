/* ============================================================
   KamalagSessions — manage kamalag.com/sesi sessions from Hero
   ------------------------------------------------------------
   These sessions live in kamalag.com's OWN Supabase project, not
   Hero's. This screen talks to the worker (/kamalag/sessions),
   which holds the kamalag service key and scopes every write to
   captain_id = 'kamalag.com'. Public page: kamalag.com/sesi
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card, Chip } from '../../components/ui'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev/kamalag/sessions'
const PUBLIC = 'https://kamalag.com/sesi'

type MeetingType = 'online' | 'coffee' | 'f2f'
interface Session {
  id: number
  session_date: string
  start_time: string
  end_time: string
  title: string | null
  note: string | null
  meeting_type: MeetingType
  meet_link: string | null
  location_name: string | null
  address: string | null
  map_link: string | null
  is_active: boolean
  checkin_code: string | null
}
interface Reg {
  id: number; name: string; phone: string; friends: string | null
  attended: boolean | null; source: string | null; created_at: string
}

const BLANK = {
  id: 0, session_date: '', start_time: '', end_time: '', title: '',
  note: '', meeting_type: 'online' as MeetingType,
  meet_link: '', location_name: '', address: '', map_link: '',
}

const TYPE_LABEL: Record<MeetingType, string> = {
  online: '💻 Online', coffee: '☕ Coffee', f2f: '📍 Face-to-face',
}

function fmtDate(d: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(d + 'T00:00:00+08:00'))
  } catch { return d }
}
function fmtTime(t: string) { return (t || '').slice(0, 5) }

export default function KamalagSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [form, setForm] = useState({ ...BLANK })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [regsFor, setRegsFor] = useState<number | null>(null)
  const [regs, setRegs] = useState<Reg[]>([])

  const call = useCallback(async (payload: Record<string, unknown>) => {
    const { data: s } = await supabase!.auth.getSession()
    const res = await fetch(WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.session?.access_token}` },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
    return body
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await call({ action: 'list' })
      setSessions(r.sessions || [])
      setCounts(r.counts || {})
    } catch (e) { setMsg('⚠ ' + (e as Error).message) }
    setLoading(false)
  }, [call])

  useEffect(() => { if (supabase) load() }, [load])

  const say = (m: string) => { setMsg(m); if (m) setTimeout(() => setMsg(''), 4000) }

  const reset = () => { setForm({ ...BLANK }); setEditingId(null) }

  const edit = (s: Session) => {
    setEditingId(s.id)
    setForm({
      id: s.id, session_date: s.session_date, start_time: fmtTime(s.start_time), end_time: fmtTime(s.end_time),
      title: s.title || '', note: s.note || '', meeting_type: s.meeting_type || 'online',
      meet_link: s.meet_link || '', location_name: s.location_name || '', address: s.address || '', map_link: s.map_link || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = async () => {
    if (!form.session_date || !form.start_time) { say('⚠ Date and start time are required'); return }
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        action: editingId ? 'update' : 'create',
        session_date: form.session_date, start_time: form.start_time, end_time: form.end_time,
        title: form.title, note: form.note, meeting_type: form.meeting_type,
        meet_link: form.meeting_type === 'online' ? form.meet_link : '',
        location_name: form.meeting_type === 'online' ? '' : form.location_name,
        address: form.meeting_type === 'online' ? '' : form.address,
        map_link: form.meeting_type === 'online' ? '' : form.map_link,
      }
      if (editingId) payload.id = editingId
      await call(payload)
      say(editingId ? '✓ Session updated' : '✓ Session added')
      reset()
      load()
    } catch (e) { say('⚠ ' + (e as Error).message) }
    setBusy(false)
  }

  const archive = async (s: Session) => {
    if (!window.confirm(`Archive the ${fmtDate(s.session_date)} session? It disappears from kamalag.com/sesi but sign-ups are kept.`)) return
    try { await call({ action: 'archive', id: s.id }); say('✓ Archived'); load() }
    catch (e) { say('⚠ ' + (e as Error).message) }
  }

  const viewRegs = async (s: Session) => {
    setRegsFor(s.id); setRegs([])
    try { const r = await call({ action: 'registrations', id: s.id }); setRegs(r.registrations || []) }
    catch (e) { say('⚠ ' + (e as Error).message) }
  }

  const active = useMemo(() => sessions.filter((s) => s.is_active), [sessions])
  const physical = form.meeting_type !== 'online'
  const gold = 'cursor-pointer rounded-xl bg-accent px-4 py-2 text-xs font-extrabold text-on-accent hover:opacity-90 disabled:opacity-40'
  const btn = 'cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted hover:border-accent/60 hover:text-ink disabled:opacity-40'
  const input = 'mt-1 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm'

  if (!supabase) return <Card><p>Live login not configured.</p></Card>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>Kamal AG Sessions</h2>
            <p style={{ margin: '4px 0 0', opacity: 0.7, fontSize: 13 }}>
              Career-conversation dates shown on <a href={PUBLIC} target="_blank" rel="noopener">kamalag.com/sesi</a>.
              Stored in kamalag.com's own database.
            </p>
          </div>
          <a className={btn} href={PUBLIC} target="_blank" rel="noopener">View public page ↗</a>
        </div>
        {msg && <p style={{ marginTop: 10, fontWeight: 600 }}>{msg}</p>}
      </Card>

      {/* ---- add / edit ---- */}
      <Card>
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit session' : 'Add a session'}</h3>
        <div style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
          <label>Meeting type
            <select className={input} value={form.meeting_type} onChange={(e) => setForm({ ...form, meeting_type: e.target.value as MeetingType })}>
              <option value="online">💻 Online — Zoom / Google Meet</option>
              <option value="coffee">☕ Coffee meeting (in person)</option>
              <option value="f2f">📍 Face-to-face (office / venue)</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ flex: '1 1 150px' }}>Date
              <input className={input} type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} />
            </label>
            <label style={{ flex: '1 1 120px' }}>Start
              <input className={input} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </label>
            <label style={{ flex: '1 1 120px' }}>End
              <input className={input} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
            </label>
          </div>
          <label>Session name
            <input className={input} type="text" placeholder="Career Conversation" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>

          {!physical && (
            <label>Zoom / Google Meet link <span style={{ opacity: 0.6 }}>(recruits get it after they reserve)</span>
              <input className={input} type="url" placeholder="https://meet.google.com/xxx-xxxx-xxx" value={form.meet_link} onChange={(e) => setForm({ ...form, meet_link: e.target.value })} />
            </label>
          )}
          {physical && (
            <>
              <label>Venue name
                <input className={input} type="text" placeholder="e.g. Starbucks Millerz Square" value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} />
              </label>
              <label>Address
                <input className={input} type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </label>
              <label>Google Maps link
                <input className={input} type="url" placeholder="https://maps.app.goo.gl/..." value={form.map_link} onChange={(e) => setForm({ ...form, map_link: e.target.value })} />
              </label>
            </>
          )}
          <label>Note on the page <span style={{ opacity: 0.6 }}>(optional)</span>
            <input className={input} type="text" placeholder="e.g. Bring your questions. 30 minutes." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className={gold} disabled={busy} onClick={save}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Add session'}</button>
            {editingId && <button className={btn} onClick={reset}>Cancel</button>}
          </div>
        </div>
      </Card>

      {/* ---- list ---- */}
      <Card>
        <h3 style={{ marginTop: 0 }}>Published dates {active.length ? `(${active.length})` : ''}</h3>
        {loading ? <p>Loading…</p> : !active.length ? (
          <p style={{ opacity: 0.7 }}>No active sessions — add one above. kamalag.com/sesi shows “coming soon”.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {active.map((s) => (
              <div key={s.id} style={{ border: '1px solid var(--line,#333)', borderRadius: 8, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{fmtDate(s.session_date)} · {fmtTime(s.start_time)}{s.end_time ? '–' + fmtTime(s.end_time) : ''}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    <Chip>{TYPE_LABEL[s.meeting_type] || s.meeting_type}</Chip>{' '}
                    {s.meeting_type !== 'online' && s.location_name ? '· ' + s.location_name : ''}
                    {' · '}{counts[s.id] || 0} signed up
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={btn} onClick={() => viewRegs(s)}>Who’s coming</button>
                  <button className={btn} onClick={() => edit(s)}>Edit</button>
                  <button className={btn} onClick={() => archive(s)}>Archive</button>
                </div>

                {regsFor === s.id && (
                  <div style={{ flexBasis: '100%', marginTop: 8, borderTop: '1px solid var(--line,#333)', paddingTop: 8 }}>
                    {!regs.length ? <p style={{ opacity: 0.7, margin: 0 }}>No sign-ups yet.</p> : (
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ textAlign: 'left', opacity: 0.7 }}><th>Name</th><th>WhatsApp</th><th>Friends</th><th>Present</th></tr></thead>
                        <tbody>
                          {regs.map((r) => (
                            <tr key={r.id} style={{ borderTop: '1px solid var(--line,#2a2a2a)' }}>
                              <td>{r.name}</td><td>{r.phone}</td><td>{r.friends || '—'}</td><td>{r.attended ? '✓' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <button className={btn} style={{ marginTop: 6 }} onClick={() => setRegsFor(null)}>Close</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
