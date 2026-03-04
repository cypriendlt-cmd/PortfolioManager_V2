import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { loadPortfolioFromDrive, savePortfolioToDrive, loadFileFromDrive, saveFileToDrive } from '../services/googleDrive'
import { GUEST_DEMO_PORTFOLIO } from '../data/guestDemoData'
import { getAllCurrentRates } from '../services/rateProvider'
import { migrateLegacyConfig, matchPlanToAsset } from '../services/dcaEngine'

const PortfolioContext = createContext(null)

const EMPTY_PORTFOLIO = {
  crypto: [],
  pea: [],
  livrets: [],
  fundraising: [],
  objectives: [],
}

export function PortfolioProvider({ children }) {
  const { user, accessToken, gapiReady, isGuest } = useAuth()
  const [portfolio, setPortfolio] = useState(EMPTY_PORTFOLIO)
  const [loading, setLoading] = useState(false)
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveError, setDriveError] = useState(null)
  const [pricesLastUpdated, setPricesLastUpdated] = useState(null)
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)
  const [priceRefreshError, setPriceRefreshError] = useState(null)
  const manualRefreshRef = useRef(null)
  const saveTimer = useRef(null)

  // Insights + DCA Drive persistence
  const [insightsData, setInsightsData]   = useState(null)
  const [dcaConfig, setDcaConfig]         = useState(null)  // legacy (lecture seule après migration)
  const [dcaPlans, setDcaPlans]           = useState(null)  // nouveau format { version, plans }
  const [dcaSnapshots, setDcaSnapshots]   = useState(null)  // cache calculs dca_snapshots.json
  const insightsSaveTimer     = useRef(null)
  const dcaSaveTimer          = useRef(null)
  const dcaPlansSaveTimer     = useRef(null)
  const dcaSnapshotsSaveTimer = useRef(null)

  const rates = useMemo(() => getAllCurrentRates(), [])

  const fetchPortfolio = useCallback(async () => {
    if (!user || !accessToken || !gapiReady) return
    setLoading(true)
    setDriveError(null)
    try {
      const data = await loadPortfolioFromDrive()
      if (data && typeof data === 'object') {
        setPortfolio({
          crypto: data.crypto || [],
          pea: data.pea || [],
          livrets: data.livrets || [],
          fundraising: data.fundraising || [],
          objectives: data.objectives || [],
        })
      }
      setDriveConnected(true)
    } catch (e) {
      console.error('Drive load error:', e)
      setDriveError(e.message || 'Erreur de connexion Google Drive')
      setDriveConnected(false)
    } finally {
      setLoading(false)
    }
  }, [user, accessToken, gapiReady])

  const fetchInsightsFromDrive = useCallback(async () => {
    if (!user || !accessToken || !gapiReady) return
    try {
      const data = await loadFileFromDrive('insights.json')
      if (data) setInsightsData(data)
    } catch (e) {
      console.warn('Drive insights load error:', e)
      try {
        const cached = localStorage.getItem('pm_insights_cache')
        if (cached) setInsightsData(JSON.parse(cached))
      } catch {}
    }
  }, [user, accessToken, gapiReady])

  const fetchDcaConfigFromDrive = useCallback(async () => {
    if (!user || !accessToken || !gapiReady) return
    try {
      const data = await loadFileFromDrive('dca-config.json')
      if (data) setDcaConfig(data)
    } catch (e) {
      console.warn('Drive DCA config load error:', e)
      try {
        const cached = localStorage.getItem('pm_dca_config_cache')
        if (cached) setDcaConfig(JSON.parse(cached))
      } catch {}
    }
  }, [user, accessToken, gapiReady])

  // Charge dca_plans.json ; si absent, migre depuis dca-config.json (une seule fois).
  const fetchDcaPlansFromDrive = useCallback(async (portfolioSnapshot) => {
    if (!user || !accessToken || !gapiReady) return
    try {
      const data = await loadFileFromDrive('dca_plans.json')
      if (data && data.version) {
        setDcaPlans(data)
        localStorage.setItem('pm_dca_plans_cache', JSON.stringify(data))
        return
      }
    } catch { /* fichier absent */ }

    // Pas trouvé → migration depuis dca-config.json
    try {
      const legacy = await loadFileFromDrive('dca-config.json')
      if (legacy && (legacy.simulations?.length || legacy.notifications?.length)) {
        const migrated = migrateLegacyConfig(legacy, portfolioSnapshot)
        setDcaPlans(migrated)
        localStorage.setItem('pm_dca_plans_cache', JSON.stringify(migrated))
        // Persister le nouveau fichier sur Drive
        try { await saveFileToDrive('dca_plans.json', migrated) } catch {}
        return
      }
    } catch {}

    // Fallback local cache
    try {
      const cached = localStorage.getItem('pm_dca_plans_cache')
      if (cached) { setDcaPlans(JSON.parse(cached)); return }
    } catch {}

    // Tout vide
    const empty = { version: 1, plans: [] }
    setDcaPlans(empty)
  }, [user, accessToken, gapiReady])

  useEffect(() => {
    if (user && accessToken && gapiReady) {
      fetchPortfolio()
      fetchInsightsFromDrive()
      fetchDcaConfigFromDrive()
      // On passe portfolio directement pour l'auto-link lors de la migration
      // Note: portfolioSnapshot peut être null au premier appel si les données ne sont pas encore chargées.
      // fetchDcaPlansFromDrive sera rappelé avec le portfolio une fois chargé (voir effet ci-dessous).
      fetchDcaPlansFromDrive(null)
    } else {
      if (isGuest) {
        setPortfolio(GUEST_DEMO_PORTFOLIO)
      } else {
        setPortfolio(EMPTY_PORTFOLIO)
      }
      setDriveConnected(false)
      setInsightsData(null)
      setDcaConfig(null)
      setDcaPlans(null)
    }
  }, [user, accessToken, gapiReady, isGuest, fetchPortfolio, fetchInsightsFromDrive, fetchDcaConfigFromDrive, fetchDcaPlansFromDrive])

  // Debounced save to Drive
  const saveToDrive = useCallback((data) => {
    if (!user || !accessToken || !gapiReady) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await savePortfolioToDrive(data)
        setDriveConnected(true)
        setDriveError(null)
      } catch (e) {
        console.error('Drive save error:', e)
        setDriveError('Erreur de sauvegarde sur Google Drive')
      }
    }, 1500)
  }, [user, accessToken, gapiReady])

  const saveInsights = useCallback((data) => {
    setInsightsData(data)
    localStorage.setItem('pm_insights_cache', JSON.stringify(data))
    if (!user || !accessToken || !gapiReady) return
    if (insightsSaveTimer.current) clearTimeout(insightsSaveTimer.current)
    insightsSaveTimer.current = setTimeout(async () => {
      try { await saveFileToDrive('insights.json', data) } catch (e) { console.warn('Drive insights save error:', e) }
    }, 1500)
  }, [user, accessToken, gapiReady])

  const saveDcaConfig = useCallback((data) => {
    setDcaConfig(data)
    localStorage.setItem('pm_dca_config_cache', JSON.stringify(data))
    if (!user || !accessToken || !gapiReady) return
    if (dcaSaveTimer.current) clearTimeout(dcaSaveTimer.current)
    dcaSaveTimer.current = setTimeout(async () => {
      try { await saveFileToDrive('dca-config.json', data) } catch (e) { console.warn('Drive DCA save error:', e) }
    }, 1500)
  }, [user, accessToken, gapiReady])

  const saveDcaSnapshots = useCallback((snapshotsObj) => {
    setDcaSnapshots(snapshotsObj)
    if (!user || !accessToken || !gapiReady) return
    if (dcaSnapshotsSaveTimer.current) clearTimeout(dcaSnapshotsSaveTimer.current)
    dcaSnapshotsSaveTimer.current = setTimeout(async () => {
      try { await saveFileToDrive('dca_snapshots.json', snapshotsObj) } catch (e) { console.warn('Drive DCA snapshots save error:', e) }
    }, 2000)
  }, [user, accessToken, gapiReady])

  // ── DCA Plans CRUD ────────────────────────────────────────────────────────────

  const saveDcaPlansData = useCallback((data) => {
    setDcaPlans(data)
    localStorage.setItem('pm_dca_plans_cache', JSON.stringify(data))
    if (!user || !accessToken || !gapiReady) return
    if (dcaPlansSaveTimer.current) clearTimeout(dcaPlansSaveTimer.current)
    dcaPlansSaveTimer.current = setTimeout(async () => {
      try { await saveFileToDrive('dca_plans.json', data) } catch (e) { console.warn('Drive DCA plans save error:', e) }
    }, 1500)
  }, [user, accessToken, gapiReady])

  const updateDcaPlansState = useCallback((updater) => {
    setDcaPlans(prev => {
      const current = prev || { version: 1, plans: [] }
      const updated = updater(current)
      localStorage.setItem('pm_dca_plans_cache', JSON.stringify(updated))
      if (user && accessToken && gapiReady) {
        if (dcaPlansSaveTimer.current) clearTimeout(dcaPlansSaveTimer.current)
        dcaPlansSaveTimer.current = setTimeout(async () => {
          try { await saveFileToDrive('dca_plans.json', updated) } catch {}
        }, 1500)
      }
      return updated
    })
  }, [user, accessToken, gapiReady])

  const createDcaPlan = useCallback((planData) => {
    const plan_id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const plan = {
      plan_id,
      label:                  planData.label || 'Plan DCA',
      enabled:                true,
      account_type:           planData.account_type || 'pea',
      asset_target: {
        isin:         planData.asset_target?.isin        || null,
        symbol:       planData.asset_target?.symbol      || null,
        name:         planData.asset_target?.name        || null,
        coingecko_id: planData.asset_target?.coingecko_id || null,
      },
      asset_link:             planData.asset_link || null,
      cadence:                planData.cadence || 'monthly',
      day_of_month:           planData.day_of_month || 1,
      amount_per_period:      planData.amount_per_period || 0,
      currency:               'EUR',
      start_date:             planData.start_date || new Date().toISOString().slice(0, 10),
      end_date:               planData.end_date || null,
      tolerance_days:         planData.tolerance_days || 7,
      annual_return_estimate: planData.annual_return_estimate ?? 8,
      notes:                  planData.notes || '',
      created_at:             new Date().toISOString(),
      migrated_from:          null,
    }
    updateDcaPlansState(prev => ({ ...prev, plans: [...prev.plans, plan] }))
    return plan_id
  }, [updateDcaPlansState])

  const updateDcaPlan = useCallback((plan_id, data) => {
    updateDcaPlansState(prev => ({
      ...prev,
      plans: prev.plans.map(p => p.plan_id === plan_id ? { ...p, ...data } : p),
    }))
  }, [updateDcaPlansState])

  const deleteDcaPlan = useCallback((plan_id) => {
    updateDcaPlansState(prev => ({
      ...prev,
      plans: prev.plans.filter(p => p.plan_id !== plan_id),
    }))
  }, [updateDcaPlansState])

  const linkPlanToAsset = useCallback((plan_id, asset_id, account_type, match_method = 'manual') => {
    updateDcaPlansState(prev => ({
      ...prev,
      plans: prev.plans.map(p => p.plan_id !== plan_id ? p : {
        ...p,
        asset_link: {
          portfolio_asset_id: asset_id,
          account_type,
          match_method,
          match_score: 1.0,
          auto_linked: false,
        },
      }),
    }))
  }, [updateDcaPlansState])

  const unlinkPlan = useCallback((plan_id) => {
    updateDcaPlansState(prev => ({
      ...prev,
      plans: prev.plans.map(p => p.plan_id !== plan_id ? p : { ...p, asset_link: null }),
    }))
  }, [updateDcaPlansState])

  const updateAndSave = useCallback((updater) => {
    setPortfolio(prev => {
      const updated = updater(prev)
      saveToDrive(updated)
      return updated
    })
  }, [saveToDrive])

  // CRYPTO CRUD
  const addCrypto = (item) => updateAndSave(p => ({
    ...p, crypto: [...p.crypto, {
      ...item,
      id: Date.now().toString(),
      movements: [{
        date: item.buyDate || new Date().toISOString().slice(0, 10),
        type: 'buy',
        quantity: parseFloat(item.quantity) || 0,
        price: parseFloat(item.buyPrice) || 0,
        fees: 0,
      }]
    }]
  }))
  const updateCrypto = (id, item) => updateAndSave(p => ({
    ...p, crypto: p.crypto.map(c => c.id === id ? { ...c, ...item } : c)
  }))
  const deleteCrypto = (id) => updateAndSave(p => ({
    ...p, crypto: p.crypto.filter(c => c.id !== id)
  }))
  const addCryptoMovement = (cryptoId, movement) => updateAndSave(p => ({
    ...p,
    crypto: p.crypto.map(item => {
      if (item.id !== cryptoId) return item
      const movements = [...(item.movements || []), movement]
      let totalQty = 0, totalCost = 0
      for (const mv of movements) {
        if (mv.type === 'buy') {
          totalQty += mv.quantity
          totalCost += mv.quantity * mv.price + (mv.fees || 0)
        } else if (mv.type === 'sell') {
          totalQty -= mv.quantity
        }
      }
      totalQty = Math.max(totalQty, 0)
      const avgPrice = totalQty > 0 ? totalCost / totalQty : item.buyPrice
      return { ...item, movements, quantity: totalQty, buyPrice: Math.round(avgPrice * 100) / 100 }
    })
  }))
  const deleteCryptoMovement = (cryptoId, movementIndex) => updateAndSave(p => ({
    ...p,
    crypto: p.crypto.map(item => {
      if (item.id !== cryptoId) return item
      const movements = (item.movements || []).filter((_, i) => i !== movementIndex)
      let totalQty = 0, totalCost = 0
      for (const mv of movements) {
        if (mv.type === 'buy') {
          totalQty += mv.quantity
          totalCost += mv.quantity * mv.price + (mv.fees || 0)
        } else if (mv.type === 'sell') {
          totalQty -= mv.quantity
        }
      }
      totalQty = Math.max(totalQty, 0)
      const avgPrice = totalQty > 0 ? totalCost / totalQty : item.buyPrice
      return { ...item, movements, quantity: totalQty, buyPrice: Math.round(avgPrice * 100) / 100 }
    })
  }))

  // PEA CRUD
  const addPea = (item) => updateAndSave(p => ({
    ...p, pea: [...p.pea, {
      ...item,
      id: Date.now().toString(),
      movements: [{
        date: item.buyDate || new Date().toISOString().slice(0, 10),
        type: 'buy',
        quantity: parseInt(item.quantity) || 0,
        price: parseFloat(item.buyPrice) || 0,
        fees: 0,
      }]
    }]
  }))
  const updatePea = (id, item) => updateAndSave(p => ({
    ...p, pea: p.pea.map(x => x.id === id ? { ...x, ...item } : x)
  }))
  const deletePea = (id) => updateAndSave(p => ({
    ...p, pea: p.pea.filter(x => x.id !== id)
  }))

  const addPeaMovement = (peaId, movement) => updateAndSave(p => ({
    ...p,
    pea: p.pea.map(item => {
      if (item.id !== peaId) return item
      const movements = [...(item.movements || []), movement]
      let totalQty = 0, totalCost = 0
      for (const mv of movements) {
        if (mv.type === 'buy') {
          totalQty += mv.quantity
          totalCost += mv.quantity * mv.price + (mv.fees || 0)
        } else if (mv.type === 'sell') {
          totalQty -= mv.quantity
        }
      }
      totalQty = Math.max(totalQty, 0)
      const avgPrice = totalQty > 0 ? totalCost / totalQty : item.buyPrice
      return { ...item, movements, quantity: totalQty, buyPrice: Math.round(avgPrice * 100) / 100 }
    })
  }))

  const deletePeaMovement = (peaId, movementIndex) => updateAndSave(p => ({
    ...p,
    pea: p.pea.map(item => {
      if (item.id !== peaId) return item
      const movements = (item.movements || []).filter((_, i) => i !== movementIndex)
      let totalQty = 0, totalCost = 0
      for (const mv of movements) {
        if (mv.type === 'buy') {
          totalQty += mv.quantity
          totalCost += mv.quantity * mv.price + (mv.fees || 0)
        } else if (mv.type === 'sell') {
          totalQty -= mv.quantity
        }
      }
      totalQty = Math.max(totalQty, 0)
      const avgPrice = totalQty > 0 ? totalCost / totalQty : item.buyPrice
      return { ...item, movements, quantity: totalQty, buyPrice: Math.round(avgPrice * 100) / 100 }
    })
  }))

  // LIVRETS CRUD
  const addLivret = (item) => updateAndSave(p => ({
    ...p, livrets: [...p.livrets, { ...item, id: Date.now().toString(), movements: item.movements || [] }]
  }))
  const updateLivret = (id, item) => updateAndSave(p => ({
    ...p, livrets: p.livrets.map(x => x.id === id ? { ...x, ...item } : x)
  }))
  const deleteLivret = (id) => updateAndSave(p => ({
    ...p, livrets: p.livrets.filter(x => x.id !== id)
  }))
  const addLivretMovement = (livretId, movement) => updateAndSave(p => ({
    ...p,
    livrets: p.livrets.map(l => {
      if (l.id !== livretId) return l
      const movements = [...(l.movements || []), movement]
      const newBalance = l.balance + movement.amount
      return { ...l, movements, balance: Math.max(newBalance, 0) }
    })
  }))
  const deleteLivretMovement = (livretId, movementIndex) => updateAndSave(p => ({
    ...p,
    livrets: p.livrets.map(l => {
      if (l.id !== livretId) return l
      const removed = l.movements[movementIndex]
      if (!removed) return l
      const movements = l.movements.filter((_, i) => i !== movementIndex)
      const newBalance = l.balance - removed.amount
      return { ...l, movements, balance: Math.max(newBalance, 0) }
    })
  }))

  // FUNDRAISING CRUD
  const addFundraising = (item) => updateAndSave(p => ({
    ...p, fundraising: [...p.fundraising, { ...item, id: Date.now().toString() }]
  }))
  const deleteFundraising = (id) => updateAndSave(p => ({
    ...p, fundraising: p.fundraising.filter(x => x.id !== id)
  }))

  // PRICE UPDATE (ephemeral — not saved to Drive)
  // cryptoPrices: { [coingeckoId]: { currentPrice, change24h, high24h, low24h, ... } }
  // stockPrices:  { [isin]: { currentPrice, openPrice, previousClose, dayHigh, dayLow, name, ... } }
  const updatePrices = useCallback((cryptoPrices, stockPrices) => {
    setPortfolio(prev => {
      const updatedCrypto = prev.crypto.map(c => {
        const coinId = c.coingeckoId || c.coinId || c.id_coingecko
        const data = coinId ? cryptoPrices[coinId] : null
        if (!data) return c
        return {
          ...c,
          currentPrice: data.currentPrice ?? c.currentPrice,
          change24h: data.change24h,
          change1h: data.change1h,
          change7d: data.change7d,
          change30d: data.change30d,
          change1y: data.change1y,
          high24h: data.high24h,
          low24h: data.low24h,
          marketCap: data.marketCap,
          volume: data.volume,
          coinImage: data.image || c.coinImage,
        }
      })

      const updatedPea = prev.pea.map(p => {
        const data = p.isin ? stockPrices[p.isin] : null
        if (!data) return p
        return {
          ...p,
          currentPrice: data.currentPrice ?? p.currentPrice,
          openPrice: data.openPrice,
          previousClose: data.previousClose,
          dayHigh: data.dayHigh,
          dayLow: data.dayLow,
          // Update name from live data if we didn't have one
          name: p.name || data.name || p.name,
        }
      })

      return { ...prev, crypto: updatedCrypto, pea: updatedPea }
    })
    setPricesLastUpdated(new Date())
  }, [])

  // OBJECTIVES CRUD
  const addObjective = (item) => updateAndSave(p => ({
    ...p, objectives: [...p.objectives, { ...item, id: Date.now().toString() }]
  }))
  const updateObjective = (id, item) => updateAndSave(p => ({
    ...p, objectives: p.objectives.map(x => x.id === id ? { ...x, ...item } : x)
  }))
  const deleteObjective = (id) => updateAndSave(p => ({
    ...p, objectives: p.objectives.filter(x => x.id !== id)
  }))

  // Computed totals
  const totals = {
    crypto: portfolio.crypto.reduce((sum, c) => sum + (c.currentPrice || c.buyPrice) * c.quantity, 0),
    pea: portfolio.pea.reduce((sum, p) => sum + (p.currentPrice || p.buyPrice) * p.quantity, 0),
    livrets: portfolio.livrets.reduce((sum, l) => sum + l.balance, 0),
    fundraising: portfolio.fundraising.reduce((sum, f) => sum + f.amountInvested, 0),
  }
  totals.total = totals.crypto + totals.pea + totals.livrets + totals.fundraising

  return (
    <PortfolioContext.Provider value={{
      portfolio, loading, totals, rates,
      driveConnected, driveError,
      addCrypto, updateCrypto, deleteCrypto, addCryptoMovement, deleteCryptoMovement,
      addPea, updatePea, deletePea, addPeaMovement, deletePeaMovement,
      addLivret, updateLivret, deleteLivret, addLivretMovement, deleteLivretMovement,
      addFundraising, deleteFundraising,
      addObjective, updateObjective, deleteObjective,
      fetchPortfolio,
      insightsData, saveInsights,
      dcaConfig, saveDcaConfig,
      dcaPlans: dcaPlans || { version: 1, plans: [] },
      createDcaPlan, updateDcaPlan, deleteDcaPlan, linkPlanToAsset, unlinkPlan,
      dcaSnapshots, saveDcaSnapshots,
      updatePrices, pricesLastUpdated,
      isRefreshingPrices, setIsRefreshingPrices,
      priceRefreshError, setPriceRefreshError,
      manualRefreshRef,
    }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolio() {
  return useContext(PortfolioContext)
}
