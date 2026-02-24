import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { useAuth } from './AuthContext'

const PortfolioContext = createContext(null)

const DEMO_DATA = {
  crypto: [
    { id: '1', symbol: 'BTC', name: 'Bitcoin', quantity: 0.5, buyPrice: 28000, buyDate: '2023-11-01', source: 'manual', currentPrice: 62000 },
    { id: '2', symbol: 'ETH', name: 'Ethereum', quantity: 3.2, buyPrice: 1800, buyDate: '2023-12-15', source: 'manual', currentPrice: 3400 },
    { id: '3', symbol: 'SOL', name: 'Solana', quantity: 45, buyPrice: 22, buyDate: '2024-01-10', source: 'binance', currentPrice: 148 },
    { id: '4', symbol: 'BNB', name: 'BNB', quantity: 12, buyPrice: 230, buyDate: '2024-02-01', source: 'binance', currentPrice: 410 },
    { id: '5', symbol: 'AVAX', name: 'Avalanche', quantity: 30, buyPrice: 18, buyDate: '2024-01-20', source: 'manual', currentPrice: 35 },
  ],
  pea: [
    { id: '1', isin: 'FR0000120271', name: 'TotalEnergies', quantity: 20, buyPrice: 55.20, buyDate: '2023-09-01', currentPrice: 61.50 },
    { id: '2', isin: 'LU0908500753', name: 'Amundi MSCI World', quantity: 50, buyPrice: 300, buyDate: '2023-06-15', currentPrice: 380 },
    { id: '3', isin: 'FR0000131104', name: 'BNP Paribas', quantity: 35, buyPrice: 52.80, buyDate: '2024-01-05', currentPrice: 58.20 },
    { id: '4', isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', quantity: 25, buyPrice: 72, buyDate: '2023-11-20', currentPrice: 89 },
  ],
  livrets: [
    { id: '1', type: 'livret-a', bank: 'Boursorama', balance: 22950, customRate: null },
    { id: '2', type: 'ldds', bank: 'Crédit Mutuel', balance: 12000, customRate: null },
    { id: '3', type: 'lep', bank: 'La Banque Postale', balance: 10000, customRate: null },
    { id: '4', type: 'pel', bank: 'Caisse d\'Epargne', balance: 35000, customRate: 2.0 },
  ],
  fundraising: [
    { id: '1', projectName: 'Startup FinTech Alpha', amountInvested: 5000, unitPrice: 0.50, units: 10000, date: '2023-08-15' },
    { id: '2', projectName: 'GreenTech Solutions', amountInvested: 2500, unitPrice: 1.00, units: 2500, date: '2024-01-30' },
    { id: '3', projectName: 'MedTech Innovation', amountInvested: 3000, unitPrice: 2.50, units: 1200, date: '2024-02-10' },
  ],
  objectives: [
    { id: '1', name: 'Vacances Japon', targetAmount: 8000, currentAmount: 5200, deadline: '2025-06-01', icon: 'plane', color: '#3b82f6' },
    { id: '2', name: 'Voiture', targetAmount: 25000, currentAmount: 12000, deadline: '2025-12-01', icon: 'car', color: '#10b981' },
    { id: '3', name: 'Immobilier', targetAmount: 60000, currentAmount: 18000, deadline: '2027-01-01', icon: 'home', color: '#8b5cf6' },
    { id: '4', name: 'Retraite anticipée', targetAmount: 500000, currentAmount: 85000, deadline: '2035-01-01', icon: 'sun', color: '#f59e0b' },
  ],
}

const RATES = { 'livret-a': 3.0, 'ldds': 3.0, 'lep': 5.0, 'cel': 2.0, 'pel': 2.0 }

export function PortfolioProvider({ children }) {
  const { user } = useAuth()
  const [portfolio, setPortfolio] = useState(DEMO_DATA)
  const [loading, setLoading] = useState(false)
  const [prices, setPrices] = useState({})

  const fetchPortfolio = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await axios.get('/api/portfolio', { withCredentials: true })
      if (res.data && Object.keys(res.data).length > 0) {
        setPortfolio(res.data)
      }
    } catch {
      // Use demo data
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) fetchPortfolio()
  }, [user, fetchPortfolio])

  const savePortfolio = async (data) => {
    try {
      await axios.put('/api/portfolio', data, { withCredentials: true })
      setPortfolio(data)
    } catch {
      setPortfolio(data)
    }
  }

  // CRYPTO CRUD
  const addCrypto = (item) => {
    const updated = { ...portfolio, crypto: [...portfolio.crypto, { ...item, id: Date.now().toString() }] }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const updateCrypto = (id, item) => {
    const updated = { ...portfolio, crypto: portfolio.crypto.map(c => c.id === id ? { ...c, ...item } : c) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const deleteCrypto = (id) => {
    const updated = { ...portfolio, crypto: portfolio.crypto.filter(c => c.id !== id) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  // PEA CRUD
  const addPea = (item) => {
    const updated = { ...portfolio, pea: [...portfolio.pea, { ...item, id: Date.now().toString() }] }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const updatePea = (id, item) => {
    const updated = { ...portfolio, pea: portfolio.pea.map(p => p.id === id ? { ...p, ...item } : p) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const deletePea = (id) => {
    const updated = { ...portfolio, pea: portfolio.pea.filter(p => p.id !== id) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  // LIVRETS CRUD
  const addLivret = (item) => {
    const updated = { ...portfolio, livrets: [...portfolio.livrets, { ...item, id: Date.now().toString() }] }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const updateLivret = (id, item) => {
    const updated = { ...portfolio, livrets: portfolio.livrets.map(l => l.id === id ? { ...l, ...item } : l) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const deleteLivret = (id) => {
    const updated = { ...portfolio, livrets: portfolio.livrets.filter(l => l.id !== id) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  // FUNDRAISING CRUD
  const addFundraising = (item) => {
    const updated = { ...portfolio, fundraising: [...portfolio.fundraising, { ...item, id: Date.now().toString() }] }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const deleteFundraising = (id) => {
    const updated = { ...portfolio, fundraising: portfolio.fundraising.filter(f => f.id !== id) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  // OBJECTIVES CRUD
  const addObjective = (item) => {
    const updated = { ...portfolio, objectives: [...portfolio.objectives, { ...item, id: Date.now().toString() }] }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const updateObjective = (id, item) => {
    const updated = { ...portfolio, objectives: portfolio.objectives.map(o => o.id === id ? { ...o, ...item } : o) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

  const deleteObjective = (id) => {
    const updated = { ...portfolio, objectives: portfolio.objectives.filter(o => o.id !== id) }
    setPortfolio(updated)
    if (user) savePortfolio(updated)
  }

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
      addCrypto, updateCrypto, deleteCrypto,
      addPea, updatePea, deletePea,
      addLivret, updateLivret, deleteLivret,
      addFundraising, deleteFundraising,
      addObjective, updateObjective, deleteObjective,
      fetchPortfolio,
    }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolio() {
  return useContext(PortfolioContext)
}
