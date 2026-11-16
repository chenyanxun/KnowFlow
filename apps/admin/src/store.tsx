import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, clearToken, setToken, token } from './api'
import type { Account, AccountStatus, ActionResult, DashboardSummary, Db, Employee, MenuItem, MenuType, Role } from './types'

interface Profile {
  account: Account
  menus: MenuItem[]
  permissions: string[]
  homePath: string
}

export interface EmployeeInput {
  username: string
  name: string
  password?: string
  status: AccountStatus
}

export interface AccountInput {
  username: string
  name: string
  password?: string
  roleIds: string[]
  status: AccountStatus
}

export interface RoleInput {
  name: string
  code: string
  menuIds: string[]
}

export interface MenuInput {
  parentId: string | null
  name: string
  type: MenuType
  path?: string
  icon?: string
  permission?: string
  sort: number
  visible: boolean
}

type Ok = { ok: true } | ActionResult

interface StoreValue {
  ready: boolean
  db: Db
  navMenus: MenuItem[]
  summary: DashboardSummary | null
  current: Account | null
  login: (username: string, password: string) => Promise<{ ok: true; path: string } | ActionResult>
  logout: () => void
  can: (permission: string) => boolean
  canOpenPath: (path: string) => boolean
  homePath: () => string
  saveAccount: (input: AccountInput, id?: string) => Promise<Ok>
  saveEmployee: (input: EmployeeInput, id?: string) => Promise<Ok>
  setEmployeeStatus: (id: string, status: AccountStatus) => Promise<Ok>
  resetEmployeePassword: (id: string, password: string) => Promise<Ok>
  resetPassword: (id: string, password: string) => Promise<Ok>
  removeAccount: (id: string) => Promise<Ok>
  saveRole: (input: RoleInput, id?: string) => Promise<Ok>
  removeRole: (id: string) => Promise<Ok>
  saveMenu: (input: MenuInput, id?: string) => Promise<Ok>
  removeMenu: (id: string) => Promise<Ok>
  addDocument: (file: File) => Promise<Ok>
  reloadDocuments: () => Promise<void>
  removeDocument: (id: string) => Promise<Ok>
  downloadDocument: (id: string, name: string) => Promise<void>
}

const emptyDb: Db = { accounts: [], employees: [], roles: [], menus: [], documents: [] }

const StoreContext = createContext<StoreValue | null>(null)

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '请求失败'
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id) => right.includes(id))
}

