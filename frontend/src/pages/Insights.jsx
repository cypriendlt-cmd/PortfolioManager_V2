import { useState, useEffect } from 'react'
import { Brain, RefreshCw, AlertCircle, TrendingUp, Shield, BarChart3, Lightbulb, Cpu, FlaskConical, Search, ChevronDown, ChevronUp, Target, DollarSign, Gauge, FileText, Key } from 'lucide-react'
import { getFearGreed } from '../services/market'
import { getInsights, refreshInsights, analyzePortfolio, getProviders, analyzeStocks } from '../services/insights'
import { usePortfolio } from '../context/PortfolioContext'
import { useAuth } from '../context/AuthContext'
import { usePrivacy } from '../context/PrivacyContext'
import { Link } from 'react-router-dom'

function GaugeMeter({ value, label }) {
  const getColor = (v) => {
    if (v <= 25) return '#ef4444'
    if (v <= 45) return '#f97316'
    if (v <= 55) return '#f59e0b'
    if (v <= 75) return '#84cc16'
    return '#10b981'
  }

  const getText = (v) => {
    if (v <= 25) return 'Peur extrême'
    if (v <= 45) return 'Peur'
    if (v <= 55) return 'Neutre'
    if (v <= 75) return 'Avidité'
    return 'Avidité extrême'
  }

  const c = getColor(value)
  const r = 70
  const cx = 90, cy = 90
  const endAngle = Math.PI + (value / 100) * Math.PI
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = value > 50 ? 1 : 0

  return (
    <div className="insights-gauge">
      <svg viewBox="0 0 180 110" width="180" height="110">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--bg-secondary)" strokeWidth="14" strokeLinecap="round" />
        {value > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} fill="none" stroke={c} strokeWidth="14" strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary)" fontSize="24" fontWeight="700">{value}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill={c} fontSize="11" fontWeight="600">{getText(value)}</text>
      </svg>
      <span className="insights-gauge-label">{label}</span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="card">
      <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 10, width: '60%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 10, width: '80%' }} />
    </div>
  )
}

