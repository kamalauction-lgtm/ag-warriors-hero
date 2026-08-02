/* Global app context: current user, country, locale, theme.
   In production this becomes Supabase auth + profile; for the design preview
   it is an in-memory store with persona switching. */
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

interface AppState {
  user: User | null
  locale: Locale
  theme: Theme
  country: Country
  login: (u: User) => void
  logout: () => void
  setLocale: (l: Locale) => void
  toggleTheme: () => void
  t: (key: string) => string
}

const Ctx = createContext<AppState>(null as unknown as AppState)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [locale, setLocale] = useState<Locale>('en')
  const [theme, setTheme] = useState<Theme>('dark')

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

  const logout = useCallback(() => setUser(null), [])
  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  const t = useCallback((key: string) => translate(locale, key), [locale])

  const value = useMemo(
    () => ({ user, locale, theme, country, login, logout, setLocale, toggleTheme, t }),
    [user, locale, theme, country, login, logout, toggleTheme, t],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  return useContext(Ctx)
}

export { PERSONAS }
