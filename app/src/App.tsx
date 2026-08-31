import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './lib/store'
import Join from './pages/Join'
import TestMe from './modules/talent/TestMe'
import Shell from './components/Shell'
import Login from './pages/Login'
import MyDay from './pages/MyDay'
import Sales from './pages/Sales'
import Income from './pages/Income'
import Career from './pages/Career'
import Leads from './pages/Leads'
import Team from './pages/Team'
import Komunikasi from './pages/Komunikasi'
import ProjectLibrary from './pages/ProjectLibrary'
import Elite from './pages/Elite'
import Poster from './pages/Poster'
import Grow from './pages/Grow'
import GrowOnboarding from './modules/onboarding/GrowOnboarding'
import Academy from './modules/academy/Academy'
import Social from './modules/social/Social'
import Atlas from './modules/atlas/Atlas'
import Admin from './pages/Admin'
import Onboarding from './pages/Onboarding'
import Challenge from './modules/challenge/Challenge'
import Pipeline from './modules/challenge/Pipeline'
import Journey from './modules/challenge/Journey'
import ReviewQueue from './modules/coach/ReviewQueue'
import Notifications from './pages/Notifications'
import Directory from './pages/Directory'
import TalentAdmin from './modules/talent/TalentAdmin'
import Myself from './modules/talent/Myself'
import ResetPassword from './pages/ResetPassword'
import Privacy from './pages/Privacy'
import Register from './pages/Register'
import EventPublic from './pages/EventPublic'
import { CertificateVerify, CertificateView } from './pages/CertificatePublic'

export default function App() {
  const { user, gateOn } = useApp()
  const { pathname } = useLocation()

  // public invitation acceptance (§21) — reachable with or without a session
  if (pathname.startsWith('/join/')) {
    return (
      <Routes>
        <Route path="/join/:code" element={<Join />} />
      </Routes>
    )
  }
  // Hero Talent Compass — public, event-code access, no login required
  // exact match only — /testme/admin is the facilitator screen and needs a session
  if (pathname === '/testme' || pathname === '/myself') {
    return (
      <Routes>
        <Route path="/testme" element={<TestMe />} />
        {/* public pre-programme link: same journey, no event code */}
        <Route path="/myself" element={<Myself />} />
      </Routes>
    )
  }
  // password recovery lands here from the email link — must work with the
  // temporary recovery session, before the normal app shell
  if (pathname === '/reset') {
    return (
      <Routes>
        <Route path="/reset" element={<ResetPassword />} />
      </Routes>
    )
  }
  // public privacy policy — required for the Play Store listing
  if (pathname === '/privacy') {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    )
  }
  // certificates (075): public verification + participant view — no login
  if (pathname.startsWith('/certificate')) {
    return (
      <Routes>
        <Route path="/certificate/verify/:token" element={<CertificateVerify />} />
        <Route path="/certificate/verify" element={<CertificateVerify />} />
        <Route path="/certificate/:access" element={<CertificateView />} />
      </Routes>
    )
  }
  // public event pages (070): /my/<slug> · /id/<slug> — no login, country in the URL
  if (/^\/(my|id)\/[a-z0-9-]+\/?$/.test(pathname)) {
    return (
      <Routes>
        <Route path="/:cc/:slug" element={<EventPublic />} />
      </Routes>
    )
  }
  // self-registration (068) — public; the account waits for admin approval
  if (pathname === '/register') {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
      </Routes>
    )
  }
  if (!user) return <Login />
  /* Production M1 rule: nothing unlocks until Global App Onboarding is complete.
     Staged rollout — the gate only applies while global_onboarding_gate is on.
     This is GLOBAL onboarding only: Grow onboarding and 30 Days readiness are
     separate journeys and are never gated here. */
  if (gateOn && user.onboarded === false) return <Onboarding />

  const isAdmin = user.role === 'master_admin' || user.role === 'country_admin'
  // Production gating: Tim Elit = elite members only (admins can monitor);
  // Win Poster = leadership tier (admin / leader / elite / rank above REN)
  const canElite = user.isElite || isAdmin
  const canPoster =
    isAdmin || user.role === 'leader' || user.isElite || user.careerRank !== 'REN'

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<MyDay />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/sales/income" element={<Income />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/team" element={<Team />} />
        <Route path="/komunikasi" element={<Komunikasi />} />
        <Route path="/library" element={<ProjectLibrary />} />
        <Route path="/team/career" element={<Career />} />
        <Route
          path="/team/elite"
          element={canElite ? <Elite /> : <Navigate to="/team" replace />}
        />
        <Route
          path="/team/poster"
          element={canPoster ? <Poster /> : <Navigate to="/team" replace />}
        />
        <Route path="/grow" element={<Grow />} />
        <Route path="/grow/onboarding" element={<GrowOnboarding />} />
        <Route path="/grow/academy" element={<Academy />} />
        <Route path="/grow/social" element={<Social />} />
        <Route path="/grow/atlas" element={<Atlas />} />
        <Route path="/challenge" element={<Challenge />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/journey" element={<Journey />} />
        <Route path="/coach" element={<ReviewQueue />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/directory" element={<Directory />} />
        <Route
          path="/admin"
          element={isAdmin ? <Admin /> : <Navigate to="/" replace />}
        />
        {/* §15 names /testme/admin; /admin/talent is the same screen reached from
            the admin console, so both paths resolve to one component. */}
        <Route
          path="/testme/admin"
          element={isAdmin ? <TalentAdmin /> : <Navigate to="/" replace />}
        />
        <Route
          path="/admin/talent"
          element={isAdmin ? <TalentAdmin /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
