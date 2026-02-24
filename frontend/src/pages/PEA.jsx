import { useState, useCallback } from 'react'
import { Plus, TrendingUp, TrendingDown, Trash2, X, RefreshCw, Loader2 } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import { usePriceRefresh } from '../hooks/usePriceRefresh'
import { searchISIN } from '../services/priceService'

const fmt = (n) => n != null ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n) : '—'
const fmtPct = (n) => n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—'
const fmtTime = (d) => d ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d) : null

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
    } catch (err) {
      setSearchError('Impossible de récupérer le nom (ISIN inconnu ou erreur réseau)')
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
            <input
              className="form-input"
              placeholder="TotalEnergies"
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-2 gap-16">
            <div className="form-group">
              <label className="form-label">Quantité</label>
              <input className="form-input" type="number" min="1" required value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Prix d'achat (€)</label>
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

export default function PEA() {
  const { portfolio, totals, addPea, deletePea, pricesLastUpdated } = usePortfolio()
  const { isRefreshing, refreshNow } = usePriceRefresh()
  const [showModal, setShowModal] = useState(false)

  const totalInvested = portfolio.pea.reduce((s, p) => s + p.buyPrice * p.quantity, 0)
  const totalGain = totals.pea - totalInvested
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0

  return (
    <div className="animate-fade-in">
      {/* Header card */}
      <div className="card mb-24" style={{ background: 'var(--gradient-card)', borderColor: 'var(--border-strong)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label">Valeur totale PEA</p>
            <p className="stat-value" style={{ fontSize: '2.5rem', marginTop: 4 }}>{fmt(totals.pea)}</p>
            <div className="flex items-center gap-12 mt-8">
              <span className={`badge ${totalGain >= 0 ? 'badge-success' : 'badge-danger'}`}>
                {totalGain >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {fmt(totalGain)} ({fmtPct(totalGainPct)})
              </span>
              <span className="text-sm text-muted">Investi: {fmt(totalInvested)}</span>
            </div>
          </div>
          <div className="flex gap-12 items-center">
            {pricesLastUpdated && (
              <span className="text-xs text-muted">
                Mis a jour {fmtTime(pricesLastUpdated)}
              </span>
            )}
            <button
              className="btn btn-secondary"
              onClick={refreshNow}
              disabled={isRefreshing}
              title="Rafraichir les prix"
            >
              {isRefreshing
                ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                : <RefreshCw size={16} />
              }
              {isRefreshing ? 'Mise a jour...' : 'Rafraichir'}
            </button>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Ajouter
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>ISIN</th>
                <th>Qte</th>
                <th>Prix achat</th>
                <th>Prix actuel</th>
                <th>Ouverture</th>
                <th>Cloture prev.</th>
                <th>Haut</th>
                <th>Bas</th>
                <th>Gain/Perte €</th>
                <th>Perf. %</th>
                <th>Valeur totale</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {portfolio.pea.length === 0 && (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                    Aucune position. Cliquez sur "Ajouter" pour commencer.
                  </td>
                </tr>
              )}
              {portfolio.pea.map(p => {
                const current = p.currentPrice || p.buyPrice
                const value = current * p.quantity
                const gain = (current - p.buyPrice) * p.quantity
                const gainPct = ((current - p.buyPrice) / p.buyPrice) * 100
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-semibold">{p.name}</div>
                    </td>
                    <td className="font-mono text-muted text-sm">{p.isin}</td>
                    <td className="font-mono">{p.quantity}</td>
                    <td className="font-mono">{fmt(p.buyPrice)}</td>
                    <td className="font-mono font-semibold">
                      {fmt(current)}
                      {isRefreshing && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite', opacity: 0.4, marginLeft: 4, display: 'inline' }} />}
                    </td>
                    <td className="font-mono text-muted">{fmt(p.openPrice)}</td>
                    <td className="font-mono text-muted">{fmt(p.previousClose)}</td>
                    <td className="font-mono text-muted">{fmt(p.dayHigh)}</td>
                    <td className="font-mono text-muted">{fmt(p.dayLow)}</td>
                    <td className={`font-mono font-semibold ${gain >= 0 ? 'text-success' : 'text-danger'}`}>
                      {gain >= 0 ? '+' : ''}{fmt(gain)}
                    </td>
                    <td>
                      <span className={`badge ${gainPct >= 0 ? 'badge-success' : 'badge-danger'}`}>
                        {gainPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {fmtPct(gainPct)}
                      </span>
                    </td>
                    <td className="font-mono font-semibold">{fmt(value)}</td>
                    <td>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deletePea(p.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <AddPeaModal onClose={() => setShowModal(false)} onAdd={addPea} />}
    </div>
  )
}
