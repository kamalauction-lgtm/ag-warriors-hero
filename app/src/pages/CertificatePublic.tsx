/* Certificates — public surfaces (075).
   /certificate/verify/<token>  public verification (limited fields, enumeration-safe)
   /certificate/verify          enter a certificate number
   /certificate/<access_token>  participant's own certificate: view · download PDF · verify */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import clsx from 'clsx'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'

const WORKER = 'https://m4u-api.iqiaggroup.workers.dev'
type Loc = 'en' | 'bm' | 'id'
interface Verify {
  status: string; recipient_name?: string; certificate_title?: string; event_title?: string
  event_date?: string; issued_at?: string; certificate_number?: string; country?: string; issuer?: string
}
interface View extends Verify { id?: string; language?: string; snapshot?: Record<string, unknown>; has_pdf?: boolean }

const fmtDate = (iso?: string, country?: string, loc: Loc = 'en') => iso
  ? new Date(iso).toLocaleDateString(loc === 'bm' ? 'ms-MY' : loc === 'id' ? 'id-ID' : 'en-GB',
      { timeZone: country === 'ID' ? 'Asia/Jakarta' : 'Asia/Kuala_Lumpur', day: 'numeric', month: 'long', year: 'numeric' })
  : ''

function Shell({ children, loc, setLoc }: { children: React.ReactNode; loc: Loc; setLoc: (l: Loc) => void }) {
  const shield = useBrand('GLOBAL', 'shield')
  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-6">
      <div className="mb-3 flex justify-center gap-1.5">
        {(['en', 'bm', 'id'] as Loc[]).map((l) => (
          <button key={l} type="button" onClick={() => setLoc(l)}
            className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold', loc === l ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted')}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="hero-user mb-5 px-5 pb-4 pt-5 text-center">
        <img src={shield ?? '/brand/ag-shield.png'} alt="" className="relative mx-auto mb-2 h-12 w-12 object-contain" />
        <p className="relative text-[10px] font-bold uppercase tracking-[0.22em] text-[#c9c2a8]">IQI AG Hero</p>
        <p className="relative mt-0.5 font-display text-base font-extrabold">Certificate Verification</p>
      </div>
      {children}
      <p className="mt-6 text-center text-[10px] leading-relaxed text-muted">
        This page verifies that the displayed certificate was issued by the stated organiser through IQI AG Hero.
      </p>
    </div>
  )
}

function StatusBadge({ status, L }: { status: string; L: (a: string, b: string, c: string) => string }) {
  const ok = status === 'issued'
  const revoked = status === 'revoked'
  const sup = status === 'superseded'
  return (
    <div className={clsx('mb-4 rounded-2xl border p-4 text-center',
      ok ? 'border-success/50 bg-success/10' : revoked ? 'border-danger/50 bg-danger/10' : 'border-border bg-surface')}>
      <p className="text-3xl" aria-hidden>{ok ? '✅' : revoked ? '⛔' : sup ? '🔁' : '❔'}</p>
      <p className={clsx('mt-1 text-base font-extrabold', ok ? 'text-success' : revoked ? 'text-danger' : 'text-muted')}>
        {ok ? L('VALID CERTIFICATE', 'SIJIL SAH', 'SERTIFIKAT VALID')
          : revoked ? L('REVOKED', 'DIBATALKAN', 'DICABUT')
          : sup ? L('SUPERSEDED — a corrected certificate replaced this one', 'DIGANTIKAN — sijil yang dibetulkan menggantikan ini', 'DIGANTIKAN — sertifikat yang diperbaiki menggantikan ini')
          : L('Certificate not found or verification information is invalid.', 'Sijil tidak dijumpai atau maklumat pengesahan tidak sah.', 'Sertifikat tidak ditemukan atau informasi verifikasi tidak valid.')}
      </p>
    </div>
  )
}

function Details({ v, loc, L }: { v: Verify; loc: Loc; L: (a: string, b: string, c: string) => string }) {
  const rows: [string, string | undefined][] = [
    [L('Name', 'Nama', 'Nama'), v.recipient_name],
    [L('Certificate', 'Sijil', 'Sertifikat'), v.certificate_title],
    [L('Event', 'Acara', 'Acara'), v.event_title],
    [L('Date', 'Tarikh', 'Tanggal'), fmtDate(v.event_date, v.country, loc)],
    [L('Issued', 'Dikeluarkan', 'Diterbitkan'), fmtDate(v.issued_at, v.country, loc)],
    [L('Certificate No.', 'No. Sijil', 'No. Sertifikat'), v.certificate_number],
    [L('Issued by', 'Dikeluarkan oleh', 'Diterbitkan oleh'), v.issuer],
  ]
  return (
    <div className="rounded-2xl border border-border bg-surface">
      {rows.filter(([, val]) => val).map(([k, val]) => (
        <div key={k} className="flex items-start justify-between gap-4 border-b border-border px-4 py-2.5 text-sm last:border-0">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted">{k}</span>
          <span className="text-right font-semibold">{val}</span>
        </div>
      ))}
    </div>
  )
}

