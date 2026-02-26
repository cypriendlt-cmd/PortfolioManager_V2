import { useState } from 'react'
import { Sun, Moon, Download, Upload, LogOut, Key, Globe, User, Palette, Check, AlertCircle, CheckCircle, Brain, ExternalLink, Server, Bell, BellOff, Send, MessageSquare, Bug, Lightbulb, HelpCircle, Loader2, Trash2, Info } from 'lucide-react'
import packageJson from '../../package.json'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { usePortfolio } from '../context/PortfolioContext'
import {
  isNotificationSupported, getNotificationPermission,
  requestPermission, testNotification
} from '../services/pushNotifications'
import { sendBugReport } from '../services/emailService'
import './Settings.css'

const GROQ_KEY_STORAGE = 'pm_groq_api_key'
const TOGETHER_KEY_STORAGE = 'pm_together_api_key'
const HF_KEY_STORAGE = 'pm_hf_api_key'
const CORS_PROXY_KEY = 'pm_cors_proxy_url'

const THEME_META = {
  crimson: { label: 'Crimson', colors: ['#0f0a0a', '#dc2626', '#faf5f5'] },
  rose: { label: 'Rosé', colors: ['#120a0e', '#e11d48', '#fdf2f8'] },
  burgundy: { label: 'Burgundy', colors: ['#0d0808', '#a21c2d', '#faf6f6'] },
  ember: { label: 'Ember', colors: ['#0f0a05', '#ea580c', '#fff7ed'] },
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
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem(GROQ_KEY_STORAGE) || '')
  const [togetherKey, setTogetherKey] = useState(() => localStorage.getItem(TOGETHER_KEY_STORAGE) || '')
  const [hfKey, setHfKey] = useState(() => localStorage.getItem(HF_KEY_STORAGE) || '')
  const [aiSaved, setAiSaved] = useState(false)
  const [corsProxy, setCorsProxy] = useState(() => localStorage.getItem(CORS_PROXY_KEY) || '')
  const [corsProxySaved, setCorsProxySaved] = useState(false)
  const [corsProxyTest, setCorsProxyTest] = useState(null) // null | 'testing' | 'ok' | 'error'
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission())
  const notifSupported = isNotificationSupported()

  const [cacheCleared, setCacheCleared] = useState(false)

  const handleClearCache = async () => {
    try {
      // Clear SW caches
      if ('caches' in window) {
        const names = await caches.keys()
        await Promise.all(names.map(name => caches.delete(name)))
      }
      // Unregister SW so it re-installs fresh
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map(r => r.unregister()))
      }
      // Clear all localStorage (auth tokens, API keys, cached data)
      localStorage.clear()
      // Clear sessionStorage
      sessionStorage.clear()
      // Clear cookies
      document.cookie.split(';').forEach(c => {
        document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'
      })
      // Revoke Google token if gapi loaded
      try {
        const token = window.gapi?.client?.getToken()
        if (token) window.google?.accounts?.oauth2?.revoke(token.access_token)
      } catch {}
      // Force full reload (bypass cache)
      window.location.reload()
    } catch (e) {
      console.error('Cache clear error:', e)
      window.location.reload()
    }
  }

  // Bug report form
  const [reportType, setReportType] = useState('bug')
  const [reportSubject, setReportSubject] = useState('')
  const [reportDesc, setReportDesc] = useState('')
  const [reportEmail, setReportEmail] = useState('')
  const [reportHoneypot, setReportHoneypot] = useState('')
  const [reportStatus, setReportStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [reportError, setReportError] = useState('')

  const handleSendReport = async (e) => {
    e.preventDefault()
    setReportStatus('loading')
    setReportError('')
    const result = await sendBugReport({
      type: reportType,
      subject: reportSubject,
      description: reportDesc,
      userEmail: reportEmail,
      honeypot: reportHoneypot,
    })
    if (result.success) {
      setReportStatus('success')
      setReportSubject('')
      setReportDesc('')
      setReportEmail('')
      setReportType('bug')
      setTimeout(() => setReportStatus(null), 4000)
    } else {
      setReportStatus('error')
      setReportError(result.error || 'Erreur inconnue.')
    }
  }

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

      {/* AI Providers */}
      <Section title="IA — Fournisseurs" icon={Brain}>
        <p className="text-sm text-muted mb-16">
          Configurez au moins une cle API pour activer les analyses IA sur la page Insights.
          Les fournisseurs sont testes dans l'ordre : Groq, Together AI, Hugging Face.
        </p>
        <div className="form-group">
          <label className="form-label">Cle API Groq (recommande)</label>
          <input
            className="form-input"
            type="password"
            placeholder="gsk_..."
            value={groqKey}
            onChange={e => setGroqKey(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Cle API Together AI</label>
          <input
            className="form-input"
            type="password"
            placeholder="..."
            value={togetherKey}
            onChange={e => setTogetherKey(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Cle API Hugging Face</label>
          <input
            className="form-input"
            type="password"
            placeholder="hf_..."
            value={hfKey}
            onChange={e => setHfKey(e.target.value)}
          />
        </div>
        <div className="gc-actions">
          <button className="btn btn-primary" onClick={() => {
            localStorage.setItem(GROQ_KEY_STORAGE, groqKey.trim())
            localStorage.setItem(TOGETHER_KEY_STORAGE, togetherKey.trim())
            localStorage.setItem(HF_KEY_STORAGE, hfKey.trim())
            setAiSaved(true)
            setTimeout(() => setAiSaved(false), 2000)
          }}>
            {aiSaved ? <><Check size={16} /> Sauvegarde</> : 'Sauvegarder les cles'}
          </button>
        </div>
        <div className="gc-status mt-16">
          <div className={`gc-status-item ${groqKey ? 'gc-ok' : 'gc-warn'}`}>
            {groqKey ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Groq {groqKey ? 'configure' : 'non configure'}</span>
          </div>
          <div className={`gc-status-item ${togetherKey ? 'gc-ok' : 'gc-warn'}`}>
            {togetherKey ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Together AI {togetherKey ? 'configure' : 'non configure'}</span>
          </div>
          <div className={`gc-status-item ${hfKey ? 'gc-ok' : 'gc-warn'}`}>
            {hfKey ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>Hugging Face {hfKey ? 'configure' : 'non configure'}</span>
          </div>
        </div>
        <p className="text-xs text-muted mt-12">
          Vos cles sont stockees localement dans votre navigateur.
        </p>
      </Section>

      {/* Notifications */}
      <Section title="Notifications" icon={Bell}>
        {notifSupported ? (
          <>
            <div className="gc-status">
              <div className={`gc-status-item ${notifPermission === 'granted' ? 'gc-ok' : notifPermission === 'denied' ? 'gc-error' : 'gc-warn'}`}>
                {notifPermission === 'granted' ? <CheckCircle size={16} /> : notifPermission === 'denied' ? <BellOff size={16} /> : <AlertCircle size={16} />}
                <span>
                  {notifPermission === 'granted' && 'Notifications activées'}
                  {notifPermission === 'denied' && 'Notifications bloquées — modifiez les paramètres de votre navigateur'}
                  {notifPermission === 'default' && 'Notifications non configurées'}
                </span>
              </div>
            </div>
            <div className="gc-actions mt-16">
              {notifPermission !== 'granted' && notifPermission !== 'denied' && (
                <button className="btn btn-primary" onClick={async () => {
                  const result = await requestPermission()
                  setNotifPermission(result)
                }}>
                  <Bell size={16} /> Autoriser les notifications
                </button>
              )}
              <button className="btn btn-secondary" onClick={async () => {
                if (notifPermission !== 'granted') {
                  const result = await requestPermission()
                  setNotifPermission(result)
                  if (result !== 'granted') return
                }
                await testNotification()
              }}>
                <Send size={16} /> Tester
              </button>
            </div>
            <p className="text-xs text-muted mt-12">
              Les notifications sont utilisées pour les rappels DCA. Aucun serveur tiers requis.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Votre navigateur ne supporte pas les notifications.</p>
        )}
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
          <button className="btn btn-ghost" onClick={handleClearCache} style={{ color: 'var(--danger)' }}>
            {cacheCleared ? <><Check size={16} /> Cache vidé</> : <><Trash2 size={16} /> Vider le cache</>}
          </button>
        </div>
        <p className="text-xs text-muted mt-12">Les données sont stockées sur votre Google Drive personnel.</p>
      </Section>

      {/* Version */}
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <span className="text-xs text-muted">
          <Info size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          PortfolioManager v{packageJson.version}
        </span>
      </div>

      {/* Report Bug / FAQ */}
      <Section title="Signaler un bug / FAQ" icon={MessageSquare}>
        <p className="text-sm text-muted mb-16">
          Un problème, une idée d'amélioration ou une question ? Envoyez-nous un message.
        </p>

        <form onSubmit={handleSendReport}>
          {/* Honeypot — invisible to users */}
          <input
            type="text"
            name="website"
            value={reportHoneypot}
            onChange={e => setReportHoneypot(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
            tabIndex={-1}
            autoComplete="off"
          />

          {/* Type toggle */}
          <div className="form-group mb-16">
            <label className="form-label">Type de message</label>
            <div className="report-type-toggle">
              {[
                { key: 'bug', label: 'Bug', icon: Bug },
                { key: 'suggestion', label: 'Suggestion', icon: Lightbulb },
                { key: 'question', label: 'Question', icon: HelpCircle },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={reportType === key ? 'active' : ''}
                  onClick={() => setReportType(key)}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Sujet *</label>
            <input
              className="form-input"
              type="text"
              placeholder="Résumez votre message en quelques mots"
              value={reportSubject}
              onChange={e => setReportSubject(e.target.value)}
              required
              disabled={reportStatus === 'loading'}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description *</label>
            <textarea
              className="form-input"
              rows={5}
              placeholder="Décrivez le problème, la suggestion ou votre question en détail..."
              value={reportDesc}
              onChange={e => setReportDesc(e.target.value)}
              required
              disabled={reportStatus === 'loading'}
              style={{ resize: 'vertical', minHeight: 100 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email de contact (optionnel)</label>
            <input
              className="form-input"
              type="email"
              placeholder="votre@email.com"
              value={reportEmail}
              onChange={e => setReportEmail(e.target.value)}
              disabled={reportStatus === 'loading'}
            />
            <span className="text-xs text-muted" style={{ marginTop: 4 }}>
              Pour que nous puissions vous répondre si nécessaire.
            </span>
          </div>

          <div className="gc-actions">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={reportStatus === 'loading' || !reportSubject.trim() || !reportDesc.trim()}
            >
              {reportStatus === 'loading' ? (
                <><Loader2 size={16} className="animate-pulse" /> Envoi en cours...</>
              ) : (
                <><Send size={16} /> Envoyer</>
              )}
            </button>
          </div>
        </form>

        {/* Feedback */}
        {reportStatus === 'success' && (
          <div className="gc-status mt-16">
            <div className="gc-status-item gc-ok">
              <CheckCircle size={16} />
              <span>Message envoyé avec succès ! Merci pour votre retour.</span>
            </div>
          </div>
        )}
        {reportStatus === 'error' && (
          <div className="gc-status mt-16">
            <div className="gc-status-item gc-error">
              <AlertCircle size={16} />
              <span>{reportError}</span>
            </div>
          </div>
        )}
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
