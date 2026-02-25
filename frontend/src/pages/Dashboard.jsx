import { useState, useEffect } from 'react'
import {
  LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { TrendingUp, TrendingDown, Wallet, Activity, Award, AlertTriangle, Sparkles } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import { getInsights } from '../services/insights'
import { Link } from 'react-router-dom'
import './Dashboard.css'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

const TIME_RANGES = [
  { key: '7d', label: '7J', days: 7 },
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 180 },
  { key: '1y', label: '1A', days: 365 },
  { key: 'all', label: 'Max', days: null },
]

function getAllMovements(portfolio) {
  const allMovements = []
  for (const c of portfolio.crypto) {
    for (const m of (c.movements || [])) {
      allMovements.push({
        date: new Date(m.date),
        delta: m.type === 'sell' ? -(m.quantity * m.price) : (m.quantity * m.price + (m.fees || 0))
      })
    }
  }
  for (const p of portfolio.pea) {
    for (const m of (p.movements || [])) {
      allMovements.push({
        date: new Date(m.date),
        delta: m.type === 'sell' ? -(m.quantity * m.price) : (m.quantity * m.price + (m.fees || 0))
      })
    }
  }
  for (const l of portfolio.livrets) {
    for (const m of (l.movements || [])) {
      allMovements.push({
        date: new Date(m.date),
        delta: m.type === 'withdrawal' ? -(m.amount || 0) : (m.amount || 0)
      })
    }
  }
  allMovements.sort((a, b) => b.date - a.date)
  return allMovements
}

function buildPortfolioHistory(portfolio, totals, rangeKey = '6m') {
  const now = new Date()
  const currentTotal = totals.total
  const allMovements = getAllMovements(portfolio)

  const range = TIME_RANGES.find(r => r.key === rangeKey) || TIME_RANGES[3]

  // Determine date boundaries
  const oldest = allMovements.length > 0 ? allMovements[allMovements.length - 1].date : now
  const startDate = range.days ? new Date(now.getTime() - range.days * 86400000) : oldest

  // Build time points based on range
  const points = []
  if (range.days && range.days <= 7) {
    // Daily points
    for (let i = range.days; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      points.push({ date: d, label: i === 0 ? "Auj." : DAY_NAMES[d.getDay()] + ' ' + d.getDate() })
    }
  } else if (range.days && range.days <= 30) {
    // Every ~3 days
    const step = 3
    for (let i = range.days; i >= 0; i -= step) {
      const d = new Date(now.getTime() - i * 86400000)
      points.push({ date: d, label: d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] })
    }
    if (points[points.length - 1]?.date.toDateString() !== now.toDateString()) {
      points.push({ date: now, label: now.getDate() + ' ' + MONTH_NAMES[now.getMonth()] })
    }
  } else if (range.days && range.days <= 180) {
    // Monthly points
    for (let i = Math.ceil(range.days / 30); i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      if (d >= startDate) points.push({ date: d, label: MONTH_NAMES[d.getMonth()] })
    }
    points.push({ date: now, label: MONTH_NAMES[now.getMonth()] })
  } else {
    // Yearly / all: quarterly points
    const totalMonths = range.days ? Math.ceil(range.days / 30) : Math.max(Math.ceil((now - oldest) / (86400000 * 30)), 6)
    const step = Math.max(1, Math.floor(totalMonths / 12))
    for (let i = totalMonths; i >= 0; i -= step) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      if (d >= startDate || !range.days) {
        const lbl = step >= 12 ? MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear() : MONTH_NAMES[d.getMonth()] + (d.getMonth() === 0 ? ' ' + d.getFullYear() : '')
        points.push({ date: d, label: lbl })
      }
    }
    if (points.length === 0 || points[points.length - 1]?.date.toDateString() !== now.toDateString()) {
      points.push({ date: now, label: MONTH_NAMES[now.getMonth()] })
    }
  }

  // Build values: current total minus net invested after each point
  const result = points.map((p, i) => {
    if (i === points.length - 1) return { month: p.label, value: Math.round(currentTotal) }
    const investedAfter = allMovements
      .filter(mv => mv.date > p.date)
      .reduce((sum, mv) => sum + mv.delta, 0)
    return { month: p.label, value: Math.round(currentTotal - investedAfter) }
  })

  // Deduplicate consecutive labels
  for (let i = 1; i < result.length; i++) {
    if (result[i].month === result[i - 1].month) result[i].month = result[i].month + ' '
  }

  return result.length > 0 ? result : [{ month: MONTH_NAMES[now.getMonth()], value: Math.round(currentTotal) }]
}

