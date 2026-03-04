import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { TrendingUp, TrendingDown, Wallet, Activity, Award, AlertTriangle, Sparkles, BarChart3, Shield, Lightbulb, Landmark, CreditCard, Heart, Calendar } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import { useBank } from '../context/BankContext'
import { useAuth } from '../context/AuthContext'
import { usePrivacyMask } from '../hooks/usePrivacyMask'
import { getInsights, getDashboardSummary } from '../services/insights'
import { getFearGreed } from '../services/market'
import { getMonthlyDcaSummary, getLinkedAsset, computeDcaProgress } from '../services/dcaEngine'
import { Link } from 'react-router-dom'

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
  { key: 'all', label: 'MAX', days: null },
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
  const oldest = allMovements.length > 0 ? allMovements[allMovements.length - 1].date : now
  const startDate = range.days ? new Date(now.getTime() - range.days * 86400000) : oldest

  const points = []
  if (range.days && range.days <= 7) {
    for (let i = range.days; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      points.push({ date: d, label: i === 0 ? "Auj." : DAY_NAMES[d.getDay()] + ' ' + d.getDate() })
    }
  } else if (range.days && range.days <= 30) {
    const step = 3
    for (let i = range.days; i >= 0; i -= step) {
      const d = new Date(now.getTime() - i * 86400000)
      points.push({ date: d, label: d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] })
    }
    if (points[points.length - 1]?.date.toDateString() !== now.toDateString()) {
      points.push({ date: now, label: now.getDate() + ' ' + MONTH_NAMES[now.getMonth()] })
    }
  } else if (range.days && range.days <= 180) {
    for (let i = Math.ceil(range.days / 30); i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      if (d >= startDate) points.push({ date: d, label: MONTH_NAMES[d.getMonth()] })
    }
    points.push({ date: now, label: MONTH_NAMES[now.getMonth()] })
  } else {
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

  const result = points.map((p, i) => {
    if (i === points.length - 1) return { month: p.label, value: Math.round(currentTotal) }
    const investedAfter = allMovements
      .filter(mv => mv.date > p.date)
      .reduce((sum, mv) => sum + mv.delta, 0)
    return { month: p.label, value: Math.round(currentTotal - investedAfter) }
  })

  for (let i = 1; i < result.length; i++) {
    if (result[i].month === result[i - 1].month) result[i].month = result[i].month + ' '
  }

  return result.length > 0 ? result : [{ month: MONTH_NAMES[now.getMonth()], value: Math.round(currentTotal) }]
}

function gatherRecentActivities(portfolio) {
  const activities = []
  for (const c of portfolio.crypto) {
    for (const m of (c.movements || [])) {
      activities.push({ type: m.type === 'sell' ? 'sell' : 'buy', asset: c.name || c.symbol, amount: m.quantity * m.price, date: new Date(m.date) })
    }
  }
  for (const p of portfolio.pea) {
    for (const m of (p.movements || [])) {
      activities.push({ type: m.type === 'sell' ? 'sell' : 'buy', asset: p.name || p.symbol, amount: m.quantity * m.price, date: new Date(m.date) })
    }
  }
  for (const l of portfolio.livrets) {
    for (const m of (l.movements || [])) {
      activities.push({ type: m.type === 'withdrawal' ? 'sell' : 'deposit', asset: l.name, amount: m.amount || 0, date: new Date(m.date) })
    }
  }
  activities.sort((a, b) => b.date - a.date)
  return activities.slice(0, 6).map(a => ({ ...a, dateLabel: formatRelativeDate(a.date) }))
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

function GaugeChart({ value, label }) {
  const r = 62
  const cx = 80, cy = 80
  const circumference = Math.PI * r
  const endAngle = Math.PI + (value / 100) * Math.PI
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
        <defs>
          <filter id={`glow-${label}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          className="gauge-bg"
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="var(--border)" strokeWidth="10" strokeLinecap="round"
        />
        {value > 0 && (
          <path
            className="gauge-arc"
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none" stroke={c} strokeWidth="10" strokeLinecap="round"
            style={{ '--gauge-color': c }}
            filter={`url(#glow-${label})`}
          />
        )}
        <text x={cx} y={cy - 10} textAnchor="middle" fill="var(--text-primary)" fontSize="22" fontWeight="700" className="gauge-value">
          {value}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill={c} fontSize="8" fontWeight="600" className="gauge-sentiment">
          {getLabel(value)}
        </text>
      </svg>
      <span className="gauge-label">{label}</span>
    </div>
  )
}

