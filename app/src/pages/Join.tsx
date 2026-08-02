/* Invitation acceptance (§21 public page) — /#/join/CODE
   Preview invite → create account → fn_accept_invitation builds the profile →
   reload into the app where the global onboarding gate takes over. */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Shield } from 'lucide-react'
import { supabase, supabaseReady } from '../lib/supabase'

interface Preview { name: string; country: string; cohort_name: string | null }

export default function Join() {
  const { code = '' } = useParams()
  const [inv, setInv] = useState<Preview | null | 'bad'>(null)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!supabaseReady || !supabase || !code) return
    supabase.rpc('fn_invite_preview', { p_code: code }).then(({ data, error }) => {
      if (error || !data?.length) setInv('bad')
      else setInv(data[0] as Preview)
    })
  }, [code])

  const accept = async () => {
    if (!supabase) return
    setBusy(true); setErr('')
    // create the account (or sign in if they already created one mid-flow)
    let { data: su, error } = await supabase.auth.signUp({ email, password: pw })
    if (error?.message.includes('already registered')) {
      const si = await supabase.auth.signInWithPassword({ email, password: pw })
      su = si.data as typeof su; error = si.error
    }
    if (error || !su?.session) {
      setBusy(false)
      setErr(error?.message ?? 'Account created — please confirm your email, then open this link again.')
      return
    }
    const { error: e2 } = await supabase.rpc('fn_accept_invitation', { p_code: code })
    setBusy(false)
    if (e2) { setErr(e2.message); return }
    window.location.hash = '#/'
    window.location.reload()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Shield size={40} className="mx-auto mb-2 text-accent" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight">IQI AG <span className="gold-text">Hero</span></h1>
          <p className="text-xs text-muted">Become Better · Build Better · Give Better</p>
        </div>

        {inv === null && <p className="text-center text-sm text-muted">Checking your invitation…</p>}
        {inv === 'bad' && (
          <div className="rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="text-sm font-bold">Invitation not found</p>
            <p className="mt-1 text-xs text-muted">This link has been used, revoked, or mistyped. Ask your leader for a new one.</p>
          </div>
        )}
        {inv !== null && inv !== 'bad' && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="mb-1 text-center text-sm">
              {inv.country === 'ID' ? '🇮🇩' : '🇲🇾'} Welcome, <b>{inv.name}</b>!
            </p>
            <p className="mb-4 text-center text-xs text-muted">
              You are invited to join{inv.cohort_name ? ` — ${inv.cohort_name}` : ' IQI AG Hero'}.
              Create your account to begin.
            </p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email"
              className="mb-2 h-12 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Choose a password (min 6)"
              className="mb-3 h-12 w-full rounded-xl border border-border bg-surface2 px-3 text-sm outline-none focus:border-accent" />
            {err && <p className="mb-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">⚠ {err}</p>}
            <button type="button" disabled={busy || !email || pw.length < 6} onClick={accept}
              className="h-12 w-full cursor-pointer rounded-xl bg-accent text-sm font-extrabold text-on-accent disabled:opacity-40">
              {busy ? 'Creating your account…' : 'Accept invitation & join'}
            </button>
            <p className="mt-3 text-center text-[10px] text-muted">
              After joining you will complete Warrior onboarding, then enrol in the 30 Days Closing Challenge.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
