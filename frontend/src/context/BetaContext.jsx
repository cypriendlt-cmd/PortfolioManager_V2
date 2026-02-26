import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext'
import { loadFileFromDrive, saveFileToDrive } from '../services/googleDrive'

const BetaContext = createContext(null)

const EMPTY_PROFILE = {
  monthlyIncome: 0,
  monthlyExpenses: 0,
  currentCash: 0,
  investmentHorizon: 'moyen', // court | moyen | long
  riskTolerance: 'modere', // prudent | modere | dynamique
}

export function BetaProvider({ children }) {
  const { user, accessToken, gapiReady } = useAuth()

  const [isBeta, setIsBeta] = useState(() => localStorage.getItem('pm_beta_mode') === 'true')
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false)
  const saveTimer = useRef(null)

  const toggleBeta = useCallback(() => {
    setIsBeta(prev => {
      const next = !prev
      localStorage.setItem('pm_beta_mode', String(next))
      // Persist to Drive so reload doesn't revert
      if (user && accessToken && gapiReady) {
        saveFileToDrive('user-profile.json', {
          version: 1,
          preferences: { betaEnabled: next },
          financeProfile: userProfile || EMPTY_PROFILE,
        }).catch(() => {})
      }
      return next
    })
  }, [user, accessToken, gapiReady, userProfile])

  // Load profile from Drive on login
  useEffect(() => {
    if (!user || !accessToken || !gapiReady) return
    let cancelled = false
    setProfileLoading(true)

    ;(async () => {
      try {
        const data = await loadFileFromDrive('user-profile.json')
        if (!cancelled && data) {
          setUserProfile(data.financeProfile || EMPTY_PROFILE)
          setHasCompletedOnboarding(!!data.financeProfile?.monthlyIncome)
          if (data.preferences?.betaEnabled != null) {
            setIsBeta(data.preferences.betaEnabled)
            localStorage.setItem('pm_beta_mode', String(data.preferences.betaEnabled))
          }
        }
      } catch (e) {
        console.warn('Drive profile load error:', e)
        try {
          const cached = localStorage.getItem('pm_user_profile')
          if (!cancelled && cached) {
            const parsed = JSON.parse(cached)
            setUserProfile(parsed)
            setHasCompletedOnboarding(!!parsed.monthlyIncome)
          }
        } catch {}
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [user, accessToken, gapiReady])

  const updateProfile = useCallback((data) => {
    const updated = { ...userProfile, ...data }
    setUserProfile(updated)
    setHasCompletedOnboarding(!!updated.monthlyIncome)
    localStorage.setItem('pm_user_profile', JSON.stringify(updated))

    if (!user || !accessToken || !gapiReady) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveFileToDrive('user-profile.json', {
          version: 1,
          preferences: { betaEnabled: isBeta },
          financeProfile: updated,
        })
      } catch (e) {
        console.warn('Drive profile save error:', e)
      }
    }, 1500)
  }, [userProfile, user, accessToken, gapiReady, isBeta])

  return (
    <BetaContext.Provider value={{
      isBeta, toggleBeta,
      userProfile: userProfile || EMPTY_PROFILE,
      updateProfile,
      profileLoading,
      hasCompletedOnboarding,
    }}>
      {children}
    </BetaContext.Provider>
  )
}

export function useBeta() {
  return useContext(BetaContext)
}
