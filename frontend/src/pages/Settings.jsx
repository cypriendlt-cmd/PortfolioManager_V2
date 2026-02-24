import { useState } from 'react'
import { Sun, Moon, Download, Upload, LogOut, Key, Globe, Euro, User, Palette, Check } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import './Settings.css'

const THEME_META = {
  ocean: { label: 'Océan', colors: ['#0a1628', '#3b82f6', '#f0f4f8'] },
  sunset: { label: 'Coucher de soleil', colors: ['#1a0f00', '#f59e0b', '#fef7ed'] },
  forest: { label: 'Forêt', colors: ['#0a1a0f', '#10b981', '#f0faf4'] },
  lavender: { label: 'Lavande', colors: ['#1a0f28', '#8b5cf6', '#f5f0ff'] },
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="settings-section card">
      <div className="settings-section-header">
        <Icon size={18} style={{ color: 'var(--accent)' }} />
        <h3>{title}</h3>
      </div>
      <div className="divider" />
      {children}
    </div>
  )
}

export default function Settings() {
  const { theme, darkMode, toggleDarkMode, changeTheme, THEMES } = useTheme()
  const { user, logout } = useAuth()
  const [binanceKey, setBinanceKey] = useState('')
  const [binanceSecret, setBinanceSecret] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [language, setLanguage] = useState('fr')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleExport = () => {
    const data = JSON.stringify({ exportDate: new Date().toISOString() })
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
  }

  return (
    <div className="settings animate-fade-in">
      {/* Theme */}
      <Section title="Apparence" icon={Palette}>
        <div className="settings-row">
          <div>
            <div className="settings-label">Thème de couleur</div>
            <div className="settings-hint">Choisissez votre palette de couleurs préférée</div>
          </div>
        </div>
        <div className="theme-grid">
          {THEMES.map(t => {
            const meta = THEME_META[t]
            return (
              <button key={t} className={`theme-swatch ${theme === t ? 'theme-swatch--active' : ''}`} onClick={() => changeTheme(t)}>
                <div className="theme-colors">
                  {meta.colors.map((c, i) => (
                    <div key={i} style={{ background: c, flex: 1, height: '100%' }} />
                  ))}
                </div>
                <span className="theme-label">{meta.label}</span>
                {theme === t && <div className="theme-check"><Check size={12} /></div>}
              </button>
            )
          })}
        </div>

        <div className="settings-row mt-24">
          <div>
            <div className="settings-label">Mode sombre</div>
            <div className="settings-hint">Basculer entre mode clair et sombre</div>
          </div>
          <button className="settings-toggle" onClick={toggleDarkMode}>
            <div className={`settings-toggle-ball ${darkMode ? 'settings-toggle-ball--on' : ''}`} />
            {darkMode ? <Moon size={14} /> : <Sun size={14} />}
          </button>
        </div>
      </Section>

      {/* Preferences */}
      <Section title="Préférences" icon={Globe}>
        <div className="settings-row">
          <div>
            <div className="settings-label">Langue</div>
            <div className="settings-hint">Langue de l'interface</div>
          </div>
          <select className="form-select" style={{ width: 'auto' }} value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Devise</div>
            <div className="settings-hint">Devise d'affichage par défaut</div>
          </div>
          <select className="form-select" style={{ width: 'auto' }} value={currency} onChange={e => setCurrency(e.target.value)}>
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
          </select>
        </div>
      </Section>

      {/* Binance API */}
      <Section title="Binance API" icon={Key}>
        <p className="text-sm text-muted mb-16">Connectez votre compte Binance pour synchroniser automatiquement vos cryptomonnaies.</p>
        <div className="form-group">
          <label className="form-label">Clé API</label>
          <input className="form-input" type="password" placeholder="Entrez votre clé API Binance" value={binanceKey} onChange={e => setBinanceKey(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Clé secrète</label>
          <input className="form-input" type="password" placeholder="Entrez votre clé secrète Binance" value={binanceSecret} onChange={e => setBinanceSecret(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? <><Check size={16} /> Sauvegardé</> : 'Sauvegarder les clés'}
        </button>
      </Section>

      {/* Account */}
      <Section title="Compte" icon={User}>
        {user ? (
          <div className="settings-account">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} style={{ width: 56, height: 56, borderRadius: '50%' }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700 }}>
                {(user.name || 'U')[0]}
              </div>
            )}
            <div>
              <div className="font-semibold">{user.name}</div>
              <div className="text-sm text-muted">{user.email}</div>
              <div className="text-xs text-muted mt-4">Connecté via Google OAuth</div>
            </div>
          </div>
        ) : (
          <p className="text-muted text-sm">Mode démonstration — non connecté</p>
        )}
      </Section>

      {/* Data */}
      <Section title="Données" icon={Download}>
        <div className="settings-data-btns">
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={16} /> Exporter les données
          </button>
          <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
            <Upload size={16} /> Importer des données
            <input type="file" accept=".json" style={{ display: 'none' }} />
          </label>
        </div>
        <p className="text-xs text-muted mt-12">Les données sont stockées sur votre Google Drive personnel.</p>
      </Section>

      {/* Logout */}
      {user && (
        <div className="settings-logout">
          <button className="btn btn-danger" onClick={logout}>
            <LogOut size={16} /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
