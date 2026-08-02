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
  logout: () => void
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
  }
}

async function fetchProfile(userId: string): Promise<User | null> {
  if (!supabase) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data ? profileToUser(data as ProfileRow) : null
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [locale, setLocale] = useState<Locale>('en')
  const [theme, setTheme] = useState<Theme>('dark')
  const [authReady, setAuthReady] = useState(!supabaseReady)

  const country: Country = user?.country ?? 'MY'

  // reflect theme + country accent onto <html>
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.country = country
  }, [theme, country])

  const login = useCallback((u: User) => {
    setUser(u)
    // country default language: MY → en, ID → id
    setLocale(u.country === 'ID' ? 'id' : 'en')
  }, [])

  // restore a real session on boot
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id
      if (uid) {
        const u = await fetchProfile(uid)
        if (u) login(u)
      }
      setAuthReady(true)
    })
  }, [login])

  const authLogin = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!supabase) return 'Live login not configured'
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return error.message
      const u = await fetchProfile(data.user.id)
      if (!u) {
        await supabase.auth.signOut()
        return 'Account exists but has no profile yet — ask admin.'
      }
      login(u)
      return null
    },
    [login],
  )

  const logout = useCallback(() => {
    supabase?.auth.signOut()
    setUser(null)
  }, [])
  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  const t = useCallback((key: string) => translate(locale, key), [locale])

  const value = useMemo(
    () => ({ user, locale, theme, country, authReady, login, authLogin, logout, setLocale, toggleTheme, t }),
    [user, locale, theme, country, authReady, login, authLogin, logout, setLocale, toggleTheme, t],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  return useContext(Ctx)
}

export { PERSONAS }
