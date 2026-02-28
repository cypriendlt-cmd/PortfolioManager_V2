import { useState, useMemo } from 'react'
import {
  Landmark, Upload, Heart, Settings2,
  AlertTriangle, TrendingUp, TrendingDown, CreditCard, PiggyBank,
  Repeat, Trash2, Plus, Search, Shield, Target, Sunrise,
  PieChart as PieChartIcon, CheckCircle, User, Wallet,
  ArrowRight, ArrowLeft, Zap, Brain, Loader2, X, Sparkles, RotateCcw, History
} from 'lucide-react'
import { aiCategorizeLines } from '../services/bankAI'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { useBank } from '../context/BankContext'
import { usePortfolio } from '../context/PortfolioContext'
import { usePrivacyMask } from '../hooks/usePrivacyMask'
import { CATEGORIES, TAXONOMY } from '../services/bankTaxonomy'
import BankImportModal from '../components/BankImportModal'

const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtD = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n)
const fmtN = (v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
const catMap = Object.fromEntries(CATEGORIES.map(c => [c.id, c]))

const TABS = [
  { key: 'synthese', label: 'Synthese', icon: Landmark },
  { key: 'courant', label: 'Compte Courant', icon: CreditCard },
  { key: 'livrets', label: 'Livrets', icon: PiggyBank },
  { key: 'analyse', label: 'Analyse', icon: Heart },
  { key: 'securite', label: 'Matelas', icon: Shield },
  { key: 'liberte', label: 'Liberte', icon: Sunrise },
  { key: 'investissements', label: 'Allocation', icon: PieChartIcon },
  { key: 'regles', label: 'Regles', icon: Settings2 },
]

/* ─── Confidence dot ─── */
function ConfidenceDot({ confidence }) {
  const c = typeof confidence === 'number' ? confidence : 0
  const color = c >= 0.8 ? '#22c55e' : c >= 0.5 ? '#f59e0b' : '#ef4444'
  return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: 4, flexShrink: 0 }} title={`Confiance: ${(c * 100).toFixed(0)}%`} />
}

