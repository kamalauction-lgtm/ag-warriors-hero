/* Self-registration (068) — a recruit presents themselves with a VISIBLE phone
   number, lands in the pending queue, and can only enter the app after an
   admin approves them in Command HQ → People & Roles. Country picks the phone
   prefix and the default language (MY→EN, ID→ID). */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useApp } from '../lib/store'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'
import type { Locale } from '../lib/types'

const LOCALES: { v: Locale; label: string }[] = [
  { v: 'en', label: 'EN' },
  { v: 'bm', label: 'BM' },
  { v: 'id', label: 'ID' },
]

export default function Register() {
  const { t, locale, setLocale } = useApp()
  const shield = useBrand('GLOBAL', 'shield')
  const [country, setCountry] = useState<'MY' | 'ID'>('MY')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<'' | 'pending' | 'confirm'>('')

  const inp = 'h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-ink outline-none transition-colors duration-200 focus:border-accent'
  const inpStyle = { WebkitTextFillColor: 'var(--ink)', caretColor: 'var(--ink)' } as const

  const submit = async () => {
    if (!supabase) return
    setErr('')
    if (!name.trim() || !phone.trim() || !email.trim()) { setErr(t('rg.fillAll')); return }
    if (pw.length < 8) { setErr(t('rg.pwShort')); return }
    if (pw !== pw2) { setErr(t('rg.pwMismatch')); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password: pw,
      options: { data: { name: name.trim(), phone: phone.trim(), country } },
    })
    if (error) { setBusy(false); setErr(error.message); return }
    if (data.session) {
      // no email-confirmation step — create the pending profile right now
      const { error: e2 } = await supabase.rpc('register_profile', {
        p_name: name.trim(), p_phone: phone.trim(), p_country: country,
      })
      await supabase.auth.signOut()
      setBusy(false)
      if (e2) { setErr(e2.message); return }
      setDone('pending')
    } else {
      // email confirmation required first; profile is created on first login
      setBusy(false)
      setDone('confirm')
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6 py-10">
      <div className="animate-rise">
        <div className="mb-4 flex justify-center gap-1.5">
          {LOCALES.map((l) => (
            <button key={l.v} type="button" onClick={() => setLocale(l.v)}
              className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors duration-200',
                locale === l.v ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:text-ink')}>
              {l.label}
            </button>
          ))}
        </div>

        <div className="hero-user mb-6 flex flex-col items-center px-6 pb-5 pt-6 text-center">
          <img src={shield ?? '/brand/ag-shield.png'} alt="AG shield"
            className="relative mb-2 h-14 w-14 object-contain drop-shadow-[0_6px_16px_rgba(212,172,74,0.35)]" />
          <h1 className="relative font-display text-xl font-extrabold tracking-tight">
            {t('rg.title')}
          </h1>
          <p className="relative mt-1 text-[11px] text-[#c9c2a8]">{t('rg.sub')}</p>
        </div>

        {done ? (
          <div className="rounded-2xl border border-border bg-surface p-5 text-center">
            <p className="mb-1 text-sm font-bold">{done === 'pending' ? t('rg.donePending') : t('rg.doneConfirm')}</p>
            <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">
              {done === 'pending' ? t('rg.donePendingBody') : t('rg.doneConfirmBody')}
            </p>
            <Link to="/" className="mt-4 inline-block cursor-pointer text-xs font-bold text-accent underline">
              {t('lg.back')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              {(['MY', 'ID'] as const).map((c) => (
                <button key={c} type="button"
                  onClick={() => { setCountry(c); if (!phone || phone === '+60' || phone === '+62') setPhone(c === 'MY' ? '+60' : '+62') }}
                  className={clsx('flex-1 cursor-pointer rounded-xl border py-2.5 text-sm font-extrabold transition-colors duration-200',
                    country === c ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-ink')}>
                  {c === 'MY' ? '🇲🇾 Malaysia' : '🇮🇩 Indonesia'}
                </button>
              ))}
            </div>
            <input className={clsx(inp, 'mb-2')} style={inpStyle} placeholder={t('rg.name')}
              value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <input className={clsx(inp, 'mb-2')} style={inpStyle} type="tel" placeholder={t('rg.phone')}
              value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            <input className={clsx(inp, 'mb-2')} style={inpStyle} type="email" placeholder={t('lg.email')}
              value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            <div className="relative mb-2">
              <input className={clsx(inp, 'pr-12')} style={inpStyle} type={showPw ? 'text' : 'password'}
                placeholder={t('lg.password')} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-lg text-muted hover:text-ink">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
            <input className={clsx(inp, 'mb-2')} style={inpStyle} type={showPw ? 'text' : 'password'}
              placeholder={t('rg.pw2')} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            {err && (
              <p className="mb-2 rounded-lg border border-danger/50 bg-danger/10 p-2 text-xs font-semibold text-danger">{err}</p>
            )}
            <button type="button" onClick={submit} disabled={busy}
              className="mb-3 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? '…' : t('rg.submit')}
            </button>
            <p className="mb-3 text-center text-[11px] leading-relaxed text-muted">{t('rg.note')}</p>
            <Link to="/" className="mx-auto block w-fit cursor-pointer text-xs font-bold text-muted underline hover:text-accent">
              {t('lg.back')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
