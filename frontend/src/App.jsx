import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useBeta } from './context/BetaContext'
import { usePriceRefreshManager } from './hooks/usePriceRefresh'
import Layout from './components/Layout'
import BetaLayout from './components/BetaLayout'
import Dashboard from './pages/Dashboard'
import Crypto from './pages/Crypto'
import PEA from './pages/PEA'
import Livrets from './pages/Livrets'
import Fundraising from './pages/Fundraising'
import Objectives from './pages/Objectives'
import Insights from './pages/Insights'
import DCA from './pages/DCA'
import Banking from './pages/Banking'
import Settings from './pages/Settings'
import Login from './pages/Login'
import InstallPrompt from './components/InstallPrompt'
import BetaDashboard from './pages/beta/BetaDashboard'
import BetaBudget from './pages/beta/BetaBudget'
import BetaSecurity from './pages/beta/BetaSecurity'
import BetaInvestments from './pages/beta/BetaInvestments'
import BetaFreedom from './pages/beta/BetaFreedom'
import BetaOnboarding from './pages/beta/BetaOnboarding'
import { BankProvider } from './context/BankContext'

/**
 * Inner component that lives inside PortfolioProvider so it can access the context.
 * Starts the global 60s price refresh loop.
 */
function PriceRefreshManager({ children }) {
  usePriceRefreshManager(60000)
  return children
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.5rem', fontWeight: 700 }}>P</div>
          <p>Chargement...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <PriceRefreshManager><BankProvider>{children}</BankProvider></PriceRefreshManager>
}

export default function App() {
  const { isBeta, hasCompletedOnboarding } = useBeta()

  return (
    <>
    <InstallPrompt />
    <Routes>
      <Route path="/login" element={<Login />} />
      {isBeta ? (
        <>
          <Route path="/settings" element={
            <BetaLayout><Settings /></BetaLayout>
          } />
          <Route path="/beta/*" element={
            <ProtectedRoute>
              <BetaLayout>
                <Routes>
                  {!hasCompletedOnboarding ? (
                    <Route path="*" element={<BetaOnboarding />} />
                  ) : (
                    <>
                      <Route path="/" element={<BetaDashboard />} />
                      <Route path="/budget" element={<BetaBudget />} />
                      <Route path="/security" element={<BetaSecurity />} />
                      <Route path="/investments" element={<BetaInvestments />} />
                      <Route path="/freedom" element={<BetaFreedom />} />
                      <Route path="*" element={<Navigate to="/beta" replace />} />
                    </>
                  )}
                </Routes>
              </BetaLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/beta" replace />} />
        </>
      ) : (
        <>
          <Route path="/settings" element={
            <Layout><Settings /></Layout>
          } />
          <Route path="/*" element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/crypto" element={<Crypto />} />
                  <Route path="/pea" element={<PEA />} />
                  <Route path="/livrets" element={<Livrets />} />
                  <Route path="/fundraising" element={<Fundraising />} />
                  <Route path="/objectives" element={<Objectives />} />
                  <Route path="/insights" element={<Insights />} />
                  <Route path="/banking" element={<Banking />} />
                  <Route path="/dca" element={<DCA />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } />
        </>
      )}
    </Routes>
    </>
  )
}
