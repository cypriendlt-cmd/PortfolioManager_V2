import React, { useMemo } from 'react';
import { useBeta } from '../../context/BetaContext';
import { usePortfolio } from '../../context/PortfolioContext';
import {
  Activity, Wallet, Shield, PieChart, AlertTriangle, CheckCircle, TrendingUp,
} from 'lucide-react';

const fmt = v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

const ALLOC_COLORS = {
  crypto: '#f7931a',
  pea: '#4f8cf7',
  livrets: '#34d399',
  fundraising: '#a78bfa',
};

const ALLOC_LABELS = {
  crypto: 'Crypto',
  pea: 'PEA',
  livrets: 'Livrets',
  fundraising: 'Fundraising',
};

function ScoreRing({ score }) {
  const r = 58;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(score, 100) / 100) * circ;
  const color = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="beta-score-ring">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle className="ring-bg" cx="70" cy="70" r={r} />
        <circle
          className="ring-fg"
          cx="70" cy="70" r={r}
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="beta-score-label">
        <span className="score-value" style={{ color }}>{Math.round(score)}</span>
        <span className="score-caption">/ 100</span>
      </div>
    </div>
  );
}

function MiniDonut({ totals }) {
  const keys = ['crypto', 'pea', 'livrets', 'fundraising'];
  const total = keys.reduce((s, k) => s + (totals[k] || 0), 0);
  if (total === 0) return <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Aucun actif en portefeuille.</p>;

  // Build conic-gradient
  let cumPct = 0;
  const stops = [];
  keys.forEach(k => {
    const pct = ((totals[k] || 0) / total) * 100;
    stops.push(`${ALLOC_COLORS[k]} ${cumPct}% ${cumPct + pct}%`);
    cumPct += pct;
  });

  return (
    <div className="beta-donut-wrap">
      <div
        className="beta-donut"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
      >
        <div className="beta-donut-center">{fmt(total)} &euro;</div>
      </div>
      <div className="beta-donut-legend">
        {keys.map(k => {
          const pct = total > 0 ? ((totals[k] || 0) / total) * 100 : 0;
          return (
            <div key={k} className="beta-donut-legend-item">
              <div className="beta-donut-legend-dot" style={{ background: ALLOC_COLORS[k] }} />
              <span>{ALLOC_LABELS[k]}</span>
              <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{pct.toFixed(1)} %</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BetaDashboard() {
  const { userProfile, profileLoading } = useBeta();
  const { totals, loading: portfolioLoading } = usePortfolio();

  const metrics = useMemo(() => {
    if (!userProfile) return null;
    const { monthlyIncome, monthlyExpenses, currentCash } = userProfile;
    const monthlySavings = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;
    const cushionMonths = monthlyExpenses > 0 ? currentCash / monthlyExpenses : 0;
    const totalPortfolio = totals?.total || 0;

    // Score: savings rate (40pts), cushion (30pts), diversification (30pts)
    const srScore = Math.min(savingsRate / 30 * 40, 40);
    const cushionScore = Math.min(cushionMonths / 6 * 30, 30);

    const keys = ['crypto', 'pea', 'livrets', 'fundraising'];
    const nonZero = keys.filter(k => (totals?.[k] || 0) > 0).length;
    const divScore = Math.min((nonZero / 4) * 30, 30);

    const score = Math.max(0, Math.min(100, srScore + cushionScore + divScore));

    return { monthlySavings, savingsRate, cushionMonths, totalPortfolio, score };
  }, [userProfile, totals]);

  if (profileLoading || portfolioLoading) {
    return <div className="beta-page"><div className="beta-loading">Chargement...</div></div>;
  }

  if (!userProfile || !metrics) return null;

  const { monthlySavings, savingsRate, cushionMonths, totalPortfolio, score } = metrics;

  const tips = [];
  if (cushionMonths < 3) tips.push({ type: 'danger', text: `Votre matelas de securite couvre seulement ${cushionMonths.toFixed(1)} mois de depenses. Visez au moins 3 mois.` });
  if (savingsRate < 10) tips.push({ type: 'warning', text: `Votre taux d'epargne est faible (${savingsRate.toFixed(0)} %). Essayez de reduire vos depenses ou augmenter vos revenus.` });
  if (savingsRate >= 20) tips.push({ type: 'success', text: `Excellent taux d'epargne de ${savingsRate.toFixed(0)} %. Continuez ainsi !` });
  if (cushionMonths >= 6) tips.push({ type: 'success', text: `Matelas de securite solide : ${cushionMonths.toFixed(1)} mois couverts.` });

  return (
    <div className="beta-page">
      <h1>Tableau de bord</h1>
      <p className="beta-subtitle">Vue d'ensemble de votre sante financiere</p>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, marginBottom: 24 }}>
        <div className="beta-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div>
            <ScoreRing score={score} />
            <p style={{ textAlign: 'center', marginTop: 8, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Sante financiere
            </p>
          </div>
        </div>

        <div className="beta-card">
          <div className="beta-stats-grid cols-2">
            <div className="beta-stat">
              <span className="beta-stat-label">Epargne mensuelle</span>
              <span className="beta-stat-value" style={{ color: monthlySavings >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmt(monthlySavings)} &euro;
              </span>
            </div>
            <div className="beta-stat">
              <span className="beta-stat-label">Taux d'epargne</span>
              <span className="beta-stat-value">{savingsRate.toFixed(1)} %</span>
            </div>
            <div className="beta-stat">
              <span className="beta-stat-label">Matelas de securite</span>
              <span className="beta-stat-value">{cushionMonths.toFixed(1)} mois</span>
            </div>
            <div className="beta-stat">
              <span className="beta-stat-label">Portefeuille total</span>
              <span className="beta-stat-value">{fmt(totalPortfolio)} &euro;</span>
            </div>
          </div>
        </div>
      </div>

      {tips.length > 0 && (
        <div className="beta-section">
          <p className="beta-section-title">Conseils</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tips.map((t, i) => (
              <div key={i} className={`beta-alert ${t.type}`}>
                {t.type === 'success' ? <CheckCircle size={18} /> :
                 t.type === 'danger' ? <AlertTriangle size={18} /> :
                 <AlertTriangle size={18} />}
                <span>{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="beta-card">
        <div className="beta-card-header">
          <PieChart size={20} />
          <h2>Repartition du portefeuille</h2>
        </div>
        <MiniDonut totals={totals || {}} />
      </div>
    </div>
  );
}
