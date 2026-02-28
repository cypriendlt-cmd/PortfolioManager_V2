import { useState, useEffect } from 'react'
import { Brain, RefreshCw, AlertCircle, TrendingUp, Shield, BarChart3, Lightbulb, Cpu } from 'lucide-react'
import { getFearGreed } from '../services/market'
import { getInsights, refreshInsights, analyzePortfolio, getProviders } from '../services/insights'
import { usePortfolio } from '../context/PortfolioContext'
import { useAuth } from '../context/AuthContext'
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
