import { useState } from 'react'
import { Sun, Moon, Download, Upload, LogOut, Key, Globe, User, Palette, Check, AlertCircle, CheckCircle, Brain, ExternalLink } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import './Settings.css'

const OPENAI_KEY_STORAGE = 'pm_openai_api_key'

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
  const { driveConnected, driveError, portfolio } = usePortfolio()
  const [binanceKey, setBinanceKey] = useState('')
  const [binanceSecret, setBinanceSecret] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [language, setLanguage] = useState('fr')
  const [saved, setSaved] = useState(false)
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem(OPENAI_KEY_STORAGE) || '')
  const [openaiSaved, setOpenaiSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleExport = () => {
    const data = JSON.stringify(portfolio, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
  }

  return (
    <div className="settings animate-fade-in">
      {/* Google Connection Status */}
      <Section title="Connexion Google" icon={User}>
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
          <p className="text-muted text-sm">Non connecté.</p>
        )}

        <div className="gc-status mt-16">
          <div className={`gc-status-item ${user ? 'gc-ok' : 'gc-warn'}`}>
            {user ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Compte Google {user ? `connecté (${user.email})` : 'non connecté'}</span>
          </div>
          <div className={`gc-status-item ${driveConnected ? 'gc-ok' : driveError ? 'gc-error' : 'gc-warn'}`}>
            {driveConnected ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Google Drive {driveConnected ? 'synchronisé' : driveError || 'en attente'}</span>
          </div>
        </div>
      </Section>

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

      {/* OpenAI API */}
      <Section title="IA — Clé OpenAI" icon={Brain}>
        <p className="text-sm text-muted mb-16">
          Ajoutez votre clé API OpenAI pour activer les analyses IA en temps réel sur la page Insights.
          Sans clé, des données de démonstration seront affichées.
        </p>
        <div className="form-group">
          <label className="form-label">Clé API OpenAI</label>
          <input
            className="form-input"
            type="password"
            placeholder="sk-..."
            value={openaiKey}
            onChange={e => setOpenaiKey(e.target.value)}
          />
        </div>
        <div className="gc-actions">
          <button className="btn btn-primary" onClick={() => {
            localStorage.setItem(OPENAI_KEY_STORAGE, openaiKey.trim())
            setOpenaiSaved(true)
            setTimeout(() => setOpenaiSaved(false), 2000)
          }}>
            {openaiSaved ? <><Check size={16} /> Sauvegardé</> : 'Sauvegarder la clé'}
          </button>
          {openaiKey && (
            <button className="btn btn-ghost" onClick={() => {
              setOpenaiKey('')
              localStorage.removeItem(OPENAI_KEY_STORAGE)
            }}>
              Supprimer la clé
            </button>
          )}
        </div>
        <div className="gc-status mt-16">
          <div className={`gc-status-item ${openaiKey ? 'gc-ok' : 'gc-warn'}`}>
            {openaiKey ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Clé OpenAI {openaiKey ? 'configurée' : 'non configurée — mode démo actif'}</span>
          </div>
        </div>
        <p className="text-xs text-muted mt-12">
          Votre clé est stockée localement dans votre navigateur. Elle n'est jamais envoyée à nos serveurs.
          <br />
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="gc-link" style={{ marginTop: 4 }}>
            Obtenir une clé API OpenAI <ExternalLink size={14} />
          </a>
        </p>
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
