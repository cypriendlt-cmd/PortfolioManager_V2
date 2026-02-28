import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Sun, Moon, Bell, Search, Check, Eye, EyeOff } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { usePrivacy } from '../context/PrivacyContext'
import { getDueNotifications, markNotificationDone } from '../services/notifications'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/crypto': 'Crypto',
  '/pea': 'PEA',
  '/livrets': 'Livrets',
  '/fundraising': 'Levées de fonds',
  '/objectives': 'Objectifs',
  '/insights': 'Insights IA',
  '/dca': 'DCA',
  '/settings': 'Paramètres',
  '/banking': 'Banque & Cashflow',
}

export default function Header({ onMenuClick }) {
  const { darkMode, toggleDarkMode } = useTheme()
  const { hideValues, toggleHideValues } = usePrivacy()
  const location = useLocation()
  const [searchFocused, setSearchFocused] = useState(false)
  const [dueNotifs, setDueNotifs] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef(null)

  const title = PAGE_TITLES[location.pathname] || 'Portfolio Manager'

  // Check due notifications every 30s and on mount
  useEffect(() => {
    const check = () => setDueNotifs(getDueNotifications())
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleMarkDone = (id) => {
    markNotificationDone(id)
    setDueNotifs(getDueNotifications())
  }

  return (
    <header className="header">
      <div className="header-left">
        <button className="header-menu-btn" onClick={onMenuClick}>
          <Menu size={20} />
        </button>
        <h1 className="header-title">{title}</h1>
      </div>

      <div className="header-right">
        <div className={`header-search ${searchFocused ? 'header-search--focused' : ''}`}>
          <Search size={16} />
          <input
            type="text"
            placeholder="Rechercher..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>

        <div className="header-notif-wrapper" ref={notifRef}>
          <button
            className="header-icon-btn"
            title="Notifications"
            onClick={() => setNotifOpen(!notifOpen)}
          >
            <Bell size={18} />
            {dueNotifs.length > 0 && (
              <span className="header-notif-badge">{dueNotifs.length}</span>
            )}
          </button>

          {notifOpen && (
            <div className="header-notif-dropdown">
              <div className="header-notif-dropdown-title">Rappels DCA</div>
              <div className="header-notif-dropdown-list">
                {dueNotifs.length === 0 ? (
                  <div className="header-notif-empty">Aucun rappel en attente</div>
                ) : (
                  dueNotifs.map(n => (
                    <div key={n.id} className="header-notif-dropdown-item">
                      <div className="header-notif-dropdown-text">
                        Investir {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n.monthlyAmount)} dans {n.assetName}
                        <span>Rappel DCA du {n.nextReminder}</span>
                      </div>
                      <button className="header-notif-done-btn" onClick={() => handleMarkDone(n.id)}>
                        <Check size={12} style={{ marginRight: 2, verticalAlign: 'middle' }} />
                        Fait
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button className="header-icon-btn" onClick={toggleHideValues} title={hideValues ? 'Afficher les valeurs' : 'Masquer les valeurs'}>
          {hideValues ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>

        <button className="header-icon-btn" onClick={toggleDarkMode} title={darkMode ? 'Mode clair' : 'Mode sombre'}>
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}
