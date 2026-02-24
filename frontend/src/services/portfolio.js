import api from './api'

export const getPortfolio = () => api.get('/api/portfolio')
export const savePortfolio = (data) => api.put('/api/portfolio', data)
