import { useState, useEffect, useCallback } from 'react'
import { Brain, RefreshCw, AlertCircle, TrendingUp, Shield, BarChart3, Lightbulb, Cpu, Search, ChevronDown, ChevronUp, Target, DollarSign, Gauge, FileText, Download, PieChart, AlertTriangle } from 'lucide-react'
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

// ─── Monthly Analysis Constants ──────────────────────────────────────────────

const ANALYSIS_RISK_OPTIONS = [
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Modéré' },
  { value: 'high', label: 'Élevé' },
]

const ANALYSIS_AMOUNT_OPTIONS = [
  { value: 100, label: '100€' },
  { value: 1000, label: '1 000€' },
  { value: 2000, label: '2 000€' },
  { value: 5000, label: '5 000€' },
]

const ANALYSIS_HORIZON_OPTIONS = [
  { value: 'short', label: '1-2 ans' },
  { value: 'medium', label: '3-5 ans' },
  { value: 'long', label: '5 ans +' },
]

const ANALYSIS_STYLE_OPTIONS = [
  { value: 'growth', label: 'Growth' },
  { value: 'value', label: 'Value' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'blend', label: 'Blend' },
]

const ANALYSIS_SECTOR_OPTIONS = [
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'diversified', label: 'Diversified' },
]

const ANALYSIS_GEO_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'europe', label: 'Europe' },
  { value: 'global', label: 'Global' },
]

const ANALYSIS_ESG_OPTIONS = [
  { value: 'none', label: 'Aucune' },
  { value: 'light', label: 'ESG léger' },
  { value: 'strict', label: 'ESG strict' },
]

function getRiskColor(score) {
  if (score <= 3) return '#10b981'
  if (score <= 5) return '#f59e0b'
  if (score <= 7) return '#f97316'
  return '#ef4444'
}

const MONTH_LABELS = {
  '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
  '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
  '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre',
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-')
  return `${MONTH_LABELS[month] || month} ${year}`
}

/**
 * Normalize values for fuzzy matching between form values and JSON values.
 */
const HORIZON_ALIASES = {
  'short': ['short', '1-2 years', '1-2 ans', '<2 years'],
  'medium': ['medium', '3-5 years', '3-5 ans'],
  'long': ['long', '5+ years', '5 ans +', '5+ ans', '>5 years'],
}
const RISK_ALIASES = {
  'low': ['low', 'faible'],
  'moderate': ['moderate', 'medium', 'modéré', 'moyen'],
  'high': ['high', 'élevé', 'aggressive'],
}

function fuzzyMatch(formValue, jsonValue, aliasMap) {
  if (!formValue || !jsonValue) return false
  const fv = formValue.toLowerCase().trim()
  const jv = jsonValue.toLowerCase().trim()
  if (fv === jv) return true
  if (aliasMap) {
    const aliases = aliasMap[fv]
    if (aliases && aliases.some(a => a.toLowerCase() === jv)) return true
  }
  return false
}

/**
 * Compute a match score between user profile and an analysis profile from the manifest.
 * Higher score = better match. Each matching field adds points, weighted by importance.
 */
function computeMatchScore(userProfile, analysisProfile) {
  let score = 0
  // Risk tolerance — most important (weight 4)
  if (fuzzyMatch(userProfile.risk, analysisProfile.riskTolerance, RISK_ALIASES)) score += 4
  // Style — very important (weight 3)
  if (userProfile.style?.toLowerCase() === analysisProfile.style?.toLowerCase()) score += 3
  // Amount — important (weight 2), also reward closest amount
  const analysisAmount = analysisProfile.investmentAmount ?? analysisProfile.amount ?? 1000
  if (userProfile.amount === analysisAmount) {
    score += 2
  } else {
    const ratio = Math.min(userProfile.amount, analysisAmount) / Math.max(userProfile.amount, analysisAmount)
    score += ratio // 0 to 1 partial credit
  }
  // Horizon (weight 2)
  if (fuzzyMatch(userProfile.horizon, analysisProfile.horizon, HORIZON_ALIASES)) score += 2
  // Sector (weight 2)
  const analysisSectors = (analysisProfile.preferredSectors || analysisProfile.sectors || []).map(s => s.toLowerCase())
  if (analysisSectors.includes(userProfile.sector?.toLowerCase())) score += 2
  // Geography (weight 1.5)
  if (userProfile.geo?.toLowerCase() === analysisProfile.geography?.toLowerCase()) score += 1.5
  // ESG (weight 1)
  if (userProfile.esg?.toLowerCase() === analysisProfile.esg?.toLowerCase()) score += 1
  return score
}

