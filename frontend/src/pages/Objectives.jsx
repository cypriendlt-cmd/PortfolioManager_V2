import { useState } from 'react'
import { Plus, X, Target, Trash2, Edit2 } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899']

function AddObjectiveModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: '', targetAmount: '', currentAmount: '', deadline: '', color: '#3b82f6' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({ ...form, targetAmount: parseFloat(form.targetAmount), currentAmount: parseFloat(form.currentAmount) })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Ajouter un objectif</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom de l'objectif</label>
            <input className="form-input" placeholder="Vacances, Voiture, Maison..." required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-2 gap-16">
            <div className="form-group">
              <label className="form-label">Montant cible (€)</label>
              <input className="form-input" type="number" step="0.01" required value={form.targetAmount} onChange={e => setForm({ ...form, targetAmount: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Montant actuel (€)</label>
              <input className="form-input" type="number" step="0.01" required value={form.currentAmount} onChange={e => setForm({ ...form, currentAmount: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Date limite</label>
            <input className="form-input" type="date" required value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Couleur</label>
            <div className="flex gap-8">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--text-primary)' : '3px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
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

function getStatus(obj) {
  const pct = (obj.currentAmount / obj.targetAmount) * 100
  const daysLeft = (new Date(obj.deadline) - new Date()) / (1000 * 60 * 60 * 24)
  const daysTotal = (new Date(obj.deadline) - new Date(obj.id ? '2023-01-01' : '2023-01-01')) / (1000 * 60 * 60 * 24)
  if (pct >= 100) return { label: 'Atteint', color: 'var(--success)', badgeClass: 'badge-success' }
  if (daysLeft < 60 && pct < 80) return { label: 'En danger', color: 'var(--danger)', badgeClass: 'badge-danger' }
  if (pct < 50 && daysLeft < 180) return { label: 'En retard', color: 'var(--warning)', badgeClass: 'badge-warning' }
  return { label: 'En bonne voie', color: 'var(--success)', badgeClass: 'badge-success' }
}

export default function Objectives() {
  const { portfolio, addObjective, deleteObjective, updateObjective } = usePortfolio()
  const [showModal, setShowModal] = useState(false)

  const totalTarget = portfolio.objectives.reduce((s, o) => s + o.targetAmount, 0)
  const totalCurrent = portfolio.objectives.reduce((s, o) => s + o.currentAmount, 0)

  return (
    <div className="animate-fade-in">
      <div className="grid grid-3 mb-24 gap-20">
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Progression globale des objectifs</p>
              <p className="stat-value" style={{ fontSize: '2rem', marginTop: 4 }}>{fmt(totalCurrent)} <span className="text-muted text-lg">/ {fmt(totalTarget)}</span></p>
              <div className="progress-bar mt-16" style={{ height: 10 }}>
                <div className="progress-fill" style={{ width: `${Math.min((totalCurrent / totalTarget) * 100, 100)}%`, background: 'var(--accent)' }} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Ajouter
            </button>
          </div>
        </div>
        <div className="stat-card">
          <p className="stat-label">Objectifs actifs</p>
          <p className="stat-value">{portfolio.objectives.length}</p>
          <p className="stat-sub">{portfolio.objectives.filter(o => o.currentAmount >= o.targetAmount).length} atteint(s)</p>
        </div>
      </div>

      <div className="grid grid-2 gap-20">
        {portfolio.objectives.map(obj => {
          const pct = Math.min((obj.currentAmount / obj.targetAmount) * 100, 100)
          const status = getStatus(obj)
          const remaining = obj.targetAmount - obj.currentAmount

          return (
            <div key={obj.id} className="card" style={{ borderTop: `3px solid ${obj.color || 'var(--accent)'}` }}>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-12">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: (obj.color || 'var(--accent)') + '22', color: obj.color || 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Target size={20} />
                  </div>
                  <div>
                    <div className="font-semibold">{obj.name}</div>
                    <div className="text-xs text-muted">Échéance: {fmtDate(obj.deadline)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  <span className={`badge ${status.badgeClass}`}>{status.label}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteObjective(obj.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="flex justify-between mb-8">
                <span className="text-xl font-bold">{fmt(obj.currentAmount)}</span>
                <span className="text-muted text-sm">{fmt(obj.targetAmount)}</span>
              </div>

              <div className="progress-bar mb-8" style={{ height: 10 }}>
                <div className="progress-fill" style={{ width: `${pct}%`, background: obj.color || 'var(--accent)' }} />
              </div>

              <div className="flex justify-between">
                <span className="text-xs text-muted">{pct.toFixed(1)}% atteint</span>
                <span className="text-xs text-muted">Reste: {fmt(Math.max(remaining, 0))}</span>
              </div>
            </div>
          )
        })}

        {portfolio.objectives.length === 0 && (
          <div className="empty-state" style={{ gridColumn: 'span 2' }}>
            <div className="empty-state-icon"><Target /></div>
            <h3>Aucun objectif défini</h3>
            <p>Fixez-vous des objectifs financiers pour rester motivé.</p>
            <button className="btn btn-primary mt-16" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Ajouter un objectif
            </button>
          </div>
        )}
      </div>

      {showModal && <AddObjectiveModal onClose={() => setShowModal(false)} onAdd={addObjective} />}
    </div>
  )
}