function gatherRecentActivities(portfolio) {
  const activities = []

  for (const c of portfolio.crypto) {
    for (const m of (c.movements || [])) {
      activities.push({
        type: m.type === 'sell' ? 'sell' : 'buy',
        asset: c.name || c.symbol,
        amount: m.quantity * m.price,
        date: new Date(m.date),
      })
    }
  }
  for (const p of portfolio.pea) {
    for (const m of (p.movements || [])) {
      activities.push({
        type: m.type === 'sell' ? 'sell' : 'buy',
        asset: p.name || p.symbol,
        amount: m.quantity * m.price,
        date: new Date(m.date),
      })
    }
  }
  for (const l of portfolio.livrets) {
    for (const m of (l.movements || [])) {
      activities.push({
        type: m.type === 'withdrawal' ? 'sell' : 'deposit',
        asset: l.name,
        amount: m.amount || 0,
        date: new Date(m.date),
      })
    }
  }

  activities.sort((a, b) => b.date - a.date)

  return activities.slice(0, 6).map(a => ({
    ...a,
    dateLabel: formatRelativeDate(a.date),
  }))
}

function formatRelativeDate(date) {
  const now = new Date()
  const diffMs = now - date
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  const diffD = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffH < 1) return "À l'instant"
  if (diffH < 24) return `Il y a ${diffH}h`
  if (diffD === 1) return 'Hier'
  if (diffD < 7) return `Il y a ${diffD}j`
  if (diffD < 30) return `Il y a ${Math.floor(diffD / 7)} sem`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function GaugeChart({ value, label, color }) {
  const angle = (value / 100) * 180 - 90
  const r = 60
  const cx = 80, cy = 80
  const startAngle = Math.PI
  const endAngle = Math.PI + (value / 100) * Math.PI
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = value > 50 ? 1 : 0

  const getColor = (v) => {
    if (v <= 25) return '#ef4444'
    if (v <= 45) return '#f97316'
    if (v <= 55) return '#f59e0b'
    if (v <= 75) return '#84cc16'
    return '#10b981'
  }

  const getLabel = (v) => {
    if (v <= 25) return 'Peur extrême'
    if (v <= 45) return 'Peur'
    if (v <= 55) return 'Neutre'
    if (v <= 75) return 'Avidité'
    return 'Avidité extrême'
  }

  const c = getColor(value)

  return (
    <div className="gauge-chart">
      <svg viewBox="0 0 160 100" width="160" height="100">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="var(--border)" strokeWidth="12" strokeLinecap="round" />
        {value > 0 && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} fill="none" stroke={c} strokeWidth="12" strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text-primary)" fontSize="20" fontWeight="700">{value}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={c} fontSize="9" fontWeight="600">{getLabel(value)}</text>
      </svg>
      <span className="gauge-label">{label}</span>
    </div>
  )
}

