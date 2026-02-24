import { useState } from 'react'
import { Sun, Moon, Download, Upload, LogOut, Key, Globe, User, Palette, Check, Cloud, ExternalLink, AlertCircle, CheckCircle, Brain } from 'lucide-react'
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
  const { user, logout, clientId, updateClientId, login } = useAuth()
  const { driveConnected, driveError, portfolio } = usePortfolio()
  const [binanceKey, setBinanceKey] = useState('')
  const [binanceSecret, setBinanceSecret] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [language, setLanguage] = useState('fr')
  const [saved, setSaved] = useState(false)
  const [editClientId, setEditClientId] = useState(clientId)
  const [clientIdSaved, setClientIdSaved] = useState(false)
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem(OPENAI_KEY_STORAGE) || '')
  const [openaiSaved, setOpenaiSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveClientId = () => {
    updateClientId(editClientId.trim())
    setClientIdSaved(true)
    setTimeout(() => setClientIdSaved(false), 2000)
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
      {/* Google Cloud Connection */}
      <Section title="Connexion Google Cloud" icon={Cloud}>
        <p className="text-sm text-muted mb-16">
          Connectez votre compte Google pour stocker vos données sur Google Drive.
          Aucune donnée ne transite par un serveur tiers.
        </p>

        <div className="gc-steps">
          <div className="gc-step">
            <div className="gc-step-number">1</div>
            <div className="gc-step-content">
              <div className="settings-label">Créer un projet Google Cloud</div>
              <div className="settings-hint">
                Rendez-vous sur la Google Cloud Console et créez un projet.
              </div>
              <a
                href="https://console.cloud.google.com/projectcreate"
                target="_blank"
                rel="noopener noreferrer"
                className="gc-link"
              >
                Ouvrir Google Cloud Console <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="gc-step">
            <div className="gc-step-number">2</div>
            <div className="gc-step-content">
              <div className="settings-label">Activer les APIs requises</div>
              <div className="settings-hint">
                Activez <strong>Google Drive API</strong> et <strong>Google Identity Services</strong> dans votre projet.
              </div>
              <a
                href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                target="_blank"
                rel="noopener noreferrer"
                className="gc-link"
              >
                Activer Google Drive API <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="gc-step">
            <div className="gc-step-number">3</div>
            <div className="gc-step-content">
              <div className="settings-label">Créer un OAuth Client ID</div>
              <div className="settings-hint">
                Allez dans <em>APIs & Services &gt; Credentials</em>, créez un <strong>OAuth 2.0 Client ID</strong> de type
                <strong> Application Web</strong>. Ajoutez comme origines JavaScript autorisées :
              </div>
              <div className="gc-origins">
                <code>https://cypriendlt-cmd.github.io</code>
                <code>http://localhost:3000</code>
              </div>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="gc-link"
              >
                Gérer les credentials <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="gc-step">
            <div className="gc-step-number">4</div>
            <div className="gc-step-content">
              <div className="settings-label">Configurer l'écran de consentement OAuth</div>
              <div className="settings-hint">
                Dans <em>OAuth consent screen</em>, configurez en mode <strong>External</strong>,
                ajoutez votre email comme utilisateur test.
              </div>
              <a
                href="https://console.cloud.google.com/apis/credentials/consent"
                target="_blank"
                rel="noopener noreferrer"
                className="gc-link"
              >
                Configurer le consentement <ExternalLink size={14} />
              </a>
            </div>
          </div>

          <div className="gc-step">
            <div className="gc-step-number">5</div>
            <div className="gc-step-content">
              <div className="settings-label">Coller votre Client ID ci-dessous</div>
              <div className="settings-hint">
                Copiez le Client ID depuis la page Credentials et collez-le ici.
              </div>
            </div>
          </div>
        </div>

        <div className="form-group mt-16">
          <label className="form-label">Google OAuth Client ID</label>
          <input
            className="form-input"
            type="text"
            placeholder="123456789-xxxxxx.apps.googleusercontent.com"
            value={editClientId}
            onChange={e => setEditClientId(e.target.value)}
          />
        </div>
        <div className="gc-actions">
          <button className="btn btn-primary" onClick={handleSaveClientId}>
            {clientIdSaved ? <><Check size={16} /> Sauvegardé</> : 'Sauvegarder le Client ID'}
          </button>
          {clientId && !user && (
            <button className="btn btn-secondary" onClick={login}>
              Se connecter avec Google
            </button>
          )}
        </div>

        {/* Status */}
        <div className="gc-status mt-16">
          <div className={`gc-status-item ${clientId ? 'gc-ok' : 'gc-warn'}`}>
            {clientId ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Client ID {clientId ? 'configuré' : 'non configuré'}</span>
          </div>
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
          <p className="text-muted text-sm">Non connecté — configurez Google Cloud ci-dessus pour commencer.</p>
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
