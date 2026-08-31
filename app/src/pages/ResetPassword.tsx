/* /reset — where the password-recovery email lands.
   Supabase JS parses the recovery tokens from the URL automatically and opens
   a temporary session; we wait for it, take a new password twice, update, and
   send the user in. An expired or reused link never gets a session, so the
   page degrades to "request a new link". */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/store'
import { useBrand } from '../lib/brand'

export default function ResetPassword() {
  const nav = useNavigate()
  const { locale } = useApp()
  const L = useCallback((en: string, bm: string, id: string) =>
    locale === 'bm' ? bm : locale === 'id' ? id : en, [locale])
  const shield = useBrand('GLOBAL', 'shield')
  const [ready, setReady] = useState<boolean | null>(null)   // null = still checking
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  /* the recovery hash is processed asynchronously on load — listen AND poll */
  useEffect(() => {
    if (!supabase) { setReady(false); return }
    let alive = true
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) setReady(true)
    })
    const giveUp = window.setTimeout(() => { if (alive) setReady((r) => r ?? false) }, 4000)
    return () => { alive = false; sub.subscription.unsubscribe(); window.clearTimeout(giveUp) }
  }, [])

  const save = async () => {
    if (!supabase) return
    if (pw1.length < 8) {
      setErr(L('Password needs at least 8 characters', 'Kata laluan perlu sekurang-kurangnya 8 aksara', 'Kata sandi minimal 8 karakter'))
      return
    }
    if (pw1 !== pw2) {
      setErr(L('Passwords do not match', 'Kata laluan tidak sepadan', 'Kata sandi tidak cocok'))
      return
    }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDone(true)
    window.setTimeout(() => { nav('/'); window.location.reload() }, 1800)
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6 py-10">
      <div className="animate-rise">
        <div className="hero-user mb-8 flex flex-col items-center px-6 pb-6 pt-7 text-center">
          <img src={shield ?? '/brand/ag-shield.png'} alt="AG shield"
            className="relative mb-3 h-16 w-16 object-contain" />
          <h1 className="relative font-display text-xl font-extrabold tracking-tight">
            <span className="gold-text">{L('Reset password', 'Tetapkan semula kata laluan', 'Atur ulang kata sandi')}</span>
          </h1>
        </div>

        {ready === null && (
          <p className="text-center text-sm text-muted">{L('Checking your reset link…', 'Menyemak pautan reset anda…', 'Memeriksa tautan reset kamu…')}</p>
        )}

        {ready === false && (
          <div className="rounded-2xl border border-border bg-surface p-5 text-center">
            <p className="mb-1 text-sm font-bold">{L('This link is invalid or has expired', 'Pautan ini tidak sah atau telah tamat tempoh', 'Tautan ini tidak valid atau sudah kedaluwarsa')}</p>
            <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">
              {L('Reset links work once and expire quickly. Request a new one from the sign-in page.',
                 'Pautan reset hanya berfungsi sekali dan cepat tamat tempoh. Minta yang baharu di halaman log masuk.',
                 'Tautan reset hanya berlaku sekali dan cepat kedaluwarsa. Minta yang baru di halaman masuk.')}
            </p>
            <button type="button" onClick={() => nav('/')}
              className="mt-4 h-11 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent">
              {L('Back to sign in', 'Kembali ke log masuk', 'Kembali ke halaman masuk')}
            </button>
          </div>
        )}

        {ready === true && !done && (
          <>
            <label htmlFor="pw1" className="mb-1.5 block text-xs font-semibold text-muted">
              {L('New password', 'Kata laluan baharu', 'Kata sandi baru')}
            </label>
            <input id="pw1" type="password" placeholder={L('At least 8 characters', 'Sekurang-kurangnya 8 aksara', 'Minimal 8 karakter')} value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              className="mb-2 h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] outline-none focus:border-accent" />
            <input id="pw2" type="password" placeholder={L('Repeat new password', 'Ulang kata laluan baharu', 'Ulangi kata sandi baru')} value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="mb-2 h-12 w-full rounded-xl border border-border bg-surface px-4 text-[15px] outline-none focus:border-accent" />
            {err && (
              <p className="mb-2 rounded-lg border border-danger/50 bg-danger/10 p-2 text-xs font-semibold text-danger">{err}</p>
            )}
            <button type="button" onClick={save} disabled={busy || !pw1 || !pw2}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:cursor-not-allowed disabled:opacity-40">
              <KeyRound size={15} /> {busy
                ? L('Saving…', 'Menyimpan…', 'Menyimpan…')
                : L('Set new password', 'Tetapkan kata laluan baharu', 'Atur kata sandi baru')}
            </button>
          </>
        )}

        {done && (
          <p className="rounded-2xl border border-success/40 bg-success/10 p-5 text-center text-sm font-bold text-success">
            {L('✅ Password updated — taking you in…', '✅ Kata laluan dikemas kini — membawa anda masuk…', '✅ Kata sandi diperbarui — membawamu masuk…')}
          </p>
        )}
      </div>
    </div>
  )
}
