import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Bitcoin, TrendingUp, PiggyBank,
  Rocket, Target, Brain, Calculator, Landmark, Settings, ChevronLeft,
  ChevronRight, Menu, X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/banking', icon: Landmark, label: 'Banque & Cash' },
  { path: '/crypto', icon: Bitcoin, label: 'Crypto' },
  { path: '/pea', icon: TrendingUp, label: 'PEA' },
  { path: '/livrets', icon: PiggyBank, label: 'Livrets' },
  { path: '/fundraising', icon: Rocket, label: 'Levées de fonds' },
  { path: '/objectives', icon: Target, label: 'Objectifs' },
  { path: '/insights', icon: Brain, label: 'Insights IA' },
  { path: '/dca', icon: Calculator, label: 'DCA' },
  { path: '/settings', icon: Settings, label: 'Paramètres' },
]

export default function Sidebar({ mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(false)
  const { user } = useAuth()
  const { theme } = useTheme()
  const location = useLocation()

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
              <div className="sidebar-logo-icon" style={{ background: themeColors[theme] }}>P</div>
              <span className="sidebar-logo-text">Portfolio</span>
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
          {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
              onClick={onMobileClose}
            >
              <Icon size={20} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-theme-dot" style={{ background: themeColors[theme] }} title={theme} />
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
          {!collapsed && !user && (
            <div className="sidebar-user">
              <div className="sidebar-avatar sidebar-avatar--placeholder">D</div>
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">Mode Demo</span>
                <span className="sidebar-user-email">Non connecté</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
