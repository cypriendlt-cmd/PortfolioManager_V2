import api from './api'

export const getUser = () => api.get('/auth/me')
export const logout = () => api.post('/auth/logout')
export const login = () => { window.location.href = '/auth/google' }
