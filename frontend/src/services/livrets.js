import api from './api'

export const getRates = () => api.get('/api/livrets/rates')

export const calculateInterest = (balance, rate) => {
  const annual = balance * (rate / 100)
  const quinzaine = annual / 24
  return { annual, quinzaine }
}
