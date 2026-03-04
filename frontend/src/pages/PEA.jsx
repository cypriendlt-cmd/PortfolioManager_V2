import { useState, useCallback, useMemo } from 'react'
import {
  Plus, X, Trash2, RefreshCw, Loader2,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  ArrowUpRight, ArrowDownLeft,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { usePortfolio } from '../context/PortfolioContext'
import { usePriceRefresh } from '../hooks/usePriceRefresh'
import { usePrivacyMask } from '../hooks/usePrivacyMask'
import { searchISIN } from '../services/priceService'

const fmt = (n) => n != null ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n) : '\u2014'
const fmtPct = (n) => n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '\u2014'
const fmtTime = (d) => d ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d) : null
const fmtDate = (d) => new Intl.DateTimeFormat('fr-FR').format(new Date(d))

/* ===== Running PRU per movement ===== */
function computeRunningPRU(movements) {
  let cumQty = 0, cumCost = 0
  return movements.map(mv => {
    if (mv.type === 'buy') {
      cumQty += mv.quantity
      cumCost += mv.quantity * mv.price + (mv.fees || 0)
    } else {
      const oldQty = cumQty
      cumQty = Math.max(cumQty - mv.quantity, 0)
      if (oldQty > 0) cumCost = cumCost * (cumQty / oldQty)
    }
    return cumQty > 0 ? cumCost / cumQty : 0
  })
}

function buildChartData(asset) {
  const movements = [...(asset.movements || [])].sort((a, b) => a.date.localeCompare(b.date))
  if (movements.length === 0) return []
  let cumQty = 0, cumCost = 0
  const points = []
  for (const mv of movements) {
    if (mv.type === 'buy') { cumQty += mv.quantity; cumCost += mv.quantity * mv.price + (mv.fees || 0) }
    else { cumQty = Math.max(cumQty - mv.quantity, 0) }
    points.push({ date: mv.date, invested: Math.round(cumCost * 100) / 100, value: Math.round(cumQty * (asset.currentPrice || mv.price) * 100) / 100 })
  }
  const today = new Date().toISOString().slice(0, 10)
  if (points[points.length - 1]?.date !== today) {
    points.push({ date: today, invested: cumCost, value: Math.round(cumQty * (asset.currentPrice || asset.buyPrice) * 100) / 100 })
  }
  return points
}

/* ===== Add Modal ===== */
function AddPeaModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ isin: '', name: '', quantity: '', buyPrice: '', buyDate: '' })
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  const handleIsinBlur = useCallback(async () => {
    const isin = form.isin.trim()
    if (isin.length < 10) return
    setSearching(true)
    setSearchError(null)
    try {
      const result = await searchISIN(isin)
      if (result && result.name) {
        setForm(f => ({ ...f, name: f.name || result.name }))
      }
    } catch {
      setSearchError('Impossible de recuperer le nom (ISIN inconnu ou erreur reseau)')
    } finally {
      setSearching(false)
    }
  }, [form.isin])

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({
      ...form,
      quantity: parseInt(form.quantity),
      buyPrice: parseFloat(form.buyPrice),
      currentPrice: parseFloat(form.buyPrice),
    })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Ajouter une position PEA</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">ISIN</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                placeholder="FR0000120271"
                required
                value={form.isin}
                onChange={e => setForm({ ...form, isin: e.target.value.toUpperCase() })}
                onBlur={handleIsinBlur}
              />
              {searching && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                </span>
              )}
            </div>
            {searchError && <p style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 4 }}>{searchError}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">Nom</label>
            <input className="form-input" placeholder="TotalEnergies" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-2 gap-16">
            <div className="form-group">
              <label className="form-label">Quantite</label>
              <input className="form-input" type="number" min="1" required value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Prix d'achat (EUR)</label>
              <input className="form-input" type="number" step="0.01" required value={form.buyPrice}
                onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Date d'achat</label>
            <input className="form-input" type="date" required value={form.buyDate}
              onChange={e => setForm({ ...form, buyDate: e.target.value })} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">Ajouter</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ===== Movement Form ===== */
