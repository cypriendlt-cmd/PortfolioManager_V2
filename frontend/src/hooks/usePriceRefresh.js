/**
 * usePriceRefresh.js
 * Custom React hook that auto-refreshes live prices for all portfolio assets
 * every `intervalMs` milliseconds.
 *
 * Usage modes:
 *  - Called ONCE in PriceRefreshManager (App.jsx) with `manager: true` — owns the interval
 *    and writes refreshing state back to context.
 *  - Called in page components WITHOUT manager flag — returns the shared state from context
 *    plus a `refreshNow` function that delegates to the manager's refresh function.
 */

import { useEffect, useCallback, useRef } from 'react'
import { usePortfolio } from '../context/PortfolioContext'
import { fetchCryptoPrices, fetchStockPrices, getCachedCryptoPrices, getCachedStockPrices } from '../services/priceService'

/**
 * Manager mode: owns the interval, performs fetches, writes to context.
 */
export function usePriceRefreshManager(intervalMs = 60000) {
  const {
    portfolio,
    updatePrices,
    setIsRefreshingPrices,
    setPriceRefreshError,
    manualRefreshRef,
  } = usePortfolio()

  const isMountedRef = useRef(true)
  const timerRef = useRef(null)

  // Keep a ref to the latest portfolio so refresh() can read current IDs
  // without depending on portfolio in its useCallback deps (which would cause
  // an infinite loop: updatePrices → new array ref → refresh recreated → effect
  // re-runs → refresh() called immediately → updatePrices → ∞).
  const portfolioRef = useRef(portfolio)
  useEffect(() => {
    portfolioRef.current = portfolio
  }, [portfolio])

  // Apply cached prices immediately so the UI shows something before first fetch
  useEffect(() => {
    const cachedCrypto = getCachedCryptoPrices()
    const cachedStocks = getCachedStockPrices()
    if (Object.keys(cachedCrypto).length > 0 || Object.keys(cachedStocks).length > 0) {
      updatePrices(cachedCrypto, cachedStocks)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    if (!isMountedRef.current) return
    setIsRefreshingPrices(true)
    setPriceRefreshError(null)

    try {
      const cryptoIds = [
        ...new Set(
          (portfolioRef.current.crypto || [])
            .map(c => c.coingeckoId || c.coinId || c.id_coingecko)
            .filter(Boolean)
        )
      ]
      const isins = [
        ...new Set(
          (portfolioRef.current.pea || [])
            .map(p => p.isin)
            .filter(Boolean)
        )
      ]

      const [cryptoResult, stockResult] = await Promise.allSettled([
        cryptoIds.length > 0 ? fetchCryptoPrices(cryptoIds) : Promise.resolve({}),
        isins.length > 0 ? fetchStockPrices(isins) : Promise.resolve({}),
      ])

      if (!isMountedRef.current) return

      const cp = cryptoResult.status === 'fulfilled' ? cryptoResult.value : {}
      const sp = stockResult.status === 'fulfilled' ? stockResult.value : {}

      if (cryptoResult.status === 'rejected') console.warn('Crypto refresh failed:', cryptoResult.reason)
      if (stockResult.status === 'rejected') console.warn('Stock refresh failed:', stockResult.reason)

      updatePrices(cp, sp)
    } catch (err) {
      if (isMountedRef.current) setPriceRefreshError(err.message || 'Price refresh failed')
    } finally {
      if (isMountedRef.current) setIsRefreshingPrices(false)
    }
  }, [updatePrices, setIsRefreshingPrices, setPriceRefreshError])

  // Expose refresh function via ref so page components can trigger it
  useEffect(() => {
    manualRefreshRef.current = refresh
  }, [refresh, manualRefreshRef])

  // Schedule periodic refresh
  useEffect(() => {
    isMountedRef.current = true
    refresh()
    timerRef.current = setInterval(refresh, intervalMs)
    return () => {
      isMountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [refresh, intervalMs])
}

/**
 * Consumer mode: used by page components to read shared refresh state
 * and trigger a manual refresh via the manager.
 */
export function usePriceRefresh() {
  const { pricesLastUpdated, isRefreshingPrices, priceRefreshError, manualRefreshRef } = usePortfolio()

  const refreshNow = useCallback(() => {
    if (manualRefreshRef.current) manualRefreshRef.current()
  }, [manualRefreshRef])

  return {
    lastRefresh: pricesLastUpdated,
    isRefreshing: isRefreshingPrices,
    error: priceRefreshError,
    refreshNow,
  }
}
