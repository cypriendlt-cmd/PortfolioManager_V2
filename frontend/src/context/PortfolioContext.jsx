import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { loadPortfolioFromDrive, savePortfolioToDrive } from '../services/googleDrive'

const PortfolioContext = createContext(null)

const EMPTY_PORTFOLIO = {
  crypto: [],
  pea: [],
  livrets: [],
  fundraising: [],
  objectives: [],
}

const RATES = { 'livret-a': 2.4, 'ldds': 2.4, 'lep': 3.5, 'cel': 2.0, 'pel': 2.25 }

export function PortfolioProvider({ children }) {
  const { user, accessToken, gapiReady } = useAuth()
  const [portfolio, setPortfolio] = useState(EMPTY_PORTFOLIO)
  const [loading, setLoading] = useState(false)
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveError, setDriveError] = useState(null)
  const [pricesLastUpdated, setPricesLastUpdated] = useState(null)
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)
  const [priceRefreshError, setPriceRefreshError] = useState(null)
  const manualRefreshRef = useRef(null)
  const saveTimer = useRef(null)

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

  useEffect(() => {
    if (user && accessToken && gapiReady) {
      fetchPortfolio()
    } else {
      setPortfolio(EMPTY_PORTFOLIO)
      setDriveConnected(false)
    }
  }, [user, accessToken, gapiReady, fetchPortfolio])

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

  const updateAndSave = useCallback((updater) => {
    setPortfolio(prev => {
      const updated = updater(prev)
      saveToDrive(updated)
      return updated
    })
  }, [saveToDrive])

  // CRYPTO CRUD
  const addCrypto = (item) => updateAndSave(p => ({
    ...p, crypto: [...p.crypto, { ...item, id: Date.now().toString() }]
  }))
  const updateCrypto = (id, item) => updateAndSave(p => ({
    ...p, crypto: p.crypto.map(c => c.id === id ? { ...c, ...item } : c)
  }))
  const deleteCrypto = (id) => updateAndSave(p => ({
    ...p, crypto: p.crypto.filter(c => c.id !== id)
  }))

  // PEA CRUD
  const addPea = (item) => updateAndSave(p => ({
    ...p, pea: [...p.pea, { ...item, id: Date.now().toString() }]
  }))
  const updatePea = (id, item) => updateAndSave(p => ({
    ...p, pea: p.pea.map(x => x.id === id ? { ...x, ...item } : x)
  }))
  const deletePea = (id) => updateAndSave(p => ({
    ...p, pea: p.pea.filter(x => x.id !== id)
  }))

  // LIVRETS CRUD
  const addLivret = (item) => updateAndSave(p => ({
    ...p, livrets: [...p.livrets, { ...item, id: Date.now().toString() }]
  }))
  const updateLivret = (id, item) => updateAndSave(p => ({
    ...p, livrets: p.livrets.map(x => x.id === id ? { ...x, ...item } : x)
  }))
  const deleteLivret = (id) => updateAndSave(p => ({
    ...p, livrets: p.livrets.filter(x => x.id !== id)
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
      portfolio, loading, totals, rates: RATES,
      driveConnected, driveError,
      addCrypto, updateCrypto, deleteCrypto,
      addPea, updatePea, deletePea,
      addLivret, updateLivret, deleteLivret,
      addFundraising, deleteFundraising,
      addObjective, updateObjective, deleteObjective,
      fetchPortfolio,
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
