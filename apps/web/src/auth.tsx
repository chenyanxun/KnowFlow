import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearToken, setToken, token, type Account } from './api'

interface AuthValue {
  ready: boolean
  account: Account | null
  login: (username: string, password: string) => Promise<string | null>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)

  useEffect(() => {
    const logout = () => setAccount(null)
    window.addEventListener('knowflow-client-unauthorized', logout)
    if (!token()) {
      setReady(true)
      return () => window.removeEventListener('knowflow-client-unauthorized', logout)
    }
    api<{ account: Account }>('/client/profile')
      .then((profile) => setAccount(profile.account))
      .catch(() => clearToken())
      .finally(() => setReady(true))
    return () => window.removeEventListener('knowflow-client-unauthorized', logout)
  }, [])

  const value = useMemo<AuthValue>(() => ({
    ready,
    account,
    async login(username, password) {
      try {
        const result = await api<{ token: string; account: Account }>('/client/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        })
        setToken(result.token)
        setAccount(result.account)
        return null
      } catch (error) {
        return error instanceof Error ? error.message : '登录失败'
      }
    },
    logout() {
      clearToken()
      setAccount(null)
    },
  }), [account, ready])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider 未挂载')
  return auth
}
