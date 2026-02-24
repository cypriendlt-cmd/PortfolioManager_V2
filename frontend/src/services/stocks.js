import api from './api'

export const getStockPrice = (isin) => api.get(`/api/stocks/${isin}`)
export const searchStocks = (query) => api.get('/api/stocks/search', { params: { q: query } })