export default function Dashboard() {
  const { portfolio, totals } = usePortfolio()
  const [fearGreed, setFearGreed] = useState({ crypto: 72, market: 58 })
  const [insight, setInsight] = useState(null)
  const [insightLoading, setInsightLoading] = useState(true)

  useEffect(() => {
    getInsights()
      .then(res => {
        const data = res.data
        if (data && (data.summary || data.content)) {
          setInsight(data.summary || data.content)
        }
      })
      .catch(() => {})
      .finally(() => setInsightLoading(false))
  }, [])

  const [timeRange, setTimeRange] = useState('6m')
  const perfData = buildPortfolioHistory(portfolio, totals, timeRange)
  const recentActivities = gatherRecentActivities(portfolio)

  const allocationData = [
    { name: 'Crypto', value: totals.crypto, color: '#3b82f6' },
    { name: 'PEA', value: totals.pea, color: '#10b981' },
    { name: 'Livrets', value: totals.livrets, color: '#f59e0b' },
    { name: 'Levées', value: totals.fundraising, color: '#8b5cf6' },
  ]

  const cryptoGains = portfolio.crypto.map(c => ({
    name: c.symbol,
    gain: ((c.currentPrice || c.buyPrice) - c.buyPrice) / c.buyPrice * 100
  }))

  const best = cryptoGains.sort((a, b) => b.gain - a.gain)[0]
  const worst = [...cryptoGains].sort((a, b) => a.gain - b.gain)[0]

  const totalInvested = [
    ...portfolio.crypto.map(c => c.buyPrice * c.quantity),
    ...portfolio.pea.map(p => p.buyPrice * p.quantity),
  ].reduce((a, b) => a + b, 0)

  const totalGain = totals.total - totals.livrets - totals.fundraising - totalInvested

  // Compute real gain percentages for stat cards
  const cryptoInvested = portfolio.crypto.reduce((sum, c) => sum + c.buyPrice * c.quantity, 0)
  const cryptoGainPct = cryptoInvested > 0 ? ((totals.crypto - cryptoInvested) / cryptoInvested) * 100 : 0
  const peaInvested = portfolio.pea.reduce((sum, p) => sum + p.buyPrice * p.quantity, 0)
  const peaGainPct = peaInvested > 0 ? ((totals.pea - peaInvested) / peaInvested) * 100 : 0

  return (
    <div className="dashboard animate-fade-in">
      {/* Hero total */}
      <div className="dashboard-hero card">
        <div>
          <p className="stat-label">Valeur totale du portefeuille</p>
          <p className="dashboard-total">{fmt(totals.total)}</p>
          <span className={`badge ${totalGain >= 0 ? 'badge-success' : 'badge-danger'}`}>
            {totalGain >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {fmt(totalGain)} depuis le début
          </span>
        </div>
        <div className="dashboard-hero-chart">
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={perfData}>
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-4 mt-24">
        <div className="stat-card">
          <div className="flex items-center gap-8 mb-8">
            <Wallet size={18} style={{ color: 'var(--accent)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Total Crypto</span>
          </div>
          <div className="stat-value">{fmt(totals.crypto)}</div>
          <div className={`stat-sub ${cryptoGainPct >= 0 ? 'text-success' : 'text-danger'}`}>{fmtPct(cryptoGainPct)} depuis achat</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-8 mb-8">
            <TrendingUp size={18} style={{ color: 'var(--success)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Total PEA</span>
          </div>
          <div className="stat-value">{fmt(totals.pea)}</div>
          <div className={`stat-sub ${peaGainPct >= 0 ? 'text-success' : 'text-danger'}`}>{fmtPct(peaGainPct)} depuis achat</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-8 mb-8">
            <Activity size={18} style={{ color: 'var(--warning)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Épargne réglementée</span>
          </div>
          <div className="stat-value">{fmt(totals.livrets)}</div>
          <div className="stat-sub">{portfolio.livrets.length} livret{portfolio.livrets.length > 1 ? 's' : ''}</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-8 mb-8">
            <Award size={18} style={{ color: '#8b5cf6' }} />
            <span className="stat-label" style={{ margin: 0 }}>Levées de fonds</span>
          </div>
          <div className="stat-value">{fmt(totals.fundraising)}</div>
          <div className="stat-sub">{portfolio.fundraising.length} projets</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-2 mt-24 gap-20">
        {/* Allocation pie */}
        <div className="card">
          <h3 className="mb-16">Allocation du portefeuille</h3>
          <div className="dashboard-pie-row">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={allocationData} cx={95} cy={95} innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                  {allocationData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="dashboard-legend">
              {allocationData.map((item) => (
                <div key={item.name} className="dashboard-legend-item">
                  <span className="dashboard-legend-dot" style={{ background: item.color }} />
                  <div>
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-muted">{fmt(item.value)} · {((item.value / totals.total) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Performance line chart */}
        <div className="card">
          <div className="perf-chart-header">
            <h3>Performance</h3>
            <div className="time-range-selector">
              {TIME_RANGES.map(r => (
                <button
                  key={r.key}
                  className={`time-range-btn${timeRange === r.key ? ' active' : ''}`}
                  onClick={() => setTimeRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [fmt(v), 'Valeur']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-2 mt-24 gap-20">
        {/* Fear & Greed */}
        <div className="card">
          <h3 className="mb-16">Fear & Greed Index</h3>
          <div className="dashboard-gauges">
            <GaugeChart value={fearGreed.crypto} label="Crypto" />
            <GaugeChart value={fearGreed.market} label="Marchés" />
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <h3 className="mb-16">Activité récente</h3>
          <div className="activity-list">
            {recentActivities.length === 0 && (
              <p className="text-muted text-sm">Aucun mouvement enregistré</p>
            )}
            {recentActivities.map((a, i) => (
              <div key={i} className="activity-item">
                <div className={`activity-icon activity-icon--${a.type}`}>
                  {a.type === 'buy' ? <TrendingUp size={14} /> : a.type === 'sell' ? <TrendingDown size={14} /> : <Wallet size={14} />}
                </div>
                <div className="activity-info">
                  <span className="activity-asset">{a.asset}</span>
                  <span className="activity-date text-xs text-muted">{a.dateLabel}</span>
                </div>
                <span className={`activity-amount ${a.type === 'sell' ? 'text-danger' : 'text-success'}`}>
                  {a.type === 'sell' ? '-' : '+'}{fmt(a.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* IA Insight + Best/Worst performers */}
      <div className="grid grid-3 mt-24 gap-20">
        <div className="card dashboard-insight-card">
          <div className="flex items-center gap-8 mb-8">
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IA Quick Insight</span>
          </div>
          {insightLoading ? (
            <p className="text-muted text-sm">Chargement...</p>
          ) : insight ? (
            <>
              <p className="text-sm" style={{ lineHeight: 1.5 }}>{typeof insight === 'string' ? insight.slice(0, 200) : 'Analyse disponible'}</p>
              <Link to="/insights" className="text-xs mt-8" style={{ color: 'var(--accent)', display: 'inline-block', marginTop: 8 }}>
                Voir l'analyse complète →
              </Link>
            </>
          ) : (
            <p className="text-muted text-sm">Activez l'IA dans les paramètres pour obtenir des insights personnalisés.</p>
          )}
        </div>

        <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>
          <div className="flex items-center gap-8 mb-8">
            <Award size={16} style={{ color: 'var(--success)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meilleure performance</span>
          </div>
          {best && (
            <>
              <div className="text-2xl font-bold">{best.name}</div>
              <div className="text-success font-semibold mt-4">{fmtPct(best.gain)}</div>
            </>
          )}
        </div>
        <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
          <div className="flex items-center gap-8 mb-8">
            <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Performance la plus faible</span>
          </div>
          {worst && (
            <>
              <div className="text-2xl font-bold">{worst.name}</div>
              <div className="text-danger font-semibold mt-4">{fmtPct(worst.gain)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