export function CertificateVerify() {
  const { token = '' } = useParams()
  const [loc, setLoc] = useState<Loc>('en')
  const L = (en: string, bm: string, id: string) => loc === 'bm' ? bm : loc === 'id' ? id : en
  const [v, setV] = useState<Verify | null | undefined>(token ? undefined : null)
  const [num, setNum] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token || !supabase) return
    supabase.rpc('certificate_verify', { p_token: token }).then(({ data }) => setV((data as Verify) ?? { status: 'not_found' }))
  }, [token])

  const lookup = async () => {
    if (!supabase || !num.trim()) return
    setBusy(true)
    const { data } = await supabase.rpc('certificate_verify_number', { p_number: num.trim() })
    setBusy(false)
    setV((data as Verify) ?? { status: 'not_found' })
  }

  return (
    <Shell loc={loc} setLoc={setLoc}>
      {v === undefined && <p className="py-8 text-center text-xs text-muted">…</p>}
      {v && <><StatusBadge status={v.status} L={L} />{v.status !== 'not_found' && <Details v={v} loc={loc} L={L} />}</>}
      <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs font-bold">{L('Verify by certificate number', 'Sahkan dengan nombor sijil', 'Verifikasi dengan nomor sertifikat')}</p>
        <div className="flex gap-2">
          <input value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookup()}
            placeholder="AG-MY-2026-000123" aria-label="Certificate number"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 text-sm text-ink outline-none focus:border-accent"
            style={{ WebkitTextFillColor: 'var(--ink)' }} />
          <button type="button" onClick={lookup} disabled={busy || !num.trim()}
            className="cursor-pointer rounded-xl bg-accent px-4 text-xs font-extrabold text-on-accent disabled:opacity-40">
            {L('Verify', 'Sahkan', 'Verifikasi')}
          </button>
        </div>
      </div>
    </Shell>
  )
}

export function CertificateView() {
  const { access = '' } = useParams()
  const [loc, setLoc] = useState<Loc>('en')
  const L = (en: string, bm: string, id: string) => loc === 'bm' ? bm : loc === 'id' ? id : en
  const [v, setV] = useState<View | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) return
    supabase.rpc('certificate_view', { p_access_token: access }).then(({ data }) => {
      const out = (data as View) ?? { status: 'not_found' }
      setV(out)
      if (out.language === 'ms-MY') setLoc('bm'); else if (out.language === 'id-ID') setLoc('id')
    })
  }, [access])

  const snap = (v?.snapshot ?? {}) as Record<string, string>
  return (
    <Shell loc={loc} setLoc={setLoc}>
      {v === undefined && <p className="py-8 text-center text-xs text-muted">…</p>}
      {v && v.status === 'not_found' && <StatusBadge status="not_found" L={L} />}
      {v && v.status !== 'not_found' && (
        <>
          {/* the certificate card — mirrors the PDF */}
          <div className="mb-4 rounded-2xl border-2 p-6 text-center" style={{ borderColor: '#b08a3a', background: '#fdfcf7', color: '#1a1a1f' }}>
            <p className="text-[9px] font-extrabold uppercase tracking-[0.25em]" style={{ color: '#8a6d1f' }}>IQI AG Group</p>
            <p className="mt-2 font-display text-2xl font-extrabold" style={{ color: '#b08a3a' }}>
              {snap.certificate_title || L('Certificate of Attendance', 'Sijil Kehadiran', 'Sertifikat Kehadiran')}
            </p>
            <p className="mt-3 text-[11px] italic text-[#666]">{L('This is to certify that', 'Dengan ini disahkan bahawa', 'Dengan ini menyatakan bahwa')}</p>
            <p className="mt-1 font-display text-xl font-extrabold">{v.recipient_name}</p>
            <div className="mx-auto my-2 h-px w-40" style={{ background: '#b08a3a' }} />
            <p className="text-[11px] italic text-[#666]">{L('attended', 'telah menghadiri', 'telah menghadiri')}</p>
            <p className="mt-1 text-sm font-bold">{snap.event_title}</p>
            <p className="text-[11px] text-[#666]">{[fmtDate(snap.event_date, v.country, loc), snap.venue].filter(Boolean).join(' · ')}</p>
            <p className="mt-4 font-mono text-[10px] text-[#666]">{v.certificate_number} · {fmtDate(v.issued_at, v.country, loc)}</p>
            {v.status === 'revoked' && <p className="mt-2 text-xs font-extrabold text-danger">{L('REVOKED', 'DIBATALKAN', 'DICABUT')}</p>}
          </div>
          {v.status === 'issued' && (
            <a href={`${WORKER}/cert/pdf?t=${access}`} target="_blank" rel="noreferrer"
              className="mb-2 block rounded-xl bg-accent py-3 text-center text-sm font-extrabold text-on-accent no-underline">
              ⬇ {L('Download PDF', 'Muat turun PDF', 'Unduh PDF')}
            </a>
          )}
          <a href={`/certificate/verify?n=${encodeURIComponent(v.certificate_number ?? '')}`}
            className="block rounded-xl border border-border py-2.5 text-center text-xs font-bold text-muted no-underline hover:text-ink">
            ✓ {L('Verify this certificate', 'Sahkan sijil ini', 'Verifikasi sertifikat ini')}
          </a>
        </>
      )}
    </Shell>
  )
}
