import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authEnabled, setAuthEnabled] = useState(false)
  const [token, setToken] = useState(() => localStorage.getItem('hs-token') || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.auth.config()
      .then(c => setAuthEnabled(c.auth_enabled))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const login = async (username, password) => {
    const resp = await api.auth.login({ username, password })
    const t = resp.token || ''
    localStorage.setItem('hs-token', t)
    setToken(t)
    return resp
  }

  const logout = () => {
    localStorage.removeItem('hs-token')
    setToken('')
  }

  const isAuthenticated = !authEnabled || !!token

  return (
    <AuthContext.Provider value={{ authEnabled, token, loading, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
