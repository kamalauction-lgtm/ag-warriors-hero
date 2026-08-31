/* Sign-in — production only. The demo personas and the registration preview
   were removed for launch (Kamal, 2026-08-09): real accounts come from admin
   invitations, and a clean login page is what a real cohort should meet.
   Includes the forgot-password flow (recovery email lands on /reset) and an
   EN/BM/ID switcher — the platform rule says all three languages are always
   selectable, and that starts before sign-in. */
import { useState } from 'react'
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

export default function Login() {
  const { authLogin, t, locale, setLocale } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [sent, setSent] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const shield = useBrand('GLOBAL', 'shield')

  const doLogin = async () => {
    if (!email.trim() || !password) return
    setBusy(true)
    setErr('')
    const e = await authLogin(email.trim(), password)
    setBusy(false)
    if (e) setErr(e)
  }

  const sendReset = async () => {
    if (!supabase || !email.trim()) return
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`,
    })
    setBusy(false)
    // privacy-safe: never reveal whether the email exists
    if (error && !/rate/i.test(error.message)) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6 py-10">
      <div className="animate-rise">
        {/* language — selectable before sign-in, all three always */}
        <div className="mb-4 flex justify-center gap-1.5">
          {LOCALES.map((l) => (
            <button key={l.v} type="button" onClick={() => setLocale(l.v)}
              className={clsx('cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors duration-200',
                locale === l.v ? 'border-accent bg-accent text-on-accent' : 'border-border text-muted hover:text-ink')}>
              {l.label}
            </button>
          ))}
        </div>

        {/* Brand — hero splash */}
        <div className="hero-user mb-8 flex flex-col items-center px-6 pb-6 pt-7 text-center">
          <img
            src={shield ?? '/brand/ag-shield.png'}
            alt="AG shield"
            className="relative mb-3 h-20 w-20 object-contain drop-shadow-[0_6px_16px_rgba(212,172,74,0.35)]"
          />
          <h1 className="relative font-display text-2xl font-extrabold tracking-tight">
            IQI <span className="gold-text">AG Warriors</span>
          </h1>
          <p className="relative mt-1 text-xs tracking-wide text-[#c9c2a8]">
            Become Better · Build Better · Give Better
          </p>
        </div>

        {forgot ? (
          /* ---------- forgot password ---------- */
          sent ? (
            <div className="rounded-2xl border border-border bg-surface p-5 text-center">
              <p className="mb-1 text-sm font-bold">{t('lg.checkEmail')}</p>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">
                {t('lg.checkEmailBody').replace('{email}', email.trim())}
              </p>
              <button type="button" onClick={() => { setForgot(false); setSent(false) }}
                className="mt-4 cursor-pointer text-xs font-bold text-accent underline">
                {t('lg.back')}
              </button>
            </div>
          ) : (
            <>
              <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-muted">
                {t('lg.reset')}
              </label>
              <input
                id="email" type="email" placeholder={t('lg.resetEmailPh')} value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendReset()}
                className="mb-2 h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] outline-none transition-colors duration-200 focus:border-accent"
              />
              {err && (
                <p className="mb-2 rounded-lg border border-danger/50 bg-danger/10 p-2 text-xs font-semibold text-danger">{err}</p>
              )}
              <button
                type="button" onClick={sendReset} disabled={busy || !email.trim()}
                className="mb-3 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? t('lg.sending') : t('lg.sendReset')}
              </button>
              <button type="button" onClick={() => { setForgot(false); setErr('') }}
                className="mx-auto block cursor-pointer text-xs font-bold text-muted underline hover:text-ink">
                {t('lg.back')}
              </button>
            </>
          )
        ) : (
          /* ---------- sign in ---------- */
          <>
            <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-muted">
              {t('lg.signIn')}
            </label>
            <input
              id="email" type="email" placeholder={t('lg.email')} value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mb-2 h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] text-ink outline-none transition-colors duration-200 focus:border-accent"
              style={{ WebkitTextFillColor: 'var(--ink)', caretColor: 'var(--ink)' }}
            />
            <div className="relative mb-2">
              <input
                id="password" type={showPw ? 'text' : 'password'} placeholder={t('lg.password')} value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-border bg-surface px-4 pr-12 text-[15px] text-ink outline-none transition-colors duration-200 focus:border-accent"
                style={{ WebkitTextFillColor: 'var(--ink)', caretColor: 'var(--ink)' }}
              />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-lg text-muted hover:text-ink">
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
            {err && (
              <p className="mb-2 rounded-lg border border-danger/50 bg-danger/10 p-2 text-xs font-semibold text-danger">{err}</p>
            )}
            <button
              type="button" onClick={doLogin} disabled={busy || !email.trim() || !password}
              className="mb-3 h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? t('lg.signingIn') : t('lg.signIn')}
            </button>
            <button type="button" onClick={() => { setForgot(true); setErr('') }}
              className="mx-auto block cursor-pointer text-xs font-bold text-muted underline hover:text-accent">
              {t('lg.forgot')}
            </button>
            <a href="/register"
              className="mx-auto mt-5 block w-fit cursor-pointer rounded-xl border border-accent/50 px-5 py-2.5 text-center text-xs font-extrabold text-accent no-underline transition-colors hover:bg-accent-soft">
              ✨ {t('rg.cta')}
            </a>
          </>
        )}
      </div>
    </div>
  )
}
