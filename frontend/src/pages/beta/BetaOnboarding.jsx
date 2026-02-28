import React, { useState } from 'react';
import { useBeta } from '../../context/BetaContext';
import { User, Wallet, Shield, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';

const STEPS = [
  { key: 'income', label: 'Revenus & Depenses', icon: Wallet },
  { key: 'cash', label: 'Epargne disponible', icon: Shield },
  { key: 'profile', label: 'Profil investisseur', icon: User },
];

const HORIZON_OPTIONS = [
  { value: 'court', label: 'Court terme', desc: 'Moins de 3 ans' },
  { value: 'moyen', label: 'Moyen terme', desc: '3 a 7 ans' },
  { value: 'long', label: 'Long terme', desc: 'Plus de 7 ans' },
];

const RISK_OPTIONS = [
  { value: 'prudent', label: 'Prudent', desc: 'Securite avant tout' },
  { value: 'modere', label: 'Modere', desc: 'Equilibre risque/rendement' },
  { value: 'dynamique', label: 'Dynamique', desc: 'Rendement maximal' },
];

export default function BetaOnboarding() {
  const { updateProfile } = useBeta();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    monthlyIncome: '',
    monthlyExpenses: '',
    currentCash: '',
    investmentHorizon: 'moyen',
    riskTolerance: 'modere',
  });

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const canNext = () => {
    if (step === 0) return form.monthlyIncome !== '' && form.monthlyExpenses !== '';
    if (step === 1) return form.currentCash !== '';
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await updateProfile({
        monthlyIncome: Number(form.monthlyIncome),
        monthlyExpenses: Number(form.monthlyExpenses),
        currentCash: Number(form.currentCash),
        investmentHorizon: form.investmentHorizon,
        riskTolerance: form.riskTolerance,
      });
    } catch {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleSubmit();
  };

  return (
    <div className="beta-page">
      <h1>Coach Financier</h1>
      <p className="beta-subtitle">Configurez votre profil pour recevoir des conseils personnalises.</p>

      <div className="beta-onboarding-steps">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`beta-step-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
          />
        ))}
      </div>

      <div className="beta-card" style={{ maxWidth: 520 }}>
        <div className="beta-card-header">
          {React.createElement(STEPS[step].icon, { size: 20 })}
          <h2>{STEPS[step].label}</h2>
        </div>

        <div className="beta-step-content" key={step}>
          {step === 0 && (
            <>
              <div className="beta-field">
                <label>Revenus mensuels nets</label>
                <input
                  type="number"
                  placeholder="ex: 2500"
                  value={form.monthlyIncome}
                  onChange={e => set('monthlyIncome', e.target.value)}
                  min="0"
                />
              </div>
              <div className="beta-field">
                <label>Depenses mensuelles</label>
                <input
                  type="number"
                  placeholder="ex: 1800"
                  value={form.monthlyExpenses}
                  onChange={e => set('monthlyExpenses', e.target.value)}
                  min="0"
                />
              </div>
            </>
          )}

          {step === 1 && (
            <div className="beta-field">
              <label>Epargne de precaution disponible (cash)</label>
              <input
                type="number"
                placeholder="ex: 5000"
                value={form.currentCash}
                onChange={e => set('currentCash', e.target.value)}
                min="0"
              />
            </div>
          )}

          {step === 2 && (
            <>
              <div className="beta-field">
                <label>Horizon d'investissement</label>
                <div className="beta-segmented">
                  {HORIZON_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      className={form.investmentHorizon === o.value ? 'active' : ''}
                      onClick={() => set('investmentHorizon', o.value)}
                      title={o.desc}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="beta-field">
                <label>Tolerance au risque</label>
                <div className="beta-segmented">
                  {RISK_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      className={form.riskTolerance === o.value ? 'active' : ''}
                      onClick={() => set('riskTolerance', o.value)}
                      title={o.desc}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          {step > 0 ? (
            <button className="beta-btn beta-btn-secondary" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} /> Retour
            </button>
          ) : <span />}
          <button
            className="beta-btn beta-btn-primary"
            disabled={!canNext() || submitting}
            onClick={handleNext}
          >
            {step < STEPS.length - 1 ? (
              <>Suivant <ArrowRight size={16} /></>
            ) : (
              <>{submitting ? 'Enregistrement...' : <><CheckCircle size={16} /> Terminer</>}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