async function loadData(profile: Profile) {
  const paths = new Set(profile.menus.flatMap((menu) => (menu.type === 'page' && menu.path ? [menu.path] : [])))
  const [accounts, employees, roles, menus, documents, summary] = await Promise.all([
    paths.has('/system/users') ? api<Account[]>('/users') : Promise.resolve(null),
    paths.has('/system/employees') ? api<Employee[]>('/employees') : Promise.resolve(null),
    paths.has('/system/users') || paths.has('/system/roles') ? api<Role[]>('/roles') : Promise.resolve(null),
    paths.has('/system/menus') || paths.has('/system/roles') ? api<MenuItem[]>('/menus') : Promise.resolve(null),
    paths.has('/documents') ? api<Db['documents']>('/documents') : Promise.resolve(null),
    paths.has('/dashboard') ? api<DashboardSummary>('/dashboard') : Promise.resolve(null),
  ])
  return {
    db: {
      accounts: accounts ?? [],
      employees: employees ?? [],
      roles: roles ?? [],
      menus: menus ?? [],
      documents: documents ?? [],
    },
    summary,
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [navMenus, setNavMenus] = useState<MenuItem[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [home, setHome] = useState('/dashboard')
  const [db, setDb] = useState<Db>(emptyDb)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const sessionRef = useRef<Profile | null>(null)

  const apply = (profile: Profile) => {
    sessionRef.current = profile
    setAccount(profile.account)
    setNavMenus(profile.menus)
    setPermissions(profile.permissions)
    setHome(profile.homePath || '/dashboard')
  }

  const refresh = async () => {
    const profile = await api<Profile>('/auth/profile')
    apply(profile)
    const data = await loadData(profile)
    setDb(data.db)
    setSummary(data.summary)
  }

  useEffect(() => {
    const expire = () => {
      sessionRef.current = null
      setAccount(null)
      setNavMenus([])
      setPermissions([])
      setDb(emptyDb)
      setSummary(null)
    }
    window.addEventListener('knowflow-unauthorized', expire)
    return () => window.removeEventListener('knowflow-unauthorized', expire)
  }, [])

  useEffect(() => {
    let active = true
    const boot = async () => {
      if (!token()) {
        if (active) setReady(true)
        return
      }
      try {
        const profile = await api<Profile>('/auth/profile')
        if (!active) return
        apply(profile)
        const data = await loadData(profile)
        if (!active) return
        setDb(data.db)
        setSummary(data.summary)
      } catch {
        clearToken()
        if (!active) return
        sessionRef.current = null
      } finally {
        if (active) setReady(true)
      }
    }
    void boot()
    return () => {
      active = false
    }
  }, [])

  const value = useMemo<StoreValue>(() => {
    const run = async (work: () => Promise<void>): Promise<Ok> => {
      try {
        await work()
        return { ok: true }
      } catch (error) {
        return { ok: false, message: messageOf(error) }
      }
    }

    return {
      ready,
      db,
      navMenus,
      summary,
      current: account,
      async login(username, password) {
        try {
          const result = await api<Profile & { token: string }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
          })
          setToken(result.token)
          apply(result)
          const data = await loadData(result)
          setDb(data.db)
          setSummary(data.summary)
          return { ok: true, path: result.homePath || '/dashboard' }
        } catch (error) {
          return { ok: false, message: messageOf(error) }
        }
      },
      logout() {
        clearToken()
        sessionRef.current = null
        setAccount(null)
        setNavMenus([])
        setPermissions([])
        setDb(emptyDb)
        setSummary(null)
      },
      can(permission) {
        return permissions.includes(permission)
      },
      canOpenPath(path) {
        return navMenus.some((menu) => menu.type === 'page' && menu.path === path)
      },
      homePath() {
        return account ? home : '/login'
      },
      saveAccount(input, id) {
        return run(async () => {
          if (!id) {
            await api('/users', { method: 'POST', body: JSON.stringify(input) })
          } else {
            const current = db.accounts.find((item) => item.id === id)
            const statusOnly = current
              && current.username === input.username
              && current.name === input.name
              && sameIds(current.roleIds, input.roleIds)
              && current.status !== input.status
            if (statusOnly) {
              await api(`/users/${id}/status`, { method: 'POST', body: JSON.stringify({ status: input.status }) })
            } else {
              await api(`/users/${id}`, { method: 'PUT', body: JSON.stringify(input) })
            }
          }
          await refresh()
        })
      },
      resetPassword(id, password) {
        return run(async () => {
          await api(`/users/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) })
        })
      },
      saveEmployee(input, id) {
        return run(async () => {
          if (!id) await api('/employees', { method: 'POST', body: JSON.stringify(input) })
          else await api(`/employees/${id}`, { method: 'PUT', body: JSON.stringify({ name: input.name }) })
          await refresh()
        })
      },
      setEmployeeStatus(id, status) {
        return run(async () => {
          await api(`/employees/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) })
          await refresh()
        })
      },
      resetEmployeePassword(id, password) {
        return run(async () => {
          await api(`/employees/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) })
        })
      },
      removeAccount(id) {
        return run(async () => {
          await api(`/users/${id}`, { method: 'DELETE' })
          await refresh()
        })
      },
      saveRole(input, id) {
        return run(async () => {
          await api(id ? `/roles/${id}` : '/roles', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) })
          await refresh()
        })
      },
      removeRole(id) {
        return run(async () => {
          await api(`/roles/${id}`, { method: 'DELETE' })
          await refresh()
        })
      },
      saveMenu(input, id) {
        return run(async () => {
          await api(id ? `/menus/${id}` : '/menus', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) })
          await refresh()
        })
      },
      removeMenu(id) {
        return run(async () => {
          await api(`/menus/${id}`, { method: 'DELETE' })
          await refresh()
        })
      },
      addDocument(file) {
        return run(async () => {
          const body = new FormData()
          body.append('file', file)
          await api('/documents', { method: 'POST', body })
          await refresh()
        })
      },
      async reloadDocuments() {
        const documents = await api<Db['documents']>('/documents')
        setDb((current) => ({ ...current, documents }))
      },
      removeDocument(id) {
        return run(async () => {
          await api(`/documents/${id}`, { method: 'DELETE' })
          await refresh()
        })
      },
      async downloadDocument(id, name) {
        const current = token()
        const response = await fetch(`/api/documents/${id}/file`, {
          headers: current ? { Authorization: `Bearer ${current}` } : {},
        })
        if (response.status === 401) {
          clearToken()
          window.dispatchEvent(new Event('knowflow-unauthorized'))
          return
        }
        if (!response.ok) {
          const body = await response.json().catch(() => ({ message: '下载失败' }))
          throw new Error(body.message || '下载失败')
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.click()
        URL.revokeObjectURL(url)
      },
    }
  }, [account, db, home, navMenus, permissions, ready, summary])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('StoreProvider 未挂载')
  return store
}
