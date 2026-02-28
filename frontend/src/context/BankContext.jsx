import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { loadFileFromDrive, saveFileToDrive } from '../services/googleDrive'
import { parseExcelBuffer } from '../services/bankParser'
import { deduplicateTransactions } from '../services/bankEngine'
import { processInWorker, recategorizeInWorker, invalidateWorkerCache, terminateWorker } from '../services/bankWorkerBridge'
import { aiCategorizeBatch } from '../services/bankAI'

const BankContext = createContext(null)

const BANK_FILE = 'bank_history.json'
const CACHE_KEY = 'pm_bank_cache'

const EMPTY_BANK = {
  version: 2,
  accounts: [],
  transactions: [],
  rules: [],
  learnedRules: {},   // { merchant_key: { category, subcategory, learnedAt } }
  aiCache: {},        // { merchant_key: { category, subcategory, confidence, cachedAt } }
  lastImport: null,
  financeProfile: null,
}

const DEMO_BANK_DATA = {
  version: 2,
  accounts: [
    { id: 'demo_courant', name: 'Compte Courant BNP', type: 'courant', iban: 'FR76****', initialBalance: 2847.32, lastBalanceDate: '2024-01-01' },
    { id: 'demo_joint', name: 'Compte Joint CIC', type: 'courant', iban: 'FR76****', initialBalance: 1203.54, lastBalanceDate: '2024-01-01' },
  ],
  transactions: [],
  rules: [],
  learnedRules: {},
  aiCache: {},
  lastImport: null,
  financeProfile: {
    monthlyIncome: 3200,
    monthlyExpenses: 1850,
    currentCash: 4050,
    investmentHorizon: 'long',
    riskTolerance: 'modere',
  },
}

const EMPTY_PROFILE = {
  monthlyIncome: 0,
  monthlyExpenses: 0,
  currentCash: 0,
  investmentHorizon: 'moyen',
  riskTolerance: 'modere',
}

// Strip heavy derived fields before saving to Drive.
// merchant_key IS kept — it's needed by correctCategory and the worker preserves it
// when re-running so manual/AI corrections aren't overwritten.
function stripDerived(transactions) {
  return transactions.map(({ label_norm, tokens, ...rest }) => rest)
}

// Migrate v1 → v2
function migrateData(data) {
  if (!data || !data.version) return EMPTY_BANK
  if (data.version >= 2) return data
  return {
    ...EMPTY_BANK,
    ...data,
    version: 2,
    learnedRules: data.learnedRules || {},
    aiCache: data.aiCache || {},
  }
}

