import { useCallback } from 'react'
import { usePrivacy } from '../context/PrivacyContext'

const MASK = '••••'

/**
 * Returns masking functions for personal financial values.
 * Market data (asset prices, 24h changes) should NOT use these — pass them raw.
 */
export function usePrivacyMask() {
  const { hideValues } = usePrivacy()

  // Mask a formatted currency string
  const m = useCallback((formatted) => hideValues ? MASK : formatted, [hideValues])

  // Mask a formatted percentage string
  const mp = useCallback((formatted) => hideValues ? MASK : formatted, [hideValues])

  return { m, mp, hideValues }
}
