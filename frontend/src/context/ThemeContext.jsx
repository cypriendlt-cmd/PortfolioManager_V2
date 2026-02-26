import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext(null)

const THEMES = ['crimson', 'ocean', 'slate', 'amethyst', 'teal']

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('pm-theme')
    return stored && THEMES.includes(stored) ? stored : 'crimson'
  })
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('pm-dark-mode')
    return stored !== null ? JSON.parse(stored) : true
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-mode', darkMode ? 'dark' : 'light')
    localStorage.setItem('pm-theme', theme)
    localStorage.setItem('pm-dark-mode', JSON.stringify(darkMode))
  }, [theme, darkMode])

  const toggleDarkMode = () => setDarkMode(prev => !prev)

  const changeTheme = (newTheme) => {
    if (THEMES.includes(newTheme)) setTheme(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, darkMode, toggleDarkMode, changeTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
