import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { loadFileFromDrive, saveFileToDrive } from '../services/googleDrive'
import { parseExcelBuffer } from '../services/bankParser'
import {
  deduplicateTransactions, detectTransfers, categorizeAll,
  computeMonthlyAggregates, computeHealthScore, generateCoachInsights
} from '../services/bankEngine'

const BankContext = createContext(null)

const BANK_FILE = 'bank_history.json'
const CACHE_KEY = 'pm_bank_cache'

const EMPTY_BANK = {
  version: 1,
  accounts: [],
  transactions: [],
  rules: [],
  lastImport: null,
  financeProfile: null,
}

const EMPTY_PROFILE = {
  monthlyIncome: 0,
  monthlyExpenses: 0,
  currentCash: 0,
  investmentHorizon: 'moyen',
  riskTolerance: 'modere',
}

export function BankProvider({ children }) {
  const { user, accessToken, gapiReady } = useAuth()
  const [bankHistory, setBankHistory] = useState(EMPTY_BANK)
  const [loading, setLoading] = useState(false)
  const saveTimer = useRef(null)

  // Load from Drive
  useEffect(() => {
    if (!user || !accessToken || !gapiReady) {
      setBankHistory(EMPTY_BANK)
      return
    }
    setLoading(true)
    loadFileFromDrive(BANK_FILE)
      .then(data => {
        if (data && data.version) {
          setBankHistory(data)
          try {
            const { transactions, ...meta } = data
            localStorage.setItem(CACHE_KEY, JSON.stringify(meta))
          } catch {}
        }
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const meta = JSON.parse(cached)
            setBankHistory(prev => ({ ...prev, ...meta, transactions: prev.transactions }))
          }
        } catch {}
      })
      .finally(() => setLoading(false))
  }, [user, accessToken, gapiReady])

  const saveToDrive = useCallback((data) => {
    if (!user || !accessToken || !gapiReady) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveFileToDrive(BANK_FILE, data)
      } catch (e) {
        console.error('Bank Drive save error:', e)
      }
    }, 1500)
  }, [user, accessToken, gapiReady])

  const updateAndSave = useCallback((updater) => {
    setBankHistory(prev => {
      const updated = updater(prev)
      saveToDrive(updated)
      try {
        const { transactions, ...meta } = updated
        localStorage.setItem(CACHE_KEY, JSON.stringify(meta))
      } catch {}
      return updated
    })
  }, [saveToDrive])

  const importExcel = useCallback(async (arrayBuffer) => {
    const { accounts: newAccounts, transactions: newTxs, errors } = await parseExcelBuffer(arrayBuffer)

    let result = {}
    updateAndSave(prev => {
      // Merge accounts
      const existingIds = new Set(prev.accounts.map(a => a.id))
      const mergedAccounts = [...prev.accounts]
      for (const acc of newAccounts) {
        if (!existingIds.has(acc.id)) mergedAccounts.push(acc)
      }

      // Deduplicate transactions
      const { merged, newCount, dupCount } = deduplicateTransactions(prev.transactions, newTxs)

      // Detect transfers and categorize
      let processed = detectTransfers(merged)
      processed = categorizeAll(processed, prev.rules)

      result = { newCount, dupCount, accountCount: newAccounts.length, errors }
      return {
        ...prev,
        accounts: mergedAccounts,
        transactions: processed,
        lastImport: new Date().toISOString(),
      }
    })
    return result
  }, [updateAndSave])

  const addRule = useCallback((rule) => {
    updateAndSave(prev => {
      const rules = [...prev.rules, { ...rule, id: `custom_${Date.now()}` }]
      const transactions = categorizeAll(prev.transactions, rules)
      return { ...prev, rules, transactions }
    })
  }, [updateAndSave])

  const deleteRule = useCallback((ruleId) => {
    updateAndSave(prev => {
      const rules = prev.rules.filter(r => r.id !== ruleId)
      const transactions = categorizeAll(prev.transactions, rules)
      return { ...prev, rules, transactions }
    })
  }, [updateAndSave])

  const markAsTransfer = useCallback((hash) => {
    updateAndSave(prev => ({
      ...prev,
      transactions: prev.transactions.map(t =>
        t.hash === hash ? { ...t, isTransfer: true, category: 'virement' } : t
      )
    }))
  }, [updateAndSave])

  const unmarkTransfer = useCallback((hash) => {
    updateAndSave(prev => {
      const transactions = prev.transactions.map(t =>
        t.hash === hash ? { ...t, isTransfer: false, transferPairHash: null } : t
      )
      return { ...prev, transactions: categorizeAll(transactions, prev.rules) }
    })
  }, [updateAndSave])

  const setInitialBalance = useCallback((accountId, balance, date) => {
    updateAndSave(prev => ({
      ...prev,
      accounts: prev.accounts.map(a =>
        a.id === accountId ? { ...a, initialBalance: balance, lastBalanceDate: date } : a
      )
    }))
  }, [updateAndSave])

  const updateFinanceProfile = useCallback((data) => {
    updateAndSave(prev => ({
      ...prev,
      financeProfile: { ...(prev.financeProfile || EMPTY_PROFILE), ...data },
    }))
  }, [updateAndSave])

  const refreshCategories = useCallback(() => {
    updateAndSave(prev => ({
      ...prev,
      transactions: categorizeAll(detectTransfers(prev.transactions), prev.rules)
    }))
  }, [updateAndSave])

  // Computed values
  const aggregates = computeMonthlyAggregates(bankHistory.transactions)
  const healthScore = computeHealthScore(aggregates)
  const coachInsights = bankHistory.transactions.length > 0
    ? generateCoachInsights(bankHistory.transactions, aggregates)
    : null

  // Account balances
  const accountBalances = bankHistory.accounts.map(acc => {
    const txs = bankHistory.transactions.filter(t => t.accountId === acc.id)
    const txTotal = txs.reduce((s, t) => s + t.amount, 0)
    return { ...acc, balance: acc.initialBalance + txTotal, txCount: txs.length }
  })

  return (
    <BankContext.Provider value={{
      bankHistory, loading, accountBalances,
      aggregates, healthScore, coachInsights,
      importExcel, addRule, deleteRule,
      markAsTransfer, unmarkTransfer,
      setInitialBalance, refreshCategories,
      financeProfile: bankHistory.financeProfile || EMPTY_PROFILE,
      updateFinanceProfile,
    }}>
      {children}
    </BankContext.Provider>
  )
}

export function useBank() {
  return useContext(BankContext)
}
