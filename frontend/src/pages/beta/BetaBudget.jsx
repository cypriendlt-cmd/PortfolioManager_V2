import React from 'react';
import { useBeta } from '../../context/BetaContext';
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';

const fmt = v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

export default function BetaBudget() {
  const { userProfile, profileLoading } = useBeta();

  if (profileLoading) {
    return <div className="beta-page"><div className="beta-loading">Chargement...</div></div>;
  }
  if (!userProfile) return null;

  const { monthlyIncome, monthlyExpenses } = userProfile;
  const savings = monthlyIncome - monthlyExpenses;
  const savingsRate = monthlyIncome > 0 ? (savings / monthlyIncome) * 100 : 0;
  const expenseRate = monthlyIncome > 0 ? (monthlyExpenses / monthlyIncome) * 100 : 0;
  const maxBar = Math.max(monthlyIncome, monthlyExpenses, 1);

  const rateColor = savingsRate >= 20 ? 'success' : savingsRate >= 10 ? 'warning' : 'danger';

  const recommendations = [];
  if (savingsRate < 10) {
    recommendations.push({ type: 'danger', text: 'Votre taux d\'epargne est critique. Identifiez des postes de depenses a reduire en priorite.' });
  } else if (savingsRate < 20) {
    recommendations.push({ type: 'warning', text: 'Taux d\'epargne correct mais ameliorable. L\'objectif recommande est de 20 %.' });
  } else if (savingsRate < 30) {
    recommendations.push({ type: 'success', text: 'Bon taux d\'epargne ! Vous etes sur la bonne voie pour construire votre patrimoine.' });
  } else {
    recommendations.push({ type: 'success', text: 'Excellent taux d\'epargne. Vous pouvez accelerer vos investissements.' });
  }

  if (savings < 0) {
    recommendations.push({ type: 'danger', text: `Vous depensez ${fmt(Math.abs(savings))} \u20AC de plus que vos revenus chaque mois. Action urgente requise.` });
  }

  if (monthlyExpenses > monthlyIncome * 0.8 && savings >= 0) {
    recommendations.push({ type: 'warning', text: 'Vos depenses representent plus de 80 % de vos revenus. Peu de marge de manoeuvre.' });
  }

  return (
    <div className="beta-page">
      <h1>Budget & Tresorerie</h1>
      <p className="beta-subtitle">Analysez vos flux mensuels</p>

      <div className="beta-card beta-section">
        <div className="beta-card-header">
          <Wallet size={20} />
          <h2>Revenus vs Depenses</h2>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <TrendingUp size={16} style={{ color: 'var(--success)' }} />
            <span style={{ width: 90, fontSize: '0.88rem', fontWeight: 500 }}>Revenus</span>
            <div style={{ flex: 1, height: 28, background: 'var(--bg-secondary)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${(monthlyIncome / maxBar) * 100}%`,
                height: '100%',
                background: 'var(--success)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 10,
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 600,
                transition: 'width 0.5s ease',
              }}>
                {fmt(monthlyIncome)} &euro;
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TrendingDown size={16} style={{ color: 'var(--danger)' }} />
            <span style={{ width: 90, fontSize: '0.88rem', fontWeight: 500 }}>Depenses</span>
            <div style={{ flex: 1, height: 28, background: 'var(--bg-secondary)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${(monthlyExpenses / maxBar) * 100}%`,
                height: '100%',
                background: 'var(--danger)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 10,
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 600,
                transition: 'width 0.5s ease',
              }}>
                {fmt(monthlyExpenses)} &euro;
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div className="beta-stats-grid cols-3">
            <div className="beta-stat">
              <span className="beta-stat-label">Epargne mensuelle</span>
              <span className="beta-stat-value" style={{ color: savings >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {savings >= 0 ? '+' : ''}{fmt(savings)} &euro;
              </span>
            </div>
            <div className="beta-stat">
              <span className="beta-stat-label">Taux d'epargne</span>
              <span className="beta-stat-value" style={{ color: `var(--${rateColor})` }}>
                {savingsRate.toFixed(1)} %
              </span>
              <div className="beta-progress-track" style={{ marginTop: 4 }}>
                <div
                  className={`beta-progress-fill ${rateColor}`}
                  style={{ width: `${Math.min(Math.max(savingsRate, 0), 100)}%` }}
                />
              </div>
            </div>
            <div className="beta-stat">
              <span className="beta-stat-label">Taux de depenses</span>
              <span className="beta-stat-value">{expenseRate.toFixed(1)} %</span>
            </div>
          </div>
        </div>
      </div>

      <div className="beta-section">
        <p className="beta-section-title">Recommandations</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recommendations.map((r, i) => (
            <div key={i} className={`beta-alert ${r.type}`}>
              {r.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
