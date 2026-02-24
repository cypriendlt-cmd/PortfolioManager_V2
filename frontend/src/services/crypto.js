import api from './api'

export const getPrices = (symbols) => api.get('/api/crypto/prices', { params: { symbols: symbols.join(',') } })
export const syncBinance = () => api.get('/api/crypto/binance/sync')
export const searchCrypto = (query) => api.get('/api/crypto/search', { params: { q: query } })
