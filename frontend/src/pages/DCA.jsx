import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Calculator, TrendingUp, Calendar, Play, BellRing,
  Plus, Trash2, Edit3, Link2, Unlink, ChevronDown, ChevronUp,
  CheckCircle, AlertTriangle, Clock, Pause, BarChart2, Target
} from 'lucide-react'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'
import { usePortfolio } from '../context/PortfolioContext'
import {
  computeDcaProgress, computeExtendedSeries, futureLookAheadForRange,
  matchPlanToAsset, getLinkedAsset,
  fmtScheduledDate, fmtShortDate,
  migrateLegacyConfig,
} from '../services/dcaEngine'

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}).format(v ?? 0)
const fmtD = (v) => new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
}).format(v ?? 0)
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${(v ?? 0).toFixed(1)}%`
const today = () => new Date().toISOString().slice(0, 10)

// ─── Simulation DCA projetée (non reliée au réel) ─────────────────────────────
function simulateDca(monthlyAmount, totalMonths, annualRate, initialAmount = 0) {
  const r = Math.pow(1 + annualRate / 100, 1 / 12) - 1
  const rows = []
  for (let i = 1; i <= totalMonths; i++) {
    const invested = initialAmount + monthlyAmount * i
    const init     = initialAmount * Math.pow(1 + r, i)
    const dca      = r === 0 ? monthlyAmount * i
      : monthlyAmount * ((Math.pow(1 + r, i) - 1) / r) * (1 + r)
    rows.push({ month: i, invested, projectedValue: Math.round(init + dca) })
  }
  return rows
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  on_track: { label: 'Dans les temps', color: '#22c55e', Icon: CheckCircle },
  behind:   { label: 'En retard',      color: '#ef4444', Icon: AlertTriangle },
  ahead:    { label: 'En avance',      color: '#3b82f6', Icon: TrendingUp },
  paused:   { label: 'En pause',       color: '#94a3b8', Icon: Pause },
  pending:  { label: 'En attente',     color: '#f59e0b', Icon: Clock },
}
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <span className="dca-status-badge" style={{ background: cfg.color + '20', color: cfg.color }}>
      <cfg.Icon size={11} /> {cfg.label}
    </span>
  )
}

// ─── Jauge discipline ─────────────────────────────────────────────────────────
function DisciplineBar({ score }) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div className="dca-discipline-wrap">
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        Discipline
      </span>
      <div className="dca-discipline-track">
        <div style={{ width: `${score}%`, background: color, borderRadius: 99, height: '100%',
          transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color, minWidth: 32, textAlign: 'right' }}>
        {score}/100
      </span>
    </div>
  )
}

// ─── Sélecteur d'actif portfolio ──────────────────────────────────────────────
function AssetPicker({ portfolio, accountType, onSelect, onCancel }) {
  const list = accountType === 'crypto' ? portfolio.crypto : portfolio.pea
  return (
    <div className="dca-asset-picker">
      <div className="dca-asset-picker-title">Sélectionner l'actif à lier</div>
      {(list || []).length === 0 && (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 0' }}>
          Aucun actif {accountType === 'crypto' ? 'crypto' : 'PEA'} trouvé.
        </div>
      )}
      <div className="dca-asset-picker-list">
        {(list || []).map(asset => (
          <button key={asset.id} className="dca-asset-picker-item"
            onClick={() => onSelect(asset.id, accountType === 'crypto' ? 'crypto' : 'pea')}>
            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{asset.name}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 6 }}>
              {asset.symbol || asset.isin || ''}
            </span>
          </button>
        ))}
      </div>
      <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: '0.78rem' }} onClick={onCancel}>
        Annuler
      </button>
    </div>
  )
}

// ─── Sélecteur d'échelle temporelle ───────────────────────────────────────────
const CHART_RANGES = ['6M', '1Y', '2Y', '5Y', 'Max']

// ─── Carte plan DCA ───────────────────────────────────────────────────────────
const CHART_LINES = [
  { key: 'Investi',            label: 'Investi',            color: 'var(--text-muted)' },
  { key: 'Projection',        label: 'Projection plan',    color: '#22c55e' },
  { key: 'Réel',              label: 'Réel',               color: 'var(--accent)' },
  { key: 'Tendance',          label: 'Tendance',           color: '#f59e0b' },
  { key: 'ProjectionRéelle',  label: 'Projection réelle',  color: '#a855f7' },
]

function PlanCard({ plan, progress, asset, onEdit, onDelete, onLink, onUnlink }) {
  const [expanded, setExpanded] = useState(false)
  const [timeRange, setTimeRange] = useState('1Y')
  const [visibleLines, setVisibleLines] = useState(() =>
    ({ Investi: true, Projection: true, Réel: true, Tendance: true, ProjectionRéelle: true })
  )
  const isLinked = !!plan.asset_link
  const toggleLine = (key) => setVisibleLines(v => ({ ...v, [key]: !v[key] }))

  // Série étendue : recalculée quand timeRange change (pour graph + table)
  const extendedSeries = useMemo(() => {
    if (!isLinked || !asset) return progress?.monthly_series || []
    const futureLookAhead = futureLookAheadForRange(timeRange, plan.end_date)
    return computeExtendedSeries(plan, asset, today(), futureLookAhead)
  }, [plan, asset, isLinked, timeRange, progress])

  const chartData = useMemo(() => {
    if (extendedSeries.length === 0) return []
    const pastRows = extendedSeries.filter(r => !r.future)
    const nPast    = pastRows.length
    const lastReal = nPast > 0 ? pastRows[nPast - 1] : null
    const avgContrib = lastReal && nPast > 0 ? lastReal.cumul_actual / nPast : null

    // Projection avec rendement composé
    const annualRate = plan.annual_return_estimate || 0
    const r = annualRate > 0 ? Math.pow(1 + annualRate / 100, 1 / 12) - 1 : 0
    const monthlyAmount = plan.amount_per_period || 0

    let futureIdx = 0
    return extendedSeries.map((row, i) => {
      const monthIdx = i + 1
      const pt = { name: row.month, Investi: row.cumul_expected, Réel: row.cumul_actual }
      // Projection plan = valeur projetée avec intérêts composés sur contributions prévues
      if (r > 0 && monthIdx > 0) {
        const projectedValue = monthlyAmount * ((Math.pow(1 + r, monthIdx) - 1) / r) * (1 + r)
        pt.Projection = Math.round(projectedValue)
      }
      if (row.future && avgContrib !== null) {
        futureIdx++
        // Tendance = extrapolation linéaire du rythme actuel
        pt.Tendance = Math.round(lastReal.cumul_actual + avgContrib * futureIdx)
        // Projection réelle = rendement composé appliqué sur la tendance réelle
        if (r > 0) {
          const growthOnExisting = lastReal.cumul_actual * Math.pow(1 + r, futureIdx)
          const growthOnFuture   = avgContrib * ((Math.pow(1 + r, futureIdx) - 1) / r) * (1 + r)
          pt.ProjectionRéelle = Math.round(growthOnExisting + growthOnFuture)
        }
      } else if (!row.future && r > 0 && row.cumul_actual > 0) {
        // Pour les mois passés : projection réelle = appliquer le rendement aux contributions réelles
        // On recalcule comme si chaque contribution réelle avait grandi
        pt.ProjectionRéelle = pt.Réel // passé = valeur réelle (pas de projection rétroactive)
      }
      return pt
    })
  }, [extendedSeries, progress?.status, plan])

  const tableRows = extendedSeries

  const cadenceLabel = plan.cadence === 'weekly' ? '/sem'
    : plan.cadence === 'biweekly' ? '/2 sem' : '/mois'

  return (
    <div className={`dca-plan-card ${!plan.enabled ? 'dca-plan-card--paused' : ''}`}>

      {/* ── En-tête ── */}
      <div className="dca-plan-header">
        <div className="dca-plan-header-left">
          <span className="dca-plan-name">{plan.label}</span>
          {progress && <StatusBadge status={progress.status} />}
        </div>
        <div className="dca-plan-header-right">
          <span className="dca-plan-amount">{fmt(plan.amount_per_period)}{cadenceLabel}</span>
          <button className="btn btn-ghost btn-icon" onClick={() => setExpanded(v => !v)} title="Détails">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        {plan.account_type?.toUpperCase()} · Jour {plan.day_of_month}
        · depuis {new Date(plan.start_date + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
        {asset && <span style={{ marginLeft: 6, color: 'var(--success)' }}>· {asset.name}</span>}
      </div>

      {/* ── Lien actif manquant ── */}
      {!isLinked && (
        <div className="dca-link-prompt">
          <Link2 size={13} style={{ color: 'var(--warning)' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1 }}>
            Aucun actif lié — liez cet actif pour voir la progression réelle.
          </span>
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
            onClick={onLink}>
            Lier
          </button>
        </div>
      )}

      {/* ── Stats progression (si lié) ── */}
      {isLinked && progress && (
        <>
          {/* Barre progression */}
          <div className="dca-progress-wrap">
            <div className="dca-progress-track">
              <div className="dca-progress-bar"
                style={{ width: `${progress.expected_contribution > 0
                  ? Math.min((progress.actual_contribution / progress.expected_contribution) * 100, 100) : 0}%` }} />
            </div>
            <span className="dca-progress-pct">
              {progress.expected_contribution > 0
                ? Math.round((progress.actual_contribution / progress.expected_contribution) * 100)
                : 0}%
            </span>
          </div>

          {/* Métriques */}
          <div className="dca-stats-row">
            <div className="dca-stat">
              <div className="dca-stat-label">Attendu</div>
              <div className="dca-stat-value">{fmt(progress.expected_contribution)}</div>
            </div>
            <div className="dca-stat">
              <div className="dca-stat-label">Versé</div>
              <div className="dca-stat-value">{fmt(progress.actual_contribution)}</div>
            </div>
            <div className="dca-stat">
              <div className="dca-stat-label">Écart</div>
              <div className="dca-stat-value"
                style={{ color: progress.contribution_gap >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {progress.contribution_gap >= 0 ? '+' : ''}{fmt(progress.contribution_gap)}
              </div>
            </div>
            <div className="dca-stat">
              <div className="dca-stat-label">Valeur</div>
              <div className="dca-stat-value">{fmt(progress.current_value)}</div>
            </div>
            <div className="dca-stat">
              <div className="dca-stat-label">PnL</div>
              <div className="dca-stat-value"
                style={{ color: progress.pnl_eur >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmtPct(progress.pnl_pct)}
              </div>
            </div>
          </div>

          <DisciplineBar score={progress.discipline_score} />
        </>
      )}

      {/* ── Prochaines dates ── */}
      {progress?.upcoming_dates?.length > 0 && (
        <div className="dca-upcoming">
          <Calendar size={11} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Prochains :</span>
          {progress.upcoming_dates.map(d => (
            <span key={d} className="dca-upcoming-chip">{fmtShortDate(d)}</span>
          ))}
        </div>
      )}

      {/* ── Détails expandés ── */}
      {expanded && (
        <div className="dca-expanded">

          {/* Graph contributions cumulées */}
          {isLinked && chartData.length > 0 && (
            <div className="dca-chart-wrap">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Projection DCA ({plan.annual_return_estimate || 0}% /an)
                </span>
                <div className="dca-time-range-selector">
                  {CHART_RANGES.map(r => (
                    <button key={r}
                      className={`dca-time-range-btn${timeRange === r ? ' active' : ''}`}
                      onClick={() => setTimeRange(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              {/* Toggles pour afficher/masquer les courbes */}
              <div className="dca-chart-toggles">
                {CHART_LINES.map(({ key, label, color }) => (
                  <button key={key} className={`dca-chart-toggle${visibleLines[key] ? ' active' : ''}`}
                    style={{ '--toggle-color': color }}
                    onClick={() => toggleLine(key)}>
                    <span className="dca-toggle-dot" />
                    {label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id={`gradInv-${plan.plan_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--text-muted)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--text-muted)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gradReel-${plan.plan_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gradTend-${plan.plan_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gradProj-${plan.plan_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gradProjR-${plan.plan_id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickFormatter={v => v.slice(2)} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={36} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.75rem' }}
                    formatter={(val, name) => [val != null ? fmt(val) : '—', name]}
                  />
                  {visibleLines.Investi && (
                    <Area type="monotone" dataKey="Investi" stroke="var(--text-muted)"
                      fill={`url(#gradInv-${plan.plan_id})`} strokeWidth={1.5} strokeDasharray="4 2"
                      dot={false} name="Investi" />
                  )}
                  {visibleLines.Projection && (
                    <Area type="monotone" dataKey="Projection" stroke="#22c55e"
                      fill={`url(#gradProj-${plan.plan_id})`} strokeWidth={2} dot={false}
                      name={`Projection plan (${plan.annual_return_estimate || 0}%)`} />
                  )}
                  {visibleLines.Réel && (
                    <Area type="monotone" dataKey="Réel" stroke="var(--accent)"
                      fill={`url(#gradReel-${plan.plan_id})`} strokeWidth={2} dot={false}
                      connectNulls={false} name="Réel" />
                  )}
                  {visibleLines.Tendance && (
                    <Area type="monotone" dataKey="Tendance" stroke="#f59e0b"
                      fill={`url(#gradTend-${plan.plan_id})`} strokeWidth={1.5} strokeDasharray="6 3"
                      dot={false} connectNulls={false} name="Tendance actuelle" />
                  )}
                  {visibleLines.ProjectionRéelle && (
                    <Area type="monotone" dataKey="ProjectionRéelle" stroke="#a855f7"
                      fill={`url(#gradProjR-${plan.plan_id})`} strokeWidth={2} strokeDasharray="6 3"
                      dot={false} connectNulls={false} name="Projection réelle" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tableau lignes planifiées + réelles */}
          {tableRows.length > 0 && (
            <div className="dca-lines-table-wrap">
              <div style={{ fontSize: '0.78rem', fontWeight: 600, margin: '12px 0 6px', color: 'var(--text-secondary)' }}>
                Lignes planifiées
              </div>
              <div className="dca-lines-table-scroll">
                <table className="dca-lines-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Prévu</th>
                      <th>Réel</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, i) => (
                      <tr key={i} className={row.future ? 'dca-row-future' : ''}>
                        <td>{new Date(row.date + 'T00:00:00').toLocaleDateString('fr-FR', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}</td>
                        <td>{fmt(row.expected)}</td>
                        <td>{row.actual != null ? fmt(row.actual) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td>
                          {row.future
                            ? <span className="dca-row-chip dca-row-chip--future"><Calendar size={9} /> Planifié</span>
                            : row.actual > 0
                              ? <span className="dca-row-chip dca-row-chip--ok"><CheckCircle size={9} /> Exécuté</span>
                              : <span className="dca-row-chip dca-row-chip--miss"><AlertTriangle size={9} /> Manqué</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="dca-plan-actions">
        {isLinked && (
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
            onClick={onUnlink} title="Délier l'actif">
            <Unlink size={12} /> Délier
          </button>
        )}
        <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={onEdit}>
          <Edit3 size={12} /> Modifier
        </button>
        <button className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'var(--danger)' }}
          onClick={onDelete}>
          <Trash2 size={12} /> Supprimer
        </button>
      </div>
    </div>
  )
}

// ─── Formulaire création / édition plan ───────────────────────────────────────
const EMPTY_FORM = {
  label:                  '',
  account_type:           'pea',
  cadence:                'monthly',
  day_of_month:           1,
  amount_per_period:      100,
  start_date:             new Date().toISOString().slice(0, 10),
  end_date:               '',
  annual_return_estimate: 8,
  asset_target: { isin: '', symbol: '', name: '', coingecko_id: '' },
  notes:                  '',
}

function PlanForm({ initial, portfolio, onSave, onCancel }) {
  const [form, setForm] = useState(() => initial
    ? {
        ...EMPTY_FORM, ...initial,
        asset_target: { ...EMPTY_FORM.asset_target, ...(initial.asset_target || {}) },
        end_date: initial.end_date || '',
      }
    : { ...EMPTY_FORM })

  const [showSim, setShowSim] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setTarget = (k, v) => setForm(f => ({ ...f, asset_target: { ...f.asset_target, [k]: v } }))

  // Chargement depuis un actif portfolio existant
  const fillFromAsset = (asset, acctType) => {
    if (acctType === 'crypto') {
      setTarget('name', asset.name || '')
      setTarget('symbol', asset.symbol || '')
      setTarget('coingecko_id', asset.coingeckoId || asset.coinId || '')
      set('account_type', 'crypto')
      if (!form.label) set('label', `DCA ${asset.name}`)
    } else {
      setTarget('name', asset.name || '')
      setTarget('symbol', asset.symbol || '')
      setTarget('isin', asset.isin || '')
      set('account_type', 'pea')
      if (!form.label) set('label', `DCA ${asset.name}`)
    }
    // Start date = première date d'achat de l'actif (premier movement)
    const first = (asset.movements || []).filter(m => m.type === 'buy').sort((a, b) => a.date.localeCompare(b.date))[0]
    if (first && !initial) set('start_date', first.date)
  }

  // Simulation projetée
  const totalMonths = useMemo(() => {
    if (!form.end_date) return 24
    const ms = new Date(form.end_date) - new Date(form.start_date)
    return Math.max(1, Math.round(ms / (30.44 * 86400000)))
  }, [form.start_date, form.end_date])

  const simData = useMemo(() => {
    if (!showSim || form.amount_per_period <= 0) return []
    return simulateDca(form.amount_per_period, totalMonths, form.annual_return_estimate || 8, 0)
      .filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 20)) === 0 || i === arr.length - 1)
  }, [showSim, form.amount_per_period, totalMonths, form.annual_return_estimate])

  const assetList = form.account_type === 'crypto' ? portfolio.crypto : portfolio.pea
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleSave = () => {
    if (!form.label || form.amount_per_period <= 0) return
    const payload = {
      ...form,
      end_date: form.end_date || null,
      asset_target: {
        isin:         form.asset_target.isin || null,
        symbol:       form.asset_target.symbol || null,
        name:         form.asset_target.name || null,
        coingecko_id: form.asset_target.coingecko_id || null,
      },
    }
    onSave(payload)
  }

  return (
    <div className="dca-plan-form">
      <div className="dca-form-title">{initial ? 'Modifier le plan' : 'Nouveau plan DCA'}</div>

      {/* Sélection actif portfolio */}
      <div className="dca-form-group full-width">
        <label>Actif ciblé — depuis mon portefeuille</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={form.account_type}
            onChange={e => { set('account_type', e.target.value); setPickerOpen(false) }}
            style={{ flex: '0 0 auto', padding: '6px 10px', fontSize: '0.82rem', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <option value="pea">PEA / ETF / Action</option>
            <option value="crypto">Crypto</option>
          </select>
          <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            type="button" onClick={() => setPickerOpen(v => !v)}>
            <Link2 size={12} /> {form.asset_target.name ? `Lié : ${form.asset_target.name}` : 'Choisir dans le portefeuille'}
          </button>
          {form.asset_target.name && (
            <button className="btn btn-ghost" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}
              type="button" onClick={() => setForm(f => ({ ...f, asset_target: EMPTY_FORM.asset_target }))}>
              <Unlink size={11} /> Effacer
            </button>
          )}
        </div>
        {pickerOpen && (
          <AssetPicker
            portfolio={portfolio}
            accountType={form.account_type}
            onSelect={(assetId, acctType) => {
              const list = acctType === 'crypto' ? portfolio.crypto : portfolio.pea
              const asset = list.find(a => a.id === assetId)
              if (asset) fillFromAsset(asset, acctType)
              setPickerOpen(false)
            }}
            onCancel={() => setPickerOpen(false)}
          />
        )}
      </div>

      <div className="dca-form-row">
        <div className="dca-form-group">
          <label>Nom du plan</label>
          <input type="text" placeholder="ex: ETF S&P 500 PEA"
            value={form.label} onChange={e => set('label', e.target.value)} />
        </div>
        <div className="dca-form-group">
          <label>Montant ({form.cadence === 'weekly' ? 'hebdo' : form.cadence === 'biweekly' ? 'bi-hebdo' : 'mensuel'}) €</label>
          <input type="number" min="1" value={form.amount_per_period}
            onChange={e => set('amount_per_period', Number(e.target.value))} />
        </div>
      </div>

      <div className="dca-form-row">
        <div className="dca-form-group">
          <label>Cadence</label>
          <select value={form.cadence} onChange={e => set('cadence', e.target.value)}>
            <option value="monthly">Mensuel</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="biweekly">Bi-hebdomadaire</option>
          </select>
        </div>
        {form.cadence === 'monthly' && (
          <div className="dca-form-group">
            <label>Jour du mois (1-28)</label>
            <input type="number" min="1" max="28" value={form.day_of_month}
              onChange={e => set('day_of_month', Math.max(1, Math.min(28, Number(e.target.value))))} />
          </div>
        )}
      </div>

      <div className="dca-form-row">
        <div className="dca-form-group">
          <label>Date de début</label>
          <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="dca-form-group">
          <label>Date de fin (optionnel)</label>
          <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
        </div>
      </div>

      <div className="dca-form-row">
        <div className="dca-form-group">
          <label>Rendement annuel estimé (%)</label>
          <input type="number" step="0.1" value={form.annual_return_estimate}
            onChange={e => set('annual_return_estimate', Number(e.target.value))} />
        </div>
        <div className="dca-form-group">
          <label>Tolérance (jours)</label>
          <input type="number" min="1" max="30"
            value={form.tolerance_days ?? 7}
            onChange={e => set('tolerance_days', Number(e.target.value))} />
        </div>
      </div>

      {/* Simulation projetée */}
      <button className="btn btn-ghost" type="button"
        style={{ fontSize: '0.78rem', marginBottom: 8 }}
        onClick={() => setShowSim(v => !v)}>
        <BarChart2 size={13} /> {showSim ? 'Masquer' : 'Voir'} la projection simulée
      </button>

      {showSim && simData.length > 0 && (
        <div className="dca-chart-wrap" style={{ marginBottom: 12 }}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={simData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                tickFormatter={v => `M${v}`} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={34} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, fontSize: '0.75rem' }}
                formatter={(val, name) => [fmt(val), name === 'invested' ? 'Investi' : 'Projection']} />
              <Line type="monotone" dataKey="invested" stroke="var(--text-muted)"
                strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="invested" />
              <Line type="monotone" dataKey="projectedValue" stroke="var(--accent)"
                strokeWidth={2} dot={false} name="projectedValue" />
            </LineChart>
          </ResponsiveContainer>
          {simData.length > 0 && (() => {
            const last = simData[simData.length - 1]
            return (
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Investi : <strong>{fmt(last.invested)}</strong>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
                  Projection : <strong>{fmt(last.projectedValue)}</strong>
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                  Gain estimé : <strong>{fmt(last.projectedValue - last.invested)}</strong>
                </span>
              </div>
            )
          })()}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" type="button" onClick={handleSave}
          disabled={!form.label || form.amount_per_period <= 0}>
          {initial ? 'Enregistrer' : 'Créer le plan'}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function DCA() {
  const {
    portfolio,
    dcaPlans,
    createDcaPlan, updateDcaPlan, deleteDcaPlan, linkPlanToAsset, unlinkPlan,
    saveDcaSnapshots,
  } = usePortfolio()

  const plans = dcaPlans?.plans || []

  const [showForm, setShowForm]     = useState(false)
  const [editingId, setEditingId]   = useState(null)   // plan_id en édition
  const [linkingId, setLinkingId]   = useState(null)   // plan_id en cours de liaison

  // Auto-relink : si l'asset_link pointe vers un id obsolète, on re-lie via fallback
  useEffect(() => {
    for (const plan of plans) {
      if (!plan.asset_link) {
        console.log(`[DCA] Plan "${plan.label}" — pas de asset_link`)
        continue
      }
      const { portfolio_asset_id, account_type } = plan.asset_link
      const list = account_type === 'crypto' ? portfolio.crypto : portfolio.pea
      console.log(`[DCA] Plan "${plan.label}" — asset_link.id=${portfolio_asset_id}, account_type=${account_type}`)
      console.log(`[DCA] IDs disponibles dans ${account_type}:`, (list || []).map(a => ({ id: a.id, name: a.name, movements: (a.movements || []).length })))
      const exactMatch = (list || []).find(a => a.id === portfolio_asset_id)
      if (exactMatch) {
        console.log(`[DCA] ✅ Lien OK — actif trouvé: "${exactMatch.name}", movements:`, exactMatch.movements)
        continue
      }
      console.log(`[DCA] ❌ ID "${portfolio_asset_id}" introuvable — tentative fallback...`)
      const fallback = getLinkedAsset(plan, portfolio)
      if (fallback) {
        console.log(`[DCA] 🔄 Fallback trouvé: "${fallback.name}" (id=${fallback.id}) — re-link`)
        linkPlanToAsset(plan.plan_id, fallback.id, account_type, plan.asset_link.match_method || 'auto_relink')
      } else {
        console.log(`[DCA] ⚠️ Aucun fallback trouvé, asset_target:`, plan.asset_target)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, portfolio])

  // Calcul progression pour tous les plans (mémoïsé)
  const progressMap = useMemo(() => {
    const map = {}
    const t = today()
    for (const plan of plans) {
      const asset = getLinkedAsset(plan, portfolio)
      console.log(`[DCA progress] Plan "${plan.label}" — asset:`, asset ? `"${asset.name}" (${(asset.movements||[]).length} mvts)` : 'NULL')
      const progress = computeDcaProgress(plan, asset, t)
      console.log(`[DCA progress] → actual=${progress.actual_contribution}, expected=${progress.expected_contribution}, status=${progress.status}`)
      map[plan.plan_id] = progress
    }
    return map
  }, [plans, portfolio])

  // Sauvegarde snapshots Drive à chaque recalcul (série 60 mois + métriques)
  useEffect(() => {
    if (!saveDcaSnapshots || plans.length === 0) return
    const t = today()
    const snapshots = {}
    for (const plan of plans) {
      const prog = progressMap[plan.plan_id]
      if (!prog) continue
      const asset = getLinkedAsset(plan, portfolio)
      const full_series = computeExtendedSeries(plan, asset, t, 60)
      snapshots[plan.plan_id] = {
        plan_id:               plan.plan_id,
        as_of_date:            t,
        expected_contribution: prog.expected_contribution,
        actual_contribution:   prog.actual_contribution,
        contribution_gap:      prog.contribution_gap,
        on_track:              prog.on_track,
        discipline_score:      prog.discipline_score,
        pnl_eur:               prog.pnl_eur,
        pnl_pct:               prog.pnl_pct,
        full_series,
        saved_at:              new Date().toISOString(),
      }
    }
    saveDcaSnapshots({ version: 1, snapshots })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressMap])

  // Handlers
  const handleCreate = useCallback((formData) => {
    const plan_id = createDcaPlan(formData)
    // Si un actif a été sélectionné dans le formulaire, auto-link
    if (formData.asset_target?.name) {
      const match = matchPlanToAsset({ ...formData, plan_id }, portfolio)
      if (match && match.score >= 0.8) {
        linkPlanToAsset(plan_id, match.asset.id, match.account_type, match.method)
      }
    }
    setShowForm(false)
  }, [createDcaPlan, linkPlanToAsset, portfolio])

  const handleEdit = useCallback((formData) => {
    updateDcaPlan(editingId, formData)
    setEditingId(null)
  }, [updateDcaPlan, editingId])

  const handleLink = useCallback((plan_id, asset_id, account_type) => {
    linkPlanToAsset(plan_id, asset_id, account_type, 'manual')
    setLinkingId(null)
  }, [linkPlanToAsset])

  // Résumé global
  const globalStats = useMemo(() => {
    const enabled = plans.filter(p => p.enabled)
    const totalExpected = enabled.reduce((s, p) => s + (progressMap[p.plan_id]?.expected_contribution || 0), 0)
    const totalActual   = enabled.reduce((s, p) => s + (progressMap[p.plan_id]?.actual_contribution || 0), 0)
    const onTrack       = enabled.filter(p => progressMap[p.plan_id]?.on_track).length
    return { totalExpected, totalActual, onTrack, total: enabled.length }
  }, [plans, progressMap])

  const editingPlan = editingId ? plans.find(p => p.plan_id === editingId) : null

  return (
    <div className="dca-page animate-fade-in">
      <div className="dca-page-header">
        <div>
          <h2 style={{ marginBottom: 4 }}>Plans DCA</h2>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            Investissements programmés — plan vs réel
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingId(null) }}>
          <Plus size={14} /> Nouveau plan
        </button>
      </div>

      {/* ── Résumé global ── */}
      {plans.length > 0 && (
        <div className="dca-global-stats">
          <div className="dca-gstat">
            <div className="dca-gstat-label">Versé total</div>
            <div className="dca-gstat-value">{fmt(globalStats.totalActual)}</div>
          </div>
          <div className="dca-gstat">
            <div className="dca-gstat-label">Attendu total</div>
            <div className="dca-gstat-value">{fmt(globalStats.totalExpected)}</div>
          </div>
          <div className="dca-gstat">
            <div className="dca-gstat-label">Écart global</div>
            <div className="dca-gstat-value"
              style={{ color: globalStats.totalActual >= globalStats.totalExpected ? 'var(--success)' : 'var(--danger)' }}>
              {globalStats.totalActual - globalStats.totalExpected >= 0 ? '+' : ''}{fmt(globalStats.totalActual - globalStats.totalExpected)}
            </div>
          </div>
          <div className="dca-gstat">
            <div className="dca-gstat-label">Dans les temps</div>
            <div className="dca-gstat-value" style={{ color: 'var(--success)' }}>
              {globalStats.onTrack}/{globalStats.total}
            </div>
          </div>
        </div>
      )}

      {/* ── Formulaire (nouveau ou édition) ── */}
      {(showForm || editingId) && (
        <div className="dca-card" style={{ marginBottom: 16 }}>
          <PlanForm
            initial={editingPlan || null}
            portfolio={portfolio}
            onSave={editingId ? handleEdit : handleCreate}
            onCancel={() => { setShowForm(false); setEditingId(null) }}
          />
        </div>
      )}

      {/* ── Sélecteur de lien (si déclenchée depuis une carte) ── */}
      {linkingId && (
        <div className="dca-card" style={{ marginBottom: 16 }}>
          {(() => {
            const plan = plans.find(p => p.plan_id === linkingId)
            if (!plan) return null
            return (
              <>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>
                  Lier "{plan.label}" à un actif
                </div>
                <AssetPicker
                  portfolio={portfolio}
                  accountType={plan.account_type}
                  onSelect={(assetId, acctType) => handleLink(linkingId, assetId, acctType)}
                  onCancel={() => setLinkingId(null)}
                />
              </>
            )
          })()}
        </div>
      )}

      {/* ── Liste des plans ── */}
      {plans.length === 0 && !showForm && (
        <div className="dca-empty-state">
          <Target size={40} style={{ opacity: 0.25, display: 'block', margin: '0 auto 16px' }} />
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Aucun plan DCA</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Créez votre premier plan pour relier vos investissements programmés à vos actifs réels.
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Créer un plan
          </button>
        </div>
      )}

      <div className="dca-plans-grid">
        {plans.map(plan => {
          const asset    = getLinkedAsset(plan, portfolio)
          const progress = progressMap[plan.plan_id]
          return (
            <PlanCard
              key={plan.plan_id}
              plan={plan}
              progress={progress}
              asset={asset}
              onEdit={() => { setEditingId(plan.plan_id); setShowForm(false); setLinkingId(null) }}
              onDelete={() => { if (window.confirm(`Supprimer le plan "${plan.label}" ?`)) deleteDcaPlan(plan.plan_id) }}
              onLink={() => { setLinkingId(plan.plan_id); setShowForm(false); setEditingId(null) }}
              onUnlink={() => unlinkPlan(plan.plan_id)}
            />
          )
        })}
      </div>
    </div>
  )
}
