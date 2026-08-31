/* Public event page — hero.iqiaggroup.com/my/<slug> · /id/<slug> (070).
   No login. Country segment = default language (MY→EN, ID→ID), phone prefix,
   and which WhatsApp number GHL replies from. Flow ported from kamalag.com/sesi:
   pick a date (online or physical) → register → join details revealed only
   now → add to calendar. ?ref=<agent phone> credits the agent. ?checkin=1&code=
   is the venue QR: registered phone → present; unknown phone → walk-in. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'

interface Ev { id: string; country: 'MY' | 'ID'; slug: string; title: string; description: string | null; kind: string; status: string; capacity: number | null; registration_closes_at?: string | null; allow_walkin?: boolean }
interface Sess { id: number; type: string; title: string; starts_at: string; location: string | null; map_url: string | null; capacity: number | null }
type Loc = 'en' | 'bm' | 'id'
const WORKER = 'https://m4u-api.iqiaggroup.workers.dev'

export default function EventPublic() {
  const { cc = 'my', slug = '' } = useParams()
  const [sp] = useSearchParams()
  const country: 'MY' | 'ID' = cc === 'id' ? 'ID' : 'MY'
  const tz = country === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur'
  const [loc, setLoc] = useState<Loc>(country === 'ID' ? 'id' : 'en')
  const L = useCallback((en: string, bm: string, id: string) => loc === 'bm' ? bm : loc === 'id' ? id : en, [loc])
  const dl = loc === 'bm' ? 'ms-MY' : loc === 'id' ? 'id-ID' : 'en-GB'
  const shield = useBrand('GLOBAL', 'shield')

  const [ev, setEv] = useState<Ev | null | undefined>(undefined)
  const [sessions, setSessions] = useState<Sess[]>([])
  const [pick, setPick] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState(country === 'ID' ? '+62' : '+60')
  const [email, setEmail] = useState('')
  const [friends, setFriends] = useState('')
  const [withFriends, setWithFriends] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ type: string; title: string; starts_at: string; link: string | null; location: string | null; map_url: string | null } | null>(null)
  const [now, setNow] = useState(Date.now())
  // venue check-in
  const checkin = sp.get('checkin') === '1'
  const code = sp.get('code') ?? ''
  const ref = sp.get('ref') ?? ''
  const [ciPhone, setCiPhone] = useState(country === 'ID' ? '+62' : '+60')
  const [ciName, setCiName] = useState('')
  const [ciEmail, setCiEmail] = useState('')
  const [ciDone, setCiDone] = useState<string>('')

  useEffect(() => {
    if (!supabase) { setEv(null); return }
    ;(async () => {
      const { data } = await supabase.from('events')
        .select('id,country,slug,title,description,kind,status,capacity,registration_closes_at,allow_walkin')
        .eq('country', country).eq('slug', slug).eq('status', 'published').maybeSingle()
      const e = (data as Ev | null) ?? null
      setEv(e)
      if (!e) return
      const { data: s } = await supabase.from('bop_sessions')
        .select('id,type,title,starts_at,location,map_url,capacity')
        .eq('event_id', e.id).eq('active', true)
        .gte('starts_at', new Date(Date.now() - 3 * 3600e3).toISOString()).order('starts_at')
      const list = (s as Sess[]) ?? []
      setSessions(list)
      if (list.length === 1) setPick(list[0].id)
    })()
  }, [country, slug])

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const n = sp.get('name'); const p = sp.get('phone')
    if (n) setName(n); if (p) setPhone(p)
  }, [sp])

  const next = useMemo(() => sessions.find((s) => new Date(s.starts_at).getTime() > now) ?? sessions[0], [sessions, now])
  const countdown = useMemo(() => {
    if (!next) return null
    const d = Math.max(0, new Date(next.starts_at).getTime() - now)
    const days = Math.floor(d / 864e5), h = Math.floor((d % 864e5) / 36e5), m = Math.floor((d % 36e5) / 6e4), s = Math.floor((d % 6e4) / 1e3)
    return { days, h, m, s }
  }, [next, now])

  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString(dl, { timeZone: tz, ...opts })

  const register = async () => {
    if (!supabase || !ev || !pick) return
    setErr('')
    if (!name.trim() || phone.replace(/\D/g, '').length < 9) { setErr(L('Please enter your name and phone.', 'Sila isi nama dan telefon.', 'Mohon isi nama dan nomor telepon.')); return }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr(L('A valid email is required — your attendance e-certificate is sent there.',
        'Emel yang sah diperlukan — e-sijil kehadiran anda dihantar ke situ.',
        'Email yang valid wajib diisi — e-sertifikat kehadiranmu dikirim ke sana.'))
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('event_register', {
      p_country: country, p_slug: slug, p_session: pick, p_name: name.trim(), p_phone: phone.trim(),
      p_email: email.trim().toLowerCase(), p_friends: withFriends ? friends.trim() || null : null,
      p_ref: ref || null, p_source: 'self',
    })
    setBusy(false)
    const out = data as { ok: boolean; reason?: string; lead_id?: number; session_id?: number; type: string; title: string; starts_at: string; link: string | null; location: string | null; map_url: string | null }
    if (error || !out?.ok) {
      const r = out?.reason
      setErr(r === 'full' ? L('This date is full — pick another.', 'Tarikh ini penuh — pilih yang lain.', 'Tanggal ini penuh — pilih yang lain.')
        : r === 'closed' ? L('Online registration has closed for this event.', 'Pendaftaran dalam talian untuk acara ini telah ditutup.', 'Pendaftaran online untuk acara ini sudah ditutup.')
        : r === 'email_required' ? L('A valid email is required.', 'Emel yang sah diperlukan.', 'Email yang valid wajib diisi.')
        : error?.message ?? L('Could not register. Try again.', 'Tidak dapat mendaftar. Cuba lagi.', 'Tidak bisa mendaftar. Coba lagi.'))
      return
    }
    try { localStorage.setItem(`ev:${ev.id}`, JSON.stringify({ phone: phone.trim(), session: pick })) } catch { /* ignore */ }
    setDone(out)
    // GHL + owner notification — server side, fire and forget
    fetch(`${WORKER}/events/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, slug, lead_id: out.lead_id, session_id: out.session_id }) }).catch(() => {})
  }

  /* venue check-in = two steps: look up by phone → confirm/correct the name +
     email that will go on the e-certificate → "I'm here". Unknown phone →
     walk-in (name + email required). */
  const [ciStep, setCiStep] = useState<'phone' | 'confirm' | 'walkin'>('phone')
  const [ciSession, setCiSession] = useState('')
  const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())

  const ciLookup = async () => {
    if (!supabase) return
    setErr(''); setBusy(true)
    const { data, error } = await supabase.rpc('event_checkin_lookup', { p_country: country, p_slug: slug, p_code: code, p_phone: ciPhone.trim() })
    setBusy(false)
    const out = data as { ok: boolean; reason?: string; name?: string; email?: string; session_title?: string; already_present?: boolean }
    if (error) { setErr(error.message); return }
    if (out.ok) {
      setCiName(out.name ?? ''); setCiEmail(out.email ?? ''); setCiSession(out.session_title ?? ''); setCiStep('confirm'); return
    }
    if (out.reason === 'not_registered') { setCiName(''); setCiEmail(''); setCiStep('walkin'); return }
    setErr(out.reason === 'bad_code' ? L('Check-in code invalid.', 'Kod daftar masuk tidak sah.', 'Kode check-in tidak valid.')
      : out.reason === 'bad_phone' ? L('Enter a valid phone number.', 'Masukkan nombor telefon yang sah.', 'Masukkan nomor telepon yang valid.') : out.reason ?? 'error')
  }

  const doCheckin = async () => {
    if (!supabase) return
    setErr('')
    if (!ciName.trim()) { setErr(L('Name is required.', 'Nama diperlukan.', 'Nama wajib diisi.')); return }
    if (!emailOk(ciEmail)) { setErr(L('A valid email is required for your e-certificate.', 'Emel yang sah diperlukan untuk e-sijil anda.', 'Email yang valid wajib untuk e-sertifikatmu.')); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('event_checkin', {
      p_country: country, p_slug: slug, p_code: code, p_phone: ciPhone.trim(),
      p_name: ciName.trim(), p_email: ciEmail.trim().toLowerCase(),
    })
    setBusy(false)
    const out = data as { ok: boolean; reason?: string; walkin?: boolean; title?: string }
    if (error) { setErr(error.message); return }
    if (out.ok) { setCiDone(out.walkin ? 'walkin' : 'ok'); return }
    setErr(out.reason === 'bad_code' ? L('Check-in code invalid.', 'Kod daftar masuk tidak sah.', 'Kode check-in tidak valid.')
      : out.reason === 'email_required' || out.reason === 'bad_email' ? L('A valid email is required.', 'Emel yang sah diperlukan.', 'Email yang valid wajib diisi.')
      : out.reason === 'walkin_closed' ? L('On-the-day registration is closed for this event — please see the registration desk.', 'Pendaftaran pada hari acara ditutup untuk acara ini — sila ke kaunter pendaftaran.', 'Pendaftaran di hari acara ditutup untuk acara ini — silakan ke meja pendaftaran.')
      : out.reason ?? 'error')
  }
  const regClosed = !!ev?.registration_closes_at && new Date(ev.registration_closes_at).getTime() < now

  const gcal = (s: { title: string; starts_at: string; location?: string | null; link?: string | null }) => {
    const st = new Date(s.starts_at); const en = new Date(st.getTime() + 90 * 60000)
    const f = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '')
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(s.title)}&dates=${f(st)}/${f(en)}&details=${encodeURIComponent(s.link ?? '')}&location=${encodeURIComponent(s.location ?? s.link ?? '')}`
  }

  const inp = 'h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-ink outline-none transition-colors focus:border-accent'
  const inpStyle = { WebkitTextFillColor: 'var(--ink)', caretColor: 'var(--ink)' } as const

  if (ev === undefined) return <div className="p-10 text-center text-sm text-muted">…</div>
  if (ev === null) return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="text-lg font-extrabold">{L('Event not found', 'Acara tidak dijumpai', 'Acara tidak ditemukan')}</p>
      <p className="mt-1 text-xs text-muted">{L('This link may have closed. Ask the person who sent it.', 'Pautan ini mungkin sudah ditutup. Tanya orang yang menghantarnya.', 'Tautan ini mungkin sudah ditutup. Tanyakan ke pengirimnya.')}</p>
    </div>
  )

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-6">
      <div className="mb-3 flex justify-center gap-1.5">
        {(country === 'ID' ? (['id', 'en'] as Loc[]) : (['en', 'bm'] as Loc[])).map((l) => (
          <button key={l} type="button" onClick={() => setLoc(l)}
            className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold', loc === l ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted')}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="hero-user mb-5 px-5 pb-5 pt-6 text-center">
        <img src={shield ?? '/brand/ag-shield.png'} alt="" className="relative mx-auto mb-2 h-12 w-12 object-contain" />
        <p className="relative text-[10px] font-bold uppercase tracking-[0.2em] text-[#c9c2a8]">IQI AG · {country === 'MY' ? 'Malaysia' : 'Indonesia'}</p>
        <h1 className="relative mt-1 font-display text-xl font-extrabold leading-tight">{ev.title}</h1>
        {ev.description && <p className="relative mt-2 text-xs leading-relaxed text-[#c9c2a8]">{ev.description}</p>}
        {countdown && next && !done && !checkin && (
          <div className="relative mt-4 flex justify-center gap-2">
            {[[countdown.days, L('days', 'hari', 'hari')], [countdown.h, L('hrs', 'jam', 'jam')], [countdown.m, L('min', 'min', 'mnt')], [countdown.s, L('sec', 'saat', 'dtk')]].map(([v, l]) => (
              <div key={String(l)} className="min-w-[56px] rounded-xl bg-black/30 px-2 py-1.5">
                <p className="gold-text font-display text-xl font-extrabold">{String(v).padStart(2, '0')}</p>
                <p className="text-[9px] uppercase text-[#c9c2a8]">{l}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- venue check-in ---------- */}
      {checkin ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          {ciDone ? (
            <div className="text-center">
              <p className="text-3xl">✅</p>
              <p className="mt-1 text-base font-extrabold">{L('You are checked in!', 'Anda sudah daftar masuk!', 'Kamu sudah check-in!')}</p>
              <p className="mt-1 text-xs text-muted">{ciDone === 'walkin' ? L('Registered as a walk-in and marked present. Welcome!', 'Didaftar sebagai walk-in dan ditanda hadir. Selamat datang!', 'Terdaftar sebagai walk-in dan ditandai hadir. Selamat datang!') : L('Welcome — enjoy the session.', 'Selamat datang — nikmati sesi ini.', 'Selamat datang — nikmati sesinya.')}</p>
            </div>
          ) : (
            <>
              <p className="mb-1 text-sm font-extrabold">📍 {L('Check in at the venue', 'Daftar masuk di venue', 'Check-in di lokasi')}</p>
              {ciStep === 'phone' && (
                <>
                  <p className="mb-3 text-xs text-muted">{L('Enter the phone you registered with.', 'Masukkan telefon yang anda daftarkan.', 'Masukkan nomor telepon yang kamu daftarkan.')}</p>
                  <input className={clsx(inp, 'mb-2')} style={inpStyle} type="tel" value={ciPhone} onChange={(e) => setCiPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ciLookup()} />
                  {err && <p className="mb-2 rounded-lg border border-danger/50 bg-danger/10 p-2 text-xs font-semibold text-danger">{err}</p>}
                  <button type="button" disabled={busy} onClick={ciLookup}
                    className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                    {busy ? '…' : L('Continue', 'Teruskan', 'Lanjutkan')} →
                  </button>
                </>
              )}
              {(ciStep === 'confirm' || ciStep === 'walkin') && (
                <>
                  <div className="mb-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-xs leading-relaxed">
                    {ciStep === 'confirm'
                      ? <>🎓 <b>{L('Check your details — this is exactly what will appear on your e-certificate.', 'Semak butiran anda — inilah yang akan tertera pada e-sijil anda.', 'Periksa datamu — ini yang akan tertulis di e-sertifikatmu.')}</b>{' '}
                          {L('Edit if anything is wrong, then confirm.', 'Betulkan jika ada yang silap, kemudian sahkan.', 'Perbaiki jika ada yang salah, lalu konfirmasi.')}
                          {ciSession && <span className="block text-muted">{ciSession}</span>}</>
                      : <>⚠️ <b>{L("You're not registered yet — register now!", 'Anda belum berdaftar — daftar sekarang!', 'Kamu belum terdaftar — daftar sekarang!')}</b>{' '}
                          {L('Fill in your details and you are registered and checked in at once. They will appear on your e-certificate.',
                            'Isi butiran anda — anda terus berdaftar dan daftar masuk sekali gus. Ia akan tertera pada e-sijil anda.',
                            'Isi datamu — kamu langsung terdaftar dan check-in sekaligus. Data ini akan tertulis di e-sertifikatmu.')}</>}
                  </div>
                  <label className="mb-1 block text-[11px] font-bold text-muted">{L('Full name (as on certificate)', 'Nama penuh (seperti pada sijil)', 'Nama lengkap (seperti di sertifikat)')}</label>
                  <input className={clsx(inp, 'mb-2')} style={inpStyle} value={ciName} onChange={(e) => setCiName(e.target.value)} autoComplete="name" />
                  <label className="mb-1 block text-[11px] font-bold text-muted">{L('Email (certificate is sent here)', 'Emel (sijil dihantar ke sini)', 'Email (sertifikat dikirim ke sini)')}</label>
                  <input className={clsx(inp, 'mb-2')} style={inpStyle} type="email" value={ciEmail} onChange={(e) => setCiEmail(e.target.value)} autoComplete="email" />
                  <p className="mb-2 text-[11px] text-muted">📱 {ciPhone}</p>
                  {err && <p className="mb-2 rounded-lg border border-danger/50 bg-danger/10 p-2 text-xs font-semibold text-danger">{err}</p>}
                  <button type="button" disabled={busy} onClick={doCheckin}
                    className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
                    {busy ? '…' : ciStep === 'walkin' ? L('Register & I’m here ✓', 'Daftar & saya hadir ✓', 'Daftar & saya hadir ✓') : L('Details correct — I’m here ✓', 'Butiran betul — saya hadir ✓', 'Data benar — saya hadir ✓')}
                  </button>
                  <button type="button" onClick={() => { setCiStep('phone'); setErr('') }} className="mt-2 block w-full cursor-pointer text-center text-xs text-muted underline">
                    ← {L('Different number', 'Nombor lain', 'Nomor lain')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      ) : done ? (
        /* ---------- confirmation ---------- */
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-center text-3xl">🎉</p>
          <p className="mt-1 text-center text-base font-extrabold">{L("You're registered!", 'Anda sudah berdaftar!', 'Kamu sudah terdaftar!')}</p>
          <p className="mt-1 text-center text-xs text-muted">
            {fmt(done.starts_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-center">
            {done.type === 'online' ? (
              <>
                <p className="mb-2 text-xs font-bold">🎥 {L('Online session — your join link', 'Sesi online — pautan sertai anda', 'Sesi online — link bergabungmu')}</p>
                {done.link ? (
                  <a href={done.link} target="_blank" rel="noreferrer" className="inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-extrabold text-on-accent no-underline">
                    {L('Join link', 'Pautan sertai', 'Link bergabung')} →
                  </a>
                ) : <p className="text-xs text-muted">{L('The link will be sent to your WhatsApp.', 'Pautan akan dihantar ke WhatsApp anda.', 'Link akan dikirim ke WhatsApp kamu.')}</p>}
              </>
            ) : (
              <>
                <p className="mb-1 text-xs font-bold">🏢 {L('Physical session — venue', 'Sesi fizikal — venue', 'Sesi fisik — lokasi')}</p>
                <p className="text-xs">{done.location}</p>
                {done.map_url && <a href={done.map_url} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-xl bg-accent px-4 py-2 text-xs font-extrabold text-on-accent no-underline">📍 Google Maps</a>}
              </>
            )}
          </div>
          <a href={gcal({ title: `${ev.title} · ${done.title}`, starts_at: done.starts_at, location: done.location, link: done.link })} target="_blank" rel="noreferrer"
            className="mt-3 block rounded-xl border border-border py-2.5 text-center text-xs font-bold text-muted no-underline hover:text-ink">
            📅 {L('Add to Google Calendar', 'Tambah ke Google Calendar', 'Tambah ke Google Calendar')}
          </a>
          <p className="mt-4 text-center text-[11px] text-muted">
            {L('A WhatsApp confirmation and reminders are on the way. See you there!', 'Pengesahan & peringatan WhatsApp sedang dihantar. Jumpa nanti!', 'Konfirmasi & pengingat WhatsApp sedang dikirim. Sampai jumpa!')}
          </p>
          {sessions.length > 1 && (
            <button type="button" onClick={() => { setDone(null); setPick(null) }} className="mt-3 block w-full cursor-pointer text-center text-xs text-accent underline">
              {L('Need a different date?', 'Perlu tarikh lain?', 'Perlu tanggal lain?')}
            </button>
          )}
        </div>
      ) : (
        /* ---------- register ---------- */
        <>
          {regClosed ? (
            <div className="rounded-2xl border border-border bg-surface p-5 text-center">
              <p className="text-sm font-bold">{L('Online registration has closed', 'Pendaftaran dalam talian telah ditutup', 'Pendaftaran online sudah ditutup')}</p>
              <p className="mt-1 text-xs text-muted">
                {ev.allow_walkin !== false
                  ? L('You can still register at the venue on event day — scan the check-in QR there.', 'Anda masih boleh mendaftar di venue pada hari acara — imbas QR daftar masuk di sana.', 'Kamu masih bisa mendaftar di lokasi pada hari acara — scan QR check-in di sana.')
                  : L('Please contact the organiser.', 'Sila hubungi penganjur.', 'Silakan hubungi penyelenggara.')}
              </p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-5 text-center text-xs text-muted">
              {L('No upcoming dates right now — check back soon.', 'Tiada tarikh akan datang buat masa ini — semak semula nanti.', 'Belum ada tanggal mendatang — cek lagi nanti.')}
            </div>
          ) : (
            <>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                {sessions.length > 1 ? L('Pick your date', 'Pilih tarikh anda', 'Pilih tanggalmu') : L('Date', 'Tarikh', 'Tanggal')}
              </p>
              <div className="mb-4 space-y-2">
                {sessions.map((s) => (
                  <button key={s.id} type="button" onClick={() => setPick(s.id)}
                    className={clsx('flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      pick === s.id ? 'border-accent bg-accent-soft/50' : 'border-border bg-surface hover:border-accent/40')}>
                    <span className="text-xl">{s.type === 'online' ? '🎥' : '🏢'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{fmt(s.starts_at, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmt(s.starts_at, { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {s.type === 'online' ? L('Online (Google Meet / Zoom)', 'Online (Google Meet / Zoom)', 'Online (Google Meet / Zoom)') : (s.location ?? L('Physical session', 'Sesi fizikal', 'Sesi fisik'))}
                      </span>
                    </span>
                    <span className={clsx('h-4 w-4 shrink-0 rounded-full border-2', pick === s.id ? 'border-accent bg-accent' : 'border-border')} />
                  </button>
                ))}
              </div>
              <input className={clsx(inp, 'mb-2')} style={inpStyle} placeholder={L('Full name', 'Nama penuh', 'Nama lengkap')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <input className={clsx(inp, 'mb-2')} style={inpStyle} type="tel" placeholder={L('WhatsApp number', 'Nombor WhatsApp', 'Nomor WhatsApp')} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              <input className={clsx(inp, 'mb-1')} style={inpStyle} type="email" required placeholder={L('Email *', 'Emel *', 'Email *')} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              <p className="mb-2 px-1 text-[10px] text-muted">
                🎓 {L('Your attendance e-certificate is sent to this email.', 'E-sijil kehadiran anda dihantar ke emel ini.', 'E-sertifikat kehadiranmu dikirim ke email ini.')}
              </p>
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
                <input type="checkbox" checked={withFriends} onChange={(e) => setWithFriends(e.target.checked)} className="h-4 w-4" style={{ accentColor: 'var(--accent)' }} />
                {L("I'm bringing friends", 'Saya bawa kawan', 'Saya bawa teman')}
              </label>
              {withFriends && (
                <textarea className="mb-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent" rows={2}
                  placeholder={L('Their names, one per line', 'Nama mereka, satu setiap baris', 'Nama mereka, satu per baris')} value={friends} onChange={(e) => setFriends(e.target.value)} />
              )}
              {err && <p className="mb-2 rounded-lg border border-danger/50 bg-danger/10 p-2 text-xs font-semibold text-danger">{err}</p>}
              <button type="button" disabled={busy || !pick} onClick={register}
                className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? '…' : L('Reserve my seat', 'Tempah tempat saya', 'Daftar sekarang')}
              </button>
              <p className="mt-3 text-center text-[10px] text-muted">
                {L('Free. Join details are shown right after you register.', 'Percuma. Butiran sertai dipaparkan sebaik anda mendaftar.', 'Gratis. Detail bergabung ditampilkan setelah kamu mendaftar.')}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
