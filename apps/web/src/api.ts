const TOKEN_KEY = 'knowflow-client-token'

export interface Account {
  id: string
  username: string
  name: string
}

export interface Source {
  documentId: string
  originalName: string
  excerpt: string
  passage: string
}

export interface DocumentItem {
  id: string
  originalName: string
  uploadedAt: string
}

export interface DocumentDetail {
  id: string
  originalName: string
  kind: 'pdf' | 'text' | 'docx'
}

export function token() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setToken(value: string) {
  sessionStorage.setItem(TOKEN_KEY, value)
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const current = token()
  if (current) headers.set('Authorization', `Bearer ${current}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api${path}`, { ...init, headers })
  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new Event('knowflow-client-unauthorized'))
    throw new Error('登录已失效')
  }
  const text = await response.text()
  const body = text ? JSON.parse(text) as { message?: string } : {}
  if (!response.ok) throw new Error(body.message || '请求失败')
  return body as T
}

export async function apiBlob(path: string) {
  const headers = new Headers()
  const current = token()
  if (current) headers.set('Authorization', `Bearer ${current}`)
  const response = await fetch(`/api${path}`, { headers })
  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new Event('knowflow-client-unauthorized'))
    throw new Error('登录已失效')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: '读取失败' })) as { message?: string }
    throw new Error(body.message || '读取失败')
  }
  return response.blob()
}
