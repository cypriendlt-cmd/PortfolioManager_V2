import { useState } from 'react'
import BetaSidebar from './BetaSidebar'
import Header from './Header'

export default function BetaLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="app-layout">
      <BetaSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="main-content">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="page-content animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}
