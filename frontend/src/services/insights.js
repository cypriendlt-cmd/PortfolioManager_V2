import api from './api'

export const getInsights = () => api.get('/api/insights')

export const refreshInsights = () => api.post('/api/insights/refresh')

export const analyzePortfolio = (portfolioData) =>
  api.post('/api/insights/analyze', { portfolio: portfolioData })

export const getProviders = () => api.get('/api/insights/providers')

export const getDashboardSummary = (portfolioData) =>
  api.post('/api/insights/dashboard-summary', { portfolio: portfolioData })

export const analyzeStocks = (investmentProfile, anthropicApiKey) =>
  api.post('/api/insights/stocks', { ...investmentProfile, anthropicApiKey })