/* ─── Clickable category badge ─── */
function CategoryBadge({ tx, onCorrect }) {
  const [editing, setEditing] = useState(false)
  const cat = catMap[tx.category] || catMap.autre
  const color = cat?.color || '#94a3b8'

  if (editing) {
    return (
      <select
        autoFocus
        value={tx.category}
        onChange={e => { onCorrect(tx.hash, e.target.value); setEditing(false) }}
        onBlur={() => setEditing(false)}
        style={{ fontSize: '0.75rem', padding: '2px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
      >
        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
    )
  }

  return (
    <span
      className="tx-category"
      style={{ background: color + '18', color, cursor: 'pointer' }}
      onClick={() => setEditing(true)}
      title={tx.reason || 'Cliquer pour changer'}
    >
      <ConfidenceDot confidence={tx.confidence} />
      {tx.isTransfer && <Repeat size={10} style={{ marginRight: 3 }} />}
      {cat?.label || tx.category}
    </span>
  )
}

/* ─── AI Categorize Panel ─── */
function AICategorizePanel({ proposals, onClose, onApply }) {
  const [selected, setSelected] = useState(() => new Set(proposals.map(p => p.hash)))

  const allSelected = selected.size === proposals.length
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(proposals.map(p => p.hash)))
  const toggle = (hash) => {
    const next = new Set(selected)
    next.has(hash) ? next.delete(hash) : next.add(hash)
    setSelected(next)
  }

  const handleApply = () => {
    const corrections = proposals
      .filter(p => selected.has(p.hash))
      .map(p => ({
        hash: p.hash,
        category: p.proposedCategory,
        subcategory: p.proposedSubcategory,
        merchantName: p.merchantName,   // for auto-learning
      }))
    onApply(corrections)
  }

  return (
    <div className="ai-panel-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ai-panel">
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <Sparkles size={18} style={{ color: 'var(--accent)' }} />
            <h3>Propositions IA — Compte Courant</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="ai-panel-badge">{selected.size}/{proposals.length} sélectionnées</span>
            <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ai-panel-toolbar">
          <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 12px' }} onClick={toggleAll}>
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {proposals.length} transaction{proposals.length > 1 ? 's' : ''} analysée{proposals.length > 1 ? 's' : ''} — cliquez pour sélectionner
          </span>
        </div>

        <div className="ai-panel-list">
          {proposals.map(p => {
            const currentCat = catMap[p.currentCat] || catMap.autre
            const proposedCat = catMap[p.proposedCategory] || catMap.autre
            const isChecked = selected.has(p.hash)
            return (
              <div
                key={p.hash}
                className={`ai-proposal-row ${isChecked ? 'selected' : ''}`}
                onClick={() => toggle(p.hash)}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(p.hash)}
                  onClick={e => e.stopPropagation()}
                />
                <div className="ai-proposal-info">
                  <div className="ai-proposal-label" title={p.label}>{p.label}</div>
                  <div className="ai-proposal-meta">
                    {p.date}
                    <span className={`tx-amount ${p.amount >= 0 ? 'positive' : 'negative'}`} style={{ fontSize: '0.75rem', marginLeft: 8 }}>
                      {fmtD(p.amount)}
                    </span>
                    {p.merchantName && (
                      <span className="ai-merchant-tag" title="Nom marchand extrait — sera appris automatiquement">
                        {p.merchantName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ai-proposal-cats">
                  <span className="tx-category" style={{ background: currentCat.color + '18', color: currentCat.color }}>
                    {currentCat.label}
                  </span>
                  <ArrowRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span
                    className="tx-category ai-proposed"
                    style={{ background: proposedCat.color + '22', color: proposedCat.color, border: `1px solid ${proposedCat.color}44` }}
                    title={p.ruleHit ? `Règle: ${p.ruleHit} · Confiance: ${Math.round(p.confidence * 100)}%` : `Confiance: ${Math.round(p.confidence * 100)}%`}
                  >
                    <ConfidenceDot confidence={p.confidence} />
                    {proposedCat.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="ai-panel-footer">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flex: 1 }}>
            {selected.size === 0
              ? 'Sélectionnez les lignes à corriger'
              : <><Brain size={12} style={{ marginRight: 4, color: 'var(--accent)' }} />{selected.size} correction{selected.size > 1 ? 's' : ''} — les marchands seront mémorisés pour vos prochaines transactions</>}
          </span>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            disabled={selected.size === 0}
            onClick={handleApply}
          >
            <CheckCircle size={14} />
            Appliquer {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Banking() {
  const {
    bankHistory, loading, processing, accountBalances,
    aggregates, healthScore, coachInsights,
    importExcel, addRule, deleteRule,
    setInitialBalance, updateAccount, deleteAccount, refreshCategories,
    financeProfile, updateFinanceProfile,
    correctCategory, deleteLearnedRule, undoCorrection, clearAICache,
    requestAICategorization, lowConfidenceCount, applyAIProposals,
    forceRecategorize,
  } = useBank()
  const { m, mp } = usePrivacyMask()
  const [tab, setTab] = useState('synthese')
  const [importOpen, setImportOpen] = useState(false)

  if (loading) {
    return <div className="banking" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement...</div>
  }

  const hasProfile = financeProfile && (financeProfile.monthlyIncome > 0 || aggregates.length > 0)

  return (
    <div className="banking">
      <div className="banking-header">
        <h1><Landmark size={22} style={{ marginRight: 8 }} />Banque & Cashflow</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {processing && <Loader2 size={16} className="spin" style={{ color: 'var(--accent)' }} />}
          <button className="btn btn-primary" onClick={() => setImportOpen(true)}>
            <Upload size={14} /> Importer un releve
          </button>
        </div>
      </div>

      <div className="banking-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`banking-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <t.icon size={14} style={{ marginRight: 4 }} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'synthese' && <SyntheseTab accountBalances={accountBalances} aggregates={aggregates} healthScore={healthScore} coachInsights={coachInsights} m={m} mp={mp} />}
      {tab === 'courant' && <CourantTab bankHistory={bankHistory} accountBalances={accountBalances} setInitialBalance={setInitialBalance} deleteAccount={deleteAccount} correctCategory={correctCategory} applyAIProposals={applyAIProposals} m={m} />}
      {tab === 'livrets' && <LivretsTab bankHistory={bankHistory} accountBalances={accountBalances} setInitialBalance={setInitialBalance} deleteAccount={deleteAccount} m={m} />}
      {tab === 'analyse' && <AnalyseTab healthScore={healthScore} coachInsights={coachInsights} aggregates={aggregates} m={m} />}
      {tab === 'securite' && <SecurityTab profile={financeProfile} hasProfile={hasProfile} updateProfile={updateFinanceProfile} m={m} onSetup={() => setTab('profil')} />}
      {tab === 'liberte' && <FreedomTab profile={financeProfile} hasProfile={hasProfile} m={m} />}
      {tab === 'investissements' && <InvestmentsTab profile={financeProfile} hasProfile={hasProfile} m={m} />}
      {tab === 'regles' && <ReglesTab bankHistory={bankHistory} addRule={addRule} deleteRule={deleteRule} refreshCategories={refreshCategories} forceRecategorize={forceRecategorize} deleteLearnedRule={deleteLearnedRule} undoCorrection={undoCorrection} clearAICache={clearAICache} requestAICategorization={requestAICategorization} lowConfidenceCount={lowConfidenceCount} />}

      {(tab === 'securite' || tab === 'liberte' || tab === 'investissements') && !hasProfile && (
        <ProfileSetup profile={financeProfile} updateProfile={updateFinanceProfile} hasAggregates={aggregates.length > 0} />
      )}

      <BankImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

/* ─── PROFILE SETUP (inline — horizon/risk only, income/expenses auto-calculated) ─── */
function ProfileSetup({ profile, updateProfile, hasAggregates }) {
  const [form, setForm] = useState({
    monthlyIncome: profile?.monthlyIncome || '',
    monthlyExpenses: profile?.monthlyExpenses || '',
    currentCash: profile?.currentCash || '',
    investmentHorizon: profile?.investmentHorizon || 'moyen',
    riskTolerance: profile?.riskTolerance || 'modere',
  })
  const [done, setDone] = useState(false)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = () => {
    const data = { investmentHorizon: form.investmentHorizon, riskTolerance: form.riskTolerance }
    if (!hasAggregates) {
      data.monthlyIncome = Number(form.monthlyIncome)
      data.monthlyExpenses = Number(form.monthlyExpenses)
      data.currentCash = Number(form.currentCash)
    }
    updateProfile(data)
    setDone(true)
  }

  if (done) return null

  const canSubmit = hasAggregates || (form.monthlyIncome !== '' && form.monthlyExpenses !== '' && form.currentCash !== '')

  return (
    <div className="card" style={{ maxWidth: 520, margin: '24px auto', padding: 24 }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <User size={18} /> Configurez votre profil financier
      </h3>

      {hasAggregates && (
        <div className="alert-banner info" style={{ marginBottom: 16 }}>
          <CheckCircle size={16} />
          Revenus, depenses et epargne sont calcules automatiquement depuis vos releves bancaires importes.
        </div>
      )}

      {!hasAggregates && (
        <>
          <div className="form-group">
            <label className="form-label">Revenus mensuels nets</label>
            <input className="form-input" type="number" placeholder="ex: 2500" value={form.monthlyIncome} onChange={e => set('monthlyIncome', e.target.value)} min="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Depenses mensuelles</label>
            <input className="form-input" type="number" placeholder="ex: 1800" value={form.monthlyExpenses} onChange={e => set('monthlyExpenses', e.target.value)} min="0" />
          </div>
          <div className="form-group">
            <label className="form-label">Epargne de precaution disponible (cash)</label>
            <input className="form-input" type="number" placeholder="ex: 5000" value={form.currentCash} onChange={e => set('currentCash', e.target.value)} min="0" />
          </div>
        </>
      )}

      <div className="form-group">
        <label className="form-label">Horizon d'investissement</label>
        <div className="segmented-control">
          {[['court', 'Court terme'], ['moyen', 'Moyen terme'], ['long', 'Long terme']].map(([v, l]) => (
            <button key={v} type="button" className={form.investmentHorizon === v ? 'active' : ''} onClick={() => set('investmentHorizon', v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Tolerance au risque</label>
        <div className="segmented-control">
          {[['prudent', 'Prudent'], ['modere', 'Modere'], ['dynamique', 'Dynamique']].map(([v, l]) => (
            <button key={v} type="button" className={form.riskTolerance === v ? 'active' : ''} onClick={() => set('riskTolerance', v)}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
          <CheckCircle size={14} /> Valider
        </button>
      </div>
    </div>
  )
}

/* ─── MATELAS DE SECURITE ─── */
function SecurityTab({ profile, hasProfile, m }) {
  if (!hasProfile) return null

  const { currentCash, monthlyExpenses, riskTolerance, monthlyIncome } = profile
  const TARGET_MAP = { prudent: 6, modere: 4, dynamique: 3 }
  const cushionMonths = monthlyExpenses > 0 ? currentCash / monthlyExpenses : 0
  const targetMonths = TARGET_MAP[riskTolerance] || 4
  const targetAmount = targetMonths * monthlyExpenses
  const gap = Math.max(0, targetAmount - currentCash)
  const progress = targetAmount > 0 ? Math.min((currentCash / targetAmount) * 100, 100) : 0
  const isReached = currentCash >= targetAmount
  const monthlySavings = monthlyIncome - monthlyExpenses
  const monthsToTarget = monthlySavings > 0 && gap > 0 ? Math.ceil(gap / monthlySavings) : 0

  const barColor = isReached ? 'var(--success)' : progress >= 50 ? 'var(--warning)' : 'var(--danger)'

  return (
    <>
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '1rem', fontWeight: 700 }}>
          <Shield size={18} style={{ color: 'var(--accent)' }} /> Etat actuel
        </h3>
        <div className="stats-row">
          <div className="stat-mini">
            <span className="stat-mini-label">Epargne disponible</span>
            <span className="stat-mini-value">{m(fmt(currentCash))}</span>
          </div>
          <div className="stat-mini">
            <span className="stat-mini-label">Mois couverts</span>
            <span className="stat-mini-value" style={{ color: barColor }}>{cushionMonths.toFixed(1)} mois</span>
          </div>
          <div className="stat-mini">
            <span className="stat-mini-label">Objectif</span>
            <span className="stat-mini-value">{targetMonths} mois</span>
            <span className="stat-mini-note">Profil {riskTolerance}</span>
          </div>
        </div>

        <div style={{ marginTop: 20, marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>0 EUR</span>
          <span>Objectif : {m(fmt(targetAmount))}</span>
        </div>
        <div className="progress-bar" style={{ height: 14 }}>
          <div className="progress-fill" style={{ width: `${progress}%`, background: barColor }} />
        </div>
        <p style={{ textAlign: 'center', marginTop: 8, fontSize: '0.9rem', fontWeight: 600, color: barColor }}>
          {progress.toFixed(0)} %
        </p>
      </div>

      {!isReached && (
        <div className="card" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '1rem', fontWeight: 700 }}>
            <Target size={18} style={{ color: 'var(--accent)' }} /> Pour atteindre votre objectif
          </h3>
          <div className="stats-row">
            <div className="stat-mini">
              <span className="stat-mini-label">Montant manquant</span>
              <span className="stat-mini-value" style={{ color: 'var(--danger)' }}>{m(fmt(gap))}</span>
            </div>
            <div className="stat-mini">
              <span className="stat-mini-label">Delai estime</span>
              <span className="stat-mini-value">{monthlySavings > 0 ? `${monthsToTarget} mois` : '--'}</span>
              {monthlySavings > 0 && <span className="stat-mini-note">A {m(fmt(monthlySavings))}/mois d'epargne</span>}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        {isReached ? (
          <div className="alert-banner success"><CheckCircle size={16} /> Objectif atteint ! Votre matelas de securite est solide. Orientez votre epargne vers des investissements.</div>
        ) : cushionMonths < 1 ? (
          <div className="alert-banner danger"><AlertTriangle size={16} /> Situation critique : moins d'un mois de depenses couvert. Priorite absolue : constituer votre epargne de precaution.</div>
        ) : (
          <div className="alert-banner warning"><TrendingUp size={16} /> Continuez a alimenter votre epargne. Il manque {m(fmt(gap))} pour atteindre {targetMonths} mois.</div>
        )}
      </div>
    </>
  )
}

/* ─── LIBERTE FINANCIERE ─── */
function FreedomTab({ profile, hasProfile, m }) {
  const { totals } = usePortfolio()

  const data = useMemo(() => {
    if (!hasProfile || !profile || !totals) return null
    const { monthlyIncome, monthlyExpenses, currentCash, riskTolerance } = profile
    const RATES = { prudent: 0.04, modere: 0.07, dynamique: 0.10 }
    const monthlySavings = monthlyIncome - monthlyExpenses
    const annualReturn = RATES[riskTolerance] || 0.07
    const freedomNumber = monthlyExpenses > 0 ? (monthlyExpenses * 12) / 0.04 : 0
    const currentWealth = (totals.total || 0) + currentCash
    const progress = freedomNumber > 0 ? Math.min((currentWealth / freedomNumber) * 100, 100) : 0

    let yearsToFreedom = null
    if (monthlySavings > 0 && freedomNumber > currentWealth) {
      const annualSavings = monthlySavings * 12
      let wealth = currentWealth
      for (let y = 1; y <= 100; y++) {
        wealth = wealth * (1 + annualReturn) + annualSavings
        if (wealth >= freedomNumber) { yearsToFreedom = y; break }
      }
    } else if (currentWealth >= freedomNumber && freedomNumber > 0) {
      yearsToFreedom = 0
    }

    const maxYears = yearsToFreedom != null ? Math.min(yearsToFreedom + 5, 50) : 30
    const step = maxYears <= 15 ? 1 : maxYears <= 30 ? 5 : 10
    const projections = []
    let w = currentWealth
    const annualSavings = Math.max(monthlySavings, 0) * 12
    for (let y = 0; y <= maxYears; y++) {
      if (y > 0) w = w * (1 + annualReturn) + annualSavings
      if (y % step === 0 || y === maxYears) {
        projections.push({ year: y, wealth: w, isFreedom: yearsToFreedom != null && y >= yearsToFreedom })
      }
    }

    return { monthlySavings, annualReturn, freedomNumber, currentWealth, progress, yearsToFreedom, projections }
  }, [profile, hasProfile, totals])

  if (!hasProfile || !data) return null

  const { monthlySavings, annualReturn, freedomNumber, currentWealth, progress, yearsToFreedom, projections } = data
  const maxWealth = Math.max(...projections.map(p => p.wealth), freedomNumber)

  return (
    <>
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '1rem', fontWeight: 700 }}>
          <Target size={18} style={{ color: 'var(--accent)' }} /> Objectif de liberte
        </h3>
        <div className="stats-row">
          <div className="stat-mini">
            <span className="stat-mini-label">Freedom number</span>
            <span className="stat-mini-value">{m(fmt(freedomNumber))}</span>
            <span className="stat-mini-note">Regle des 4 %</span>
          </div>
          <div className="stat-mini">
            <span className="stat-mini-label">Patrimoine actuel</span>
            <span className="stat-mini-value">{m(fmt(currentWealth))}</span>
            <span className="stat-mini-note">Portefeuille + cash</span>
          </div>
          <div className="stat-mini">
            <span className="stat-mini-label">Delai estime</span>
            <span className="stat-mini-value">{yearsToFreedom === 0 ? 'Atteint' : yearsToFreedom != null ? `${yearsToFreedom} ans` : '--'}</span>
            <span className="stat-mini-note">Rendement {(annualReturn * 100).toFixed(0)} % / an</span>
          </div>
        </div>

        <div style={{ marginTop: 20, marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>{m(fmt(currentWealth))}</span>
          <span>{m(fmt(freedomNumber))}</span>
        </div>
        <div className="progress-bar" style={{ height: 14 }}>
          <div className="progress-fill" style={{ width: `${progress}%`, background: progress >= 100 ? 'var(--success)' : 'var(--accent)' }} />
        </div>
        <p style={{ textAlign: 'center', marginTop: 6, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {progress.toFixed(1)} % atteint
        </p>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '1rem', fontWeight: 700 }}>
          <TrendingUp size={18} style={{ color: 'var(--accent)' }} /> Projection
        </h3>
        <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Epargne mensuelle : {m(fmt(monthlySavings))} &middot; Rendement : {(annualReturn * 100).toFixed(0)} % / an
        </p>

        {projections.length > 1 ? (
          <div className="projection-bars">
            {projections.map((p, i) => (
              <div key={i} className="projection-bar-col">
                <div className="projection-bar-value">{p.wealth >= 1e6 ? `${(p.wealth / 1e6).toFixed(1)}M` : fmtN(p.wealth)}</div>
                <div className={`projection-bar ${p.isFreedom ? 'highlight' : ''}`}
                  style={{ height: `${maxWealth > 0 ? Math.max((p.wealth / maxWealth) * 150, 4) : 4}px` }} />
                <div className="projection-bar-label">A{p.year}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Epargne mensuelle insuffisante pour projeter une croissance.</p>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        {yearsToFreedom === 0 ? (
          <div className="alert-banner success"><CheckCircle size={16} /> Liberte financiere atteinte ! Votre patrimoine couvre vos depenses grace a la regle des 4 %.</div>
        ) : monthlySavings <= 0 ? (
          <div className="alert-banner danger"><Sunrise size={16} /> Sans capacite d'epargne, la liberte financiere ne peut etre atteinte. Equilibrez votre budget.</div>
        ) : (
          <div className="alert-banner info"><Sunrise size={16} /> En epargnant {m(fmt(monthlySavings))}/mois avec {(annualReturn * 100).toFixed(0)} % de rendement, liberte financiere dans ~{yearsToFreedom} ans.</div>
        )}
      </div>
    </>
  )
}

/* ─── INVESTISSEMENTS / ALLOCATION ─── */
const ALLOC_KEYS = ['crypto', 'pea', 'livrets', 'fundraising']
const ALLOC_LABELS = { crypto: 'Crypto', pea: 'PEA', livrets: 'Livrets', fundraising: 'Fundraising' }
const ALLOC_COLORS = { crypto: '#f7931a', pea: '#4f8cf7', livrets: '#34d399', fundraising: '#a78bfa' }
const SUGGESTED = {
  'prudent-court': [5, 20, 65, 10], 'prudent-moyen': [5, 35, 50, 10], 'prudent-long': [10, 45, 35, 10],
  'modere-court': [10, 30, 45, 15], 'modere-moyen': [15, 40, 30, 15], 'modere-long': [20, 45, 20, 15],
  'dynamique-court': [15, 35, 30, 20], 'dynamique-moyen': [25, 40, 15, 20], 'dynamique-long': [30, 40, 10, 20],
}

function InvestmentsTab({ profile, hasProfile, m }) {
  const { totals } = usePortfolio()

  const data = useMemo(() => {
    if (!totals || !hasProfile || !profile) return null
    const total = ALLOC_KEYS.reduce((s, k) => s + (totals[k] || 0), 0)
    const current = ALLOC_KEYS.map(k => total > 0 ? ((totals[k] || 0) / total) * 100 : 0)
    const key = `${profile.riskTolerance}-${profile.investmentHorizon}`
    const suggested = SUGGESTED[key] || SUGGESTED['modere-moyen']
    return { total, current, suggested }
  }, [totals, profile, hasProfile])

  if (!hasProfile || !data) return null

  const { total, current, suggested } = data

  return (
    <>
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '1rem', fontWeight: 700 }}>
          <PieChartIcon size={18} style={{ color: 'var(--accent)' }} /> Allocation actuelle
        </h3>
        {total === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Aucun actif en portefeuille.</p>
        ) : (
          ALLOC_KEYS.map((k, i) => (
            <div key={k} className="alloc-row">
              <span className="alloc-label">{ALLOC_LABELS[k]}</span>
              <div className="alloc-bar-wrap">
                <div className="alloc-bar" style={{ width: `${current[i]}%`, background: ALLOC_COLORS[k] }} />
              </div>
              <span className="alloc-pct">{current[i].toFixed(1)} %</span>
              <span className="alloc-value">{m(fmt(totals[k] || 0))}</span>
            </div>
          ))
        )}
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: '1rem', fontWeight: 700 }}>
          <PieChartIcon size={18} style={{ color: 'var(--accent)' }} /> Allocation suggeree
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Profil : {profile.riskTolerance} / horizon {profile.investmentHorizon} terme
        </p>
        {ALLOC_KEYS.map((k, i) => (
          <div key={k} className="alloc-row">
            <span className="alloc-label">{ALLOC_LABELS[k]}</span>
            <div className="alloc-bar-wrap">
              <div className="alloc-bar" style={{ width: `${suggested[i]}%`, background: ALLOC_COLORS[k], opacity: 0.7 }} />
            </div>
            <span className="alloc-pct">{suggested[i]} %</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12, fontSize: '1rem', fontWeight: 700 }}>Comparaison</h3>
        <table className="compare-table">
          <thead><tr><th>Classe</th><th>Actuel</th><th>Suggere</th><th>Ecart</th></tr></thead>
          <tbody>
            {ALLOC_KEYS.map((k, i) => {
              const diff = current[i] - suggested[i]
              return (
                <tr key={k}>
                  <td>{ALLOC_LABELS[k]}</td>
                  <td>{current[i].toFixed(1)} %</td>
                  <td>{suggested[i]} %</td>
                  <td style={{ color: diff > 2 ? 'var(--success)' : diff < -2 ? 'var(--danger)' : 'inherit', fontWeight: Math.abs(diff) > 2 ? 600 : 400 }}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(1)} %
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {ALLOC_KEYS.map((k, i) => {
        const diff = current[i] - suggested[i]
        if (Math.abs(diff) < 5) return null
        const over = diff > 0
        return (
          <div key={k} className={`alert-banner ${over ? 'warning' : 'info'}`} style={{ marginBottom: 10 }}>
            {over ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
            {over
              ? `Surexposition en ${ALLOC_LABELS[k]} (+${diff.toFixed(0)} %). Envisagez de reequilibrer.`
              : `Sous-exposition en ${ALLOC_LABELS[k]} (${diff.toFixed(0)} %). Opportunite de renforcement.`
            }
          </div>
        )
      })}
    </>
  )
}

/* ─── SYNTHESE ─── */
function SyntheseTab({ accountBalances, aggregates, healthScore, coachInsights, m, mp }) {
  const [netMode, setNetMode] = useState(false)
  const courants = accountBalances.filter(a => a.type === 'courant')
  const livrets = accountBalances.filter(a => a.type !== 'courant')
  const totalCourant = courants.reduce((s, a) => s + a.balance, 0)
  const totalLivrets = livrets.reduce((s, a) => s + a.balance, 0)
  const lastMonths = aggregates.slice(-12)

  const netData = useMemo(() => lastMonths.map(m => ({
    ...m,
    net: m.income - m.expenses,
  })), [lastMonths])

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
          <div className="account-type">Taux d'epargne</div>
          <div className="account-balance">{savingsRate.toFixed(1)}%</div>
        </div>
        <div className="bank-account-card">
          <div className="account-type">Score sante</div>
          <div className="account-balance" style={{ color: healthScore >= 60 ? 'var(--success)' : healthScore >= 40 ? 'var(--warning)' : 'var(--danger)' }}>
            {healthScore}/100
          </div>
        </div>
      </div>

      {lastMonths.length > 0 && (
        <div className="cashflow-chart-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Cashflow mensuel</h3>
            <div className="segmented-control" style={{ fontSize: '0.75rem' }}>
              <button className={!netMode ? 'active' : ''} onClick={() => setNetMode(false)}>Brut</button>
              <button className={netMode ? 'active' : ''} onClick={() => setNetMode(true)}>Net</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={netMode ? netData : lastMonths}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={m => { const [, mm] = m.split('-'); return ['Jan','Fev','Mar','Avr','Mai','Juin','Juil','Aout','Sep','Oct','Nov','Dec'][parseInt(mm)-1] || m }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '0.82rem' }} />
              {netMode ? (
                <Bar dataKey="net" name="Cashflow net" fill="#3b82f6" radius={[4,4,0,0]} />
              ) : (
                <>
                  <Bar dataKey="income" name="Revenus" fill="#22c55e" radius={[4,4,0,0]} />
                  <Bar dataKey="expenses" name="Depenses" fill="#ef4444" radius={[4,4,0,0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {coachInsights?.topExpenses && (
        <div className="bank-account-card" style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>Top depenses par categorie</h4>
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

/* ─── CONFIRM DELETE MODAL ─── */
function ConfirmDeleteModal({ account, txCount, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} />
            Supprimer le compte
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onCancel}><X size={18} /></button>
        </div>
        <div style={{ padding: '8px 0 16px' }}>
          <p style={{ marginBottom: 8 }}>
            Voulez-vous vraiment supprimer <strong>{account.alias}</strong> ?
          </p>
          {txCount > 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: '8px 12px' }}>
              Cette action supprimera également <strong>{txCount} transaction{txCount > 1 ? 's' : ''}</strong> associée{txCount > 1 ? 's' : ''}.
            </p>
          )}
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 8 }}>
            Cette action est irréversible.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button
            className="btn btn-primary"
            style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={onConfirm}
          >
            <Trash2 size={14} /> Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── COMPTE COURANT ─── */
function CourantTab({ bankHistory, accountBalances, setInitialBalance, deleteAccount, correctCategory, applyAIProposals, m }) {
  const [monthFilter, setMonthFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [search, setSearch] = useState('')
  const [balanceInput, setBalanceInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiProposals, setAiProposals] = useState([])
  const [aiError, setAiError] = useState(null)

  const courantAccounts = useMemo(() => accountBalances.filter(a => a.type === 'courant'), [accountBalances])
  const courantIds = useMemo(() => new Set(courantAccounts.map(a => a.id)), [courantAccounts])

  const handleAIAnalyze = async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      // Select uncategorized or low-confidence courant transactions
      const toAnalyze = bankHistory.transactions
        .filter(t => courantIds.has(t.accountId))
        .filter(t => !t.category || t.category === 'autre' || (t.confidence || 0) < 0.6)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 30)
        .map(t => ({ hash: t.hash, label: t.label, amount: t.amount, date: t.date }))

      if (toAnalyze.length === 0) {
        setAiError('Toutes les transactions ont déjà une catégorie fiable.')
        setAiLoading(false)
        return
      }

      const results = await aiCategorizeLines(toAnalyze)

      const proposals = results
        .map(r => {
          const tx = bankHistory.transactions.find(t => t.hash === r.hash)
          if (!tx) return null
          // Only show if AI proposes a different category
          if (r.category === tx.category) return null
          return {
            hash: r.hash,
            label: tx.label,
            date: tx.date,
            amount: tx.amount,
            currentCat: tx.category || 'autre',
            proposedCategory: r.category,
            proposedSubcategory: r.subcategory,
            merchantName: r.merchantName,
            confidence: r.confidence,
            ruleHit: r.ruleHit,
          }
        })
        .filter(Boolean)

      if (proposals.length === 0) {
        setAiError("L'IA n'a pas de nouvelles propositions à faire.")
      } else {
        setAiProposals(proposals)
        setAiPanelOpen(true)
      }
    } catch {
      setAiError("Erreur lors de l'analyse IA. Vérifiez que le backend est démarré.")
    } finally {
      setAiLoading(false)
    }
  }

  const handleApplyProposals = (corrections) => {
    // corrections include merchantName for auto-learning
    applyAIProposals(corrections)
    setAiPanelOpen(false)
    setAiProposals([])
  }

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

  const months = useMemo(() =>
    [...new Set(bankHistory.transactions.filter(t => courantIds.has(t.accountId)).map(t => t.date.slice(0, 7)))].sort().reverse(),
    [bankHistory.transactions, courantIds]
  )

  return (
    <>
      <div className="bank-accounts-grid">
        {courantAccounts.map(a => (
          <div key={a.id} className="bank-account-card" style={{ position: 'relative' }}>
            <button
              onClick={() => setConfirmDelete(a)}
              title="Supprimer ce compte"
              style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, lineHeight: 1 }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={14} />
            </button>
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
          <option value="">Toutes categories</option>
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button
          className="btn btn-primary ai-analyze-btn"
          onClick={handleAIAnalyze}
          disabled={aiLoading || bankHistory.transactions.filter(t => courantIds.has(t.accountId)).length === 0}
          title="Analyser les transactions non catégorisées avec l'IA Groq"
        >
          {aiLoading
            ? <Loader2 size={14} className="spin" />
            : <Sparkles size={14} />}
          {aiLoading ? 'Analyse...' : 'IA Groq'}
        </button>
      </div>

      {aiError && (
        <div className="alert-banner info" style={{ marginBottom: 12, fontSize: '0.82rem' }}>
          <Brain size={14} /> {aiError}
          <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }} onClick={() => setAiError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="tx-table">
          <thead>
            <tr><th>Date</th><th>Libelle</th><th>Categorie</th><th style={{ textAlign: 'right' }}>Montant</th></tr>
          </thead>
          <tbody>
            {txs.slice(0, 200).map(tx => (
              <tr key={tx.hash} className={tx.isTransfer ? 'tx-transfer' : ''}>
                <td>{tx.date}</td>
                <td>{tx.label}</td>
                <td>
                  <CategoryBadge tx={tx} onCorrect={correctCategory} />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>{m(fmtD(tx.amount))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length > 200 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: 12 }}>Affichage limite a 200 transactions</p>}
        {txs.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Aucune transaction. Importez un releve bancaire.</p>}
      </div>

      {confirmDelete && (
        <ConfirmDeleteModal
          account={confirmDelete}
          txCount={bankHistory.transactions.filter(t => t.accountId === confirmDelete.id).length}
          onConfirm={() => { deleteAccount(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {aiPanelOpen && (
        <AICategorizePanel
          proposals={aiProposals}
          onClose={() => { setAiPanelOpen(false); setAiProposals([]) }}
          onApply={handleApplyProposals}
        />
      )}
    </>
  )
}

/* ─── LIVRETS BANCAIRES ─── */
function LivretsTab({ bankHistory, accountBalances, setInitialBalance, deleteAccount, m }) {
  const [balanceInput, setBalanceInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
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
          <div key={a.id} className="bank-account-card" style={{ position: 'relative' }}>
            <button
              onClick={() => setConfirmDelete(a)}
              title="Supprimer ce livret"
              style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, lineHeight: 1 }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <X size={14} />
            </button>
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
          <p style={{ color: 'var(--text-muted)', padding: 20 }}>Aucun livret importe. Nommez vos feuilles Excel ACC__LIVRET__NomDuLivret.</p>
        )}
      </div>

      {monthlyData.length > 0 && (
        <div className="cashflow-chart-container">
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Evolution mensuelle des livrets</h3>
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

      {confirmDelete && (
        <ConfirmDeleteModal
          account={confirmDelete}
          txCount={bankHistory.transactions.filter(t => t.accountId === confirmDelete.id).length}
          onConfirm={() => { deleteAccount(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
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
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Score de sante financiere</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
            {healthScore >= 70 ? 'Excellent ! Vos finances sont bien gerees.' :
             healthScore >= 50 ? 'Correct, mais des ameliorations sont possibles.' :
             'Attention, votre situation financiere necessite des ajustements.'}
          </div>
        </div>
      </div>

      <div className="bank-insights-grid">
        <div className="bank-insight-card">
          <h4><AlertTriangle size={14} style={{ color: 'var(--danger)' }} /> Frais bancaires detectes</h4>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 8 }}>{m(fmt(coachInsights.fees.total))}</div>
          {coachInsights.fees.items.slice(0, 5).map((f, i) => (
            <div key={i} style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>{f.label.slice(0, 40)}</span>
              <span style={{ fontWeight: 600 }}>{fmtD(f.amount)}</span>
            </div>
          ))}
        </div>

        <div className="bank-insight-card">
          <h4><Repeat size={14} style={{ color: 'var(--accent)' }} /> Abonnements recurrents</h4>
          {coachInsights.recurring.slice(0, 6).map((r, i) => (
            <div key={i} style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{r.label.slice(0, 30)}</span>
              <span style={{ fontWeight: 600 }}>~{fmtD(r.avgAmount)}/mois</span>
            </div>
          ))}
          {coachInsights.recurring.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Aucun abonnement detecte</p>}
        </div>

        <div className="bank-insight-card">
          <h4><AlertTriangle size={14} style={{ color: 'var(--warning)' }} /> Anomalies</h4>
          {coachInsights.anomalies.map((a, i) => (
            <div key={i} style={{ fontSize: '0.78rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
              <div>{a.label.slice(0, 50)}</div>
              <div style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtD(a.amount)}</div>
            </div>
          ))}
          {coachInsights.anomalies.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Aucune anomalie detectee</p>}
        </div>
      </div>

      <div className="bank-account-card">
        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>Recommandations</h4>
        {coachInsights.recommendations.map((r, i) => (
          <div key={i} className="recommendation-item">{r}</div>
        ))}
      </div>
    </>
  )
}

/* ─── REGLES & CATEGORIES ─── */
function ReglesTab({ bankHistory, addRule, deleteRule, refreshCategories, forceRecategorize, deleteLearnedRule, undoCorrection, clearAICache, requestAICategorization, lowConfidenceCount }) {
  const [pattern, setPattern] = useState('')
  const [category, setCategory] = useState('autre')
  const [priority, setPriority] = useState(50)
  const [testLabel, setTestLabel] = useState('')
  const [testResult, setTestResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [confirmForce, setConfirmForce] = useState(false)

  const learnedRules = bankHistory.learnedRules || {}
  const learnedEntries = Object.entries(learnedRules)
  const aiCacheCount = Object.keys(bankHistory.aiCache || {}).length

  const handleAdd = () => {
    if (!pattern) return
    addRule({ pattern, category, priority: parseInt(priority) })
    setPattern('')
  }

  const handleTest = () => {
    if (!testLabel) return
    try {
      const re = new RegExp(pattern, 'i')
      setTestResult(re.test(testLabel) ? `Match -> ${category}` : 'Pas de match')
    } catch {
      setTestResult('Regex invalide')
    }
  }

  const handleAI = async () => {
    setAiLoading(true)
    setAiResult(null)
    try {
      const result = await requestAICategorization()
      setAiResult(result.count > 0 ? `${result.count} marchands categorises` : 'Aucun marchand a categoriser')
    } catch {
      setAiResult('Erreur IA')
    }
    setAiLoading(false)
  }

  return (
    <>
      <div className="bank-account-card" style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12 }}>Ajouter une regle</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Pattern (regex)" value={pattern} onChange={e => setPattern(e.target.value)}
            style={{ flex: 1, minWidth: 180, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <select value={category} onChange={e => setCategory(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input type="number" placeholder="Priorite" value={priority} onChange={e => setPriority(e.target.value)}
            style={{ width: 70, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <button className="btn btn-primary" onClick={handleAdd} style={{ padding: '6px 14px' }}><Plus size={14} /> Ajouter</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <input placeholder="Tester un libelle..." value={testLabel} onChange={e => setTestLabel(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          <button className="btn btn-ghost" onClick={handleTest} style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Tester</button>
          {testResult && <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{testResult}</span>}
        </div>
      </div>

      <div className="bank-account-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>Regles personnalisees</h4>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" onClick={refreshCategories} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
              Appliquer les regles
            </button>
            {!confirmForce ? (
              <button className="btn btn-ghost" onClick={() => setConfirmForce(true)} style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--warning)' }}>
                <Zap size={12} /> Tout recategoriser
              </button>
            ) : (
              <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Confirmer ?</span>
                <button className="btn btn-primary" onClick={() => { forceRecategorize(); setConfirmForce(false) }} style={{ fontSize: '0.72rem', padding: '3px 8px', background: 'var(--warning)', borderColor: 'var(--warning)' }}>
                  Oui
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmForce(false)} style={{ fontSize: '0.72rem', padding: '3px 8px' }}>
                  Non
                </button>
              </span>
            )}
          </div>
        </div>
        {bankHistory.rules.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucune regle personnalisee</p>
        ) : (
          <table className="rules-table">
            <thead><tr><th>Pattern</th><th>Categorie</th><th>Priorite</th><th></th></tr></thead>
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

      {/* Learned rules section */}
      <div className="bank-account-card" style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>
          <Brain size={14} style={{ marginRight: 4 }} /> Regles apprises ({learnedEntries.length})
        </h4>
        {learnedEntries.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Corrigez une categorie dans la table pour creer une regle apprise.</p>
        ) : (
          <table className="rules-table">
            <thead><tr><th>Marchand</th><th>Categorie</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {learnedEntries.map(([key, rule]) => (
                <tr key={key}>
                  <td style={{ fontSize: '0.78rem' }}>{key}</td>
                  <td>
                    <span className="tx-category" style={{ background: (catMap[rule.category]?.color || '#94a3b8') + '18', color: catMap[rule.category]?.color || '#94a3b8' }}>
                      {catMap[rule.category]?.label || rule.category}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rule.learnedAt?.slice(0, 10)}</td>
                  <td><button onClick={() => deleteLearnedRule(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* AI section */}
      <div className="bank-account-card" style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>
          <Zap size={14} style={{ marginRight: 4 }} /> Categorisation IA
        </h4>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleAI} disabled={aiLoading || lowConfidenceCount === 0} style={{ padding: '6px 14px' }}>
            {aiLoading ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
            {aiLoading ? ' Analyse...' : ` Categoriser (${lowConfidenceCount} marchands)`}
          </button>
          {aiCacheCount > 0 && (
            <button className="btn btn-ghost" onClick={clearAICache} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
              Vider le cache ({aiCacheCount})
            </button>
          )}
          {aiResult && <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent)' }}>{aiResult}</span>}
        </div>
      </div>

      <div className="bank-account-card" style={{ marginBottom: 16 }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 10 }}>Categories par defaut</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORIES.map(c => (
            <span key={c.id} className="tx-category" style={{ background: c.color + '18', color: c.color }}>{c.label}</span>
          ))}
        </div>
      </div>

      {/* Audit History */}
      <AuditHistorySection corrections={bankHistory.corrections || []} onUndo={undoCorrection} />
    </>
  )
}

/* ─── AUDIT HISTORY ─── */
function AuditHistorySection({ corrections, onUndo }) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...corrections].sort((a, b) => b.corrected_at.localeCompare(a.corrected_at))
  const visible = showAll ? sorted : sorted.slice(0, 15)

  return (
    <div className="bank-account-card">
      <div className="audit-history-header">
        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <History size={14} /> Historique des corrections ({sorted.length})
        </h4>
        {sorted.length > 15 && (
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Reduire' : `Voir tout (${sorted.length})`}
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Aucune correction enregistree. Corrigez une categorie dans Compte Courant pour commencer.
        </p>
      ) : (
        <div className="audit-history-list">
          {visible.map(c => {
            const beforeCat = catMap[c.before?.category] || catMap.autre
            const afterCat  = catMap[c.after?.category]  || catMap.autre
            const isAI = c.source === 'ai_accepted'
            return (
              <div key={c.id} className="audit-row">
                <div className="audit-row-main">
                  <span className="audit-date">{c.corrected_at?.slice(0, 10)}</span>
                  <span className="audit-merchant" title={c.raw_label}>{c.merchant_key || '—'}</span>
                  <span className="tx-category" style={{ background: beforeCat.color + '18', color: beforeCat.color, fontSize: '0.72rem' }}>
                    {beforeCat.label}
                  </span>
                  <ArrowRight size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span className="tx-category" style={{ background: afterCat.color + '22', color: afterCat.color, fontSize: '0.72rem', border: `1px solid ${afterCat.color}44` }}>
                    {afterCat.label}
                    {c.after?.subcategory && <span style={{ opacity: 0.7 }}> · {c.after.subcategory}</span>}
                  </span>
                  <span className={`audit-source-badge ${isAI ? 'ai' : 'user'}`}>
                    {isAI ? 'IA' : 'Manuel'}
                  </span>
                </div>
                <button
                  className="btn btn-ghost audit-undo-btn"
                  onClick={() => onUndo(c.id)}
                  title={`Annuler cette correction (${c.merchant_key})`}
                >
                  <RotateCcw size={12} /> Annuler
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
