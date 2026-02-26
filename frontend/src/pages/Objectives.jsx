import { useState } from 'react'
import { Plus, X, Target, Trash2, Edit2, ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import { usePrivacyMask } from '../hooks/usePrivacyMask'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
const fmtDateShort = (d) => new Date(d).toLocaleDateString('fr-FR')

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899']

function AddObjectiveModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ name: '', targetAmount: '', currentAmount: '', deadline: '', color: '#3b82f6' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({
      ...form,
      targetAmount: parseFloat(form.targetAmount),
      currentAmount: parseFloat(form.currentAmount),
      movements: [{ date: new Date().toISOString().slice(0, 10), amount: parseFloat(form.currentAmount), note: 'Montant initial' }],
    })
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
  if (pct >= 100) return { label: 'Atteint', color: 'var(--success)', badgeClass: 'badge-success' }
  if (daysLeft < 60 && pct < 80) return { label: 'En danger', color: 'var(--danger)', badgeClass: 'badge-danger' }
  if (pct < 50 && daysLeft < 180) return { label: 'En retard', color: 'var(--warning)', badgeClass: 'badge-warning' }
  return { label: 'En bonne voie', color: 'var(--success)', badgeClass: 'badge-success' }
}

function ContributeForm({ obj, onUpdate }) {
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('add')
  const [note, setNote] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return
    const delta = type === 'add' ? val : -val
    const movements = [...(obj.movements || []), { date: new Date().toISOString().slice(0, 10), amount: delta, note: note || (type === 'add' ? 'Versement' : 'Retrait') }]
    onUpdate(obj.id, { currentAmount: Math.max(0, obj.currentAmount + delta), movements })
    setAmount('')
    setNote('')
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
      <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <button type="button" onClick={() => setType('add')} style={{
          padding: '7px 14px', fontSize: '0.8rem', border: 'none', cursor: 'pointer',
          background: type === 'add' ? 'var(--success)' : 'transparent',
          color: type === 'add' ? '#fff' : 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <ArrowDownLeft size={12} />Ajouter
        </button>
        <button type="button" onClick={() => setType('withdraw')} style={{
          padding: '7px 14px', fontSize: '0.8rem', border: 'none', cursor: 'pointer',
          background: type === 'withdraw' ? 'var(--danger)' : 'transparent',
          color: type === 'withdraw' ? '#fff' : 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <ArrowUpRight size={12} />Retirer
        </button>
      </div>
      <input type="number" className="form-input" step="0.01" min="0.01" placeholder="Montant" required
        value={amount} onChange={e => setAmount(e.target.value)}
        style={{ width: 120, padding: '7px 10px', fontSize: '0.85rem' }} />
      <input type="text" className="form-input" placeholder="Note (optionnel)"
        value={note} onChange={e => setNote(e.target.value)}
        style={{ width: 160, padding: '7px 10px', fontSize: '0.85rem' }} />
      <button type="submit" className="btn btn-primary btn-sm">
        <Plus size={14} /> OK
      </button>
    </form>
  )
}

export default function Objectives() {
  const { portfolio, addObjective, deleteObjective, updateObjective } = usePortfolio()
  const { m } = usePrivacyMask()
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const totalTarget = portfolio.objectives.reduce((s, o) => s + o.targetAmount, 0)
  const totalCurrent = portfolio.objectives.reduce((s, o) => s + o.currentAmount, 0)

  return (
    <div className="animate-fade-in">
      <div className="grid grid-3 mb-24 gap-20">
        <div className="stat-card" style={{ gridColumn: 'span 2' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">Progression globale des objectifs</p>
              <p className="stat-value" style={{ fontSize: '2rem', marginTop: 4 }}>{m(fmt(totalCurrent))} <span className="text-muted text-lg">/ {m(fmt(totalTarget))}</span></p>
              <div className="progress-bar mt-16" style={{ height: 10 }}>
                <div className="progress-fill" style={{ width: `${totalTarget > 0 ? Math.min((totalCurrent / totalTarget) * 100, 100) : 0}%`, background: 'var(--accent)' }} />
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
          const isExpanded = expandedId === obj.id
          const movements = obj.movements || []
          const daysLeft = Math.max(0, Math.ceil((new Date(obj.deadline) - new Date()) / (1000 * 60 * 60 * 24)))

          return (
            <div key={obj.id} className="card" style={{ borderTop: `3px solid ${obj.color || 'var(--accent)'}` }}>
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-12">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: (obj.color || 'var(--accent)') + '22', color: obj.color || 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Target size={20} />
                  </div>
                  <div>
                    <div className="font-semibold">{obj.name}</div>
                    <div className="text-xs text-muted">Échéance : {fmtDate(obj.deadline)} · {daysLeft}j restants</div>
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
                <span className="text-xl font-bold">{m(fmt(obj.currentAmount))}</span>
                <span className="text-muted text-sm">{m(fmt(obj.targetAmount))}</span>
              </div>

              <div className="progress-bar mb-8" style={{ height: 10 }}>
                <div className="progress-fill" style={{ width: `${pct}%`, background: obj.color || 'var(--accent)', transition: 'width 0.5s ease' }} />
              </div>

              <div className="flex justify-between mb-12">
                <span className="text-xs text-muted">{pct.toFixed(1)}% atteint</span>
                <span className="text-xs text-muted">Reste : {m(fmt(Math.max(remaining, 0)))}</span>
              </div>

              {/* Contribute form — always visible */}
              <ContributeForm obj={obj} onUpdate={updateObjective} />

              {/* Toggle details */}
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'center', gap: 6, marginTop: 12 }}
                onClick={() => setExpandedId(isExpanded ? null : obj.id)}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isExpanded ? 'Masquer l\'historique' : 'Voir l\'historique'}
              </button>

              {isExpanded && movements.length > 0 && (
                <div style={{ marginTop: 12, maxHeight: 200, overflowY: 'auto' }}>
                  {movements.map((mv, idx) => (
                    <div key={idx} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-8">
                        {mv.amount > 0
                          ? <ArrowDownLeft size={14} style={{ color: 'var(--success)' }} />
                          : <ArrowUpRight size={14} style={{ color: 'var(--danger)' }} />
                        }
                        <span className="text-sm">{fmtDateShort(mv.date)}</span>
                        {mv.note && <span className="text-xs text-muted">{mv.note}</span>}
                      </div>
                      <span className="text-sm font-semibold" style={{ color: mv.amount > 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {m(`${mv.amount > 0 ? '+' : ''}${fmt(mv.amount)}`)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {isExpanded && movements.length === 0 && (
                <p className="text-sm text-muted" style={{ marginTop: 8 }}>Aucun mouvement enregistré.</p>
              )}
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
