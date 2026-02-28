import React, { useMemo } from 'react';
import { useBeta } from '../../context/BetaContext';
import { usePortfolio } from '../../context/PortfolioContext';
import { PieChart, AlertTriangle, CheckCircle } from 'lucide-react';

const fmt = v => v.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

const KEYS = ['crypto', 'pea', 'livrets', 'fundraising'];

const LABELS = { crypto: 'Crypto', pea: 'PEA', livrets: 'Livrets', fundraising: 'Fundraising' };

const COLORS = {
  crypto: '#f7931a',
  pea: '#4f8cf7',
  livrets: '#34d399',
  fundraising: '#a78bfa',
};

// Suggested allocations: [crypto, pea, livrets, fundraising]
const SUGGESTED = {
  'prudent-court':    [5, 20, 65, 10],
  'prudent-moyen':    [5, 35, 50, 10],
  'prudent-long':     [10, 45, 35, 10],
  'modere-court':     [10, 30, 45, 15],
  'modere-moyen':     [15, 40, 30, 15],
  'modere-long':      [20, 45, 20, 15],
  'dynamique-court':  [15, 35, 30, 20],
  'dynamique-moyen':  [25, 40, 15, 20],
  'dynamique-long':   [30, 40, 10, 20],
};

export default function BetaInvestments() {
  const { userProfile, profileLoading } = useBeta();
  const { totals, loading } = usePortfolio();

  const data = useMemo(() => {
    if (!totals || !userProfile) return null;
    const total = KEYS.reduce((s, k) => s + (totals[k] || 0), 0);
    const current = KEYS.map(k => total > 0 ? ((totals[k] || 0) / total) * 100 : 0);
    const key = `${userProfile.riskTolerance}-${userProfile.investmentHorizon}`;
    const suggested = SUGGESTED[key] || SUGGESTED['modere-moyen'];
    return { total, current, suggested };
  }, [totals, userProfile]);

  if (profileLoading || loading) {
    return <div className="beta-page"><div className="beta-loading">Chargement...</div></div>;
  }
  if (!data || !userProfile) return null;

  const { total, current, suggested } = data;

  return (
    <div className="beta-page">
      <h1>Investissements</h1>
      <p className="beta-subtitle">Repartition actuelle et allocation recommandee</p>

      <div className="beta-card beta-section">
        <div className="beta-card-header">
          <PieChart size={20} />
          <h2>Allocation actuelle</h2>
        </div>
        {total === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Aucun actif en portefeuille.</p>
        ) : (
          <div>
            {KEYS.map((k, i) => (
              <div className="beta-alloc-row" key={k}>
                <span className="beta-alloc-label">{LABELS[k]}</span>
                <div className="beta-alloc-bar-wrap">
                  <div className="beta-alloc-bar" style={{ width: `${current[i]}%`, background: COLORS[k] }} />
                </div>
                <span className="beta-alloc-pct">{current[i].toFixed(1)} %</span>
                <span className="beta-alloc-value">{fmt(totals[k] || 0)} &euro;</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="beta-card beta-section">
        <div className="beta-card-header">
          <PieChart size={20} />
          <h2>Allocation suggeree</h2>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          Basee sur votre profil : {userProfile.riskTolerance} / horizon {userProfile.investmentHorizon} terme
        </p>
        {KEYS.map((k, i) => (
          <div className="beta-alloc-row" key={k}>
            <span className="beta-alloc-label">{LABELS[k]}</span>
            <div className="beta-alloc-bar-wrap">
              <div className="beta-alloc-bar" style={{ width: `${suggested[i]}%`, background: COLORS[k], opacity: 0.7 }} />
            </div>
            <span className="beta-alloc-pct">{suggested[i]} %</span>
          </div>
        ))}
      </div>

      <div className="beta-card beta-section">
        <h2 style={{ marginBottom: 12 }}>Comparaison</h2>
        <table className="beta-compare">
          <thead>
            <tr>
              <th>Classe</th>
              <th>Actuel</th>
              <th>Suggere</th>
              <th>Ecart</th>
            </tr>
          </thead>
          <tbody>
            {KEYS.map((k, i) => {
              const diff = current[i] - suggested[i];
              return (
                <tr key={k}>
                  <td>{LABELS[k]}</td>
                  <td>{current[i].toFixed(1)} %</td>
                  <td>{suggested[i]} %</td>
                  <td className={diff > 2 ? 'diff-pos' : diff < -2 ? 'diff-neg' : ''}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(1)} %
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="beta-section">
        {KEYS.map((k, i) => {
          const diff = current[i] - suggested[i];
          if (Math.abs(diff) < 5) return null;
          const over = diff > 0;
          return (
            <div key={k} className={`beta-alert ${over ? 'warning' : 'info'}`} style={{ marginBottom: 8 }}>
              {over ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
              <span>
                {over
                  ? `Surexposition en ${LABELS[k]} (+${diff.toFixed(0)} %). Envisagez de reequilibrer.`
                  : `Sous-exposition en ${LABELS[k]} (${diff.toFixed(0)} %). Opportunite de renforcement.`
                }
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
