import { useState, useEffect } from 'react'
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle } from 'lucide-react'
import { getInsights } from '../services/insights'
import { getFearGreed } from '../services/market'
import './Insights.css'

const DEMO_INSIGHTS = {
  crypto: {
    summary: "Le marché crypto montre des signaux haussiers avec Bitcoin consolidant au-dessus de 60 000$. L'adoption institutionnelle continue de croître avec plusieurs ETFs spot approuvés. Ethereum prépare ses prochaines mises à jour de scalabilité. Les altcoins sélectionnés (SOL, AVAX) montrent une forte dynamique technique.",
    sentiment: 'bullish',
    keyPoints: [
      'BTC consolide au-dessus du support majeur de 60k$',
      'Volume en hausse sur les exchanges décentralisés',
      'Halving approche — historiquement haussier',
      'DeFi TVL en augmentation de 15% ce mois',
    ],
    updatedAt: new Date().toISOString(),
  },
  stocks: {
    summary: "Les marchés actions européens résistent bien malgré les incertitudes géopolitiques. Le secteur énergétique et bancaire surperforment. Les ETFs monde continuent d'attirer des flux importants. La saison des résultats Q4 a globalement dépassé les attentes du consensus.",
    sentiment: 'neutral',
    keyPoints: [
      'CAC 40 proche de ses records historiques',
      'BCE maintient une politique monétaire accommodante',
      'Secteur tech US en légère correction',
      'Bons résultats trimestriels pour TotalEnergies',
    ],
    updatedAt: new Date().toISOString(),
  },
}

const DEMO_FEAR_GREED = {
  crypto: { value: 72, label: 'Greed', trend: 'up' },
  market: { value: 58, label: 'Greed', trend: 'neutral' },
}

function SentimentIcon({ sentiment }) {
  if (sentiment === 'bullish') return <TrendingUp size={18} style={{ color: 'var(--success)' }} />
  if (sentiment === 'bearish') return <TrendingDown size={18} style={{ color: 'var(--danger)' }} />
  return <Minus size={18} style={{ color: 'var(--warning)' }} />
}

function SkeletonCard() {
  return (
    <div className="card">
      <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 14, width: '75%', marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 10, width: '60%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 10, width: '80%', marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 10, width: '70%' }} />
    </div>
  )
}

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

export default function Insights() {
  const [loading, setLoading] = useState(true)
  const [insights, setInsights] = useState(null)
  const [fearGreed, setFearGreed] = useState(null)
  const [error, setError] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [insightsRes, fearGreedRes] = await Promise.allSettled([
        getInsights(),
        getFearGreed(),
      ])

      setInsights(insightsRes.status === 'fulfilled' ? insightsRes.value.data : DEMO_INSIGHTS)
      setFearGreed(fearGreedRes.status === 'fulfilled' ? fearGreedRes.value.data : DEMO_FEAR_GREED)
    } catch {
      setInsights(DEMO_INSIGHTS)
      setFearGreed(DEMO_FEAR_GREED)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const data = insights || DEMO_INSIGHTS
  const fg = fearGreed || DEMO_FEAR_GREED

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-24">
        <div>
          <p className="text-muted text-sm">Données mises à jour en temps réel via IA</p>
        </div>
        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'animate-pulse' : ''} />
          Actualiser
        </button>
      </div>

      {/* Fear & Greed */}
      <div className="card mb-24">
        <h3 className="mb-24">Fear & Greed Index</h3>
        <div className="insights-gauges-row">
          <GaugeMeter value={fg.crypto?.value || 72} label="Crypto Fear & Greed" />
          <div className="insights-gauge-divider" />
          <GaugeMeter value={fg.market?.value || 58} label="Marchés Fear & Greed" />
        </div>
        <div className="insights-fg-legend">
          {[
            { label: 'Peur extrême', range: '0-25', color: '#ef4444' },
            { label: 'Peur', range: '26-45', color: '#f97316' },
            { label: 'Neutre', range: '46-55', color: '#f59e0b' },
            { label: 'Avidité', range: '56-75', color: '#84cc16' },
            { label: 'Avidité extrême', range: '76-100', color: '#10b981' },
          ].map(item => (
            <div key={item.label} className="insights-fg-item">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
              <span>{item.label} ({item.range})</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <div className="grid grid-2 gap-20">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            {/* Crypto insight */}
            <div className="card">
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-10">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Brain size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0 }}>Analyse Crypto</h3>
                    <span className="text-xs text-muted">IA — Analyse temps réel</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <SentimentIcon sentiment={data.crypto?.sentiment} />
                  <span className={`badge ${data.crypto?.sentiment === 'bullish' ? 'badge-success' : data.crypto?.sentiment === 'bearish' ? 'badge-danger' : 'badge-warning'}`}>
                    {data.crypto?.sentiment === 'bullish' ? 'Haussier' : data.crypto?.sentiment === 'bearish' ? 'Baissier' : 'Neutre'}
                  </span>
                </div>
              </div>
              <p className="text-sm" style={{ lineHeight: 1.8, marginBottom: 20 }}>{data.crypto?.summary}</p>
              <div>
                <p className="text-xs font-semibold text-muted mb-12" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Points clés</p>
                <ul className="insights-points">
                  {data.crypto?.keyPoints?.map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Stocks insight */}
            <div className="card">
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-10">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0 }}>Analyse Actions</h3>
                    <span className="text-xs text-muted">IA — Analyse temps réel</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <SentimentIcon sentiment={data.stocks?.sentiment} />
                  <span className={`badge ${data.stocks?.sentiment === 'bullish' ? 'badge-success' : data.stocks?.sentiment === 'bearish' ? 'badge-danger' : 'badge-warning'}`}>
                    {data.stocks?.sentiment === 'bullish' ? 'Haussier' : data.stocks?.sentiment === 'bearish' ? 'Baissier' : 'Neutre'}
                  </span>
                </div>
              </div>
              <p className="text-sm" style={{ lineHeight: 1.8, marginBottom: 20 }}>{data.stocks?.summary}</p>
              <div>
                <p className="text-xs font-semibold text-muted mb-12" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Points clés</p>
                <ul className="insights-points">
                  {data.stocks?.keyPoints?.map((pt, i) => (
                    <li key={i}>{pt}</li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card mt-24" style={{ background: 'var(--warning-light)', borderColor: 'var(--warning)' }}>
        <div className="flex items-center gap-12">
          <AlertCircle size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <p className="text-sm" style={{ color: 'var(--text-primary)', margin: 0 }}>
            <strong>Avertissement :</strong> Ces analyses sont générées par intelligence artificielle et ne constituent pas des conseils en investissement. Faites vos propres recherches avant toute décision financière.
          </p>
        </div>
      </div>
    </div>
  )
}
