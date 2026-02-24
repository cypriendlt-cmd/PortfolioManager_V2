import { useState } from 'react'
import { Plus, RefreshCw, TrendingUp, TrendingDown, Trash2, X } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import './Crypto.css'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtQty = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 }).format(n)
const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

function AddCryptoModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ symbol: '', name: '', quantity: '', buyPrice: '', buyDate: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({ ...form, quantity: parseFloat(form.quantity), buyPrice: parseFloat(form.buyPrice), currentPrice: parseFloat(form.buyPrice), source: 'manual' })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Ajouter une crypto</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-2 gap-16">
            <div className="form-group">
              <label className="form-label">Symbole</label>
              <input className="form-input" placeholder="BTC" required value={form.symbol} onChange={e => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
            </div>
            <div className="form-group">
              <label className="form-label">Nom</label>
              <input className="form-input" placeholder="Bitcoin" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Quantité</label>
            <input className="form-input" type="number" step="any" placeholder="0.5" required value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Prix d'achat (€)</label>
            <input className="form-input" type="number" step="any" placeholder="30000" required value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Date d'achat</label>
            <input className="form-input" type="date" required value={form.buyDate} onChange={e => setForm({ ...form, buyDate: e.target.value })} />
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

export default function Crypto() {
  const { portfolio, totals, addCrypto, deleteCrypto } = usePortfolio()
  const [showModal, setShowModal] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    await new Promise(r => setTimeout(r, 1500))
    setSyncing(false)
  }

  const totalInvested = portfolio.crypto.reduce((s, c) => s + c.buyPrice * c.quantity, 0)
  const totalGain = totals.crypto - totalInvested
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0

  return (
    <div className="animate-fade-in">
      {/* Header card */}
      <div className="card mb-24" style={{ background: 'var(--gradient-card)', borderColor: 'var(--border-strong)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label">Valeur totale Crypto</p>
            <p className="stat-value" style={{ fontSize: '2.5rem', marginTop: 4 }}>{fmt(totals.crypto)}</p>
            <div className="flex items-center gap-12 mt-8">
              <span className={`badge ${totalGain >= 0 ? 'badge-success' : 'badge-danger'}`}>
                {totalGain >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {fmt(totalGain)} ({fmtPct(totalGainPct)})
              </span>
              <span className="text-sm text-muted">Investi: {fmt(totalInvested)}</span>
            </div>
          </div>
          <div className="flex gap-12">
            <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
              <RefreshCw size={16} className={syncing ? 'animate-pulse' : ''} />
              {syncing ? 'Sync...' : 'Sync Binance'}
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
                <th>Actif</th>
                <th>Quantité</th>
                <th>PRU</th>
                <th>Prix actuel</th>
                <th>Valeur</th>
                <th>Gain/Perte</th>
                <th>Performance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {portfolio.crypto.map(c => {
                const current = c.currentPrice || c.buyPrice
                const value = current * c.quantity
                const gain = (current - c.buyPrice) * c.quantity
                const gainPct = ((current - c.buyPrice) / c.buyPrice) * 100
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="crypto-asset">
                        <div className="crypto-icon">{c.symbol[0]}</div>
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-muted">{c.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono">{fmtQty(c.quantity)}</td>
                    <td className="font-mono">{fmt(c.buyPrice)}</td>
                    <td className="font-mono">{fmt(current)}</td>
                    <td className="font-mono font-semibold">{fmt(value)}</td>
                    <td className={`font-mono font-semibold ${gain >= 0 ? 'text-success' : 'text-danger'}`}>
                      {gain >= 0 ? '+' : ''}{fmt(gain)}
                    </td>
                    <td>
                      <span className={`badge ${gainPct >= 0 ? 'badge-success' : 'badge-danger'}`}>
                        {gainPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {fmtPct(gainPct)}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteCrypto(c.id)}>
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

      {showModal && <AddCryptoModal onClose={() => setShowModal(false)} onAdd={addCrypto} />}
    </div>
  )
}