export default function Dashboard() {
  const { portfolio, totals, dcaPlans } = usePortfolio()
  const { accountBalances, aggregates, healthScore, coachInsights } = useBank() || {}
  const { isGuest } = useAuth()
  const { m, mp } = usePrivacyMask()
  const [fearGreed, setFearGreed] = useState({ crypto: 0, market: 0 })
  const [insight, setInsight] = useState(null)
  const [insightLoading, setInsightLoading] = useState(true)
  const [analysis, setAnalysis] = useState(null)

  useEffect(() => {
    if (isGuest) {
      setInsightLoading(false)
      return
    }

    getFearGreed()
      .then(res => {
        const d = res.data
        setFearGreed({
          crypto: d.crypto?.value ?? 0,
          market: d.stock?.value ?? 0,
        })
      })
      .catch(() => {})

    getInsights()
      .then(res => {
        const data = res.data
        const summary = data.insights?.summary || data.summary || data.content
        if (summary) setInsight(summary)
      })
      .catch(() => {})
      .finally(() => setInsightLoading(false))
  }, [isGuest])

  // Load dashboard-specific compact analysis (independent from Insights page)
  // Use totals.total as stable dependency to avoid infinite loops
  useEffect(() => {
    if (isGuest || !portfolio || !totals.total) return
    const portfolioData = {
      crypto: portfolio.crypto || [],
      pea: portfolio.pea || [],
      livrets: portfolio.livrets || [],
      fundraising: portfolio.fundraising || [],
      totals,
    }
    getDashboardSummary(portfolioData)
      .then(res => {
        if (res.data.synthesis) setAnalysis(res.data)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.total])

  const [cryptoPeriod, setCryptoPeriod] = useState('max')
  const [peaPeriod, setPeaPeriod] = useState('max')
  const [timeRange, setTimeRange] = useState('6m')
  const perfData = buildPortfolioHistory(portfolio, totals, timeRange)
  const recentActivities = gatherRecentActivities(portfolio)

  // Include bank-imported livrets in total
  const bankLivrets = (accountBalances || []).filter(a => a.type !== 'courant').reduce((s, a) => s + a.balance, 0)
  const totalLivrets = totals.livrets + bankLivrets
  const totalLivretCount = portfolio.livrets.length + (accountBalances || []).filter(a => a.type !== 'courant').length

  const allocationData = [
    { name: 'Crypto', value: totals.crypto, color: '#3b82f6' },
    { name: 'PEA', value: totals.pea, color: '#10b981' },
    { name: 'Livrets', value: totalLivrets, color: '#f59e0b' },
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

  const totalGain = totals.total + bankLivrets - totalLivrets - totals.fundraising - totalInvested

  const cryptoInvested = portfolio.crypto.reduce((sum, c) => sum + c.buyPrice * c.quantity, 0)
  const cryptoGainPct = cryptoInvested > 0 ? ((totals.crypto - cryptoInvested) / cryptoInvested) * 100 : 0
  const peaInvested = portfolio.pea.reduce((sum, p) => sum + p.buyPrice * p.quantity, 0)
  const peaGainPct = peaInvested > 0 ? ((totals.pea - peaInvested) / peaInvested) * 100 : 0

  // Bank data
  const bankTotal = (accountBalances || []).filter(a => a.type === 'courant').reduce((s, a) => s + a.balance, 0)
  const lastAgg = aggregates?.[aggregates.length - 1]
  const monthIncome = lastAgg?.income || 0
  const monthExpenses = lastAgg?.expenses || 0
  const monthSavings = monthIncome - monthExpenses
  const monthFees = coachInsights?.fees?.total || 0
  const patrimoineNet = totals.total + bankLivrets + bankTotal

  // DCA summary
  const dcaSummary = useMemo(() => {
    const plans = dcaPlans?.plans || []
    const enabled = plans.filter(p => p.enabled)
    if (enabled.length === 0) return null
    const t = new Date().toISOString().slice(0, 10)
    const currentMonth = t.slice(0, 7)
    let totalInvested = 0, totalExpected = 0, onTrack = 0
    const nextDates = []
    for (const plan of enabled) {
      const asset = getLinkedAsset(plan, portfolio)
      const prog = computeDcaProgress(plan, asset, t)
      totalInvested += prog.actual_contribution
      totalExpected += prog.expected_contribution
      if (prog.on_track || prog.status === 'ahead') onTrack++
      if (prog.upcoming_dates?.[0]) nextDates.push({
        date: prog.upcoming_dates[0], label: plan.label, amount: plan.amount_per_period,
      })
    }
    nextDates.sort((a, b) => a.date.localeCompare(b.date))
    const monthly = getMonthlyDcaSummary(enabled, portfolio, currentMonth)
    return {
      totalInvested, totalExpected, onTrack, total: enabled.length,
      nextDates: nextDates.slice(0, 3),
      monthPlanned: monthly.planned_total, monthActual: monthly.actual_total,
    }
  }, [dcaPlans, portfolio])

  return (
    <div className="dashboard">
      {/* ═══ Hero ═══ */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-content">
          <p className="dashboard-hero-label">Valeur totale du portefeuille</p>
          <p className="dashboard-total">{m(fmt(totals.total + bankLivrets))}</p>
          <span className={`dashboard-hero-badge ${totalGain >= 0 ? 'dashboard-hero-badge--up' : 'dashboard-hero-badge--down'}`}>
            {totalGain >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {m(fmt(totalGain))} depuis le début
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

      {/* ═══ Stat Cards ═══ */}
      <div className="dashboard-stats">
        <div className="dash-stat" style={{ '--stat-accent': 'var(--accent)' }}>
          <div className="dash-stat-header">
            <div className="dash-stat-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
              <Wallet size={17} />
            </div>
            <span className="dash-stat-label">Total Crypto</span>
          </div>
          <div className="dash-stat-value">{m(fmt(totals.crypto))}</div>
          {(() => {
            const PERIODS = [{ key: '1h', label: '1h' },{ key: '24h', label: '24h' },{ key: '7d', label: '7j' },{ key: '30d', label: '30j' },{ key: '1y', label: '1a' },{ key: 'max', label: 'Max' }]
            let pct
            if (cryptoPeriod === 'max') { pct = cryptoGainPct }
            else {
              const pKey = { '1h': 'change1h', '24h': 'change24h', '7d': 'change7d', '30d': 'change30d', '1y': 'change1y' }[cryptoPeriod]
              const sum = portfolio.crypto.reduce((acc, c) => {
                const v = c[pKey]; if (v == null) return acc
                return { eur: acc.eur + (v / 100) * (c.currentPrice || 0) * c.quantity, n: acc.n + 1 }
              }, { eur: 0, n: 0 })
              pct = sum.n > 0 && totals.crypto > 0 ? (sum.eur / totals.crypto) * 100 : null
            }
            return (
              <>
                <div className={`dash-stat-sub ${(pct ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>{pct != null ? mp(fmtPct(pct)) : '—'}</div>
                <div className="change-period-selector change-period-selector--compact">
                  {PERIODS.map(p => (
                    <button key={p.key} className={`change-period-btn${cryptoPeriod === p.key ? ' active' : ''}`}
                      onClick={() => setCryptoPeriod(p.key)}>{p.label}</button>
                  ))}
                </div>
              </>
            )
          })()}
        </div>

        <div className="dash-stat" style={{ '--stat-accent': 'var(--success)' }}>
          <div className="dash-stat-header">
            <div className="dash-stat-icon" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
              <TrendingUp size={17} />
            </div>
            <span className="dash-stat-label">Total PEA</span>
          </div>
          <div className="dash-stat-value">{m(fmt(totals.pea))}</div>
          {(() => {
            let pct
            if (peaPeriod === 'max') { pct = peaGainPct }
            else if (peaPeriod === '24h') {
              const sum = portfolio.pea.reduce((acc, p) => {
                const prev = p.previousClose; if (prev == null) return acc
                return acc + ((p.currentPrice || p.buyPrice) - prev) * p.quantity
              }, 0)
              pct = totals.pea > 0 ? (sum / totals.pea) * 100 : null
            } else { pct = null }
            return (
              <>
                <div className={`dash-stat-sub ${(pct ?? 0) >= 0 ? 'text-success' : 'text-danger'}`}>{pct != null ? mp(fmtPct(pct)) : '—'}</div>
                <div className="change-period-selector change-period-selector--compact">
                  {[{ key: '1h', label: '1h' },{ key: '24h', label: '24h' },{ key: '7d', label: '7j' },{ key: '30d', label: '30j' },{ key: '1y', label: '1a' },{ key: 'max', label: 'Max' }].map(p => (
                    <button key={p.key} className={`change-period-btn${peaPeriod === p.key ? ' active' : ''}`}
                      onClick={() => setPeaPeriod(p.key)}>{p.label}</button>
                  ))}
                </div>
              </>
            )
          })()}
        </div>

        <div className="dash-stat" style={{ '--stat-accent': 'var(--warning)' }}>
          <div className="dash-stat-header">
            <div className="dash-stat-icon" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
              <Activity size={17} />
            </div>
            <span className="dash-stat-label">Épargne</span>
          </div>
          <div className="dash-stat-value">{m(fmt(totalLivrets))}</div>
          <div className="dash-stat-sub text-muted">{totalLivretCount} livret{totalLivretCount > 1 ? 's' : ''}</div>
        </div>

        <div className="dash-stat" style={{ '--stat-accent': '#8b5cf6' }}>
          <div className="dash-stat-header">
            <div className="dash-stat-icon" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
              <Award size={17} />
            </div>
            <span className="dash-stat-label">Levées</span>
          </div>
          <div className="dash-stat-value">{m(fmt(totals.fundraising))}</div>
          <div className="dash-stat-sub text-muted">{portfolio.fundraising.length} projets</div>
        </div>
      </div>

      {/* ═══ Bank & Patrimoine Cards ═══ */}
      {(accountBalances?.length > 0 || bankTotal !== 0) && (
        <div className="dashboard-stats">
          <div className="dash-stat" style={{ '--stat-accent': '#06b6d4' }}>
            <div className="dash-stat-header">
              <div className="dash-stat-icon" style={{ background: 'rgba(6, 182, 212, 0.12)', color: '#06b6d4' }}>
                <CreditCard size={17} />
              </div>
              <span className="dash-stat-label">Cashflow du mois</span>
            </div>
            <div className="dash-stat-value" style={{ color: monthSavings >= 0 ? 'var(--success)' : 'var(--danger)' }}>{m(fmt(monthSavings))}</div>
            <div className="dash-stat-sub text-muted">{m(fmt(monthIncome))} entrées · {m(fmt(monthExpenses))} sorties</div>
          </div>

          <div className="dash-stat" style={{ '--stat-accent': '#3b82f6' }}>
            <div className="dash-stat-header">
              <div className="dash-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                <Landmark size={17} />
              </div>
              <span className="dash-stat-label">Solde bancaire</span>
            </div>
            <div className="dash-stat-value">{m(fmt(bankTotal))}</div>
            <div className="dash-stat-sub text-muted">{(accountBalances || []).filter(a => a.type === 'courant').length} compte(s)</div>
          </div>

          <div className="dash-stat" style={{ '--stat-accent': '#dc2626' }}>
            <div className="dash-stat-header">
              <div className="dash-stat-icon" style={{ background: 'rgba(220, 38, 38, 0.12)', color: '#dc2626' }}>
                <AlertTriangle size={17} />
              </div>
              <span className="dash-stat-label">Frais détectés</span>
            </div>
            <div className="dash-stat-value" style={{ color: 'var(--danger)' }}>{m(fmt(monthFees))}</div>
            <div className="dash-stat-sub"><Link to="/banking" style={{ color: 'var(--accent)', fontSize: '0.75rem' }}>Voir l'analyse →</Link></div>
          </div>

          <div className="dash-stat" style={{ '--stat-accent': '#10b981' }}>
            <div className="dash-stat-header">
              <div className="dash-stat-icon" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                <Heart size={17} />
              </div>
              <span className="dash-stat-label">Patrimoine net</span>
            </div>
            <div className="dash-stat-value">{m(fmt(patrimoineNet))}</div>
            {healthScore != null && <div className="dash-stat-sub" style={{ color: healthScore >= 60 ? 'var(--success)' : 'var(--warning)' }}>Score santé : {healthScore}/100</div>}
          </div>
        </div>
      )}

      {/* ═══ Charts ═══ */}
      <div className="dashboard-charts">
        <div className="dash-card">
          <div className="dash-card-title">Allocation du portefeuille</div>
          <div className="dashboard-pie-row">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={allocationData} cx={95} cy={95} innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                  {allocationData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => m(fmt(v))} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '0.82rem' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="dashboard-legend">
              {allocationData.map((item) => (
                <div key={item.name} className="dashboard-legend-item">
                  <span className="dashboard-legend-dot" style={{ background: item.color }} />
                  <div>
                    <div className="legend-name">{item.name}</div>
                    <div className="legend-detail">{m(fmt(item.value))} · {mp(`${(((item.value) / (totals.total + bankLivrets)) * 100).toFixed(1)}%`)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="dash-card">
          <div className="perf-chart-header">
            <div className="dash-card-title">Performance</div>
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
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [m(fmt(v)), 'Valeur']} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '0.82rem' }} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ Fear & Greed + Activity ═══ */}
      <div className="dashboard-middle">
        <div className="dash-card">
          <div className="dash-card-title">Fear & Greed Index</div>
          <div className="dashboard-gauges">
            <GaugeChart value={fearGreed.crypto} label="Crypto" />
            <GaugeChart value={fearGreed.market} label="Marchés" />
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-title">Activité récente</div>
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
                  <span className="activity-date">{a.dateLabel}</span>
                </div>
                <span className={`activity-amount ${a.type === 'sell' ? 'text-danger' : 'text-success'}`}>
                  {m(`${a.type === 'sell' ? '-' : '+'}${fmt(a.amount)}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ DCA Synthèse ═══ */}
      {dcaSummary && (
        <div className="dash-card dca-dashboard-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={15} style={{ color: 'var(--accent)' }} />
              <span className="dash-card-title" style={{ margin: 0 }}>Plans DCA</span>
            </div>
            <Link to="/dca" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Voir les plans →</Link>
          </div>

          <div className="dca-dash-stats">
            <div className="dca-dash-stat">
              <div className="dca-dash-stat-label">Versé total</div>
              <div className="dca-dash-stat-value">{m(fmt(dcaSummary.totalInvested))}</div>
            </div>
            <div className="dca-dash-stat">
              <div className="dca-dash-stat-label">Dans les temps</div>
              <div className="dca-dash-stat-value" style={{ color: dcaSummary.onTrack === dcaSummary.total ? 'var(--success)' : 'var(--warning)' }}>
                {dcaSummary.onTrack}/{dcaSummary.total}
              </div>
            </div>
            <div className="dca-dash-stat">
              <div className="dca-dash-stat-label">Ce mois prévu</div>
              <div className="dca-dash-stat-value">{m(fmt(dcaSummary.monthPlanned))}</div>
            </div>
            <div className="dca-dash-stat">
              <div className="dca-dash-stat-label">Ce mois versé</div>
              <div className="dca-dash-stat-value"
                style={{ color: dcaSummary.monthActual >= dcaSummary.monthPlanned ? 'var(--success)' : 'var(--warning)' }}>
                {m(fmt(dcaSummary.monthActual))}
              </div>
            </div>
          </div>

          {dcaSummary.nextDates.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Prochains :</span>
              {dcaSummary.nextDates.map((d, i) => (
                <span key={i} className="dca-upcoming-chip">
                  {new Date(d.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  {' · '}{d.label}{' · '}{fmt(d.amount)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Insight + Performers ═══ */}
      <div className="dashboard-bottom">
        <div className="dash-card dashboard-insight-card">
          <div className="flex items-center gap-8 mb-8">
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
            <span className="insight-tag">Synthèse marché IA</span>
          </div>
          {insightLoading ? (
            <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 8 }} />
          ) : insight ? (
            <>
              <p className="insight-text">{typeof insight === 'string' ? insight.slice(0, 300) : 'Analyse disponible'}...</p>
              <Link to="/insights" className="insight-link">
                Voir l'analyse complète <span>→</span>
              </Link>
            </>
          ) : (
            <p className="text-muted text-sm">Configurez l'IA pour obtenir des insights.</p>
          )}
        </div>

        <div className="dash-card performer-card performer-card--best">
          <div className="flex items-center gap-8 mb-8">
            <Award size={14} style={{ color: 'var(--success)' }} />
            <span className="performer-tag" style={{ color: 'var(--success)' }}>Top performer</span>
          </div>
          {best && (
            <>
              <div className="performer-name">{best.name}</div>
              <div className="performer-gain text-success">{fmtPct(best.gain)}</div>
            </>
          )}
        </div>

        <div className="dash-card performer-card performer-card--worst">
          <div className="flex items-center gap-8 mb-8">
            <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
            <span className="performer-tag" style={{ color: 'var(--danger)' }}>Worst performer</span>
          </div>
          {worst && (
            <>
              <div className="performer-name">{worst.name}</div>
              <div className="performer-gain text-danger">{fmtPct(worst.gain)}</div>
            </>
          )}
        </div>
      </div>

      {/* ═══ AI Analysis Inline ═══ */}
      {analysis && (
        <div className="dashboard-analysis-row">
          {analysis.synthesis && (
            <div className="dashboard-analysis-item">
              <div className="analysis-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                <TrendingUp size={14} />
              </div>
              <span className="analysis-text">{analysis.synthesis}</span>
            </div>
          )}
          {analysis.diversification && (
            <div className="dashboard-analysis-item">
              <div className="analysis-icon" style={{ background: 'var(--success-light)', color: 'var(--success)' }}>
                <BarChart3 size={14} />
              </div>
              <span className="analysis-text">{analysis.diversification}</span>
            </div>
          )}
          {analysis.overexposures && (
            <div className="dashboard-analysis-item">
              <div className="analysis-icon" style={{ background: 'var(--warning-light)', color: 'var(--warning)' }}>
                <Shield size={14} />
              </div>
              <span className="analysis-text">{analysis.overexposures}</span>
            </div>
          )}
          {analysis.recommendations && (
            <div className="dashboard-analysis-item">
              <div className="analysis-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                <Lightbulb size={14} />
              </div>
              <span className="analysis-text">{analysis.recommendations}</span>
            </div>
          )}
          <div className="analysis-link">
            <Link to="/insights">Voir l'analyse complète →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
