import { useState, useMemo } from 'react'
import {
  Landmark, Upload, Heart, ListFilter, BookOpen, Settings2,
  AlertTriangle, TrendingUp, TrendingDown, CreditCard, PiggyBank,
  Repeat, Trash2, Plus, Search
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line
} from 'recharts'
import { useBank } from '../context/BankContext'
import { usePrivacyMask } from '../hooks/usePrivacyMask'
import { CATEGORIES } from '../services/bankEngine'
import BankImportModal from '../components/BankImportModal'
import './Banking.css'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtD = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const catMap = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))

const TABS = [
  { key: 'synthese', label: 'Synthèse', icon: Landmark },
  { key: 'courant', label: 'Compte Courant', icon: CreditCard },
  { key: 'livrets', label: 'Livrets Bancaires', icon: PiggyBank },
  { key: 'analyse', label: 'Analyse IA', icon: Heart },
  { key: 'regles', label: 'Règles & Catégories', icon: Settings2 },
]

export default function Banking() {
  const {
    bankHistory, loading, accountBalances,
    aggregates, healthScore, coachInsights,
    importExcel, addRule, deleteRule,
    setInitialBalance, refreshCategories,
  } = useBank()
  const { m, mp } = usePrivacyMask()
  const [tab, setTab] = useState('synthese')
  const [importOpen, setImportOpen] = useState(false)

  if (loading) {
    return <div className="banking" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement...</div>
  }

  return (
    <div className="banking">
      <div className="banking-header">
        <h1><Landmark size={22} style={{ marginRight: 8 }} />Banque & Cashflow</h1>
        <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
          <Upload size={14} /> Importer un relevé
        </button>
      </div>

      <div className="banking-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`banking-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={14} style={{ marginRight: 4 }} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'synthese' && <SyntheseTab accountBalances={accountBalances} aggregates={aggregates} healthScore={healthScore} coachInsights={coachInsights} m={m} mp={mp} />}
      {tab === 'courant' && <CourantTab bankHistory={bankHistory} accountBalances={accountBalances} setInitialBalance={setInitialBalance} m={m} />}
      {tab === 'livrets' && <LivretsTab bankHistory={bankHistory} accountBalances={accountBalances} setInitialBalance={setInitialBalance} m={m} />}
      {tab === 'analyse' && <AnalyseTab healthScore={healthScore} coachInsights={coachInsights} aggregates={aggregates} m={m} />}
      {tab === 'regles' && <ReglesTab bankHistory={bankHistory} addRule={addRule} deleteRule={deleteRule} refreshCategories={refreshCategories} />}

      <BankImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

/* ─── SYNTHESE ─── */
function SyntheseTab({ accountBalances, aggregates, healthScore, coachInsights, m, mp }) {
  const courants = accountBalances.filter(a => a.type === 'courant')
  const livrets = accountBalances.filter(a => a.type !== 'courant')
  const totalCourant = courants.reduce((s, a) => s + a.balance, 0)
  const totalLivrets = livrets.reduce((s, a) => s + a.balance, 0)
  const lastMonths = aggregates.slice(-12)

  const lastAgg = aggregates[aggregates.length - 1]
  const savingsRate = lastAgg ? lastAgg.savingsRate : 0

  return (
    <>
      <div className="bank-accounts-grid">
        <div className="bank-account-card">
          <div className="account-type">Total Comptes Courants</div>
          <div className="account-balance" style={{ color: totalCourant >= 0 ? 'var(--success)' : 'var(--danger)' }}>{m(fmt(totalCourant))}</div>
        </div>
        <div className="bank-account-card">
          <div className="account-type">Total Livrets</div>
          <div className="account-balance" style={{ color: 'var(--accent)' }}>{m(fmt(totalLivrets))}</div>
        </div>
        <div className="bank-account-card">
          <div className="account-type">Taux d'épargne</div>
          <div className="account-balance">{savingsRate.toFixed(1)}%</div>
        </div>
        <div className="bank-account-card">
          <div className="account-type">Score santé</div>
          <div className="account-balance" style={{ color: healthScore >= 60 ? 'var(--success)' : healthScore >= 40 ? 'var(--warning)' : 'var(--danger)' }}>
            {healthScore}/100
          </div>
        </div>
      </div>

      {lastMonths.length > 0 && (
        <div className="cashflow-chart-container">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Cashflow mensuel</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={lastMonths}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={m => { const [, mm] = m.split('-'); return ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'][parseInt(mm)-1] || m }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '0.82rem' }} />
              <Bar dataKey="income" name="Revenus" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="expenses" name="Dépenses" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {coachInsights?.topExpenses && (
        <div className="bank-account-card" style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>Top dépenses par catégorie</h4>
          {coachInsights.topExpenses.map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.82rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: catMap[e.category]?.color || '#94a3b8' }} />
                {catMap[e.category]?.label || e.category}
              </span>
              <span style={{ fontWeight: 600 }}>{m(fmt(e.total))}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ─── COMPTE COURANT ─── */
function CourantTab({ bankHistory, accountBalances, setInitialBalance, m }) {
  const [monthFilter, setMonthFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [search, setSearch] = useState('')
  const [balanceInput, setBalanceInput] = useState('')

  const courantAccounts = accountBalances.filter(a => a.type === 'courant')
  const courantIds = new Set(courantAccounts.map(a => a.id))

  const txs = useMemo(() => {
    let list = bankHistory.transactions.filter(t => courantIds.has(t.accountId))
    if (monthFilter) list = list.filter(t => t.date.startsWith(monthFilter))
    if (catFilter) list = list.filter(t => t.category === catFilter)
    if (search) {
      const s = search.toLowerCase()
      list = list.filter(t => t.label.toLowerCase().includes(s))
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  }, [bankHistory.transactions, monthFilter, catFilter, search, courantIds])

  const months = [...new Set(bankHistory.transactions.filter(t => courantIds.has(t.accountId)).map(t => t.date.slice(0, 7)))].sort().reverse()

  const feesPattern = /FRAIS|COTISATION|TENUE DE COMPTE|COMMISSION|AGIOS/i

  return (
    <>
      <div className="bank-accounts-grid">
        {courantAccounts.map(a => (
          <div key={a.id} className="bank-account-card">
            <div className="account-type">Courant</div>
            <div className="account-alias">{a.alias}</div>
            <div className="account-balance" style={{ color: a.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>{m(fmt(a.balance))}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{a.txCount} transactions</div>
            <div className="balance-input-row">
              <input placeholder="Solde initial" value={balanceInput} onChange={e => setBalanceInput(e.target.value)} />
              <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                onClick={() => { setInitialBalance(a.id, parseFloat(balanceInput) || 0, new Date().toISOString().slice(0, 10)); setBalanceInput('') }}>
                OK
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="tx-filters">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
          <input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}>
          <option value="">Tous les mois</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tx-table">
          <thead>
            <tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th style={{ textAlign: 'right' }}>Montant</th></tr>
          </thead>
          <tbody>
            {txs.slice(0, 200).map(tx => (
              <tr key={tx.hash} className={`${tx.isTransfer ? 'tx-transfer' : ''} ${feesPattern.test(tx.label) ? 'tx-fee' : ''}`}>
                <td>{tx.date}</td>
                <td>{tx.label}</td>
                <td>
                  <span className="tx-category" style={{ background: (catMap[tx.category]?.color || '#94a3b8') + '18', color: catMap[tx.category]?.color || '#94a3b8' }}>
                    {tx.isTransfer && <Repeat size={10} style={{ marginRight: 3 }} />}
                    {catMap[tx.category]?.label || tx.category}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>{m(fmtD(tx.amount))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length > 200 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: 12 }}>Affichage limité à 200 transactions</p>}
        {txs.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Aucune transaction. Importez un relevé bancaire.</p>}
      </div>
    </>
  )
}

/* ─── LIVRETS BANCAIRES ─── */
function LivretsTab({ bankHistory, accountBalances, setInitialBalance, m }) {
  const [balanceInput, setBalanceInput] = useState('')
  const livretAccounts = accountBalances.filter(a => a.type !== 'courant')

  const monthlyData = useMemo(() => {
    const livretIds = new Set(livretAccounts.map(a => a.id))
    const txs = bankHistory.transactions.filter(t => livretIds.has(t.accountId))
    const months = {}
    for (const tx of txs) {
      const m = tx.date.slice(0, 7)
      if (!months[m]) months[m] = { month: m, versements: 0, retraits: 0 }
      if (tx.amount > 0) months[m].versements += tx.amount
      else months[m].retraits += Math.abs(tx.amount)
    }
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
  }, [bankHistory.transactions, livretAccounts])

  return (
    <>
      <div className="bank-accounts-grid">
        {livretAccounts.map(a => (
          <div key={a.id} className="bank-account-card">
            <div className="account-type">{a.type}</div>
            <div className="account-alias">{a.alias}</div>
            <div className="account-balance" style={{ color: 'var(--accent)' }}>{m(fmt(a.balance))}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{a.txCount} mouvements</div>
            <div className="balance-input-row">
              <input placeholder="Solde initial" value={balanceInput} onChange={e => setBalanceInput(e.target.value)} />
              <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                onClick={() => { setInitialBalance(a.id, parseFloat(balanceInput) || 0, new Date().toISOString().slice(0, 10)); setBalanceInput('') }}>
                OK
              </button>
            </div>
          </div>
        ))}
        {livretAccounts.length === 0 && (
          <p style={{ color: 'var(--text-muted)', padding: 20 }}>Aucun livret importé. Nommez vos feuilles Excel ACC__LIVRET__NomDuLivret.</p>
        )}
      </div>

      {monthlyData.length > 0 && (
        <div className="cashflow-chart-container">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Évolution mensuelle des livrets</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '0.82rem' }} />
              <Bar dataKey="versements" name="Versements" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="retraits" name="Retraits" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

/* ─── ANALYSE IA ─── */
function AnalyseTab({ healthScore, coachInsights, aggregates, m }) {
  if (!coachInsights) {
    return <p style={{ color: 'var(--text-muted)', padding: 20 }}>Importez des transactions pour obtenir une analyse.</p>
  }

  const scoreColor = healthScore >= 60 ? 'var(--success)' : healthScore >= 40 ? 'var(--warning)' : 'var(--danger)'

  return (
    <>
      <div className="health-score-container">
        <div className="health-score-circle" style={{ background: scoreColor + '18', color: scoreColor }}>
          {healthScore}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Score de santé financière</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            {healthScore >= 70 ? 'Excellent ! Vos finances sont bien gérées.' :
             healthScore >= 50 ? 'Correct, mais des améliorations sont possibles.' :
             'Attention, votre situation financière nécessite des ajustements.'}
          </div>
        </div>
      </div>

      <div className="bank-insights-grid">
        <div className="bank-insight-card">
          <h4><AlertTriangle size={14} style={{ color: 'var(--danger)' }} /> Frais bancaires détectés</h4>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>{m(fmt(coachInsights.fees.total))}</div>
          {coachInsights.fees.items.slice(0, 5).map((f, i) => (
            <div key={i} style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>{f.label.slice(0, 40)}</span>
              <span style={{ fontWeight: 600 }}>{fmtD(f.amount)}</span>
            </div>
          ))}
        </div>

        <div className="bank-insight-card">
          <h4><Repeat size={14} style={{ color: 'var(--accent)' }} /> Abonnements récurrents</h4>
          {coachInsights.recurring.slice(0, 6).map((r, i) => (
            <div key={i} style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{r.label.slice(0, 30)}</span>
              <span style={{ fontWeight: 600 }}>~{fmtD(r.avgAmount)}/mois</span>
            </div>
          ))}
          {coachInsights.recurring.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Aucun abonnement détecté</p>}
        </div>

        <div className="bank-insight-card">
          <h4><AlertTriangle size={14} style={{ color: 'var(--warning)' }} /> Anomalies</h4>
          {coachInsights.anomalies.map((a, i) => (
            <div key={i} style={{ fontSize: '0.78rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <div>{a.label.slice(0, 50)}</div>
              <div style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtD(a.amount)}</div>
            </div>
          ))}
          {coachInsights.anomalies.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Aucune anomalie détectée</p>}
        </div>
      </div>

      <div className="bank-account-card">
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>💡 Recommandations</h4>
        {coachInsights.recommendations.map((r, i) => (
          <div key={i} className="recommendation-item">{r}</div>
        ))}
      </div>
    </>
  )
}

/* ─── REGLES & CATEGORIES ─── */
function ReglesTab({ bankHistory, addRule, deleteRule, refreshCategories }) {
  const [pattern, setPattern] = useState('')
  const [category, setCategory] = useState('autre')
  const [priority, setPriority] = useState(50)
  const [testLabel, setTestLabel] = useState('')
  const [testResult, setTestResult] = useState('')

  const handleAdd = () => {
    if (!pattern) return
    addRule({ pattern, category, priority: parseInt(priority) })
    setPattern('')
  }

  const handleTest = () => {
    if (!testLabel) return
    try {
      const re = new RegExp(pattern, 'i')
      setTestResult(re.test(testLabel) ? `✓ Match → ${category}` : '✗ Pas de match')
    } catch {
      setTestResult('Regex invalide')
    }
  }

  return (
    <>
      <div className="bank-account-card" style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12 }}>Ajouter une règle</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Pattern (regex)" value={pattern} onChange={e => setPattern(e.target.value)}
            style={{ flex: 1, minWidth: 180, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input type="number" placeholder="Priorité" value={priority} onChange={e => setPriority(e.target.value)}
            style={{ width: 70, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <button className="btn btn-primary" onClick={handleAdd} style={{ padding: '6px 14px' }}><Plus size={14} /> Ajouter</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input placeholder="Tester un libellé..." value={testLabel} onChange={e => setTestLabel(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <button className="btn btn-ghost" onClick={handleTest} style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Tester</button>
          {testResult && <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{testResult}</span>}
        </div>
      </div>

      <div className="bank-account-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Règles personnalisées</h4>
          <button className="btn btn-ghost" onClick={refreshCategories} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>Recatégoriser tout</button>
        </div>
        {bankHistory.rules.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucune règle personnalisée</p>
        ) : (
          <table className="rules-table">
            <thead><tr><th>Pattern</th><th>Catégorie</th><th>Priorité</th><th></th></tr></thead>
            <tbody>
              {bankHistory.rules.map(r => (
                <tr key={r.id}>
                  <td><code>{r.pattern}</code></td>
                  <td><span className="tx-category" style={{ background: (catMap[r.category]?.color || '#94a3b8') + '18', color: catMap[r.category]?.color || '#94a3b8' }}>{catMap[r.category]?.label || r.category}</span></td>
                  <td>{r.priority}</td>
                  <td><button onClick={() => deleteRule(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bank-account-card">
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>Catégories par défaut</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map(c => (
            <span key={c.id} className="tx-category" style={{ background: c.color + '18', color: c.color }}>{c.label}</span>
          ))}
        </div>
      </div>
    </>
  )
}
