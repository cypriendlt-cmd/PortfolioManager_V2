import { useState } from 'react'
import { Plus, TrendingUp, TrendingDown, Trash2, X } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtPct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`

function AddPeaModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ isin: '', name: '', quantity: '', buyPrice: '', buyDate: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({ ...form, quantity: parseInt(form.quantity), buyPrice: parseFloat(form.buyPrice), currentPrice: parseFloat(form.buyPrice) })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Ajouter une position</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">ISIN</label>
            <input className="form-input" placeholder="FR0000120271" required value={form.isin} onChange={e => setForm({ ...form, isin: e.target.value.toUpperCase() })} />
          </div>
          <div className="form-group">
            <label className="form-label">Nom</label>
            <input className="form-input" placeholder="TotalEnergies" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-2 gap-16">
            <div className="form-group">
              <label className="form-label">Quantité</label>
              <input className="form-input" type="number" min="1" required value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Prix d'achat (€)</label>
              <input className="form-input" type="number" step="0.01" required value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
            </div>
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

export default function PEA() {
  const { portfolio, totals, addPea, deletePea } = usePortfolio()
  const [showModal, setShowModal] = useState(false)

  const totalInvested = portfolio.pea.reduce((s, p) => s + p.buyPrice * p.quantity, 0)
  const totalGain = totals.pea - totalInvested
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0

  return (
    <div className="animate-fade-in">
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
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Ajouter
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>ISIN</th>
                <th>Qté</th>
                <th>Prix achat</th>
                <th>Prix actuel</th>
                <th>Valeur</th>
                <th>Gain/Perte</th>
                <th>Perf.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
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