export function BankProvider({ children }) {
  const { user, accessToken, gapiReady, isGuest } = useAuth()
  const [bankHistory, setBankHistory] = useState(EMPTY_BANK)
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const saveTimer = useRef(null)

  // Worker-computed results (off main thread)
  const [workerResults, setWorkerResults] = useState(null)

  // Load from Drive
  useEffect(() => {
    if (!user || !accessToken || !gapiReady) {
      if (isGuest) {
        setBankHistory(DEMO_BANK_DATA)
      } else {
        setBankHistory(EMPTY_BANK)
      }
      setWorkerResults(null)
      return
    }
    setLoading(true)
    loadFileFromDrive(BANK_FILE)
      .then(data => {
        if (data && data.version) {
          const migrated = migrateData(data)
          setBankHistory(migrated)
          try {
            const { transactions, ...meta } = migrated
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

    return () => terminateWorker()
  }, [user, accessToken, gapiReady, isGuest])

  // Process transactions in worker whenever bankHistory changes
  useEffect(() => {
    if (!bankHistory.transactions.length) {
      setWorkerResults(null)
      return
    }

    setProcessing(true)
    processInWorker({
      transactions: bankHistory.transactions,
      rules: bankHistory.rules,
      learnedRules: bankHistory.learnedRules || {},
      aiCache: bankHistory.aiCache || {},
      accounts: bankHistory.accounts,
    })
      .then(result => {
        if (result) setWorkerResults(result)
      })
      .catch(err => {
        if (err.message !== 'Superseded') console.error('Worker error:', err)
      })
      .finally(() => setProcessing(false))
  }, [bankHistory.transactions, bankHistory.rules, bankHistory.learnedRules, bankHistory.aiCache, bankHistory.accounts])

  const saveToDrive = useCallback((data) => {
    if (!user || !accessToken || !gapiReady) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        // Strip derived fields to save space
        const toSave = { ...data, transactions: stripDerived(data.transactions) }
        await saveFileToDrive(BANK_FILE, toSave)
      } catch (e) {
        console.error('Bank Drive save error:', e)
      }
    }, 1500)
  }, [user, accessToken, gapiReady])

  const updateAndSave = useCallback((updater) => {
    setBankHistory(prev => {
      const updated = updater(prev)
      saveToDrive(updated)
      invalidateWorkerCache()
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
      const existingIds = new Set(prev.accounts.map(a => a.id))
      const mergedAccounts = [...prev.accounts]
      for (const acc of newAccounts) {
        if (!existingIds.has(acc.id)) mergedAccounts.push(acc)
      }

      const { merged, newCount, dupCount } = deduplicateTransactions(prev.transactions, newTxs)
      result = { newCount, dupCount, accountCount: newAccounts.length, errors }
      return {
        ...prev,
        accounts: mergedAccounts,
        transactions: merged,
        lastImport: new Date().toISOString(),
      }
    })
    return result
  }, [updateAndSave])

  const addRule = useCallback((rule) => {
    updateAndSave(prev => ({
      ...prev,
      rules: [...prev.rules, { ...rule, id: `custom_${Date.now()}` }],
    }))
  }, [updateAndSave])

  const deleteRule = useCallback((ruleId) => {
    updateAndSave(prev => ({
      ...prev,
      rules: prev.rules.filter(r => r.id !== ruleId),
    }))
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
    updateAndSave(prev => ({
      ...prev,
      transactions: prev.transactions.map(t =>
        t.hash === hash ? { ...t, isTransfer: false, transferPairHash: null } : t
      ),
    }))
  }, [updateAndSave])

  const setInitialBalance = useCallback((accountId, balance, date) => {
    updateAndSave(prev => ({
      ...prev,
      accounts: prev.accounts.map(a =>
        a.id === accountId ? { ...a, initialBalance: balance, lastBalanceDate: date } : a
      )
    }))
  }, [updateAndSave])

  const updateAccount = useCallback((accountId, fields) => {
    updateAndSave(prev => ({
      ...prev,
      accounts: prev.accounts.map(a =>
        a.id === accountId ? { ...a, ...fields } : a
      )
    }))
  }, [updateAndSave])

  const deleteAccount = useCallback((accountId) => {
    updateAndSave(prev => ({
      ...prev,
      accounts: prev.accounts.filter(a => a.id !== accountId),
      transactions: prev.transactions.filter(t => t.accountId !== accountId),
    }))
  }, [updateAndSave])

  const updateFinanceProfile = useCallback((data) => {
    updateAndSave(prev => ({
      ...prev,
      financeProfile: { ...(prev.financeProfile || EMPTY_PROFILE), ...data },
    }))
  }, [updateAndSave])

  // Correct a category → learn from merchant_key
  // Uses enriched transactions (workerResults) to get the reliable merchant_key.
  const correctCategory = useCallback((hash, newCategory, newSubcategory) => {
    // Prefer merchant_key from enriched worker output (more accurate extraction)
    const enrichedMap = workerResults?.transactions
      ? new Map(workerResults.transactions.map(t => [t.hash, t.merchant_key]))
      : null

    updateAndSave(prev => {
      const tx = prev.transactions.find(t => t.hash === hash)
      if (!tx) return prev

      // merchant_key: enriched (worker computed) > stored > raw label fallback
      const merchantKey = (enrichedMap?.get(hash)) || tx.merchant_key
        || tx.label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 30)

      const learnedRules = {
        ...prev.learnedRules,
        [merchantKey]: { category: newCategory, subcategory: newSubcategory || null, learnedAt: new Date().toISOString() },
      }

      // Apply to all transactions with same merchant_key + update stored merchant_key
      const transactions = prev.transactions.map(t => {
        const mk = (enrichedMap?.get(t.hash)) || t.merchant_key
          || t.label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 30)
        if (mk === merchantKey) {
          return {
            ...t,
            merchant_key: mk,  // persist enriched key
            category: newCategory,
            subcategory: newSubcategory || null,
            confidence: 0.95,
            reason: `Règle apprise: ${merchantKey}`,
            method: 'user_learned',
          }
        }
        return t
      })

      return { ...prev, transactions, learnedRules }
    })
  }, [workerResults, updateAndSave])

  const deleteLearnedRule = useCallback((merchantKey) => {
    updateAndSave(prev => {
      const learnedRules = { ...prev.learnedRules }
      delete learnedRules[merchantKey]
      return { ...prev, learnedRules }
    })
  }, [updateAndSave])

  // Apply a batch of AI-accepted category corrections.
  // Saves to learnedRules so the worker persists them across re-runs.
  const applyAIProposals = useCallback((corrections) => {
    // corrections: [{ hash, category, subcategory, merchantName? }]
    const enrichedMap = workerResults?.transactions
      ? new Map(workerResults.transactions.map(t => [t.hash, t.merchant_key]))
      : null

    updateAndSave(prev => {
      const correctionMap = new Map(corrections.map(c => [c.hash, c]))
      const now = new Date().toISOString()
      const newLearnedRules = { ...prev.learnedRules }

      const transactions = prev.transactions.map(t => {
        const correction = correctionMap.get(t.hash)
        if (!correction) return t

        // Save merchant → category as learned rule so worker applies it persistently
        const merchantKey = correction.merchantName
          || (enrichedMap?.get(t.hash))
          || t.merchant_key
          || t.label.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 30)

        if (merchantKey) {
          newLearnedRules[merchantKey] = {
            category: correction.category,
            subcategory: correction.subcategory || null,
            learnedAt: now,
            source: 'ai_accepted',
          }
        }

        return {
          ...t,
          merchant_key: merchantKey || t.merchant_key,  // persist enriched key
          category: correction.category,
          subcategory: correction.subcategory || null,
          confidence: 0.92,
          reason: `IA acceptée: ${merchantKey}`,
          method: 'ai_accepted',
        }
      })

      return { ...prev, transactions, learnedRules: newLearnedRules }
    })
  }, [workerResults, updateAndSave])

  const clearAICache = useCallback(() => {
    updateAndSave(prev => ({ ...prev, aiCache: {} }))
  }, [updateAndSave])

  // Request AI categorization for low-confidence merchants
  const requestAICategorization = useCallback(async () => {
    const lowConf = workerResults?.lowConfidence
    if (!lowConf || lowConf.length === 0) return { count: 0 }

    try {
      const aiResults = await aiCategorizeBatch(lowConf)
      if (aiResults.size === 0) return { count: 0 }

      updateAndSave(prev => {
        const aiCache = { ...prev.aiCache }
        const now = new Date().toISOString()
        for (const [key, val] of aiResults) {
          aiCache[key] = { ...val, cachedAt: now }
        }
        return { ...prev, aiCache }
      })
      return { count: aiResults.size }
    } catch (err) {
      console.error('AI categorization error:', err)
      return { count: 0, error: err.message }
    }
  }, [workerResults, updateAndSave])

  const refreshCategories = useCallback(() => {
    invalidateWorkerCache()
    // Trigger reprocessing by bumping state
    setBankHistory(prev => ({ ...prev }))
  }, [])

  // Use worker results for computed values (all computed off main thread)
  const aggregates = useMemo(() => workerResults?.aggregates || [], [workerResults])
  const healthScore = useMemo(() => workerResults?.healthScore ?? 50, [workerResults])
  const coachInsights = useMemo(() => workerResults?.insights || null, [workerResults])
  const accountBalances = useMemo(() => workerResults?.accountBalances || bankHistory.accounts.map(acc => ({ ...acc, balance: acc.initialBalance || 0, txCount: 0 })), [workerResults, bankHistory.accounts])

  // Auto-compute finance profile
  const autoFinanceProfile = useMemo(() => {
    const manual = bankHistory.financeProfile
    if (aggregates.length > 0) {
      const recent = aggregates.slice(-3)
      const avgIncome = recent.reduce((s, a) => s + a.income, 0) / recent.length
      const avgExpenses = recent.reduce((s, a) => s + a.expenses, 0) / recent.length
      const totalCash = accountBalances.reduce((s, acc) => s + (acc.balance || 0), 0)
      return {
        monthlyIncome: Math.round(avgIncome),
        monthlyExpenses: Math.round(avgExpenses),
        currentCash: Math.round(totalCash),
        investmentHorizon: manual?.investmentHorizon || 'moyen',
        riskTolerance: manual?.riskTolerance || 'modere',
      }
    }
    return manual || EMPTY_PROFILE
  }, [aggregates, bankHistory.financeProfile, accountBalances])

  // Enriched transactions from worker (with category, confidence, etc.)
  const enrichedTransactions = useMemo(
    () => workerResults?.transactions || bankHistory.transactions,
    [workerResults, bankHistory.transactions]
  )

  return (
    <BankContext.Provider value={{
      bankHistory: { ...bankHistory, transactions: enrichedTransactions },
      loading, processing, accountBalances,
      aggregates, healthScore, coachInsights,
      importExcel, addRule, deleteRule,
      markAsTransfer, unmarkTransfer,
      setInitialBalance, updateAccount, deleteAccount, refreshCategories,
      financeProfile: autoFinanceProfile,
      updateFinanceProfile,
      correctCategory, deleteLearnedRule, clearAICache,
      requestAICategorization, applyAIProposals,
      flaggedTransfers: workerResults?.flaggedTransfers || [],
      lowConfidenceCount: workerResults?.lowConfidence?.length || 0,
    }}>
      {children}
    </BankContext.Provider>
  )
}

export function useBank() {
  return useContext(BankContext)
}