function MovementForm({ peaId, onAdd }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const qty = parseFloat(quantity)
    const px = parseFloat(price)
    if (!qty || qty <= 0 || !px || px <= 0) return
    onAdd(peaId, { date, type, quantity: qty, price: px, fees: parseFloat(fees) || 0 })
    setQuantity('')
    setPrice('')
    setFees('')
  }

  return (
    <form onSubmit={handleSubmit} className="pea-movement-form">
      <input type="date" className="form-input pea-form-date" value={date} onChange={e => setDate(e.target.value)} />
      <div className="pea-type-toggle">
        <button type="button" className={type === 'buy' ? 'active-buy' : ''} onClick={() => setType('buy')}>
          <ArrowDownLeft size={12} />Achat
        </button>
        <button type="button" className={type === 'sell' ? 'active-sell' : ''} onClick={() => setType('sell')}>
          <ArrowUpRight size={12} />Vente
        </button>
      </div>
      <input type="number" className="form-input pea-form-qty" step="1" min="1" placeholder="Qte" required value={quantity} onChange={e => setQuantity(e.target.value)} />
      <input type="number" className="form-input pea-form-price" step="0.01" min="0.01" placeholder="Prix" required value={price} onChange={e => setPrice(e.target.value)} />
      <input type="number" className="form-input pea-form-fees" step="0.01" min="0" placeholder="Frais" value={fees} onChange={e => setFees(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm"><Plus size={14} /> Ajouter</button>
    </form>
  )
}

/* ===== Performance Chart ===== */
function PerformanceChart({ asset }) {
  const data = useMemo(() => buildChartData(asset), [asset])

  if (data.length < 2) {
    return <div className="pea-chart-empty">Pas assez de donnees pour afficher le graphique (min. 2 points)</div>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--text-muted)" />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--text-muted)" tickFormatter={v => `${v} \u20AC`} />
        <Tooltip
          contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: '0.8rem' }}
          formatter={(value) => [fmt(value)]}
          labelFormatter={(label) => fmtDate(label)}
        />
        <Line type="monotone" dataKey="invested" name="Investissement" stroke="var(--accent)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="value" name="Valeur" stroke="var(--success)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ===== Accordion Card ===== */
const PEA_PERIODS = [
  { key: '1h', label: '1h' },
  { key: '24h', label: '24h' },
  { key: '7d', label: '7j' },
  { key: '30d', label: '30j' },
  { key: '1y', label: '1a' },
  { key: 'max', label: 'Max' },
]

function getPeaChange(asset, period, gain, gainPct) {
  if (period === 'max') return { eur: gain, pct: gainPct }
  // Only J-1 (24h) is available via previousClose
  if (period === '24h' && asset.previousClose != null) {
    const cur = asset.currentPrice || asset.buyPrice
    const eur = (cur - asset.previousClose) * asset.quantity
    const pct = asset.previousClose > 0 ? ((cur - asset.previousClose) / asset.previousClose) * 100 : 0
    return { eur, pct }
  }
  return { eur: null, pct: null }
}

