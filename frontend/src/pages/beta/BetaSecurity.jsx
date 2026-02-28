import React from 'react';
import { useBeta } from '../../context/BetaContext';
import { Shield, Target, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';

const fmt = v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

const TARGET_MAP = {
  prudent: 6,
  modere: 4,
  dynamique: 3,
};

export default function BetaSecurity() {
  const { userProfile, profileLoading } = useBeta();

  if (profileLoading) {
    return <div className="beta-page"><div className="beta-loading">Chargement...</div></div>;
  }
  if (!userProfile) return null;

  const { currentCash, monthlyExpenses, riskTolerance, monthlyIncome } = userProfile;
  const cushionMonths = monthlyExpenses > 0 ? currentCash / monthlyExpenses : 0;
  const targetMonths = TARGET_MAP[riskTolerance] || 4;
  const targetAmount = targetMonths * monthlyExpenses;
  const gap = Math.max(0, targetAmount - currentCash);
  const progress = targetAmount > 0 ? Math.min((currentCash / targetAmount) * 100, 100) : 0;
  const isReached = currentCash >= targetAmount;
  const monthlySavings = monthlyIncome - monthlyExpenses;
  const monthsToTarget = monthlySavings > 0 && gap > 0 ? Math.ceil(gap / monthlySavings) : 0;

  const barColor = isReached ? 'success' : progress >= 50 ? 'warning' : 'danger';

  return (
    <div className="beta-page">
      <h1>Matelas de securite</h1>
      <p className="beta-subtitle">Votre fonds d'urgence pour faire face aux imprevu</p>

      <div className="beta-card beta-section">
        <div className="beta-card-header">
          <Shield size={20} />
          <h2>Etat actuel</h2>
        </div>

        <div className="beta-stats-grid cols-3" style={{ marginBottom: 24 }}>
          <div className="beta-stat">
            <span className="beta-stat-label">Epargne disponible</span>
            <span className="beta-stat-value">{fmt(currentCash)} &euro;</span>
          </div>
          <div className="beta-stat">
            <span className="beta-stat-label">Mois couverts</span>
            <span className="beta-stat-value" style={{ color: `var(--${barColor})` }}>
              {cushionMonths.toFixed(1)} mois
            </span>
          </div>
          <div className="beta-stat">
            <span className="beta-stat-label">Objectif</span>
            <span className="beta-stat-value">{targetMonths} mois</span>
            <span className="beta-stat-note">Profil {riskTolerance}</span>
          </div>
        </div>

        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <span>0 &euro;</span>
          <span>Objectif : {fmt(targetAmount)} &euro;</span>
        </div>
        <div className="beta-progress-track" style={{ height: 16 }}>
          <div className={`beta-progress-fill ${barColor}`} style={{ width: `${progress}%` }} />
        </div>
        <p style={{ textAlign: 'center', marginTop: 8, fontSize: '0.9rem', fontWeight: 600, color: `var(--${barColor})` }}>
          {progress.toFixed(0)} %
        </p>
      </div>

      {!isReached && (
        <div className="beta-card beta-section">
          <div className="beta-card-header">
            <Target size={20} />
            <h2>Pour atteindre votre objectif</h2>
          </div>
          <div className="beta-stats-grid cols-2">
            <div className="beta-stat">
              <span className="beta-stat-label">Montant manquant</span>
              <span className="beta-stat-value" style={{ color: 'var(--danger)' }}>{fmt(gap)} &euro;</span>
            </div>
            <div className="beta-stat">
              <span className="beta-stat-label">Delai estime</span>
              <span className="beta-stat-value">
                {monthlySavings > 0 ? `${monthsToTarget} mois` : '--'}
              </span>
              {monthlySavings > 0 && (
                <span className="beta-stat-note">
                  A {fmt(monthlySavings)} &euro;/mois d'epargne
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="beta-section">
        {isReached ? (
          <div className="beta-alert success">
            <CheckCircle size={18} />
            <span>Objectif atteint. Votre matelas de securite est solide. Vous pouvez orienter votre epargne vers des investissements.</span>
          </div>
        ) : cushionMonths < 1 ? (
          <div className="beta-alert danger">
            <AlertTriangle size={18} />
            <span>Situation critique : moins d'un mois de depenses couvert. Priorite absolue : constituer votre epargne de precaution avant tout investissement.</span>
          </div>
        ) : (
          <div className="beta-alert warning">
            <TrendingUp size={18} />
            <span>Continuez a alimenter votre epargne de precaution. Il vous manque {fmt(gap)} &euro; pour atteindre la cible de {targetMonths} mois.</span>
          </div>
        )}
      </div>
    </div>
  );
}
