import { useState, useEffect } from 'react'
import {
  LineChart, Line, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid
} from 'recharts'
import { TrendingUp, TrendingDown, Wallet, Activity, Award, AlertTriangle } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import './Dashboard.css'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

const PERF_DATA = [
  { month: 'Août', value: 78000 },
  { month: 'Sep', value: 82000 },
  { month: 'Oct', value: 79000 },
  { month: 'Nov', value: 88000 },
  { month: 'Déc', value: 91000 },
  { month: 'Jan', value: 95000 },
  { month: 'Fév', value: 102000 },
]

const ACTIVITIES = [
  { type: 'buy', asset: 'Bitcoin', amount: 1500, date: 'Il y a 2h' },
  { type: 'sell', asset: 'Ethereum', amount: 850, date: 'Hier' },
  { type: 'deposit', asset: 'Livret A', amount: 500, date: 'Il y a 3j' },
  { type: 'buy', asset: 'TotalEnergies', amount: 1100, date: 'Il y a 5j' },
  { type: 'buy', asset: 'Solana', amount: 300, date: 'Il y a 1 sem' },
]

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
            <LineChart data={PERF_DATA}>
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
          <div className="stat-sub text-success">+34.2% depuis achat</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-8 mb-8">
            <TrendingUp size={18} style={{ color: 'var(--success)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Total PEA</span>
          </div>
          <div className="stat-value">{fmt(totals.pea)}</div>
          <div className="stat-sub text-success">+18.6% depuis achat</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-8 mb-8">
            <Activity size={18} style={{ color: 'var(--warning)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Épargne réglementée</span>
          </div>
          <div className="stat-value">{fmt(totals.livrets)}</div>
          <div className="stat-sub">Taux moyen ~3.2%/an</div>
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
          <h3 className="mb-16">Performance 6 mois</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={PERF_DATA}>
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
            {ACTIVITIES.map((a, i) => (
              <div key={i} className="activity-item">
                <div className={`activity-icon activity-icon--${a.type}`}>
                  {a.type === 'buy' ? <TrendingUp size={14} /> : a.type === 'sell' ? <TrendingDown size={14} /> : <Wallet size={14} />}
                </div>
                <div className="activity-info">
                  <span className="activity-asset">{a.asset}</span>
                  <span className="activity-date text-xs text-muted">{a.date}</span>
                </div>
                <span className={`activity-amount ${a.type === 'sell' ? 'text-danger' : 'text-success'}`}>
                  {a.type === 'sell' ? '-' : '+'}{fmt(a.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Best/Worst performers */}
      <div className="grid grid-2 mt-24 gap-20">
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
