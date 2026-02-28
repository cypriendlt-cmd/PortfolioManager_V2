import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Wallet, Shield, PieChart, Sunrise,
  Settings, ArrowLeft, ChevronLeft, ChevronRight, X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useBeta } from '../context/BetaContext'

const BETA_NAV_ITEMS = [
  { path: '/beta', icon: LayoutDashboard, label: 'Synthèse' },
  { path: '/beta/budget', icon: Wallet, label: 'Budget' },
  { path: '/beta/security', icon: Shield, label: 'Matelas' },
  { path: '/beta/investments', icon: PieChart, label: 'Allocation' },
  { path: '/beta/freedom', icon: Sunrise, label: 'Liberté' },
  { path: '/settings', icon: Settings, label: 'Paramètres' },
]

export default function BetaSidebar({ mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(false)
  const { user } = useAuth()
  const { theme } = useTheme()
  const { toggleBeta } = useBeta()

  const themeColors = {
    crimson: '#dc2626',
    ocean: '#2563eb',
    slate: '#64748b',
    amethyst: '#8b5cf6',
    teal: '#06b6d4',
  }

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-mobile-overlay" onClick={onMobileClose} />
      )}
      <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileOpen ? 'sidebar--mobile-open' : ''}`}>
        <div className="sidebar-header">
          {!collapsed && (
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon" style={{ background: themeColors[theme] || 'var(--accent)' }}>C</div>
              <span className="sidebar-logo-text">Coach</span>
            </div>
          )}
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <button className="sidebar-mobile-close" onClick={onMobileClose}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {BETA_NAV_ITEMS.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/beta'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
              onClick={onMobileClose}
            >
              <Icon size={20} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-link"
            onClick={toggleBeta}
            style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.8rem' }}
          >
            <ArrowLeft size={18} />
            {!collapsed && <span>Quitter le mode bêta</span>}
          </button>
          <div className="sidebar-theme-dot" style={{ background: themeColors[theme] || 'var(--accent)' }} title={theme} />
          {!collapsed && user && (
            <div className="sidebar-user">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} className="sidebar-avatar" />
              ) : (
                <div className="sidebar-avatar sidebar-avatar--placeholder">
                  {(user.name || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{user.name || 'Utilisateur'}</span>
                <span className="sidebar-user-email">{user.email}</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
