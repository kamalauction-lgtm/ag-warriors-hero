/* Global app context: current user, country, locale, theme.
   Real Supabase auth when configured (supabaseReady); personas remain as
   demo-preview fallback. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Country, Locale, Theme, User } from './types'
import { PERSONAS } from './mockData'
import { translate } from './i18n'
import { supabase, supabaseReady } from './supabase'

interface AppState {
  user: User | null
  locale: Locale
  theme: Theme
  country: Country
  authReady: boolean
  login: (u: User) => void
  authLogin: (email: string, password: string) => Promise<string | null>
  completeOnboarding: () => void
  approveDemo: () => void
  logout: () => void
  gateOn: boolean
  setLocale: (l: Locale) => void
  toggleTheme: () => void
  t: (key: string) => string
}

const Ctx = createContext<AppState>(null as unknown as AppState)

/* DB profiles row → app User */
interface ProfileRow {
  id: string; name: string; phone: string; email: string | null
  country: Country; role: User['role']; career_rank: User['careerRank']
  is_elite: boolean; is_commander: boolean; leader_id: string | null; language: string
  status: string; onboarded: boolean
}
function profileToUser(p: ProfileRow): User {
  const first = p.name.split(' ')[0]
  return {
    id: p.id,
    name: p.name,
    phone: p.phone,
    email: p.email ?? '',
    country: p.country,
    role: p.role,
    careerRank: p.career_rank,
    isElite: p.is_elite || p.is_commander,
    captainName: p.is_commander ? `Commander ${first}` : p.is_elite ? `Captain ${first}` : undefined,
    leaderId: p.leader_id,
    avatarColor:
      p.role === 'master_admin' ? '#e0a52f'
      : p.role === 'country_admin' ? '#8b5cf6'
      : p.role === 'leader' ? '#3b82f6'
      : '#10b981',
    points: 0,
    level: 1,
    levelName: 'Warrior',
    /* THE FIX. profiles.onboarded was never mapped, so user.onboarded was always
       undefined and App.tsx's `=== false` gate could never fire. The column was
       correct all along — only this line was missing. GLOBAL APP ONBOARDING only:
       Grow onboarding and 30 Days readiness are separate and stay separate. */
    onboarded: p.onboarded,
  }
}

async function fetchProfile(userId: string): Promise<{ user: User; language: string | null; status: string } | null> {
  if (!supabase) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (!data) return null
  const row = data as ProfileRow
  return { user: profileToUser(row), language: row.language ?? null, status: row.status ?? 'active' }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [locale, setLocale] = useState<Locale>('en')
  /* Staged rollout: the Global App Onboarding gate only bites when the
     global_onboarding_gate flag is on. Default false until proven. */
  const [gateOn, setGateOn] = useState(false)
  const [theme, setTheme] = useState<Theme>('dark')
  const [authReady, setAuthReady] = useState(!supabaseReady)

  const country: Country = user?.country ?? 'MY'

  // reflect theme + country accent onto <html>
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.country = country
  }, [theme, country])

  /* LOCKED PLATFORM RULE (2026-08-07): country first, language second.
     MY -> BM default (EN optional switch) · ID -> Bahasa Indonesia default
     (EN optional switch). A saved preference on the profile wins, but only if
     it is allowed for that country. */
  // Language rule (Kamal, 2026-08-11): MY = EN/BM with EN default;
  // ID = ID/EN with ID default. A saved preference outside the country's
  // pair falls back to that country's default.
  const allowedLocale = (c: Country, l: string | null | undefined): Locale | null => {
    if (c === 'MY') return l === 'bm' || l === 'en' ? l : null
    return l === 'id' || l === 'en' ? l : null
  }
  const login = useCallback((u: User, savedLang?: string | null) => {
    setUser(u)
    setLocale(allowedLocale(u.country, savedLang) ?? (u.country === 'ID' ? 'id' : 'en'))
  }, [])

  /* language switch: preserve country, remember the preference on the profile */
  const setLocalePersist = useCallback((l: Locale) => {
    setLocale(l)
    if (supabase && user && user.id.includes('-'))
      supabase.from('profiles').update({ language: l }).eq('id', user.id).then(() => {})
  }, [user])

  // restore a real session on boot
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id
      if (uid) {
        const p = await fetchProfile(uid)
        // approval gate: a pending/rejected account never enters the app
        if (p && p.status === 'active') login(p.user, p.language)
        else if (p) await supabase!.auth.signOut()
      }
      setAuthReady(true)
    })
    // belt-and-braces: if a recovery link ever lands anywhere else, route the
    // user to the reset form the moment the recovery session is detected
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset') {
        window.location.assign('/reset')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [login])

  const authLogin = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!supabase) return 'Live login not configured'
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return error.message
      let p = await fetchProfile(data.user.id)
      if (!p) {
        // self-registered user whose profile was not created yet (e.g. email
        // confirmation happened after /register) — build it from the signup
        // metadata, landing them in the pending queue
        const md = data.user.user_metadata as { name?: string; phone?: string; country?: string }
        if (md?.name && md?.phone) {
          await supabase.rpc('register_profile', {
            p_name: md.name, p_phone: md.phone, p_country: md.country === 'ID' ? 'ID' : 'MY',
          })
          p = await fetchProfile(data.user.id)
        }
      }
      if (!p) {
        await supabase.auth.signOut()
        return 'Account exists but has no profile yet — ask admin.'
      }
      if (p.status !== 'active') {
        await supabase.auth.signOut()
        return p.status === 'pending'
          ? '⏳ Registered — waiting for admin approval. / Menunggu kelulusan admin. / Menunggu persetujuan admin.'
          : 'This account is not active — contact your admin.'
      }
      login(p.user, p.language)
      return null
    },
    [login],
  )

  const logout = useCallback(() => {
    supabase?.auth.signOut()
    setUser(null)
  }, [])
  /* onboarding gate helpers — live build: update profiles.onboarded + notify leader */
  const completeOnboarding = useCallback(() => {
    setUser((u) => (u ? { ...u, onboarded: true } : u))
    // audited server-side RPC rather than a raw table write
    if (supabase && user?.id && !user.id.startsWith('demo_'))
      supabase.rpc('fn_complete_onboarding').then(() => {})
  }, [user?.id])
  const approveDemo = useCallback(
    () => setUser((u) => (u ? { ...u, pendingApproval: false } : u)),
    [],
  )
  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  useEffect(() => {
    if (!supabase || !user || !user.id.includes('-')) { setGateOn(false); return }
    supabase.rpc('fn_app_flags').then(({ data }) => {
      setGateOn(Boolean((data as Record<string, boolean> | null)?.global_onboarding_gate))
    })
  }, [user])

  const t = useCallback((key: string) => translate(locale, key), [locale])

  const value = useMemo(
    () => ({ user, locale, theme, country, authReady, gateOn, login, authLogin, completeOnboarding, approveDemo, logout, setLocale: setLocalePersist, toggleTheme, t }),
    [user, locale, theme, country, authReady, gateOn, login, authLogin, completeOnboarding, approveDemo, logout, setLocalePersist, toggleTheme, t],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  return useContext(Ctx)
}

export { PERSONAS }
