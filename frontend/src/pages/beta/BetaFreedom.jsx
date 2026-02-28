import React, { useMemo } from 'react';
import { useBeta } from '../../context/BetaContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { Sunrise, Target, TrendingUp, CheckCircle } from 'lucide-react';

const fmt = v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

const RETURN_RATES = { prudent: 0.04, modere: 0.07, dynamique: 0.10 };

export default function BetaFreedom() {
  const { userProfile, profileLoading } = useBeta();
  const { totals, loading } = usePortfolio();

  const data = useMemo(() => {
    if (!userProfile || !totals) return null;

    const { monthlyIncome, monthlyExpenses, currentCash, riskTolerance } = userProfile;
    const monthlySavings = monthlyIncome - monthlyExpenses;
    const annualReturn = RETURN_RATES[riskTolerance] || 0.07;
    const freedomNumber = monthlyExpenses > 0 ? (monthlyExpenses * 12) / 0.04 : 0;
    const currentWealth = (totals.total || 0) + currentCash;
    const progress = freedomNumber > 0 ? Math.min((currentWealth / freedomNumber) * 100, 100) : 0;

    // Years to freedom: compound growth
    // FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r = freedomNumber
    // Solve numerically
    let yearsToFreedom = null;
    if (monthlySavings > 0 && freedomNumber > currentWealth) {
      const annualSavings = monthlySavings * 12;
      let wealth = currentWealth;
      for (let y = 1; y <= 100; y++) {
        wealth = wealth * (1 + annualReturn) + annualSavings;
        if (wealth >= freedomNumber) {
          yearsToFreedom = y;
          break;
        }
      }
    } else if (currentWealth >= freedomNumber && freedomNumber > 0) {
      yearsToFreedom = 0;
    }

    // Projection: wealth at each 5-year mark, up to yearsToFreedom+5 or 40 years
    const maxYears = yearsToFreedom != null ? Math.min(yearsToFreedom + 5, 50) : 30;
    const step = maxYears <= 15 ? 1 : maxYears <= 30 ? 5 : 10;
    const projections = [];
    {
      let w = currentWealth;
      const annualSavings = Math.max(monthlySavings, 0) * 12;
      for (let y = 0; y <= maxYears; y++) {
        if (y > 0) w = w * (1 + annualReturn) + annualSavings;
        if (y % step === 0 || y === maxYears) {
          projections.push({ year: y, wealth: w, isFreedom: yearsToFreedom != null && y >= yearsToFreedom });
        }
      }
    }

    return {
      monthlySavings, annualReturn, freedomNumber, currentWealth, progress, yearsToFreedom, projections,
    };
  }, [userProfile, totals]);

  if (profileLoading || loading) {
    return <div className="beta-page"><div className="beta-loading">Chargement...</div></div>;
  }
  if (!data || !userProfile) return null;

  const { monthlySavings, annualReturn, freedomNumber, currentWealth, progress, yearsToFreedom, projections } = data;
  const maxWealth = Math.max(...projections.map(p => p.wealth), freedomNumber);
  const barColor = progress >= 100 ? 'success' : progress >= 25 ? '' : 'warning';

  return (
    <div className="beta-page">
      <h1>Liberte financiere</h1>
      <p className="beta-subtitle">Projection vers l'independance financiere</p>

      <div className="beta-card beta-section">
        <div className="beta-card-header">
          <Target size={20} />
          <h2>Objectif de liberte</h2>
        </div>
        <div className="beta-stats-grid cols-3" style={{ marginBottom: 20 }}>
          <div className="beta-stat">
            <span className="beta-stat-label">Freedom number</span>
            <span className="beta-stat-value">{fmt(freedomNumber)} &euro;</span>
            <span className="beta-stat-note">Regle des 4 %</span>
          </div>
          <div className="beta-stat">
            <span className="beta-stat-label">Patrimoine actuel</span>
            <span className="beta-stat-value">{fmt(currentWealth)} &euro;</span>
            <span className="beta-stat-note">Portefeuille + cash</span>
          </div>
          <div className="beta-stat">
            <span className="beta-stat-label">Delai estime</span>
            <span className="beta-stat-value">
              {yearsToFreedom === 0 ? 'Atteint' : yearsToFreedom != null ? `${yearsToFreedom} ans` : '--'}
            </span>
            <span className="beta-stat-note">Rendement {(annualReturn * 100).toFixed(0)} % / an</span>
          </div>
        </div>

        <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          <span>{fmt(currentWealth)} &euro;</span>
          <span>{fmt(freedomNumber)} &euro;</span>
        </div>
        <div className="beta-progress-track" style={{ height: 14 }}>
          <div className={`beta-progress-fill ${barColor}`} style={{ width: `${progress}%` }} />
        </div>
        <p style={{ textAlign: 'center', marginTop: 6, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {progress.toFixed(1)} % atteint
        </p>
      </div>

      <div className="beta-card beta-section">
        <div className="beta-card-header">
          <TrendingUp size={20} />
          <h2>Projection</h2>
        </div>
        <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Epargne mensuelle : {fmt(monthlySavings)} &euro; &middot; Rendement : {(annualReturn * 100).toFixed(0)} % / an
        </p>

        {projections.length > 1 ? (
          <>
            <div className="beta-projection">
              {projections.map((p, i) => (
                <div
                  key={i}
                  className={`beta-projection-bar ${p.isFreedom ? 'highlight' : ''}`}
                  style={{ height: `${maxWealth > 0 ? (p.wealth / maxWealth) * 100 : 0}%` }}
                >
                  <span className="bar-value">{p.wealth >= 1e6 ? `${(p.wealth / 1e6).toFixed(1)}M` : `${fmt(p.wealth)}`}</span>
                  <span className="bar-label">A{p.year}</span>
                </div>
              ))}
            </div>

            {freedomNumber > 0 && (
              <div className="beta-projection-legend">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--accent-light)', display: 'inline-block' }} />
                  Patrimoine projete
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--gradient-accent)', display: 'inline-block' }} />
                  Liberte atteinte
                </span>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Epargne mensuelle insuffisante pour projeter une croissance.
          </p>
        )}
      </div>

      <div className="beta-section">
        {yearsToFreedom === 0 ? (
          <div className="beta-alert success">
            <CheckCircle size={18} />
            <span>Vous avez atteint votre objectif de liberte financiere. Votre patrimoine peut couvrir vos depenses grace a la regle des 4 %.</span>
          </div>
        ) : monthlySavings <= 0 ? (
          <div className="beta-alert danger">
            <Sunrise size={18} />
            <span>Sans capacite d'epargne, la liberte financiere ne peut etre atteinte. Commencez par equilibrer votre budget.</span>
          </div>
        ) : (
          <div className="beta-alert info">
            <Sunrise size={18} />
            <span>
              En epargnant {fmt(monthlySavings)} &euro;/mois avec un rendement de {(annualReturn * 100).toFixed(0)} %,
              vous pourriez atteindre la liberte financiere dans environ {yearsToFreedom} ans.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
