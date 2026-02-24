import { useState, useCallback } from 'react'
import { Plus, RefreshCw, TrendingUp, TrendingDown, Trash2, X, Loader2 } from 'lucide-react'
import { usePortfolio } from '../context/PortfolioContext'
import { usePriceRefresh } from '../hooks/usePriceRefresh'
import { searchCoinGecko } from '../services/priceService'
import './Crypto.css'

const fmt = (n) => n != null ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n) : '—'
const fmtQty = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 }).format(n)
const fmtPct = (n) => n != null ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—'
const fmtTime = (d) => d ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d) : null

function AddCryptoModal({ onClose, onAdd }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selected, setSelected] = useState(null)
  const [searching, setSearching] = useState(false)
  const [form, setForm] = useState({ quantity: '', buyPrice: '', buyDate: '' })

  const handleSearch = useCallback(async (q) => {
    setQuery(q)
    if (q.length < 2) { setSuggestions([]); return }
    setSearching(true)
    try {
      const results = await searchCoinGecko(q)
      setSuggestions(results)
    } catch {
      setSuggestions([])
    } finally {
      setSearching(false)
    }
  }, [])

  const handleSelect = (coin) => {
    setSelected(coin)
    setQuery(coin.name)
    setSuggestions([])
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selected) return
    onAdd({
      name: selected.name,
      symbol: selected.symbol,
      coingeckoId: selected.id,
      coinImage: selected.thumb,
      quantity: parseFloat(form.quantity),
      buyPrice: parseFloat(form.buyPrice),
      currentPrice: parseFloat(form.buyPrice),
      buyDate: form.buyDate,
      source: 'manual',
    })
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
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Rechercher une crypto (CoinGecko)</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                placeholder="Bitcoin, BTC..."
                value={query}
                onChange={e => handleSearch(e.target.value)}
                autoComplete="off"
              />
              {searching && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
                </span>
              )}
            </div>
            {suggestions.length > 0 && (
              <div style={{
                position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 8, maxHeight: 240, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
              }}>
                {suggestions.map(c => (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      cursor: 'pointer', transition: 'background 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {c.thumb && <img src={c.thumb} alt={c.name} style={{ width: 20, height: 20, borderRadius: '50%' }} />}
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-xs text-muted">{c.symbol}</span>
                    {c.marketCapRank && <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>#{c.marketCapRank}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
              {selected.thumb && <img src={selected.thumb} alt={selected.name} style={{ width: 24, height: 24, borderRadius: '50%' }} />}
              <span className="font-semibold">{selected.name}</span>
              <span className="text-xs text-muted">{selected.symbol}</span>
              <button type="button" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setSelected(null); setQuery('') }}>
                <X size={14} />
              </button>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Quantite</label>
            <input className="form-input" type="number" step="any" placeholder="0.5" required
              value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Prix d'achat (€)</label>
            <input className="form-input" type="number" step="any" placeholder="30000" required
              value={form.buyPrice} onChange={e => setForm({ ...form, buyPrice: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Date d'achat</label>
            <input className="form-input" type="date" required value={form.buyDate}
              onChange={e => setForm({ ...form, buyDate: e.target.value })} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={!selected}>Ajouter</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Crypto() {
  const { portfolio, totals, addCrypto, deleteCrypto, pricesLastUpdated } = usePortfolio()
  const { isRefreshing, refreshNow } = usePriceRefresh()
  const [showModal, setShowModal] = useState(false)

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
                <th>Actif</th>
                <th>Quantite</th>
                <th>PRU</th>
                <th>Prix actuel</th>
                <th>Var. 24h</th>
                <th>Haut 24h</th>
                <th>Bas 24h</th>
                <th>Gain/Perte €</th>
                <th>Perf. %</th>
                <th>Valeur totale</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {portfolio.crypto.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>
                    Aucune crypto. Cliquez sur "Ajouter" pour commencer.
                  </td>
                </tr>
              )}
              {portfolio.crypto.map(c => {
                const current = c.currentPrice || c.buyPrice
                const value = current * c.quantity
                const gain = (current - c.buyPrice) * c.quantity
                const gainPct = ((current - c.buyPrice) / c.buyPrice) * 100
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="crypto-asset">
                        {c.coinImage
                          ? <img src={c.coinImage} alt={c.symbol} style={{ width: 28, height: 28, borderRadius: '50%' }} />
                          : <div className="crypto-icon">{(c.symbol || '?')[0]}</div>
                        }
                        <div>
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-muted">{c.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono">{fmtQty(c.quantity)}</td>
                    <td className="font-mono">{fmt(c.buyPrice)}</td>
                    <td className="font-mono font-semibold">
                      {fmt(current)}
                      {isRefreshing && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite', opacity: 0.4, marginLeft: 4, display: 'inline' }} />}
                    </td>
                    <td>
                      {c.change24h != null && (
                        <span className={`badge ${c.change24h >= 0 ? 'badge-success' : 'badge-danger'}`}>
                          {c.change24h >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                          {fmtPct(c.change24h)}
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-muted">{fmt(c.high24h)}</td>
                    <td className="font-mono text-muted">{fmt(c.low24h)}</td>
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
