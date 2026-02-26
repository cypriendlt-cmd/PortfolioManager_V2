import { createContext, useContext, useState, useCallback } from 'react'

const PrivacyContext = createContext(null)

export function PrivacyProvider({ children }) {
  const [hideValues, setHideValues] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pm-hide-values')) === true } catch { return false }
  })

  const toggleHideValues = useCallback(() => {
    setHideValues(prev => {
      const next = !prev
      localStorage.setItem('pm-hide-values', JSON.stringify(next))
      return next
    })
  }, [])

  return (
    <PrivacyContext.Provider value={{ hideValues, toggleHideValues }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}
