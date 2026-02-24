import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu, Sun, Moon, Bell, Search } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import './Header.css'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/crypto': 'Crypto',
  '/pea': 'PEA',
  '/livrets': 'Livrets',
  '/fundraising': 'Levées de fonds',
  '/objectives': 'Objectifs',
  '/insights': 'Insights IA',
  '/settings': 'Paramètres',
}

export default function Header({ onMenuClick }) {
  const { darkMode, toggleDarkMode } = useTheme()
  const location = useLocation()
  const [searchFocused, setSearchFocused] = useState(false)

  const title = PAGE_TITLES[location.pathname] || 'Portfolio Manager'

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

        <button className="header-icon-btn" title="Notifications">
          <Bell size={18} />
          <span className="header-notif-dot" />
        </button>

        <button className="header-icon-btn" onClick={toggleDarkMode} title={darkMode ? 'Mode clair' : 'Mode sombre'}>
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}
