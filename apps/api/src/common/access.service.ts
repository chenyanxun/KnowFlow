import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { RowDataPacket } from 'mysql2/promise'
import { DbService } from '../db/db.service'

export interface MenuItem {
  id: string
  parentId: string | null
  name: string
  type: 'directory' | 'page' | 'button'
  path?: string
  icon?: string
  permission?: string
  sort: number
  visible: boolean
}

export interface AuthUser {
  id: string
  username: string
  name: string
  status: 'enabled' | 'disabled'
  roleIds: string[]
  roleNames: string[]
  isSuper: boolean
  permissions: string[]
  menus: MenuItem[]
  homePath: string
}

interface MenuRow extends RowDataPacket {
  id: string
  parent_id: string | null
  name: string
  type: MenuItem['type']
  path: string | null
  icon: string | null
  permission: string | null
  sort_order: number
  visible: number
}

@Injectable()
export class AccessService {
  constructor(private readonly db: DbService) {}

  async forAccount(accountId: string): Promise<Pick<AuthUser, 'roleIds' | 'roleNames' | 'isSuper' | 'permissions' | 'menus' | 'homePath'>> {
    const roles = await this.db.query<RowDataPacket & { id: string; code: string; name: string }>(
      `SELECT r.id, r.code, r.name
       FROM roles r
       JOIN account_roles ar ON ar.role_id = r.id
       WHERE ar.account_id = ?`,
      [accountId],
    )
    const menus = (await this.db.query<MenuRow>('SELECT * FROM menus')).map(mapMenu)
    const isSuper = roles.some((role) => role.code === 'super_admin')
    const assigned = new Set<string>()
    if (isSuper) {
      menus.forEach((menu) => assigned.add(menu.id))
    } else {
      const rows = await this.db.query<RowDataPacket & { menu_id: string }>(
        `SELECT DISTINCT rm.menu_id
         FROM role_menus rm
         JOIN account_roles ar ON ar.role_id = rm.role_id
         WHERE ar.account_id = ?`,
        [accountId],
      )
      const byId = new Map(menus.map((menu) => [menu.id, menu]))
      for (const row of rows) {
        let current = byId.get(row.menu_id)
        while (current) {
          assigned.add(current.id)
          current = current.parentId ? byId.get(current.parentId) : undefined
        }
      }
    }
    const visible = menus.filter((menu) => assigned.has(menu.id))
    return {
      roleIds: roles.map((role) => role.id),
      roleNames: roles.map((role) => role.name),
      isSuper,
      permissions: visible.flatMap((menu) => (menu.type === 'button' && menu.permission ? [menu.permission] : [])),
      menus: visible,
      homePath: firstPath(visible),
    }
  }

  canOpen(user: AuthUser, path: string) {
    return user.menus.some((menu) => menu.type === 'page' && menu.path === path)
  }

  can(user: AuthUser, permission: string) {
    return user.isSuper || user.permissions.includes(permission)
  }

  assertPage(user: AuthUser, paths: string[]) {
    if (user.isSuper || paths.some((path) => this.canOpen(user, path))) return
    throw new ForbiddenException('没有访问权限')
  }

  assertPermission(user: AuthUser, permission: string) {
    if (this.can(user, permission)) return
    throw new ForbiddenException('没有操作权限')
  }
}

export function fail(message: string): never {
  throw new BadRequestException(message)
}

export function mapMenu(row: MenuRow): MenuItem {
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    type: row.type,
    path: row.path ?? undefined,
    icon: row.icon ?? undefined,
    permission: row.permission ?? undefined,
    sort: row.sort_order,
    visible: Boolean(row.visible),
  }
}

function firstPath(menus: MenuItem[]) {
  const walk = (parentId: string | null): string | null => {
    const children = menus
      .filter((menu) => menu.parentId === parentId && menu.type !== 'button' && menu.visible)
      .sort((a, b) => a.sort - b.sort)
    for (const menu of children) {
      if (menu.type === 'page' && menu.path) return menu.path
      const nested = walk(menu.id)
      if (nested) return nested
    }
    return null
  }
  return walk(null) ?? '/dashboard'
}
