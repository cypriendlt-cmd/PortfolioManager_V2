import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { loadFileFromDrive, saveFileToDrive } from '../services/googleDrive'
import { parseExcelBuffer } from '../services/bankParser'
import { deduplicateTransactions } from '../services/bankEngine'
import { processInWorker, recategorizeInWorker, invalidateWorkerCache, terminateWorker } from '../services/bankWorkerBridge'
import { aiCategorizeBatch } from '../services/bankAI'
import { computeFinancialHealthScore } from '../services/financialHealthScoring'

const BankContext = createContext(null)

const BANK_FILE = 'bank_history.json'
const CACHE_KEY = 'pm_bank_cache'

const EMPTY_BANK = {
  version: 3,
  accounts: [],
  transactions: [],
  rules: [],
  learnedRules: {},   // { merchant_key: { category, subcategory, learnedAt } }
  aiCache: {},        // { merchant_key: { category, subcategory, confidence, cachedAt } }
  corrections: [],    // audit log — [{ id, tx_hash, raw_label, merchant_key, before, after, corrected_at, source }]
  lastImport: null,
  financeProfile: null,
  // ── Coach budgétaire ──────────────────────────────────────────────────────
  budgetProfile: null,        // { profileType, targetAllocation }
  financialGoals: [],         // [{ id, type, label, targetAmount, currentAmount, monthlyContribution, createdAt }]
  coachHistory: [],           // [{ id, date, action, recommendationId, recommendation }]
  allocationSnapshots: [],    // [{ month, income, allocation, score }]
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
  // Always merge with EMPTY_BANK to ensure all new fields exist
  return {
    ...EMPTY_BANK,
    ...data,
    version: 3,
    corrections:          data.corrections          || [],
    budgetProfile:        data.budgetProfile        || null,
    financialGoals:       data.financialGoals        || [],
    coachHistory:         data.coachHistory          || [],
    allocationSnapshots:  data.allocationSnapshots   || [],
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

      const now = new Date().toISOString()
      const learnedRules = {
        ...prev.learnedRules,
        [merchantKey]: { category: newCategory, subcategory: newSubcategory || null, learnedAt: now, source: 'user_correction' },
      }

      // Correction event for audit log
      const correctionEvent = {
        id: `corr_${Date.now()}`,
        tx_hash: hash,
        raw_label: tx.label,
        merchant_key: merchantKey,
        before: { category: tx.category || 'autre', subcategory: tx.subcategory || null },
        after: { category: newCategory, subcategory: newSubcategory || null },
        corrected_at: now,
        source: 'user_correction',
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

      const corrections = [...(prev.corrections || []), correctionEvent].slice(-500)
      return { ...prev, transactions, learnedRules, corrections }
    })
  }, [workerResults, updateAndSave])

  const deleteLearnedRule = useCallback((merchantKey) => {
    updateAndSave(prev => {
      const learnedRules = { ...prev.learnedRules }
      delete learnedRules[merchantKey]
      return { ...prev, learnedRules }
    })
  }, [updateAndSave])

  // Undo a correction: remove its learned rule (or restore the previous one),
  // reset affected transactions so the worker can re-categorize them.
  const undoCorrection = useCallback((correctionId) => {
    updateAndSave(prev => {
      const correction = (prev.corrections || []).find(c => c.id === correctionId)
      if (!correction) return prev

      const { merchant_key, before } = correction
      const remaining = (prev.corrections || [])
        .filter(c => c.id !== correctionId && c.merchant_key === merchant_key)
        .sort((a, b) => b.corrected_at.localeCompare(a.corrected_at))

      const learnedRules = { ...prev.learnedRules }
      if (remaining.length > 0) {
        // Restore the most recent other correction for this merchant
        const latest = remaining[0]
        learnedRules[merchant_key] = {
          category: latest.after.category,
          subcategory: latest.after.subcategory || null,
          learnedAt: latest.corrected_at,
          source: latest.source,
        }
      } else {
        // No other correction → delete rule so worker re-categorizes from builtins
        delete learnedRules[merchant_key]
      }

      const restoredCategory = remaining.length > 0
        ? remaining[0].after.category
        : (before.category || 'autre')
      const restoredSubcategory = remaining.length > 0
        ? (remaining[0].after.subcategory || null)
        : (before.subcategory || null)

      const transactions = prev.transactions.map(t => {
        if (t.merchant_key !== merchant_key) return t
        if (t.method !== 'user_learned' && t.method !== 'ai_accepted') return t
        return {
          ...t,
          category: restoredCategory,
          subcategory: restoredSubcategory,
          confidence: remaining.length > 0 ? 0.95 : 0.3,
          method: remaining.length > 0 ? 'user_learned' : 'rollback',
          reason: remaining.length > 0 ? `Règle apprise: ${merchant_key}` : `Annulation correction`,
        }
      })

      return {
        ...prev,
        learnedRules,
        transactions,
        corrections: (prev.corrections || []).filter(c => c.id !== correctionId),
      }
    })
    invalidateWorkerCache()
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
      const newCorrectionEvents = []

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
          newCorrectionEvents.push({
            id: `corr_ai_${t.hash}_${Date.now()}`,
            tx_hash: t.hash,
            raw_label: t.label,
            merchant_key: merchantKey,
            before: { category: t.category || 'autre', subcategory: t.subcategory || null },
            after: { category: correction.category, subcategory: correction.subcategory || null },
            corrected_at: now,
            source: 'ai_accepted',
          })
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

      const corrections_log = [...(prev.corrections || []), ...newCorrectionEvents].slice(-500)
      return { ...prev, transactions, learnedRules: newLearnedRules, corrections: corrections_log }
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

  // ── Coach budgétaire ────────────────────────────────────────────────────────

  const updateBudgetProfile = useCallback((data) => {
    updateAndSave(prev => ({
      ...prev,
      budgetProfile: { ...(prev.budgetProfile || {}), ...data },
    }))
  }, [updateAndSave])

  const addGoal = useCallback((goal) => {
    updateAndSave(prev => ({
      ...prev,
      financialGoals: [...(prev.financialGoals || []), { ...goal, id: goal.id || `goal_${Date.now()}`, createdAt: new Date().toISOString() }],
    }))
  }, [updateAndSave])

  const updateGoal = useCallback((goalId, data) => {
    updateAndSave(prev => ({
      ...prev,
      financialGoals: (prev.financialGoals || []).map(g => g.id === goalId ? { ...g, ...data } : g),
    }))
  }, [updateAndSave])

  const deleteGoal = useCallback((goalId) => {
    updateAndSave(prev => ({
      ...prev,
      financialGoals: (prev.financialGoals || []).filter(g => g.id !== goalId),
    }))
  }, [updateAndSave])

  const recordCoachAction = useCallback((action, recommendation) => {
    updateAndSave(prev => ({
      ...prev,
      coachHistory: [...(prev.coachHistory || []), {
        id: `ch_${Date.now()}`,
        date: new Date().toISOString(),
        action,
        recommendationId: recommendation.id,
        recommendation,
      }].slice(-200),
    }))
  }, [updateAndSave])

  const saveAllocationSnapshot = useCallback((snapshot) => {
    updateAndSave(prev => ({
      ...prev,
      allocationSnapshots: [...(prev.allocationSnapshots || []).filter(s => s.month !== snapshot.month), snapshot].slice(-24),
    }))
  }, [updateAndSave])

  const refreshCategories = useCallback(() => {
    invalidateWorkerCache()
    // Trigger reprocessing by bumping state
    setBankHistory(prev => ({ ...prev }))
  }, [])

  // Force full re-extraction of merchant_key + recategorization for ALL transactions.
  // Use this after improving the extraction algorithm or importing new rules.
  // learnedRules are preserved so user corrections still apply.
  const forceRecategorize = useCallback(() => {
    invalidateWorkerCache()
    setBankHistory(prev => ({
      ...prev,
      aiCache: {},  // clear AI cache so stale category suggestions are dropped
      transactions: prev.transactions.map(({ merchant_key, label_norm, payment_type, tokens, category, subcategory, confidence, reason, method, ...rest }) => ({
        ...rest,
        // Reset derived + categorization fields → worker recomputes from scratch
        // Preserve isTransfer so manually-marked transfers stay as virements
        category: rest.isTransfer ? 'virement' : 'autre',
        isTransfer: rest.isTransfer || false,
      })),
    }))
  }, [])

  // Use worker results for computed values (all computed off main thread)
  const aggregates = useMemo(() => workerResults?.aggregates || [], [workerResults])
  const coachInsights = useMemo(() => workerResults?.insights || null, [workerResults])
  const accountBalances = useMemo(() => workerResults?.accountBalances || bankHistory.accounts.map(acc => ({ ...acc, balance: acc.initialBalance || 0, txCount: 0 })), [workerResults, bankHistory.accounts])

  // Enrich transactions early so avgByCategory can use worker-enriched data
  const enrichedTransactionsRaw = useMemo(
    () => workerResults?.transactions || bankHistory.transactions,
    [workerResults, bankHistory.transactions]
  )

  // Compute avgByCategory from last 3 months of enriched transactions
  const avgByCategory = useMemo(() => {
    if (!enrichedTransactionsRaw.length || !aggregates.length) return {}
    const last3Months = aggregates.slice(-3).map(a => a.month)
    const nMonths = last3Months.length || 1
    const sums = {}
    for (const tx of enrichedTransactionsRaw) {
      if (tx.amount >= 0 || tx.isTransfer) continue
      if (!last3Months.includes(tx.date.slice(0, 7))) continue
      const cat = tx.category || 'autre'
      sums[cat] = (sums[cat] || 0) + Math.abs(tx.amount)
    }
    return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / nMonths]))
  }, [enrichedTransactionsRaw, aggregates])

  // Rich deterministic health score (0-100) — single source of truth for the whole app
  const healthData = useMemo(() => {
    const totalCash = accountBalances.reduce((s, a) => s + (a.balance || 0), 0)
    return computeFinancialHealthScore({
      aggregates,
      totalCash,
      financialGoals: bankHistory.financialGoals || [],
      avgByCategory,
    })
  }, [aggregates, accountBalances, bankHistory.financialGoals, avgByCategory])

  const healthScore = useMemo(() => healthData.score, [healthData])

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
  const enrichedTransactions = enrichedTransactionsRaw

  return (
    <BankContext.Provider value={{
      bankHistory: { ...bankHistory, transactions: enrichedTransactions },
      loading, processing, accountBalances,
      aggregates, healthScore, healthData, coachInsights,
      importExcel, addRule, deleteRule,
      markAsTransfer, unmarkTransfer,
      setInitialBalance, updateAccount, deleteAccount, refreshCategories, forceRecategorize,
      financeProfile: autoFinanceProfile,
      updateFinanceProfile,
      correctCategory, deleteLearnedRule, undoCorrection, clearAICache,
      requestAICategorization, applyAIProposals,
      flaggedTransfers: workerResults?.flaggedTransfers || [],
      lowConfidenceCount: workerResults?.lowConfidence?.length || 0,
      // Coach budgétaire
      updateBudgetProfile, addGoal, updateGoal, deleteGoal,
      recordCoachAction, saveAllocationSnapshot,
    }}>
      {children}
    </BankContext.Provider>
  )
}

export function useBank() {
  return useContext(BankContext)
}
