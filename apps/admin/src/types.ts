export type MenuType = 'directory' | 'page' | 'button'

export type AccountStatus = 'enabled' | 'disabled'

export interface MenuItem {
  id: string
  parentId: string | null
  name: string
  type: MenuType
  path?: string
  icon?: string
  permission?: string
  sort: number
  visible: boolean
}

export interface Role {
  id: string
  code: string
  name: string
  isSystem: boolean
  menuIds: string[]
}

export interface Account {
  id: string
  username: string
  name: string
  status: AccountStatus
  roleIds: string[]
  roleNames?: string[]
  createdAt: string
}

export interface Employee {
  id: string
  username: string
  name: string
  status: AccountStatus
  createdAt: string
}

export interface DocumentRecord {
  id: string
  originalName: string
  size: number
  uploadedBy: string
  uploadedByName: string
  uploadedAt: string
  vectorStatus: 'pending' | 'processing' | 'done' | 'skipped' | 'failed'
  vectorMessage: string | null
  chunkCount: number
}

export interface DashboardSummary {
  accountCount: number
  enabledAccountCount: number
  documentCount: number
  todayUploadCount: number
  recent: Array<{
    id: string
    originalName: string
    uploadedByName: string
    uploadedAt: string
  }>
}

export interface Db {
  accounts: Account[]
  employees: Employee[]
  roles: Role[]
  menus: MenuItem[]
  documents: DocumentRecord[]
}

export type ActionResult = { ok: false; message: string }
