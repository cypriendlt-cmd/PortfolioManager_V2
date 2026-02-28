import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { PortfolioProvider } from './context/PortfolioContext'
import { PrivacyProvider } from './context/PrivacyContext'
import './styles/app.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <PrivacyProvider>
          <AuthProvider>
            <PortfolioProvider>
              <App />
            </PortfolioProvider>
          </AuthProvider>
        </PrivacyProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>
)