function PeaCard({ asset, isExpanded, onToggle, onDelete, onAddMovement, onDeleteMovement }) {
  const { m, mp } = usePrivacyMask()
  const [changePeriod, setChangePeriod] = useState('max')
  const current = asset.currentPrice || asset.buyPrice
  const totalValue = current * asset.quantity
  // Compute totalInvested from movements for accuracy
  const rawMovements = asset.movements || []
  const totalInvested = rawMovements.length > 0
    ? rawMovements.reduce((sum, mv) => mv.type === 'buy' ? sum + mv.quantity * mv.price + (mv.fees || 0) : sum, 0)
    : asset.buyPrice * asset.quantity
  const gain = totalValue - totalInvested
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0
  // Sort movements chronologically for display
  const movements = [...rawMovements].sort((a, b) => a.date.localeCompare(b.date))
  const prusPerMovement = computeRunningPRU(movements)
  const currentPRU = prusPerMovement.length > 0 ? prusPerMovement[prusPerMovement.length - 1] : asset.buyPrice
  const borderClass = gain > 0 ? 'pea-card--positive' : gain < 0 ? 'pea-card--negative' : 'pea-card--neutral'

  return (
    <div className={`pea-card ${borderClass}`}>
      {/* Collapsed header */}
      <div className="pea-card-header" onClick={onToggle}>
        <div className="pea-card-left">
          <span className="pea-card-name">{asset.name || 'Sans nom'}</span>
          <span className="pea-card-isin">{asset.isin}</span>
        </div>
        <div className="pea-card-middle">
          <span>{asset.quantity} x {fmt(current)}</span>
          <span style={{ margin: '0 4px' }}>=</span>
          <span className="pea-total-value">{m(fmt(totalValue))}</span>
        </div>
        <div className="pea-card-right">
          <span className={`badge ${gain >= 0 ? 'badge-success' : 'badge-danger'}`}>
            {gain >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {m(fmt(gain))} ({mp(fmtPct(gainPct))})
          </span>
          <div className="pea-card-chevron">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </div>

      {/* Summary stats — always visible */}
      <div className="pea-card-summary">
        <div className="pea-summary-item">
          <span className="pea-summary-label">Investi</span>
          <span className="pea-summary-value">{m(fmt(totalInvested))}</span>
        </div>
        <div className="pea-summary-item">
          <span className="pea-summary-label">PRU</span>
          <span className="pea-summary-value">{m(fmt(currentPRU))}</span>
        </div>
        <div className="pea-summary-item">
          <span className="pea-summary-label">Valeur actuelle</span>
          <span className="pea-summary-value font-semibold">{m(fmt(totalValue))}</span>
        </div>
        <div className="pea-summary-item">
          <span className="pea-summary-label">+/- value</span>
          <span className={`pea-summary-value font-semibold ${gain >= 0 ? 'text-success' : 'text-danger'}`}>
            {m(`${gain >= 0 ? '+' : ''}${fmt(gain)}`)}
          </span>
        </div>
        <div className="pea-summary-item">
          <span className="pea-summary-label">Performance</span>
          <span className={`pea-summary-value font-semibold ${gainPct >= 0 ? 'text-success' : 'text-danger'}`}>
            {mp(fmtPct(gainPct))}
          </span>
        </div>
        <div className="pea-summary-item pea-summary-item--change">
          <div className="change-period-selector">
            {PEA_PERIODS.map(p => (
              <button key={p.key} className={`change-period-btn${changePeriod === p.key ? ' active' : ''}`}
                onClick={e => { e.stopPropagation(); setChangePeriod(p.key) }}>{p.label}</button>
            ))}
          </div>
          {(() => {
            const { eur, pct } = getPeaChange(asset, changePeriod, gain, gainPct)
            if (pct == null) return <span className="pea-summary-value">—</span>
            return (
              <span className={`pea-summary-value font-semibold ${pct >= 0 ? 'text-success' : 'text-danger'}`}>
                {m(`${eur >= 0 ? '+' : ''}${fmt(eur)}`)} ({mp(fmtPct(pct))})
              </span>
            )
          })()}
        </div>
      </div>

      {/* Expanded body */}
      <div className={`pea-card-body ${isExpanded ? 'pea-card-body--open' : ''}`}>
        <div className="pea-card-body-inner">
          {/* Market Data */}
          <div>
            <h4 className="pea-movements-title">Donnees de marche</h4>
            <div className="pea-market-grid">
              <div className="pea-market-box">
                <div className="pea-market-box-label">Ouverture</div>
                <div className="pea-market-box-value">{fmt(asset.openPrice)}</div>
              </div>
              <div className="pea-market-box">
                <div className="pea-market-box-label">Clot. prec.</div>
                <div className="pea-market-box-value">{fmt(asset.previousClose)}</div>
              </div>
              <div className="pea-market-box">
                <div className="pea-market-box-label">Haut</div>
                <div className="pea-market-box-value">{fmt(asset.dayHigh)}</div>
              </div>
              <div className="pea-market-box">
                <div className="pea-market-box-label">Bas</div>
                <div className="pea-market-box-value">{fmt(asset.dayLow)}</div>
              </div>
            </div>
          </div>

          {/* Movements */}
          <div>
            <div className="flex items-center justify-between">
              <h4 className="pea-movements-title">Mouvements</h4>
              <button className="btn btn-danger btn-sm" onClick={() => onDelete(asset.id)}>
                <Trash2 size={14} /> Supprimer la position
              </button>
            </div>
            {movements.length > 0 && (
              <div className="pea-movements-scroll">
                <table className="pea-movements-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Qte</th>
                      <th>Prix</th>
                      <th>PRU</th>
                      <th className="pea-col-fees">Frais</th>
                      <th className="pea-col-total">Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((mv, idx) => {
                      const total = mv.quantity * mv.price + (mv.fees || 0)
                      return (
                        <tr key={`${mv.date}-${mv.type}-${mv.quantity}-${mv.price}-${idx}`}>
                          <td>{fmtDate(mv.date)}</td>
                          <td>
                            <span className={mv.type === 'buy' ? 'pea-badge-buy' : 'pea-badge-sell'}>
                              {mv.type === 'buy' ? <><ArrowDownLeft size={10} />Achat</> : <><ArrowUpRight size={10} />Vente</>}
                            </span>
                          </td>
                          <td className="font-mono">{mv.quantity}</td>
                          <td className="font-mono">{fmt(mv.price)}</td>
                          <td className="font-mono text-muted">{prusPerMovement[idx] > 0 ? fmt(prusPerMovement[idx]) : '—'}</td>
                          <td className="font-mono pea-col-fees">{fmt(mv.fees || 0)}</td>
                          <td className="font-mono font-semibold pea-col-total">{m(fmt(total))}</td>
                          <td>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onDeleteMovement(asset.id, rawMovements.indexOf(mv))}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {movements.length === 0 && (
              <p className="text-sm text-muted" style={{ marginBottom: 8 }}>Aucun mouvement enregistre.</p>
            )}
            <MovementForm peaId={asset.id} onAdd={onAddMovement} />
          </div>

          {/* Chart */}
          <div className="pea-chart-container">
            <h4 className="pea-chart-title">Performance</h4>
            <PerformanceChart asset={asset} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== Main Page ===== */
export default function PEA() {
  const { portfolio, totals, addPea, deletePea, addPeaMovement, deletePeaMovement, pricesLastUpdated } = usePortfolio()
  const { isRefreshing, refreshNow } = usePriceRefresh()
  const { m, mp } = usePrivacyMask()
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [headerPeriod, setHeaderPeriod] = useState('max')

  const totalInvested = portfolio.pea.reduce((s, p) => s + p.buyPrice * p.quantity, 0)
  const totalGain = totals.pea - totalInvested
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0

  return (
    <div className="animate-fade-in">
      {/* Header card */}
      <div className="card mb-24" style={{ background: 'var(--gradient-card)', borderColor: 'var(--border-strong)' }}>
        <div className="pea-header-top">
          <div>
            <p className="stat-label">Valeur totale PEA</p>
            <p className="stat-value" style={{ fontSize: '2.5rem', marginTop: 4 }}>{m(fmt(totals.pea))}</p>
            <div className="flex items-center gap-12 mt-8" style={{ flexWrap: 'wrap' }}>
              {(() => {
                let aggEur, aggPct
                if (headerPeriod === 'max') {
                  aggEur = totalGain; aggPct = totalGainPct
                } else if (headerPeriod === '24h') {
                  aggEur = portfolio.pea.reduce((sum, p) => {
                    const prev = p.previousClose
                    if (prev == null) return sum
                    return sum + ((p.currentPrice || p.buyPrice) - prev) * p.quantity
                  }, 0)
                  aggPct = totals.pea > 0 ? (aggEur / totals.pea) * 100 : 0
                } else {
                  aggEur = null; aggPct = null
                }
                return (
                  <>
                    <span className={`badge ${(aggPct ?? 0) >= 0 ? 'badge-success' : 'badge-danger'}`}>
                      {(aggPct ?? 0) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {aggEur != null ? `${m(fmt(aggEur))} (${mp(fmtPct(aggPct))})` : '—'}
                    </span>
                    <div className="change-period-selector">
                      {PEA_PERIODS.map(p => (
                        <button key={p.key} className={`change-period-btn${headerPeriod === p.key ? ' active' : ''}`}
                          onClick={() => setHeaderPeriod(p.key)}>{p.label}</button>
                      ))}
                    </div>
                  </>
                )
              })()}
              <span className="text-sm text-muted">Investi: {m(fmt(totalInvested))}</span>
            </div>
          </div>
          <div className="pea-header-actions">
            {pricesLastUpdated && (
              <span className="text-xs text-muted">
                Mis a jour {fmtTime(pricesLastUpdated)}
              </span>
            )}
            <button
              className="btn btn-secondary"
              onClick={refreshNow}
              disabled={isRefreshing}
            >
              {isRefreshing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={16} />}
              Rafraichir
            </button>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* Asset list */}
      <div className="flex flex-col gap-16">
        {portfolio.pea.map(p => (
          <PeaCard
            key={p.id}
            asset={p}
            isExpanded={expandedId === p.id}
            onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            onDelete={deletePea}
            onAddMovement={addPeaMovement}
            onDeleteMovement={deletePeaMovement}
          />
        ))}

        {portfolio.pea.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><TrendingUp /></div>
            <h3>Aucune position PEA</h3>
            <p>Ajoutez vos actions pour suivre votre portefeuille PEA.</p>
            <button className="btn btn-primary mt-16" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Ajouter une position
            </button>
          </div>
        )}
      </div>

      {showModal && <AddPeaModal onClose={() => setShowModal(false)} onAdd={addPea} />}
    </div>
  )
}
