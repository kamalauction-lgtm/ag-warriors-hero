import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './lib/store'
import Shell from './components/Shell'
import Login from './pages/Login'
import MyDay from './pages/MyDay'
import Sales from './pages/Sales'
import Income from './pages/Income'
import Career from './pages/Career'
import Leads from './pages/Leads'
import Team from './pages/Team'
import Elite from './pages/Elite'
import Poster from './pages/Poster'
import Grow from './pages/Grow'
import Admin from './pages/Admin'
import Onboarding from './pages/Onboarding'
import Challenge from './modules/challenge/Challenge'
import ReviewQueue from './modules/coach/ReviewQueue'

export default function App() {
  const { user } = useApp()

  if (!user) return <Login />
  // production M1 rule: nothing unlocks until onboarding is complete
  if (user.onboarded === false) return <Onboarding />

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
        <Route path="/challenge" element={<Challenge />} />
        <Route path="/coach" element={<ReviewQueue />} />
        <Route
          path="/admin"
          element={isAdmin ? <Admin /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}
