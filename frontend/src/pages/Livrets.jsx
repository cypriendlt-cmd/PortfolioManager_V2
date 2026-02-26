import { useState, useMemo, useCallback } from 'react'
import { Plus, X, PiggyBank, Trash2, ChevronDown, ChevronUp, TrendingUp, Calendar, ArrowUpRight, ArrowDownLeft, Settings, Pencil } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import { useBank } from '../context/BankContext'
import { usePrivacyMask } from '../hooks/usePrivacyMask'
import { calculateInterestYTD, calculateInterestAnnualEstimate } from '../services/interestEngine'
import { getCurrentRate } from '../services/rateProvider'
import { Link } from 'react-router-dom'

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

/* ===== Configure Bank Livret Modal ===== */
function ConfigureBankLivretModal({ account, onClose, onSave }) {
  const [livretType, setLivretType] = useState(account.livretType || '')
  const [customRate, setCustomRate] = useState(account.customRate != null ? String(account.customRate) : '')
  const [openDate, setOpenDate] = useState(account.openDate || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(account.id, {
      livretType: livretType || null,
      customRate: customRate ? parseFloat(customRate) : null,
      openDate: openDate || null,
    })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Configurer {account.alias}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Type de livret</label>
            <select className="form-select" value={livretType} onChange={e => setLivretType(e.target.value)}>
              <option value="">— Non défini —</option>
              {Object.entries(LIVRET_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label} (plafond {fmt(val.max)})</option>
              ))}
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Associer un type permet le calcul des intérêts et le suivi du plafond
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">Taux personnalisé (%) — optionnel</label>
            <input className="form-input" type="number" step="0.01" placeholder={livretType ? `Laisser vide pour taux officiel (${fmtPct(getCurrentRate(livretType) || 0)})` : 'Définir un taux'} value={customRate} onChange={e => setCustomRate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Date d'ouverture (optionnel)</label>
            <input className="form-input" type="date" value={openDate} onChange={e => setOpenDate(e.target.value)} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ===== Bank Livrets Section ===== */
function BankLivretsSection({ bankLivrets, bankLivretsTotal, bankCtx, m, expandedId, setExpandedId }) {
  const [configAccount, setConfigAccount] = useState(null)

  const handleSaveConfig = useCallback((accountId, fields) => {
    bankCtx.updateAccount(accountId, fields)
  }, [bankCtx])

  // Build livret-like objects for interest calculation from bank transactions
  const bankLivretData = useMemo(() => {
    const data = {}
    for (const acc of bankLivrets) {
      const type = acc.livretType
      if (!type) continue // no type configured = no interest calc

      // Convert bank transactions to movements format {date, amount}
      const txs = (bankCtx.bankHistory?.transactions || [])
        .filter(t => t.accountId === acc.id)
        .map(t => ({ date: t.date, amount: t.amount }))
        .sort((a, b) => a.date.localeCompare(b.date))

      const livretObj = {
        type,
        balance: acc.balance,
        movements: txs,
        openDate: acc.openDate || null,
        customRate: acc.customRate != null ? acc.customRate : null,
      }

      data[acc.id] = {
        ytd: calculateInterestYTD(livretObj),
        annual: calculateInterestAnnualEstimate(livretObj),
      }
    }
    return data
  }, [bankLivrets, bankCtx.bankHistory?.transactions])

  const totalAnnualBank = bankLivrets.reduce((s, a) => s + (bankLivretData[a.id]?.annual?.annual || 0), 0)
  const totalYTDBank = bankLivrets.reduce((s, a) => s + (bankLivretData[a.id]?.ytd?.ytd || 0), 0)

  return (
    <>
      <div style={{ marginTop: 32, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Livrets importés (relevés bancaires)</h3>
        <Link to="/banking" className="btn btn-ghost" style={{ fontSize: '0.8rem' }}>Voir détails →</Link>
      </div>

      <div className="grid grid-3 mb-24 gap-20">
        <div className="stat-card">
          <p className="stat-label">Total livrets importés</p>
          <p className="stat-value" style={{ fontSize: '1.5rem', marginTop: 4 }}>{m(fmt(bankLivretsTotal))}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-8 mb-4">
            <TrendingUp size={16} style={{ color: 'var(--success)' }} />
            <p className="stat-label" style={{ margin: 0 }}>Intérêts annuels estimés</p>
          </div>
          <p className="stat-value text-success">{m(fmt(totalAnnualBank))}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-8 mb-4">
            <Calendar size={16} style={{ color: 'var(--accent)' }} />
            <p className="stat-label" style={{ margin: 0 }}>Intérêts YTD</p>
          </div>
          <p className="stat-value">{m(fmt(totalYTDBank))}</p>
        </div>
      </div>

      <div className="grid grid-2 gap-20">
        {bankLivrets.map(a => {
          const type = a.livretType
          const info = type ? (LIVRET_TYPES[type] || { label: type, color: 'var(--accent)', max: 0 }) : null
          const rate = a.customRate != null ? a.customRate : (type ? (getCurrentRate(type) || 0) : 0)
          const data = bankLivretData[a.id]
          const ytd = data?.ytd?.ytd || 0
          const annual = data?.annual?.annual || 0
          const byQuinzaine = data?.annual?.byQuinzaine || []
          const fillPct = info?.max ? Math.min((a.balance / info.max) * 100, 100) : 0
          const isExpanded = expandedId === `bank_${a.id}`
          const color = info?.color || 'var(--accent)'

          // Movements from bank transactions
          const movements = (bankCtx.bankHistory?.transactions || [])
            .filter(t => t.accountId === a.id)
            .sort((x, y) => y.date.localeCompare(x.date))

          return (
            <div key={a.id} className="card" style={{ borderTop: `3px solid ${color}` }}>
              {/* Card header */}
              <div className="flex items-center justify-between mb-16">
                <div className="flex items-center gap-12">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: (info ? color : 'var(--accent)') + '22', color: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PiggyBank size={20} />
                  </div>
                  <div>
                    <div className="font-semibold">{a.alias}</div>
                    <div className="text-sm text-muted">{info ? info.label : a.type}</div>
                  </div>
                </div>
                <div className="flex items-center gap-8">
                  {type && <span className="badge badge-accent">{fmtPct(rate)}</span>}
                  {!type && <span className="badge" style={{ background: 'var(--warning-light, rgba(245,158,11,0.1))', color: 'var(--warning, #f59e0b)', fontSize: '0.7rem' }}>Non configuré</span>}
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setConfigAccount(a)} title="Configurer">
                    <Pencil size={14} />
                  </button>
                </div>
              </div>

              {/* Balance + progress */}
              <div className="mb-16">
                <div className="flex justify-between mb-8">
                  <span className="text-2xl font-bold">{m(fmt(a.balance))}</span>
                  {info?.max > 0 && <span className="text-sm text-muted">/ {fmt(info.max)}</span>}
                </div>
                {info?.max > 0 && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${fillPct}%`, background: color }} />
                  </div>
                )}
              </div>

              {/* Interest stats (only if type configured) */}
              {type && (
                <div className="grid grid-3 gap-12 mb-12">
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                    <div className="text-xs text-muted mb-4">Intérêts YTD</div>
                    <div className="font-semibold text-success">{m(fmt(ytd))}</div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                    <div className="text-xs text-muted mb-4">Estimation annuelle</div>
                    <div className="font-semibold text-success">{m(fmt(annual))}</div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                    <div className="text-xs text-muted mb-4">Moy. / quinzaine</div>
                    <div className="font-semibold text-success">{m(fmt(annual / 24))}</div>
                  </div>
                </div>
              )}

              {!type && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Configurez le type de livret pour activer le calcul des intérêts et le suivi du plafond.
                </div>
              )}

              {/* Expand toggle */}
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                onClick={() => setExpandedId(isExpanded ? null : `bank_${a.id}`)}
              >
                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isExpanded ? 'Masquer les détails' : 'Voir les détails'}
              </button>

              {/* Expanded section */}
              {isExpanded && (
                <div style={{ marginTop: 16 }}>
                  {/* Movements */}
                  <h4 style={{ fontSize: '0.9rem', marginBottom: 8 }}>Mouvements ({movements.length})</h4>
                  {movements.length === 0 && (
                    <p className="text-sm text-muted" style={{ marginBottom: 8 }}>Aucun mouvement importé.</p>
                  )}
                  {movements.length > 0 && (
                    <div style={{ maxHeight: 250, overflowY: 'auto', marginBottom: 8 }}>
                      {movements.map((mv, idx) => (
                        <div key={idx} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                          <div className="flex items-center gap-8">
                            {mv.amount > 0
                              ? <ArrowDownLeft size={14} style={{ color: 'var(--success)' }} />
                              : <ArrowUpRight size={14} style={{ color: 'var(--danger)' }} />
                            }
                            <span className="text-sm">{fmtDate(mv.date)}</span>
                            <span className="text-xs text-muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mv.label}</span>
                          </div>
                          <span className="text-sm font-semibold" style={{ color: mv.amount > 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {m(`${mv.amount > 0 ? '+' : ''}${fmt(mv.amount)}`)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Quinzaine table (only if type configured) */}
                  {type && byQuinzaine.length > 0 && (
                    <>
                      <h4 style={{ fontSize: '0.9rem', marginTop: 20, marginBottom: 8 }}>Détail par quinzaine</h4>
                      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                              <th style={{ padding: '6px 8px' }}>Période</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Solde</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Taux</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Intérêts</th>
                            </tr>
                          </thead>
                          <tbody style={{ fontFamily: 'monospace' }}>
                            {byQuinzaine.map((q, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '4px 8px' }}>{fmtDate(q.start)} - {fmtDate(q.end)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{m(fmt(q.balance))}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtPct(q.rate)}</td>
                                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--success)' }}>{m(fmt(q.interest))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {configAccount && (
        <ConfigureBankLivretModal
          account={configAccount}
          onClose={() => setConfigAccount(null)}
          onSave={handleSaveConfig}
        />
      )}
    </>
  )
}

export default function Livrets() {
  const { portfolio, totals, addLivret, deleteLivret, addLivretMovement, deleteLivretMovement } = usePortfolio()
  const bankCtx = useBank()
  const { m } = usePrivacyMask()
  const [showModal, setShowModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  // Bank livrets (from imported Excel)
  const bankLivrets = (bankCtx?.accountBalances || []).filter(a => a.type !== 'courant')
  const bankLivretsTotal = bankLivrets.reduce((s, a) => s + a.balance, 0)

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
          <p className="stat-value" style={{ fontSize: '1.75rem', marginTop: 4 }}>{m(fmt(totals.livrets))}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-8 mb-4">
            <TrendingUp size={16} style={{ color: 'var(--success)' }} />
            <p className="stat-label" style={{ margin: 0 }}>Interets annuels estimes</p>
          </div>
          <p className="stat-value text-success">{m(fmt(totalAnnualEstimate))}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-8 mb-4">
            <Calendar size={16} style={{ color: 'var(--accent)' }} />
            <p className="stat-label" style={{ margin: 0 }}>Interets YTD</p>
          </div>
          <p className="stat-value">{m(fmt(totalYTD))}</p>
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
                  <span className="text-2xl font-bold">{m(fmt(l.balance))}</span>
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
                  <div className="font-semibold text-success">{m(fmt(ytd))}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-xs text-muted mb-4">Estimation annuelle</div>
                  <div className="font-semibold text-success">{m(fmt(annual))}</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-xs text-muted mb-4">Moy. / quinzaine</div>
                  <div className="font-semibold text-success">{m(fmt(annual / 24))}</div>
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
                              {m(`${mv.amount > 0 ? '+' : ''}${fmt(mv.amount)}`)}
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
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{m(fmt(q.balance))}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtPct(q.rate)}</td>
                            <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--success)' }}>{m(fmt(q.interest))}</td>
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

      {/* ═══ Bank Livrets (imported from Excel) ═══ */}
      {bankLivrets.length > 0 && (
        <BankLivretsSection
          bankLivrets={bankLivrets}
          bankLivretsTotal={bankLivretsTotal}
          bankCtx={bankCtx}
          m={m}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
        />
      )}

      {showModal && <AddLivretModal onClose={() => setShowModal(false)} onAdd={addLivret} />}
    </div>
  )
}
