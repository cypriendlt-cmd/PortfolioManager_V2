import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Don't show if already installed or dismissed recently
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      // Small delay so it doesn't appear instantly
      setTimeout(() => setShow(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShow(false)
    }
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-strong)',
      borderRadius: 16,
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      animation: 'slideUp 0.4s ease',
      maxWidth: 'calc(100vw - 32px)',
    }}>
      <img src="./icons/icon-72x72.png" alt="" style={{ width: 40, height: 40, borderRadius: 10 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Installer Portfolio Manager
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Accès rapide depuis votre écran d'accueil
        </div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 16px',
          background: 'var(--gradient-accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Download size={14} />
        Installer
      </button>
      <button
        onClick={handleDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
