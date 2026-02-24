import { useState, useMemo } from 'react'
import { Plus, X, PiggyBank, Trash2, ChevronDown, ChevronUp, TrendingUp, Calendar, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import { calculateInterestYTD, calculateInterestAnnualEstimate } from '../services/interestEngine'
import { getCurrentRate } from '../services/rateProvider'

const LIVRET_TYPES = {
  'livret-a': { label: 'Livret A', max: 22950, color: '#3b82f6' },
  'ldds': { label: 'LDDS', max: 12000, color: '#10b981' },
  'lep': { label: 'LEP', max: 10000, color: '#f59e0b' },
  'cel': { label: 'CEL', max: 15300, color: '#8b5cf6' },
  'pel': { label: 'PEL', max: 61200, color: '#ef4444' },
}

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
const fmtPct = (n) => `${n.toFixed(2)}%`
const fmtDate = (d) => new Intl.DateTimeFormat('fr-FR').format(new Date(d))

function AddLivretModal({ onClose, onAdd }) {
  const [form, setForm] = useState({ type: 'livret-a', bank: '', balance: '', customRate: '', openDate: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    onAdd({
      ...form,
      balance: parseFloat(form.balance),
      customRate: form.customRate ? parseFloat(form.customRate) : null,
      openDate: form.openDate || null,
      movements: [],
    })
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
                <option key={key} value={key}>{val.label} ({fmtPct(getCurrentRate(key) || 0)})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Banque</label>
            <input className="form-input" placeholder="Boursorama" required value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Solde actuel (EUR)</label>
            <input className="form-input" type="number" step="0.01" placeholder="10000" required value={form.balance} onChange={e => setForm({ ...form, balance: e.target.value })} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Solde initial et date permettent un calcul plus precis des interets</span>
          </div>
          <div className="form-group">
            <label className="form-label">Date d'ouverture (optionnel)</label>
            <input className="form-input" type="date" value={form.openDate} onChange={e => setForm({ ...form, openDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Taux personnalise (%) -- optionnel</label>
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

function MovementForm({ livretId, onAdd }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('deposit')

  const handleSubmit = (e) => {
    e.preventDefault()
    const val = parseFloat(amount)
    if (!val || val <= 0) return
    onAdd(livretId, { date, amount: type === 'deposit' ? val : -val })
    setAmount('')
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
      <input type="date" className="form-input" style={{ width: 150, padding: '6px 8px', fontSize: '0.85rem' }} value={date} onChange={e => setDate(e.target.value)} />
      <input type="number" className="form-input" style={{ width: 120, padding: '6px 8px', fontSize: '0.85rem' }} step="0.01" min="0.01" placeholder="Montant" required value={amount} onChange={e => setAmount(e.target.value)} />
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <button type="button" onClick={() => setType('deposit')} style={{ padding: '6px 12px', fontSize: '0.8rem', background: type === 'deposit' ? 'var(--success)' : 'transparent', color: type === 'deposit' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
          <ArrowDownLeft size={12} style={{ marginRight: 4 }} />Depot
        </button>
        <button type="button" onClick={() => setType('withdrawal')} style={{ padding: '6px 12px', fontSize: '0.8rem', background: type === 'withdrawal' ? 'var(--danger)' : 'transparent', color: type === 'withdrawal' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>
          <ArrowUpRight size={12} style={{ marginRight: 4 }} />Retrait
        </button>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '6px 12px' }}>
        <Plus size={14} /> Ajouter
      </button>
    </form>
  )
}

export default function Livrets() {
  const { portfolio, totals, addLivret, deleteLivret, addLivretMovement, deleteLivretMovement } = usePortfolio()
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const interestData = useMemo(() => {
    const data = {}
    for (const l of portfolio.livrets) {
      data[l.id] = {
        ytd: calculateInterestYTD(l),
        annual: calculateInterestAnnualEstimate(l),
      }
    }
    return data
  }, [portfolio.livrets])

  const totalAnnualEstimate = portfolio.livrets.reduce((s, l) => s + (interestData[l.id]?.annual?.annual || 0), 0)
  const totalYTD = portfolio.livrets.reduce((s, l) => s + (interestData[l.id]?.ytd?.ytd || 0), 0)

  return (
    <div className="animate-fade-in">
      {/* Header stats */}
      <div className="grid grid-3 mb-24 gap-20">
        <div className="stat-card">
          <p className="stat-label">Total epargne reglementee</p>
          <p className="stat-value" style={{ fontSize: '1.75rem', marginTop: 4 }}>{fmt(totals.livrets)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-8 mb-4">
            <TrendingUp size={16} style={{ color: 'var(--success)' }} />
            <p className="stat-label" style={{ margin: 0 }}>Interets annuels estimes</p>
          </div>
          <p className="stat-value text-success">{fmt(totalAnnualEstimate)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-8 mb-4">
            <Calendar size={16} style={{ color: 'var(--accent)' }} />
            <p className="stat-label" style={{ margin: 0 }}>Interets YTD</p>
          </div>
          <p className="stat-value">{fmt(totalYTD)}</p>
        </div>
      </div>

      {/* Add button */}
      <div className="flex justify-end mb-16">
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Ajouter un livret
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-2 gap-20">
        {portfolio.livrets.map(l => {
          const info = LIVRET_TYPES[l.type] || { label: l.type, color: '#3b82f6', max: 0 }
          const rate = l.customRate != null ? l.customRate : (getCurrentRate(l.type) || 0)
          const data = interestData[l.id]
          const ytd = data?.ytd?.ytd || 0
          const annual = data?.annual?.annual || 0
          const byQuinzaine = data?.annual?.byQuinzaine || []
          const fillPct = info.max ? Math.min((l.balance / info.max) * 100, 100) : 0
          const isExpanded = expandedId === l.id
          const movements = l.movements || []

          return (
            <div key={l.id} className="card" style={{ borderTop: `3px solid ${info.color}` }}>
              {/* Card header */}
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
                  <span className="badge badge-accent">{fmtPct(rate)}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteLivret(l.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Balance + progress */}
              <div className="mb-16">
                <div className="flex justify-between mb-8">
                  <span className="text-2xl font-bold">{fmt(l.balance)}</span>
                  {info.max > 0 && <span className="text-sm text-muted">/ {fmt(info.max)}</span>}
                </div>
                {info.max > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${fillPct}%`, background: info.color }} />
                  </div>
                )}
              </div>

              {/* Interest stats */}
              <div className="grid grid-3 gap-12 mb-12">
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-xs text-muted mb-4">Interets YTD</div>
                  <div className="font-semibold text-success">{fmt(ytd)}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-xs text-muted mb-4">Estimation annuelle</div>
                  <div className="font-semibold text-success">{fmt(annual)}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-xs text-muted mb-4">Moy. / quinzaine</div>
                  <div className="font-semibold text-success">{fmt(annual / 24)}</div>
                </div>
              </div>

              {/* Expand toggle */}
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                onClick={() => setExpandedId(isExpanded ? null : l.id)}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isExpanded ? 'Masquer les details' : 'Voir les details'}
              </button>

              {/* Expanded section */}
              {isExpanded && (
                <div style={{ marginTop: 16 }}>
                  {/* Movements */}
                  <h4 style={{ fontSize: '0.9rem', marginBottom: 8 }}>Mouvements</h4>
                  {movements.length === 0 && (
                    <p className="text-sm text-muted" style={{ marginBottom: 8 }}>Aucun mouvement enregistre.</p>
                  )}
                  {movements.length > 0 && (
                    <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
                      {movements.map((mv, idx) => (
                        <div key={idx} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-8">
                            {mv.amount > 0
                              ? <ArrowDownLeft size={14} style={{ color: 'var(--success)' }} />
                              : <ArrowUpRight size={14} style={{ color: 'var(--danger)' }} />
                            }
                            <span className="text-sm">{fmtDate(mv.date)}</span>
                          </div>
                          <div className="flex items-center gap-8">
                            <span className="text-sm font-semibold" style={{ color: mv.amount > 0 ? 'var(--success)' : 'var(--danger)' }}>
                              {mv.amount > 0 ? '+' : ''}{fmt(mv.amount)}
                            </span>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => deleteLivretMovement(l.id, idx)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <MovementForm livretId={l.id} onAdd={addLivretMovement} />

                  {/* Quinzaine table */}
                  <h4 style={{ fontSize: '0.9rem', marginTop: 20, marginBottom: 8 }}>Detail par quinzaine</h4>
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px' }}>Periode</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Solde</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Taux</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Interets</th>
                        </tr>
                      </thead>
                      <tbody style={{ fontFamily: 'monospace' }}>
                        {byQuinzaine.map((q, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 8px' }}>{fmtDate(q.start)} - {fmtDate(q.end)}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(q.balance)}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtPct(q.rate)}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--success)' }}>{fmt(q.interest)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {portfolio.livrets.length === 0 && (
          <div className="empty-state" style={{ gridColumn: 'span 2' }}>
            <div className="empty-state-icon"><PiggyBank /></div>
            <h3>Aucun livret ajoute</h3>
            <p>Ajoutez vos livrets d'epargne pour suivre vos interets.</p>
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
