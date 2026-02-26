import { useState, useEffect, useCallback } from 'react'
import {
  Calculator, TrendingUp, Calendar, Play, BellRing,
  Trash2, ToggleLeft, ToggleRight, Bell, BellOff, Send
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'
import {
  getNotifications, addNotification, removeNotification,
  toggleNotification
} from '../services/notifications'
import {
  isNotificationSupported, getNotificationPermission,
  requestPermission, testNotification, checkAndNotifyDueReminders
} from '../services/pushNotifications'
import { usePortfolio } from '../context/PortfolioContext'
import './DCA.css'

const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
const fmtPct = (v) => new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)

function computeDCA(monthlyAmount, totalMonths, annualRate, initialFixedAmount = 0) {
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1
  const data = []
  for (let i = 1; i <= totalMonths; i++) {
    const cumulativeInvested = initialFixedAmount + monthlyAmount * i
    // Initial lump sum grows for i months, DCA formula for recurring
    const initialGrowth = initialFixedAmount * Math.pow(1 + monthlyRate, i)
    const dcaGrowth = monthlyRate === 0
      ? monthlyAmount * i
      : monthlyAmount * ((Math.pow(1 + monthlyRate, i) - 1) / monthlyRate) * (1 + monthlyRate)
    const projectedValue = initialGrowth + dcaGrowth
    data.push({ month: i, cumulativeInvested, projectedValue: Math.round(projectedValue) })
  }
  return data
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function formatDateForMonth(startDate, monthIndex) {
  const d = addMonths(new Date(startDate), monthIndex)
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
}

export default function DCA() {
  const { dcaConfig, saveDcaConfig } = usePortfolio()

  const [assetType, setAssetType] = useState('crypto')
  const [assetName, setAssetName] = useState('')
  const [monthlyAmount, setMonthlyAmount] = useState(100)
  const [initialFixedAmount, setInitialFixedAmount] = useState(0)
  const [duration, setDuration] = useState(12)
  const [durationUnit, setDurationUnit] = useState('months')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [annualReturn, setAnnualReturn] = useState(8)
  const [results, setResults] = useState(null)

  // Reminder state
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [reminderDay, setReminderDay] = useState(1)
  const [reminderSuccess, setReminderSuccess] = useState(false)

  // Notifications list
  const [notifications, setNotifications] = useState([])

  // Browser notification permission
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission())
  const notifSupported = isNotificationSupported()

  // Load DCA config from Drive on mount
  useEffect(() => {
    if (dcaConfig?.simulations?.length > 0) {
      const sim = dcaConfig.simulations[0]
      if (sim.assetType) setAssetType(sim.assetType)
      if (sim.assetName) setAssetName(sim.assetName)
      if (sim.monthlyAmount) setMonthlyAmount(sim.monthlyAmount)
      if (sim.initialFixedAmount != null) setInitialFixedAmount(sim.initialFixedAmount)
      if (sim.duration) setDuration(sim.duration)
      if (sim.durationUnit) setDurationUnit(sim.durationUnit)
      if (sim.startDate) setStartDate(sim.startDate)
      if (sim.annualReturn != null) setAnnualReturn(sim.annualReturn)
    }
    if (dcaConfig?.notifications?.length > 0) {
      setNotifications(dcaConfig.notifications)
    } else {
      setNotifications(getNotifications())
    }
  }, [dcaConfig])

  // Check for due reminders on mount
  useEffect(() => {
    if (notifications.length > 0) {
      checkAndNotifyDueReminders(notifications)
    }
  }, [notifications])

  // Persist to Drive
  const persistConfig = useCallback((sims, notifs) => {
    const config = {
      simulations: sims || [],
      notifications: notifs || notifications,
    }
    saveDcaConfig(config)
  }, [saveDcaConfig, notifications])

  const handleCalculate = (e) => {
    e.preventDefault()
    const totalMonths = durationUnit === 'years' ? duration * 12 : duration
    if (totalMonths <= 0 || monthlyAmount <= 0) return
    const data = computeDCA(monthlyAmount, totalMonths, annualReturn, initialFixedAmount)
    setResults({ data, totalMonths, startDate })
    setShowReminderForm(false)
    setReminderSuccess(false)

    // Save simulation config to Drive
    const sim = {
      id: 'main',
      assetType, assetName, monthlyAmount, initialFixedAmount,
      duration, durationUnit, startDate, annualReturn,
    }
    persistConfig([sim], notifications)
  }

  const handleAddReminder = () => {
    const totalMonths = durationUnit === 'years' ? duration * 12 : duration
    const end = addMonths(new Date(startDate), totalMonths)
    const start = new Date(startDate)
    const firstReminder = new Date(start.getFullYear(), start.getMonth(), Math.min(reminderDay, 28))
    if (firstReminder <= start) firstReminder.setMonth(firstReminder.getMonth() + 1)

    const entry = addNotification({
      assetName: assetName || 'Mon actif DCA',
      assetType,
      monthlyAmount,
      initialFixedAmount,
      duration,
      durationUnit,
      annualReturn,
      dayOfMonth: reminderDay,
      startDate,
      endDate: end.toISOString().slice(0, 10),
      nextReminder: firstReminder.toISOString().slice(0, 10),
    })
    const updatedNotifs = [...notifications, entry]
    setNotifications(updatedNotifs)
    persistConfig(undefined, updatedNotifs)
    setShowReminderForm(false)
    setReminderSuccess(true)
    setTimeout(() => setReminderSuccess(false), 3000)
  }

  const handleDeleteNotif = (id) => {
    removeNotification(id)
    const updatedNotifs = notifications.filter(n => n.id !== id)
    setNotifications(updatedNotifs)
    persistConfig(undefined, updatedNotifs)
  }

  const handleToggleNotif = (id) => {
    toggleNotification(id)
    const updatedNotifs = notifications.map(n => n.id === id ? { ...n, active: !n.active } : n)
    setNotifications(updatedNotifs)
    persistConfig(undefined, updatedNotifs)
  }

  const handleRequestPermission = async () => {
    const result = await requestPermission()
    setNotifPermission(result)
  }

  const handleLoadReminder = (n) => {
    setAssetType(n.assetType || 'crypto')
    setAssetName(n.assetName || '')
    setMonthlyAmount(n.monthlyAmount || 100)
    setInitialFixedAmount(n.initialFixedAmount || 0)
    setDuration(n.duration || 12)
    setDurationUnit(n.durationUnit || 'months')
    setStartDate(n.startDate || new Date().toISOString().slice(0, 10))
    setAnnualReturn(n.annualReturn != null ? n.annualReturn : 8)
    // Auto-calculate
    const totalMonths = (n.durationUnit || 'months') === 'years' ? (n.duration || 12) * 12 : (n.duration || 12)
    const data = computeDCA(n.monthlyAmount || 100, totalMonths, n.annualReturn != null ? n.annualReturn : 8, n.initialFixedAmount || 0)
    setResults({ data, totalMonths, startDate: n.startDate || new Date().toISOString().slice(0, 10) })
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleTestNotification = async () => {
    if (notifPermission !== 'granted') {
      const result = await requestPermission()
      setNotifPermission(result)
      if (result !== 'granted') return
    }
    await testNotification()
  }

  const last = results?.data[results.data.length - 1]
  const chartData = results?.data.filter((_, i, arr) => {
    const step = Math.max(1, Math.floor(arr.length / 30))
    return i % step === 0 || i === arr.length - 1
  }).map(row => ({
    ...row,
    dateLabel: formatDateForMonth(results.startDate, row.month),
  }))

  const tableRows = results?.data.filter((row, i, arr) => {
    return i < 12 || i === arr.length - 1
  })

  return (
    <div className="dca-page animate-fade-in">
      <div className="dca-page-header">
        <h2>Calculateur DCA</h2>
        <p>Simulez vos investissements programmés et suivez vos rappels mensuels.</p>
      </div>

      {/* Notification permission banner */}
      {notifSupported && notifPermission === 'default' && (
        <div className="dca-card" style={{ background: 'var(--accent-light)', borderColor: 'var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bell size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>Activer les notifications</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Recevez des rappels système pour vos investissements DCA.
              </div>
            </div>
            <button className="dca-reminder-btn" onClick={handleRequestPermission}>
              Autoriser
            </button>
          </div>
        </div>
      )}

      {/* Input form */}
      <div className="dca-card">
        <div className="dca-card-title">
          <Calculator size={18} /> Paramètres de simulation
        </div>
        <form className="dca-form" onSubmit={handleCalculate}>
          <div className="dca-form-group full-width">
            <label>Type d'actif</label>
            <div className="dca-type-toggle">
              {['crypto', 'etf', 'action'].map(t => (
                <button
                  key={t}
                  type="button"
                  className={assetType === t ? 'active' : ''}
                  onClick={() => setAssetType(t)}
                >
                  {t === 'crypto' ? 'Crypto' : t === 'etf' ? 'ETF' : 'Action'}
                </button>
              ))}
            </div>
          </div>

          <div className="dca-form-group">
            <label>Nom de l'actif</label>
            <input
              type="text"
              placeholder="Ex: Bitcoin, MSCI World..."
              value={assetName}
              onChange={e => setAssetName(e.target.value)}
            />
          </div>

          <div className="dca-form-group">
            <label>Investissement initial (EUR)</label>
            <input
              type="number"
              min="0"
              value={initialFixedAmount}
              onChange={e => setInitialFixedAmount(Number(e.target.value))}
            />
          </div>

          <div className="dca-form-group">
            <label>Investissement mensuel (EUR)</label>
            <input
              type="number"
              min="1"
              value={monthlyAmount}
              onChange={e => setMonthlyAmount(Number(e.target.value))}
            />
          </div>

          <div className="dca-form-group">
            <label>Durée</label>
            <div className="dca-duration-row">
              <input
                type="number"
                min="1"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
              />
              <select value={durationUnit} onChange={e => setDurationUnit(e.target.value)}>
                <option value="months">Mois</option>
                <option value="years">Années</option>
              </select>
            </div>
          </div>

          <div className="dca-form-group">
            <label>Date de début</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          <div className="dca-form-group">
            <label>Rendement annuel estimé (%)</label>
            <input
              type="number"
              step="0.1"
              value={annualReturn}
              onChange={e => setAnnualReturn(Number(e.target.value))}
            />
          </div>

          <button type="submit" className="dca-calculate-btn">
            <Play size={18} /> Calculer
          </button>
        </form>
      </div>

      {/* Results */}
      {results && last && (
        <>
          <div className="dca-card">
            <div className="dca-card-title">
              <TrendingUp size={18} /> Résultats de la projection
            </div>
            <div className="dca-summary-grid">
              <div className="dca-summary-item">
                <div className="dca-summary-label">Total investi</div>
                <div className="dca-summary-value">{fmt(last.cumulativeInvested)}</div>
              </div>
              <div className="dca-summary-item">
                <div className="dca-summary-label">Valeur projetée</div>
                <div className="dca-summary-value">{fmt(last.projectedValue)}</div>
              </div>
              <div className="dca-summary-item">
                <div className="dca-summary-label">Gain projeté</div>
                <div className="dca-summary-value positive">
                  {fmt(last.projectedValue - last.cumulativeInvested)}
                </div>
              </div>
              <div className="dca-summary-item">
                <div className="dca-summary-label">Rendement</div>
                <div className="dca-summary-value positive">
                  {fmtPct((last.projectedValue - last.cumulativeInvested) / last.cumulativeInvested)}
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="dca-chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    tickFormatter={v => {
                      const d = addMonths(new Date(results.startDate), v)
                      return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
                    }}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: '0.8rem'
                    }}
                    formatter={(val, name) => [
                      fmt(val),
                      name === 'cumulativeInvested' ? 'Investi' : 'Valeur projetée'
                    ]}
                    labelFormatter={v => {
                      const d = addMonths(new Date(results.startDate), v)
                      return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                    }}
                  />
                  <Legend
                    formatter={(value) =>
                      value === 'cumulativeInvested' ? 'Investi' : 'Valeur projetée'
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeInvested"
                    stroke="var(--text-muted)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedValue"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Table */}
          <div className="dca-card">
            <div className="dca-card-title">
              <Calendar size={18} /> Détail mensuel
            </div>
            <div className="dca-table-wrap">
              <table className="dca-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Date</th>
                    <th>Versement</th>
                    <th>Total investi</th>
                    <th>Valeur projetée</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => {
                    const d = addMonths(new Date(results.startDate), row.month)
                    const showEllipsis = idx === 12 && row.month > 13
                    return showEllipsis ? (
                      <tr key="ellipsis">
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>...</td>
                      </tr>
                    ) : (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</td>
                        <td>{fmt(monthlyAmount)}</td>
                        <td>{fmt(row.cumulativeInvested)}</td>
                        <td>{fmt(row.projectedValue)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Reminder button */}
            {!showReminderForm && !reminderSuccess && (
              <button
                className="dca-reminder-btn"
                style={{ marginTop: 16 }}
                onClick={() => setShowReminderForm(true)}
              >
                <BellRing size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Programmer un rappel mensuel
              </button>
            )}

            {showReminderForm && (
              <div className="dca-reminder-form">
                <label>Jour du rappel mensuel :</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={reminderDay}
                  onChange={e => setReminderDay(Number(e.target.value))}
                />
                <button className="dca-reminder-btn" onClick={handleAddReminder}>
                  Confirmer
                </button>
                <button
                  className="dca-reminder-btn secondary"
                  onClick={() => setShowReminderForm(false)}
                >
                  Annuler
                </button>
              </div>
            )}

            {reminderSuccess && (
              <div className="dca-reminder-success">
                Rappel DCA programmé avec succès !
              </div>
            )}
          </div>
        </>
      )}

      {/* Active reminders */}
      <div className="dca-card">
        <div className="dca-card-title">
          <BellRing size={18} /> Mes rappels DCA
        </div>
        {notifications.length === 0 ? (
          <div className="dca-empty">Aucun rappel DCA configuré.</div>
        ) : (
          <div className="dca-notif-list">
            {notifications.map(n => (
              <div key={n.id} className={`dca-notif-item ${!n.active ? 'inactive' : ''}`}>
                <div className="dca-notif-info" style={{ cursor: 'pointer' }} onClick={() => handleLoadReminder(n)} title="Cliquer pour recharger la simulation">
                  <div className="dca-notif-name">{n.assetName}</div>
                  <div className="dca-notif-details">
                    {fmt(n.monthlyAmount)}/mois &middot; Jour {n.dayOfMonth} &middot; Prochain : {n.nextReminder || '—'}
                  </div>
                </div>
                <div className="dca-notif-actions">
                  <button onClick={() => handleToggleNotif(n.id)} title={n.active ? 'Désactiver' : 'Activer'}>
                    {n.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    {n.active ? 'Actif' : 'Inactif'}
                  </button>
                  <button className="delete" onClick={() => handleDeleteNotif(n.id)} title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Test notification button */}
        {notifSupported && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="dca-reminder-btn" onClick={handleTestNotification}>
              <Send size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Tester les notifications
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {notifPermission === 'granted' && (
                <><Bell size={12} style={{ verticalAlign: 'middle' }} /> Notifications activées</>
              )}
              {notifPermission === 'denied' && (
                <><BellOff size={12} style={{ verticalAlign: 'middle' }} /> Notifications bloquées (modifier dans les paramètres du navigateur)</>
              )}
              {notifPermission === 'default' && 'Cliquez pour activer les notifications'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
