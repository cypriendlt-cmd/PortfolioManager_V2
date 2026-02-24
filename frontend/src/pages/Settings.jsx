import { useState } from 'react'
import { Sun, Moon, Download, Upload, LogOut, Key, Globe, User, Palette, Check, AlertCircle, CheckCircle, Brain, ExternalLink, Server } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import './Settings.css'

const OPENAI_KEY_STORAGE = 'pm_openai_api_key'
const CORS_PROXY_KEY = 'pm_cors_proxy_url'

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
  const [corsProxy, setCorsProxy] = useState(() => localStorage.getItem(CORS_PROXY_KEY) || '')
  const [corsProxySaved, setCorsProxySaved] = useState(false)
  const [corsProxyTest, setCorsProxyTest] = useState(null) // null | 'testing' | 'ok' | 'error'

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

      {/* CORS Proxy for stock prices */}
      <Section title="Proxy CORS (prix bourse)" icon={Server}>
        <p className="text-sm text-muted mb-16">
          Pour récupérer les prix des actions/ETF (Yahoo Finance), un proxy CORS est nécessaire.
          Déployez un Cloudflare Worker gratuit (100k req/jour) avec le fichier <code>cors-proxy/worker.js</code> du repo.
        </p>
        <div className="gc-steps">
          <div className="gc-step">
            <div className="gc-step-number">1</div>
            <div className="gc-step-content">
              <div className="settings-label">Créer un Worker Cloudflare</div>
              <div className="settings-hint">Allez sur Cloudflare Dashboard → Workers & Pages → Create</div>
              <a href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer" className="gc-link">
                Ouvrir Cloudflare Dashboard <ExternalLink size={14} />
              </a>
            </div>
          </div>
          <div className="gc-step">
            <div className="gc-step-number">2</div>
            <div className="gc-step-content">
              <div className="settings-label">Copier le code du Worker</div>
              <div className="settings-hint">
                Collez le contenu de <code>cors-proxy/worker.js</code> dans l'éditeur et déployez.
              </div>
              <a href="https://github.com/cypriendlt-cmd/PortfolioManager_V2/blob/master/cors-proxy/worker.js" target="_blank" rel="noopener noreferrer" className="gc-link">
                Voir le code du Worker <ExternalLink size={14} />
              </a>
            </div>
          </div>
          <div className="gc-step">
            <div className="gc-step-number">3</div>
            <div className="gc-step-content">
              <div className="settings-label">Coller l'URL du Worker ci-dessous</div>
              <div className="settings-hint">
                Ex: <code>https://portfolio-cors-proxy.votre-compte.workers.dev</code>
              </div>
            </div>
          </div>
        </div>
        <div className="form-group mt-16">
          <label className="form-label">URL du proxy CORS</label>
          <input
            className="form-input"
            type="text"
            placeholder="https://portfolio-cors-proxy.xxx.workers.dev"
            value={corsProxy}
            onChange={e => setCorsProxy(e.target.value)}
          />
        </div>
        <div className="gc-actions">
          <button className="btn btn-primary" onClick={() => {
            const url = corsProxy.trim().replace(/\/$/, '')
            localStorage.setItem(CORS_PROXY_KEY, url)
            setCorsProxySaved(true)
            setTimeout(() => setCorsProxySaved(false), 2000)
          }}>
            {corsProxySaved ? <><Check size={16} /> Sauvegardé</> : 'Sauvegarder'}
          </button>
          <button className="btn btn-secondary" onClick={async () => {
            const url = corsProxy.trim().replace(/\/$/, '')
            if (!url) { setCorsProxyTest('error'); return }
            setCorsProxyTest('testing')
            try {
              const res = await fetch(`${url}?url=${encodeURIComponent('https://query2.finance.yahoo.com/v1/finance/search?q=FR0011871128&quotesCount=1&newsCount=0')}`, { signal: AbortSignal.timeout(10000) })
              const data = await res.json()
              setCorsProxyTest(data.quotes ? 'ok' : 'error')
            } catch {
              setCorsProxyTest('error')
            }
          }}>
            Tester la connexion
          </button>
        </div>
        <div className="gc-status mt-16">
          <div className={`gc-status-item ${corsProxy ? 'gc-ok' : 'gc-warn'}`}>
            {corsProxy ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Proxy {corsProxy ? 'configuré' : 'non configuré — les prix bourse ne seront pas disponibles'}</span>
          </div>
          {corsProxyTest === 'testing' && (
            <div className="gc-status-item gc-warn"><AlertCircle size={16} /><span>Test en cours...</span></div>
          )}
          {corsProxyTest === 'ok' && (
            <div className="gc-status-item gc-ok"><CheckCircle size={16} /><span>Proxy fonctionnel — Yahoo Finance accessible</span></div>
          )}
          {corsProxyTest === 'error' && (
            <div className="gc-status-item gc-error"><AlertCircle size={16} /><span>Echec du test — vérifiez l'URL du Worker</span></div>
          )}
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
