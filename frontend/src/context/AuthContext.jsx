import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const GOOGLE_CLIENT_ID = '841928728121-neh3pudtmd1ig4au7lmglm6qf0uv1uff.apps.googleusercontent.com'
const REDIRECT_URI = 'https://cypriendlt-cmd.github.io/PortfolioManager_V2/'
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email'
const TOKEN_KEY = 'pm_google_token'
const USER_KEY = 'pm_google_user'
const GUEST_KEY = 'pm_guest_mode'

function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// Keep legacy setting support for any existing stored client ID
const STORAGE_KEY = 'pm_google_client_id'
function getStoredClientId() {
  return localStorage.getItem(STORAGE_KEY) || GOOGLE_CLIENT_ID
}

function waitForGoogleScripts() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.gapi) {
        resolve()
      } else {
        setTimeout(check, 100)
      }
    }
    check()
  })
}

const GUEST_USER = { name: 'Invité', email: 'guest@local', avatar: null, isGuest: true }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accessToken, setAccessToken] = useState(null)
  const [clientId] = useState(GOOGLE_CLIENT_ID)
  const [gapiReady, setGapiReady] = useState(false)
  const [error, setError] = useState(null)
  const [isGuest, setIsGuest] = useState(false)

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

  const fetchUserInfo = useCallback(async (token) => {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Failed to fetch user info')
    return res.json()
  }, [])

  // Handle the OAuth redirect callback (token in URL hash)
  const handleOAuthCallback = useCallback(async () => {
    const hash = window.location.hash
    if (!hash) return false

    const params = new URLSearchParams(hash.slice(1))
    const token = params.get('access_token')
    const hashError = params.get('error')

    // Clean up the URL regardless
    window.history.replaceState(null, '', window.location.pathname)

    if (hashError || !token) return false

    setAccessToken(token)
    sessionStorage.setItem(TOKEN_KEY, token)
    if (window.gapi?.client) window.gapi.client.setToken({ access_token: token })

    try {
      const info = await fetchUserInfo(token)
      const userData = { name: info.name, email: info.email, avatar: info.picture }
      setUser(userData)
      localStorage.setItem(USER_KEY, JSON.stringify(userData))
    } catch (e) {
      console.error('User info fetch failed', e)
    }
    return true
  }, [fetchUserInfo])

  // Try to restore session on mount (or handle OAuth redirect callback)
  useEffect(() => {
    if (!gapiReady) return

    // Handle OAuth redirect callback: token arrives in URL hash
    if (window.location.hash.includes('access_token')) {
      handleOAuthCallback().then(() => setLoading(false))
      return
    }

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

    if (storedUser && window.google?.accounts?.oauth2) {
      // User data persisted but token gone (new tab / page reload).
      // Attempt a silent token refresh using the popup-less token client.
      const id = getStoredClientId()

      let settled = false
      const settle = () => {
        if (!settled) { settled = true; setLoading(false) }
      }

      const timer = setTimeout(settle, 5000)

      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPES,
        hint: storedUser.email,
        prompt: '',
        callback: async (response) => {
          clearTimeout(timer)
          if (response.error) {
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

    // Check for guest mode
    if (sessionStorage.getItem(GUEST_KEY)) {
      setUser(GUEST_USER)
      setIsGuest(true)
      setLoading(false)
      return
    }

    setLoading(false)
  }, [gapiReady])

  // Redirect-based OAuth login — no popup, no COOP issues
  const login = useCallback(() => {
    setError(null)
    const redirectUri = REDIRECT_URI
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: SCOPES,
      include_granted_scopes: 'true',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }, [])

  const loginAsGuest = useCallback(() => {
    setUser(GUEST_USER)
    setIsGuest(true)
    setLoading(false)
    sessionStorage.setItem(GUEST_KEY, 'true')
  }, [])

  const logout = useCallback(() => {
    if (isGuest) {
      setUser(null)
      setIsGuest(false)
      sessionStorage.removeItem(GUEST_KEY)
      return
    }
    if (accessToken) {
      window.google?.accounts?.oauth2?.revoke(accessToken, () => {})
    }
    window.gapi?.client?.setToken?.(null)
    setUser(null)
    setAccessToken(null)
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }, [accessToken, isGuest])

  // Keep for Settings compatibility (no-op now since ID is hard-coded)
  const updateClientId = useCallback((newId) => {
    localStorage.setItem(STORAGE_KEY, newId)
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading, accessToken, clientId, gapiReady, error, isGuest,
      login, loginAsGuest, logout, updateClientId, handleOAuthCallback,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
