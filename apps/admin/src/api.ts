const TOKEN_KEY = 'knowflow-token'

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
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`/api${path}`, { ...init, headers })
  if (response.status === 401) {
    clearToken()
    window.dispatchEvent(new Event('knowflow-unauthorized'))
    throw new Error('登录已失效')
  }
  const text = await response.text()
  const body = text ? JSON.parse(text) as { message?: string } : {}
  if (!response.ok) throw new Error(body.message || '请求失败')
  return body as T
}
