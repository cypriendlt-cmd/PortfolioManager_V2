import { useState } from 'react'
import { Plus, X, PiggyBank, Trash2 } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

const LIVRET_TYPES = {
  'livret-a': { label: 'Livret A', rate: 3.0, max: 22950, color: '#3b82f6' },
  'ldds': { label: 'LDDS', rate: 3.0, max: 12000, color: '#10b981' },
  'lep': { label: 'LEP', rate: 5.0, max: 10000, color: '#f59e0b' },
  'cel': { label: 'CEL', rate: 2.0, max: 15300, color: '#8b5cf6' },
  'pel': { label: 'PEL', rate: 2.0, max: 61200, color: '#ef4444' },
}

function AddLivretModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ type: 'livret-a', bank: '', balance: '', customRate: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({ ...form, balance: parseFloat(form.balance), customRate: form.customRate ? parseFloat(form.customRate) : null })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Ajouter un livret</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Type de livret</label>
            <select className="form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {Object.entries(LIVRET_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label} ({val.rate}%)</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Banque</label>
            <input className="form-input" placeholder="Boursorama" required value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Solde (€)</label>
            <input className="form-input" type="number" step="0.01" placeholder="10000" required value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Taux personnalisé (%) — optionnel</label>
            <input className="form-input" type="number" step="0.01" placeholder="Laisser vide pour taux officiel" value={form.customRate} onChange={e => setForm({ ...form, customRate: e.target.value })} />
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

export default function Livrets() {
  const { portfolio, totals, rates, addLivret, deleteLivret } = usePortfolio()
  const [showModal, setShowModal] = useState(false)

  const totalAnnualInterest = portfolio.livrets.reduce((s, l) => {
    const r = l.customRate || rates[l.type] || 3.0
    return s + l.balance * (r / 100)
  }, 0)

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="grid grid-3 mb-24 gap-20">
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Total épargne réglementée</p>
              <p className="stat-value" style={{ fontSize: '2rem', marginTop: 4 }}>{fmt(totals.livrets)}</p>
              <p className="stat-sub mt-8">Intérêts annuels estimés: <strong style={{ color: 'var(--success)' }}>{fmt(totalAnnualInterest)}</strong></p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Ajouter un livret
            </button>
          </div>
        </div>
        <div className="stat-card">
          <p className="stat-label">Intérêts / quinzaine</p>
          <p className="stat-value">{fmt(totalAnnualInterest / 24)}</p>
          <p className="stat-sub">En moyenne</p>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid grid-2 gap-20">
        {portfolio.livrets.map(l => {
          const info = LIVRET_TYPES[l.type] || { label: l.type, rate: 3.0, color: '#3b82f6' }
          const rate = l.customRate || info.rate
          const annual = l.balance * (rate / 100)
          const quinzaine = annual / 24
          const fillPct = info.max ? Math.min((l.balance / info.max) * 100, 100) : 0

          return (
            <div key={l.id} className="card" style={{ borderTop: `3px solid ${info.color}` }}>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-12">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: info.color + '22', color: info.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PiggyBank size={20} />
                  </div>
                  <div>
                    <div className="font-semibold">{info.label}</div>
                    <div className="text-sm text-muted">{l.bank}</div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <span className="badge badge-accent">{rate}%</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteLivret(l.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mb-16">
                <div className="flex justify-between mb-8">
                  <span className="text-2xl font-bold">{fmt(l.balance)}</span>
                  {info.max && <span className="text-sm text-muted">/ {fmt(info.max)}</span>}
                </div>
                {info.max && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${fillPct}%`, background: info.color }} />
                  </div>
                )}
              </div>

              <div className="grid grid-2 gap-12">
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-xs text-muted mb-4">Intérêts / quinzaine</div>
                  <div className="font-semibold text-success">{fmt(quinzaine)}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-xs text-muted mb-4">Intérêts annuels</div>
                  <div className="font-semibold text-success">{fmt(annual)}</div>
                </div>
              </div>
            </div>
          )
        })}

        {portfolio.livrets.length === 0 && (
          <div className="empty-state" style={{ gridColumn: 'span 2' }}>
            <div className="empty-state-icon"><PiggyBank /></div>
            <h3>Aucun livret ajouté</h3>
            <p>Ajoutez vos livrets d'épargne pour suivre vos intérêts.</p>
            <button className="btn btn-primary mt-16" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Ajouter un livret
            </button>
          </div>
        )}
      </div>

      {showModal && <AddLivretModal onClose={() => setShowModal(false)} onAdd={addLivret} />}
    </div>
  )
}