function AnalysisCard({ icon: Icon, title, content, color }) {
  if (!content) return null
  return (
    <div className="card insights-analysis-card">
      <div className="flex items-center gap-10 mb-16">
        <div className="insights-card-icon" style={{ background: `${color}15`, color }}>
          <Icon size={20} />
        </div>
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      <div className="insights-analysis-content">
        {content.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}

// ─── Stock Screener Constants ────────────────────────────────────────────────

const SECTORS_OPTIONS = [
  { value: 'technology', label: 'Technologie' },
  { value: 'healthcare', label: 'Santé' },
  { value: 'energy', label: 'Énergie' },
  { value: 'finance', label: 'Finance' },
  { value: 'consumer', label: 'Consommation' },
  { value: 'industrial', label: 'Industrie' },
  { value: 'real_estate', label: 'Immobilier' },
  { value: 'utilities', label: 'Utilities' },
]

const DEFAULT_PROFILE = {
  riskTolerance: 'medium',
  investmentAmount: 10000,
  horizon: 'long',
  preferredSectors: ['technology'],
  geography: 'global',
  style: 'growth',
  esg: 'none',
}

// ─── Stock Screener Component ────────────────────────────────────────────────

function StockScreener() {
  const { hideValues } = usePrivacy()
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('pm_anthropic_api_key') || '')

  useEffect(() => {
    if (anthropicKey) return
    import('../services/googleDrive').then(({ loadFileFromDrive }) => {
      loadFileFromDrive('secrets.json').then(data => {
        if (data?.anthropicKey) {
          setAnthropicKey(data.anthropicKey)
          localStorage.setItem('pm_anthropic_api_key', data.anthropicKey)
        }
      }).catch(() => {})
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('screener_profile')
      return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : DEFAULT_PROFILE
    } catch { return DEFAULT_PROFILE }
  })
  const [screenerLoading, setScreenerLoading] = useState(false)
  const [screenerError, setScreenerError] = useState(null)
  const [screenerResult, setScreenerResult] = useState(null)
  const [expandedStock, setExpandedStock] = useState(null)
  const [showReport, setShowReport] = useState(false)

  const updateProfile = (key, value) => {
    setProfile(prev => {
      const next = { ...prev, [key]: value }
      localStorage.setItem('screener_profile', JSON.stringify(next))
      return next
    })
  }

  const toggleSector = (sector) => {
    setProfile(prev => {
      const current = prev.preferredSectors || []
      const next = current.includes(sector)
        ? current.filter(s => s !== sector)
        : [...current, sector]
      const updated = { ...prev, preferredSectors: next }
      localStorage.setItem('screener_profile', JSON.stringify(updated))
      return updated
    })
  }

  const handleAnalyze = async () => {
    if (profile.preferredSectors.length === 0) {
      setScreenerError('Sélectionnez au moins un secteur.')
      return
    }
    setScreenerLoading(true)
    setScreenerError(null)
    setScreenerResult(null)
    setShowReport(false)
    setExpandedStock(null)
    try {
      const res = await analyzeStocks(profile, anthropicKey)
      setScreenerResult(res.data)
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.details?.join(', ') || err.message
      setScreenerError(msg)
    } finally {
      setScreenerLoading(false)
    }
  }

  const formatCurrency = (val, currency = 'EUR') => {
    if (hideValues) return '••••'
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(val)
  }

  const getRiskColor = (score) => {
    if (score <= 3) return '#10b981'
    if (score <= 5) return '#f59e0b'
    if (score <= 7) return '#f97316'
    return '#ef4444'
  }

  const getAdvantageColor = (adv) => {
    const lower = (adv || '').toLowerCase()
    if (lower === 'fort') return '#10b981'
    if (lower === 'modéré') return '#f59e0b'
    return '#ef4444'
  }

  return (
    <div className="screener-section">
      <div className="screener-header">
        <div className="screener-header-left">
          <div className="screener-icon">
            <FlaskConical size={22} />
          </div>
          <div>
            <h2 className="screener-title">Invest LAB</h2>
            <p className="screener-subtitle">Stock Screener propulsé par Claude AI</p>
          </div>
        </div>
        <span className="screener-badge">Claude AI</span>
      </div>

      {!anthropicKey && (
        <div className="card mb-16" style={{ background: 'var(--accent-light)', borderColor: 'var(--accent)' }}>
          <div className="flex items-center gap-12">
            <Key size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <p className="text-sm" style={{ margin: 0 }}>
              Configurez votre clé API Anthropic dans les{' '}
              <Link to="/settings" style={{ color: 'var(--accent)', fontWeight: 600 }}>Paramètres</Link>{' '}
              pour utiliser le Stock Screener.
            </p>
          </div>
        </div>
      )}

      <div className="screener-form">
        <div className="screener-form-grid">
          <div className="screener-field">
            <label className="screener-label">Tolérance au risque</label>
            <select className="screener-select" value={profile.riskTolerance} onChange={e => updateProfile('riskTolerance', e.target.value)}>
              <option value="low">Faible</option>
              <option value="medium">Modéré</option>
              <option value="high">Élevé</option>
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Montant investi (€)</label>
            <input type="number" className="screener-input" value={profile.investmentAmount} onChange={e => updateProfile('investmentAmount', Number(e.target.value))} min={100} max={100000000} step={100} />
          </div>
          <div className="screener-field">
            <label className="screener-label">Horizon d'investissement</label>
            <select className="screener-select" value={profile.horizon} onChange={e => updateProfile('horizon', e.target.value)}>
              <option value="short">Court terme (1-2 ans)</option>
              <option value="medium">Moyen terme (3-5 ans)</option>
              <option value="long">Long terme (5+ ans)</option>
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Zone géographique</label>
            <select className="screener-select" value={profile.geography} onChange={e => updateProfile('geography', e.target.value)}>
              <option value="usa">USA</option>
              <option value="europe">Europe</option>
              <option value="global">Global</option>
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Style d'investissement</label>
            <select className="screener-select" value={profile.style} onChange={e => updateProfile('style', e.target.value)}>
              <option value="growth">Growth</option>
              <option value="value">Value</option>
              <option value="dividend">Dividend</option>
              <option value="blend">Blend</option>
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Contraintes ESG</label>
            <select className="screener-select" value={profile.esg} onChange={e => updateProfile('esg', e.target.value)}>
              <option value="none">Aucune</option>
              <option value="light">ESG léger</option>
              <option value="strict">ESG strict</option>
            </select>
          </div>
        </div>
        <div className="screener-field screener-field-full">
          <label className="screener-label">Secteurs préférés</label>
          <div className="screener-chips">
            {SECTORS_OPTIONS.map(s => (
              <button key={s.value} type="button" className={`screener-chip ${profile.preferredSectors.includes(s.value) ? 'screener-chip-active' : ''}`} onClick={() => toggleSector(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="screener-actions">
          <button className="btn btn-primary screener-analyze-btn" onClick={handleAnalyze} disabled={screenerLoading}>
            {screenerLoading ? (<><RefreshCw size={16} className="animate-pulse" /> Analyse en cours...</>) : (<><Search size={16} /> Analyser</>)}
          </button>
        </div>
      </div>

      {screenerError && (
        <div className="card mt-16" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'var(--danger)' }}>
          <div className="flex items-center gap-12">
            <AlertCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <p className="text-sm" style={{ margin: 0, color: 'var(--text-primary)' }}>{screenerError}</p>
          </div>
        </div>
      )}

      {screenerLoading && (
        <div className="screener-loading">
          <div className="screener-loading-spinner" />
          <p>Claude AI analyse les marchés selon votre profil...</p>
          <p className="text-xs text-muted">Cela peut prendre 15 à 30 secondes</p>
        </div>
      )}

      {screenerResult && !screenerLoading && (
        <div className="screener-results">
          <div className="screener-summary-grid">
            <div className="screener-summary-card">
              <Target size={18} style={{ color: 'var(--accent)' }} />
              <div><span className="screener-summary-value">{screenerResult.summary?.totalStocks || 10}</span><span className="screener-summary-label">Actions analysées</span></div>
            </div>
            <div className="screener-summary-card">
              <Gauge size={18} style={{ color: '#f59e0b' }} />
              <div><span className="screener-summary-value">{screenerResult.summary?.averageRiskScore?.toFixed(1) || '-'}/10</span><span className="screener-summary-label">Risque moyen</span></div>
            </div>
            <div className="screener-summary-card">
              <DollarSign size={18} style={{ color: '#10b981' }} />
              <div><span className="screener-summary-value">{screenerResult.summary?.averageDividendYield || '-'}</span><span className="screener-summary-label">Div. yield moyen</span></div>
            </div>
            <div className="screener-summary-card">
              <TrendingUp size={18} style={{ color: '#3b82f6' }} />
              <div><span className="screener-summary-value" style={{ textTransform: 'capitalize' }}>{screenerResult.summary?.marketOutlook || '-'}</span><span className="screener-summary-label">Outlook</span></div>
            </div>
          </div>

          {screenerResult.summary?.keyInsight && (
            <div className="screener-key-insight"><Lightbulb size={16} /><span>{screenerResult.summary.keyInsight}</span></div>
          )}

          {screenerResult.table && (
            <div className="screener-table-wrap">
              <table className="screener-table">
                <thead><tr>{(screenerResult.table.headers || []).map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {(screenerResult.table.rows || []).map((row, i) => (
                    <tr key={i} onClick={() => setExpandedStock(expandedStock === i ? null : i)} className="screener-table-row-clickable">
                      {row.map((cell, j) => <td key={j}>{typeof cell === 'number' && j >= 4 ? (hideValues ? '••••' : cell.toLocaleString('fr-FR')) : (hideValues && j >= 4 ? '••••' : cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="mt-24 mb-16">Fiches détaillées</h3>
          <div className="screener-stocks-grid">
            {(screenerResult.top10 || []).map((stock, i) => (
              <div key={i} className="screener-stock-card" onClick={() => setExpandedStock(expandedStock === i ? null : i)}>
                <div className="screener-stock-header">
                  <div className="screener-stock-rank">#{stock.rank}</div>
                  <div className="screener-stock-info"><strong>{stock.symbol}</strong><span className="text-sm text-muted">{stock.name}</span></div>
                  <div className="screener-stock-right">
                    <span className="screener-stock-price">{formatCurrency(stock.currentPrice, stock.currency || 'USD')}</span>
                    <span className="screener-stock-risk" style={{ background: `${getRiskColor(stock.riskScore)}15`, color: getRiskColor(stock.riskScore) }}>Risque {stock.riskScore}/10</span>
                  </div>
                  {expandedStock === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedStock === i && (
                  <div className="screener-stock-details">
                    <div className="screener-stock-metrics">
                      <div className="screener-metric"><span className="screener-metric-label">P/E</span><span className="screener-metric-value">{stock.peRatio}</span><span className="screener-metric-sub">Secteur: {stock.sectorAvgPE}</span></div>
                      <div className="screener-metric"><span className="screener-metric-label">CA 5 ans</span><span className="screener-metric-value">{stock.revenueGrowth5Y}</span></div>
                      <div className="screener-metric"><span className="screener-metric-label">Debt/Equity</span><span className="screener-metric-value">{stock.debtToEquity}</span></div>
                      <div className="screener-metric"><span className="screener-metric-label">Div. Yield</span><span className="screener-metric-value">{stock.dividendYield}</span><span className="screener-metric-sub">{stock.dividendSustainability}</span></div>
                      <div className="screener-metric"><span className="screener-metric-label">Avantage</span><span className="screener-metric-value" style={{ color: getAdvantageColor(stock.competitiveAdvantage) }}>{stock.competitiveAdvantage}</span></div>
                    </div>
                    <div className="screener-stock-targets">
                      <div className="screener-target"><span className="screener-target-label">Obj. Haussier</span><span className="screener-target-value" style={{ color: '#10b981' }}>{formatCurrency(stock.priceTarget12M?.bull, stock.currency || 'USD')}</span></div>
                      <div className="screener-target"><span className="screener-target-label">Obj. Baissier</span><span className="screener-target-value" style={{ color: '#ef4444' }}>{formatCurrency(stock.priceTarget12M?.bear, stock.currency || 'USD')}</span></div>
                      <div className="screener-target"><span className="screener-target-label">Zone d'entrée</span><span className="screener-target-value">{formatCurrency(stock.entryZone?.low, stock.currency || 'USD')} — {formatCurrency(stock.entryZone?.high, stock.currency || 'USD')}</span></div>
                      <div className="screener-target"><span className="screener-target-label">Stop-Loss</span><span className="screener-target-value" style={{ color: '#ef4444' }}>{formatCurrency(stock.stopLoss, stock.currency || 'USD')}</span></div>
                    </div>
                    {stock.thesis && <p className="screener-stock-thesis">{stock.thesis}</p>}
                    {stock.riskJustification && <p className="screener-stock-risk-text"><Shield size={14} style={{ flexShrink: 0 }} />{stock.riskJustification}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {screenerResult.reportMarkdown && (
            <div className="screener-report-section">
              <button className="btn btn-secondary screener-report-toggle" onClick={() => setShowReport(!showReport)}>
                <FileText size={16} />{showReport ? 'Masquer le rapport' : 'Voir le rapport complet'}{showReport ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showReport && (
                <div className="screener-report-content card">
                  <div className="screener-markdown" dangerouslySetInnerHTML={{
                    __html: screenerResult.reportMarkdown
                      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/^- (.*$)/gm, '<li>$1</li>')
                      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
                      .replace(/\n{2,}/g, '</p><p>')
                  }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Insights() {
  const { portfolio, totals, insightsData, saveInsights } = usePortfolio()
  const { isGuest } = useAuth()
  const [loading, setLoading] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [fearGreed, setFearGreed] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [marketInsight, setMarketInsight] = useState(null)
  const [error, setError] = useState(null)
  const [activeProvider, setActiveProvider] = useState(null)
  const [noProvider, setNoProvider] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Load cached insights from Drive
  useEffect(() => {
    if (!insightsData) return
    const { market, portfolio: portInsight } = insightsData
    if (market?.content) {
      setMarketInsight(market.content)
      if (market.updatedAt) setLastUpdated(new Date(market.updatedAt))
    }
    if (portInsight?.content) {
      setAnalysis(portInsight.content)
      if (portInsight.updatedAt && (!lastUpdated || new Date(portInsight.updatedAt) > lastUpdated)) {
        setLastUpdated(new Date(portInsight.updatedAt))
      }
    }
  }, [insightsData])

  const isCacheFresh = () => {
    if (!lastUpdated) return false
    const ageMs = Date.now() - lastUpdated.getTime()
    return ageMs < 24 * 60 * 60 * 1000 // < 24h
  }

  const loadFearGreed = async () => {
    try {
      const res = await getFearGreed()
      setFearGreed(res.data)
    } catch {
      setFearGreed(null)
    }
  }

  const checkProviders = async () => {
    try {
      const res = await getProviders()
      setActiveProvider(res.data.active)
      setNoProvider(res.data.active === 'mock')
    } catch {
      setNoProvider(true)
    }
  }

  const loadCachedInsights = async () => {
    // Skip backend call if we have fresh Drive cache
    if (isCacheFresh()) return
    try {
      const res = await getInsights()
      const data = res.data
      if (data.insights) {
        setMarketInsight(data.insights.summary || data.insights)
        if (data.insights.source) setActiveProvider(data.insights.source)
      }
      if (data.analysis) {
        setAnalysis(data.analysis)
      }
      if (data.fearGreed) {
        setFearGreed({
          crypto: data.fearGreed.crypto ? { value: data.fearGreed.crypto.value } : null,
          stock: data.fearGreed.stock ? { value: data.fearGreed.stock.value } : null,
        })
      }
    } catch {}
  }

  const persistInsights = (marketContent, analysisContent) => {
    const now = new Date().toISOString()
    const data = {
      market: {
        type: 'market',
        content: marketContent || marketInsight,
        createdAt: insightsData?.market?.createdAt || now,
        updatedAt: now,
      },
      portfolio: {
        type: 'portfolio',
        content: analysisContent || analysis,
        createdAt: insightsData?.portfolio?.createdAt || now,
        updatedAt: now,
      },
    }
    saveInsights(data)
    setLastUpdated(new Date())
  }

  const loadAnalysis = async () => {
    if (!portfolio) return
    setAnalysisLoading(true)
    setError(null)
    try {
      const portfolioData = {
        crypto: portfolio.crypto || [],
        pea: portfolio.pea || [],
        livrets: portfolio.livrets || [],
        fundraising: portfolio.fundraising || [],
        totals,
      }
      const res = await analyzePortfolio(portfolioData)
      if (res.data.provider === 'none') {
        setNoProvider(true)
        setAnalysis(null)
      } else {
        setAnalysis(res.data)
        setActiveProvider(res.data.provider)
        return res.data
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erreur lors de l\'analyse')
    } finally {
      setAnalysisLoading(false)
    }
    return null
  }

  const handleRefresh = async () => {
    setLoading(true)
    let newMarket = null
    try {
      const res = await refreshInsights()
      const data = res.data
      if (data.insights) {
        newMarket = data.insights.summary || data.insights
        setMarketInsight(newMarket)
      }
      if (data.fearGreed) {
        setFearGreed({
          crypto: data.fearGreed.crypto ? { value: data.fearGreed.crypto.value } : null,
          stock: data.fearGreed.stock ? { value: data.fearGreed.stock.value } : null,
        })
      }
    } catch {}
    const newAnalysis = await loadAnalysis()
    persistInsights(newMarket, newAnalysis)
    setLoading(false)
  }

  useEffect(() => {
    if (isGuest) return
    loadFearGreed()
    checkProviders()
  }, [isGuest])

  // Load from backend only after Drive data is resolved
  useEffect(() => {
    if (isGuest) return
    if (!isCacheFresh()) {
      loadCachedInsights()
    }
  }, [insightsData, isGuest])

  const fg = fearGreed || {}
  const cryptoFgValue = fg.crypto?.value ?? fg.current?.value ?? 0
  const stockFgValue = fg.stock?.value ?? 0

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-24">
        <div>
          <p className="text-muted text-sm">
            Analyse de portefeuille et sentiment de marche via IA
            {activeProvider && activeProvider !== 'mock' && (
              <span className="insights-provider-badge">
                <Cpu size={12} /> {activeProvider}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span className="text-xs text-muted">
              Mis à jour : {lastUpdated.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={loading || analysisLoading || isGuest}>
            <RefreshCw size={16} className={loading || analysisLoading ? 'animate-pulse' : ''} />
            Régénérer
          </button>
        </div>
      </div>

      {isGuest && (
        <div className="card mb-24" style={{ background: 'var(--accent-light)', borderColor: 'var(--accent)' }}>
          <div className="flex items-center gap-12">
            <Brain size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <p className="text-sm" style={{ color: 'var(--text-primary)', margin: 0 }}>
              Les analyses IA nécessitent un compte.{' '}
              <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Connectez-vous</Link>{' '}
              pour accéder aux insights de marché et à l'analyse de votre portefeuille.
            </p>
          </div>
        </div>
      )}

      {noProvider && !analysis && (
        <div className="card mb-24" style={{ background: 'var(--accent-light)', borderColor: 'var(--accent)' }}>
          <div className="flex items-center gap-12">
            <Brain size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <p className="text-sm" style={{ color: 'var(--text-primary)', margin: 0 }}>
              Configurez une cle API (Groq, Together AI ou Hugging Face) dans les{' '}
              <Link to="/settings" style={{ color: 'var(--accent)', fontWeight: 600 }}>Parametres</Link>{' '}
              pour activer les analyses IA.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="card mb-24" style={{ background: 'var(--danger-light, rgba(239,68,68,0.1))', borderColor: 'var(--danger)' }}>
          <div className="flex items-center gap-12">
            <AlertCircle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <div>
              <p className="text-sm" style={{ color: 'var(--text-primary)', margin: 0 }}>
                <strong>Erreur :</strong> {error}
              </p>
              <button className="btn btn-ghost mt-8" onClick={loadAnalysis} style={{ padding: '4px 12px', fontSize: '0.8rem' }}>
                Reessayer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fear & Greed */}
      <div className="card mb-24">
        <h3 className="mb-24">Fear & Greed Index</h3>
        <div className="insights-gauges-row">
          <GaugeMeter value={cryptoFgValue} label="Crypto Fear & Greed" />
          <div className="insights-gauge-divider" />
          <GaugeMeter value={stockFgValue} label="Marchés Fear & Greed" />
        </div>
        <div className="insights-fg-legend">
          {[
            { label: 'Peur extreme', range: '0-25', color: '#ef4444' },
            { label: 'Peur', range: '26-45', color: '#f97316' },
            { label: 'Neutre', range: '46-55', color: '#f59e0b' },
            { label: 'Avidite', range: '56-75', color: '#84cc16' },
            { label: 'Avidite extreme', range: '76-100', color: '#10b981' },
          ].map(item => (
            <div key={item.label} className="insights-fg-item">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
              <span>{item.label} ({item.range})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Market Summary */}
      {marketInsight && (
        <div className="card mb-24">
          <div className="flex items-center gap-10 mb-16">
            <Brain size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0 }}>Synthèse marché IA</h3>
          </div>
          <div className="text-sm" style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {typeof marketInsight === 'string' ? marketInsight : JSON.stringify(marketInsight)}
          </div>
        </div>
      )}

      {/* Portfolio Analysis */}
      {analysisLoading ? (
        <div className="grid grid-2 gap-20">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : analysis ? (
        <div className="grid grid-2 gap-20">
          <AnalysisCard
            icon={TrendingUp}
            title="Synthese du portefeuille"
            content={analysis.synthesis}
            color="var(--accent)"
          />
          <AnalysisCard
            icon={BarChart3}
            title="Diversification"
            content={analysis.diversification}
            color="var(--success)"
          />
          <AnalysisCard
            icon={Shield}
            title="Sur/Sous-expositions"
            content={analysis.overexposures}
            color="var(--warning, #f59e0b)"
          />
          <AnalysisCard
            icon={Lightbulb}
            title="Recommandations"
            content={analysis.recommendations}
            color="var(--info, #3b82f6)"
          />
        </div>
      ) : !noProvider && !error ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Brain size={40} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <p className="text-muted">Cliquez sur "Actualiser" pour lancer l'analyse IA de votre portefeuille.</p>
        </div>
      ) : null}

      {/* ─── Invest LAB : Stock Screener ─────────────────────────── */}
      <div className="screener-divider">
        <div className="screener-divider-line" />
        <span className="screener-divider-label"><FlaskConical size={14} /> Invest LAB</span>
        <div className="screener-divider-line" />
      </div>

      <StockScreener />

      <div className="card mt-24" style={{ background: 'var(--warning-light)', borderColor: 'var(--warning)' }}>
        <div className="flex items-center gap-12">
          <AlertCircle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--text-primary)', margin: 0 }}>
            <strong>Avertissement :</strong> Ces analyses sont generees par intelligence artificielle et ne constituent pas des conseils en investissement. Faites vos propres recherches avant toute decision financiere.
          </p>
        </div>
      </div>
    </div>
  )
}