// ─── Monthly Analysis Component ─────────────────────────────────────────────

function MonthlyAnalysis() {
  const [profile, setProfile] = useState({
    risk: 'medium',
    amount: 1000,
    horizon: 'long',
    style: 'growth',
    sector: 'technology',
    geo: 'global',
    esg: 'none',
  })
  const [availableMonths, setAvailableMonths] = useState([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [manifest, setManifest] = useState(null)
  const [analysisData, setAnalysisData] = useState(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [matchInfo, setMatchInfo] = useState(null) // info about the best match
  const [expandedStock, setExpandedStock] = useState(null)

  // Load available months on mount
  useEffect(() => {
    fetch('./data/analyses/index.json')
      .then(r => r.ok ? r.json() : Promise.reject('Index introuvable'))
      .then(data => {
        const months = data.months || []
        setAvailableMonths(months)
        setSelectedMonth(data.latest || months[0] || '')
      })
      .catch(() => {
        const now = new Date()
        const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        setAvailableMonths([current])
        setSelectedMonth(current)
      })
  }, [])

  // Load manifest whenever selectedMonth changes
  useEffect(() => {
    if (!selectedMonth) return
    fetch(`./data/analyses/${selectedMonth}/manifest.json`)
      .then(r => r.ok ? r.json() : Promise.reject('no manifest'))
      .then(data => setManifest(data))
      .catch(() => setManifest(null))
  }, [selectedMonth])

  const updateProfile = (key, value) => {
    setProfile(prev => ({ ...prev, [key]: value }))
  }

  const handleLoadAnalysis = useCallback(async () => {
    if (!selectedMonth) return
    setAnalysisLoading(true)
    setAnalysisError(null)
    setAnalysisData(null)
    setExpandedStock(null)
    setMatchInfo(null)

    try {
      // If we have a manifest, use best-match logic
      if (manifest?.analyses?.length > 0) {
        let bestMatch = null
        let bestScore = -1
        for (const entry of manifest.analyses) {
          const score = computeMatchScore(profile, entry.profile)
          if (score > bestScore) {
            bestScore = score
            bestMatch = entry
          }
        }

        if (bestMatch) {
          const url = `./data/analyses/${selectedMonth}/${bestMatch.file}`
          const res = await fetch(url)
          if (res.ok) {
            const data = await res.json()
            setAnalysisData(data)
            // Compute max possible score for match quality display
            const maxScore = 4 + 3 + 2 + 2 + 2 + 1.5 + 1 // 15.5
            const matchPct = Math.round((bestScore / maxScore) * 100)
            const isExact = matchPct >= 95
            setMatchInfo({ file: bestMatch.file, score: bestScore, pct: matchPct, isExact })
            return
          }
        }
      }

      // Fallback: no manifest, try direct file name convention
      const fileName = `analysis_${profile.risk}_${profile.style}_${profile.amount}.json`
      const url = `./data/analyses/${selectedMonth}/${fileName}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('not_found')
      const data = await res.json()
      setAnalysisData(data)
      setMatchInfo({ file: fileName, pct: 100, isExact: true })
    } catch {
      setAnalysisError('Aucune analyse disponible pour ce profil ce mois-ci. Les analyses sont mises à jour régulièrement par l\'administrateur.')
    } finally {
      setAnalysisLoading(false)
    }
  }, [selectedMonth, manifest, profile])

  // Auto-load when profile or manifest changes
  useEffect(() => {
    if (manifest) handleLoadAnalysis()
  }, [profile, manifest, handleLoadAnalysis])

  const handleDownloadPdf = () => {
    if (!analysisData?.reportFile) return
    window.open(analysisData.reportFile, '_blank')
  }

  // Resolve label from profile data
  const profileLabel = (options, val) => options.find(o => o.value === val)?.label || val

  return (
    <div className="monthly-analysis-section">
      {/* Header */}
      <div className="monthly-analysis-header">
        <div className="monthly-analysis-header-left">
          <div className="monthly-analysis-icon">
            <BarChart3 size={22} />
          </div>
          <div>
            <h2 className="monthly-analysis-title">Analyses du mois</h2>
            <p className="monthly-analysis-subtitle">Rapports d'investissement pré-générés selon votre profil</p>
          </div>
        </div>
        {availableMonths.length > 1 ? (
          <select
            className="screener-select"
            value={selectedMonth}
            onChange={e => { setSelectedMonth(e.target.value); setAnalysisData(null); setAnalysisError(null); setMatchInfo(null) }}
            style={{ width: 'auto', minWidth: 160 }}
          >
            {availableMonths.map(m => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
          </select>
        ) : selectedMonth ? (
          <span className="monthly-analysis-month-badge">{formatMonthLabel(selectedMonth)}</span>
        ) : null}
      </div>

      {/* Profile form */}
      <div className="screener-form">
        <div className="screener-form-grid">
          <div className="screener-field">
            <label className="screener-label">Tolérance au risque</label>
            <select className="screener-select" value={profile.risk} onChange={e => updateProfile('risk', e.target.value)}>
              {ANALYSIS_RISK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Montant investi</label>
            <select className="screener-select" value={profile.amount} onChange={e => updateProfile('amount', Number(e.target.value))}>
              {ANALYSIS_AMOUNT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Horizon</label>
            <select className="screener-select" value={profile.horizon} onChange={e => updateProfile('horizon', e.target.value)}>
              {ANALYSIS_HORIZON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Style d'investissement</label>
            <select className="screener-select" value={profile.style} onChange={e => updateProfile('style', e.target.value)}>
              {ANALYSIS_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Secteurs</label>
            <select className="screener-select" value={profile.sector} onChange={e => updateProfile('sector', e.target.value)}>
              {ANALYSIS_SECTOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Zone géographique</label>
            <select className="screener-select" value={profile.geo} onChange={e => updateProfile('geo', e.target.value)}>
              {ANALYSIS_GEO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="screener-field">
            <label className="screener-label">Contraintes ESG</label>
            <select className="screener-select" value={profile.esg} onChange={e => updateProfile('esg', e.target.value)}>
              {ANALYSIS_ESG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="screener-actions">
          <button className="btn btn-primary screener-analyze-btn" onClick={handleLoadAnalysis} disabled={analysisLoading || !selectedMonth}>
            {analysisLoading
              ? (<><RefreshCw size={16} className="animate-pulse" /> Chargement...</>)
              : (<><Search size={16} /> Voir l'analyse</>)}
          </button>
        </div>
      </div>

      {/* Error state */}
      {analysisError && (
        <div className="card mt-16" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'var(--warning)' }}>
          <div className="flex items-center gap-12">
            <AlertCircle size={18} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            <p className="text-sm" style={{ margin: 0, color: 'var(--text-primary)' }}>{analysisError}</p>
          </div>
        </div>
      )}

      {/* Match info banner */}
      {matchInfo && !matchInfo.isExact && analysisData && (
        <div className="monthly-analysis-match-banner">
          <AlertCircle size={14} />
          <span>Meilleure correspondance trouvée ({matchInfo.pct}% de match). Le rapport affiché est le plus proche de votre profil.</span>
        </div>
      )}

      {/* Results */}
      {analysisData && !analysisLoading && (
        <div className="monthly-analysis-results">

          {/* ── Profil investisseur ── */}
          <div className="monthly-analysis-profile-card">
            <div className="flex items-center gap-10 mb-12">
              <Target size={18} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0 }}>Profil investisseur</h3>
            </div>
            <div className="monthly-analysis-profile-grid">
              {[
                { label: 'Risque', value: profileLabel(ANALYSIS_RISK_OPTIONS, analysisData.profile?.riskTolerance) },
                { label: 'Montant', value: `${(analysisData.profile?.investmentAmount || analysisData.profile?.amount || 0).toLocaleString('fr-FR')}€` },
                { label: 'Horizon', value: profileLabel(ANALYSIS_HORIZON_OPTIONS, analysisData.profile?.horizon) },
                { label: 'Style', value: profileLabel(ANALYSIS_STYLE_OPTIONS, analysisData.profile?.style), capitalize: true },
                { label: 'Secteurs', value: (analysisData.profile?.preferredSectors || analysisData.profile?.sectors || []).map(s => profileLabel(ANALYSIS_SECTOR_OPTIONS, s)).join(', ') || '—', capitalize: true },
                { label: 'Zone', value: profileLabel(ANALYSIS_GEO_OPTIONS, analysisData.profile?.geography), uppercase: true },
                { label: 'ESG', value: profileLabel(ANALYSIS_ESG_OPTIONS, analysisData.profile?.esg) },
              ].map((tag, i) => (
                <div key={i} className="monthly-analysis-profile-tag">
                  <span className="monthly-analysis-profile-tag-label">{tag.label}</span>
                  <span
                    className="monthly-analysis-profile-tag-value"
                    style={{ textTransform: tag.uppercase ? 'uppercase' : tag.capitalize ? 'capitalize' : 'none' }}
                  >
                    {tag.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Résumé stratégie ── */}
          {analysisData.summary && (
            <div className="card monthly-analysis-strategy-card">
              <div className="flex items-center gap-10 mb-12">
                <Lightbulb size={18} style={{ color: '#f59e0b' }} />
                <h3 style={{ margin: 0 }}>Résumé stratégie</h3>
              </div>
              {analysisData.summary.strategy && (
                <p className="monthly-analysis-strategy-text">{analysisData.summary.strategy}</p>
              )}
              {analysisData.summary.keyInsight && (
                <div className="monthly-analysis-key-insight">
                  <Lightbulb size={14} style={{ flexShrink: 0 }} />
                  <span>{analysisData.summary.keyInsight}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Contexte de marché ── */}
          {analysisData.summary?.marketContext && (
            <div className="card monthly-analysis-context-card">
              <div className="flex items-center gap-10 mb-12">
                <TrendingUp size={18} style={{ color: '#3b82f6' }} />
                <h3 style={{ margin: 0 }}>Contexte de marché</h3>
              </div>
              <p className="monthly-analysis-context-text">{analysisData.summary.marketContext}</p>
            </div>
          )}

          {/* ── Top 10 table ── */}
          {analysisData.top10?.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-10 mb-16">
                <Target size={18} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: 0 }}>Top 10 actions</h3>
              </div>
              <div className="screener-table-wrap">
                <table className="screener-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Entreprise</th>
                      <th>Ticker</th>
                      <th>Secteur</th>
                      <th>P/E</th>
                      <th>Dividende</th>
                      <th>Risque</th>
                      <th>Zone d'entrée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisData.top10.map((stock, i) => (
                      <tr
                        key={i}
                        className={`screener-table-row-clickable${expandedStock === i ? ' screener-table-row-active' : ''}`}
                        onClick={() => setExpandedStock(expandedStock === i ? null : i)}
                      >
                        <td className="font-mono">{stock.rank}</td>
                        <td><strong>{stock.company || stock.name}</strong></td>
                        <td className="font-mono">{stock.ticker || stock.symbol}</td>
                        <td className="text-muted text-sm">{stock.sector}</td>
                        <td className="font-mono">{typeof stock.pe === 'object' ? stock.pe.value : stock.pe}</td>
                        <td className="font-mono">{typeof stock.dividendYield === 'number' ? stock.dividendYield + '%' : stock.dividendYield}</td>
                        <td>
                          <span
                            className="monthly-analysis-risk-badge"
                            style={{ background: `${getRiskColor(stock.riskScore)}15`, color: getRiskColor(stock.riskScore) }}
                          >
                            {stock.riskScore}/10
                          </span>
                        </td>
                        <td className="font-mono text-sm">{stock.entryZone}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {expandedStock != null && (() => {
                const s = analysisData.top10[expandedStock]
                const detail = s.thesis || (typeof s.pe === 'object' ? s.pe.comment : null)
                if (!detail) return null
                return (
                  <div className="monthly-analysis-thesis-box">
                    <strong>{s.ticker || s.symbol}</strong>
                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>—</span>
                    {detail}
                    {typeof s.pe === 'object' && s.pe.sectorAvg && (
                      <span className="text-muted text-sm" style={{ display: 'block', marginTop: 4 }}>
                        P/E secteur moyen : {s.pe.sectorAvg} | Croissance 5a : {s.revenueGrowth5y || '—'} | Stop-loss : {s.stopLoss || '—'}
                      </span>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Allocation portefeuille ── */}
          {analysisData.portfolioAllocation?.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-10 mb-16">
                <PieChart size={18} style={{ color: '#8b5cf6' }} />
                <h3 style={{ margin: 0 }}>Allocation portefeuille</h3>
              </div>
              <div className="monthly-analysis-allocation-grid">
                {analysisData.portfolioAllocation.map((item, i) => {
                  const pct = item.pct ?? item.weightPct ?? 0
                  const label = item.label || item.company || '—'
                  return (
                    <div key={i} className="monthly-analysis-allocation-item">
                      <div className="monthly-analysis-allocation-bar-bg">
                        <div
                          className="monthly-analysis-allocation-bar"
                          style={{ width: `${pct}%`, background: item.color || 'var(--accent)' }}
                        />
                      </div>
                      <div className="monthly-analysis-allocation-info">
                        <span className="monthly-analysis-allocation-label">
                          {item.color && <span className="monthly-analysis-alloc-dot" style={{ background: item.color }} />}
                          {label}
                        </span>
                        <span className="monthly-analysis-allocation-pct font-mono">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Risques ── */}
          {(analysisData.globalRisks?.length > 0 || analysisData.summary?.keyRisks?.length > 0) && (
            <div className="card">
              <div className="flex items-center gap-10 mb-16">
                <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
                <h3 style={{ margin: 0 }}>Principaux risques</h3>
              </div>
              <ul className="monthly-analysis-risks-list">
                {(analysisData.globalRisks || analysisData.summary?.keyRisks || []).map((risk, i) => (
                  <li key={i} className="monthly-analysis-risk-item">
                    <Shield size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Disclaimer ── */}
          {analysisData.disclaimer && (
            <div className="monthly-analysis-disclaimer">
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <p>{analysisData.disclaimer}</p>
            </div>
          )}

          {/* ── Download PDF ── */}
          {analysisData.reportFile && (
            <div className="monthly-analysis-download">
              <button className="btn btn-primary monthly-analysis-download-btn" onClick={handleDownloadPdf}>
                <Download size={18} />
                Télécharger le rapport complet (PDF)
              </button>
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

      {/* ─── Analyses du mois ─────────────────────────── */}
      <div className="screener-divider">
        <div className="screener-divider-line" />
        <span className="screener-divider-label"><BarChart3 size={14} /> Analyses du mois</span>
        <div className="screener-divider-line" />
      </div>

      <MonthlyAnalysis />

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
