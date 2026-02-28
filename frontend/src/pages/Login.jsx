import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

const THEME_META = {
  crimson: { label: 'Crimson', accent: '#dc2626' },
  rose: { label: 'Rosé', accent: '#e11d48' },
  burgundy: { label: 'Burgundy', accent: '#a21c2d' },
  ember: { label: 'Ember', accent: '#ea580c' },
}

export default function Login() {
  const { login, loginAsGuest, error, handleOAuthCallback } = useAuth()
  const { theme, darkMode, toggleDarkMode, changeTheme, THEMES } = useTheme()
  const navigate = useNavigate()

  // Handle the redirect callback from Google OAuth (token in URL hash)
  // Only trigger when the hash actually contains an OAuth token, not a HashRouter path
  useEffect(() => {
    if (!window.location.hash.includes('access_token')) return
    handleOAuthCallback().then(success => {
      if (success) navigate('/', { replace: true })
    })
  }, [handleOAuthCallback, navigate])

  return (
    <div className="login-page">
      <div className="login-bg" />

      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon" style={{ background: THEME_META[theme]?.accent }}>P</div>
          <h1 className="login-title">Portfolio Manager</h1>
          <p className="login-subtitle">Gérez votre patrimoine financier en un seul endroit</p>
        </div>

        <div className="login-features">
          {['Crypto, PEA, Livrets & Levées de fonds', 'Analyses IA en temps réel', 'Synchronisation Binance', 'Données stockées sur Google Drive'].map(f => (
            <div key={f} className="login-feature">
              <span className="login-feature-dot" style={{ background: THEME_META[theme]?.accent }} />
              {f}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: 'var(--danger)', color: 'white', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button className="login-google-btn" onClick={login}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continuer avec Google
        </button>

        <button
          className="login-google-btn"
          onClick={() => { loginAsGuest(); navigate('/', { replace: true }) }}
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', marginTop: 8 }}
        >
          Continuer sans connexion
        </button>

        <p className="login-note">
          Vos données sont stockées de façon sécurisée sur votre Google Drive personnel. Aucune donnée financière ne transite par nos serveurs.
        </p>

        <div className="login-themes">
          {THEMES.map(t => (
            <button key={t} onClick={() => changeTheme(t)} className={`login-theme-btn ${theme === t ? 'active' : ''}`} style={{ background: THEME_META[t]?.accent }} title={THEME_META[t]?.label} />
          ))}
          <button onClick={toggleDarkMode} className="login-theme-btn" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: 12 }} title={darkMode ? 'Mode clair' : 'Mode sombre'}>
            {darkMode ? '☀' : '🌙'}
          </button>
        </div>
      </div>
    </div>
  )
}
