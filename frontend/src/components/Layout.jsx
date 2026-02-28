import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isGuest } = useAuth()

  return (
    <div className="app-layout">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="main-content">
        {isGuest && (
          <div style={{
            background: 'linear-gradient(90deg, var(--accent), var(--accent-dark, var(--accent)))',
            color: 'white',
            textAlign: 'center',
            padding: '7px 16px',
            fontSize: '0.78rem',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}>
            Mode démo — Données fictives à titre illustratif.{' '}
            <a href="#/login" style={{ color: 'white', textDecoration: 'underline', fontWeight: 700 }}>
              Connectez-vous
            </a>{' '}
            pour accéder à vos vraies données.
          </div>
        )}
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="page-content animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
