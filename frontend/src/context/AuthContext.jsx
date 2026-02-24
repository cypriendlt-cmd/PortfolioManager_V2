import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email'
const STORAGE_KEY = 'pm_google_client_id'
const TOKEN_KEY = 'pm_google_token'
const USER_KEY = 'pm_google_user'

function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function getStoredClientId() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

function waitForGoogleScripts() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.google?.accounts?.oauth2 && window.gapi) {
        resolve()
      } else {
        setTimeout(check, 100)
      }
    }
    check()
  })
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState(null)
  const [clientId, setClientId] = useState(getStoredClientId)
  const [gapiReady, setGapiReady] = useState(false)
  const [error, setError] = useState(null)

  // Initialize gapi client
  const initGapi = useCallback(async () => {
    await waitForGoogleScripts()
    await new Promise((resolve, reject) => {
      window.gapi.load('client', { callback: resolve, onerror: reject })
    })
    await window.gapi.client.init({})
    await window.gapi.client.load('drive', 'v3')
    setGapiReady(true)
  }, [])

  useEffect(() => {
    initGapi().catch(console.error)
  }, [initGapi])

  // Try to restore session on mount
  useEffect(() => {
    if (!gapiReady) return

    const storedToken = sessionStorage.getItem(TOKEN_KEY)
    const storedUser = getStoredUser()

    if (storedToken && storedUser) {
      // Same-tab session still alive
      setAccessToken(storedToken)
      setUser(storedUser)
      window.gapi?.client?.setToken?.({ access_token: storedToken })
      setLoading(false)
      return
    }

    if (storedUser) {
      // User data persisted but token gone (new tab / page reload).
      // Attempt a silent token refresh — no popup, no user interaction.
      const id = getStoredClientId()
      if (!id) {
        setLoading(false)
        return
      }

      let settled = false
      const settle = () => {
        if (!settled) { settled = true; setLoading(false) }
      }

      // Fallback: if Google doesn't call the callback within 5 s, give up silently.
      const timer = setTimeout(settle, 5000)

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPES,
        hint: storedUser.email,
        prompt: '',          // empty string = let Google decide (usually silent when session exists)
        callback: async (response) => {
          clearTimeout(timer)
          if (response.error) {
            // Silent refresh failed → user must log in manually
            localStorage.removeItem(USER_KEY)
            settle()
            return
          }
          const token = response.access_token
          setAccessToken(token)
          sessionStorage.setItem(TOKEN_KEY, token)
          window.gapi.client.setToken({ access_token: token })
          setUser(storedUser)
          settle()
        },
      })
      tokenClient.requestAccessToken({ prompt: '' })
      return
    }

    setLoading(false)
  }, [gapiReady])

  const fetchUserInfo = useCallback(async (token) => {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch user info')
    return res.json()
  }, [])

  const login = useCallback(() => {
    const id = clientId || getStoredClientId()
    if (!id) {
      setError('Veuillez configurer votre Google Client ID dans les Paramètres.')
      return
    }
    setError(null)

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPES,
      callback: async (response) => {
        if (response.error) {
          setError(`Erreur OAuth: ${response.error}`)
          return
        }
        const token = response.access_token
        setAccessToken(token)
        sessionStorage.setItem(TOKEN_KEY, token)
        window.gapi.client.setToken({ access_token: token })

        try {
          const info = await fetchUserInfo(token)
          const userData = {
            name: info.name,
            email: info.email,
            avatar: info.picture,
          }
          setUser(userData)
          localStorage.setItem(USER_KEY, JSON.stringify(userData))
        } catch (e) {
          console.error('User info fetch failed', e)
        }
      },
    })
    tokenClient.requestAccessToken()
  }, [clientId, fetchUserInfo])

  const logout = useCallback(() => {
    if (accessToken) {
      window.google.accounts.oauth2.revoke(accessToken, () => {})
    }
    window.gapi?.client?.setToken?.(null)
    setUser(null)
    setAccessToken(null)
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }, [accessToken])

  const updateClientId = useCallback((newId) => {
    setClientId(newId)
    localStorage.setItem(STORAGE_KEY, newId)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading, accessToken, clientId, gapiReady, error,
      login, logout, updateClientId,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
