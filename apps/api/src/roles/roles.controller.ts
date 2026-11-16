import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { RowDataPacket } from 'mysql2/promise'
import { AccessService, AuthUser, fail } from '../common/access.service'
import { AuthGuard } from '../common/auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { DbService } from '../db/db.service'

interface RoleBody {
  name?: string
  code?: string
  menuIds?: string[]
}

@Controller('roles')
@UseGuards(AuthGuard)
export class RolesController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    this.access.assertPage(user, ['/system/roles', '/system/users'])
    const rows = await this.db.query<RowDataPacket & { id: string; code: string; name: string; is_system: number; menu_id: string | null }>(
      `SELECT r.id, r.code, r.name, r.is_system, rm.menu_id
       FROM roles r
       LEFT JOIN role_menus rm ON rm.role_id = r.id
       ORDER BY r.is_system DESC, r.name ASC`,
    )
    const map = new Map<string, { id: string; code: string; name: string; isSystem: boolean; menuIds: string[] }>()
    for (const row of rows) {
      const current = map.get(row.id) ?? { id: row.id, code: row.code, name: row.name, isSystem: Boolean(row.is_system), menuIds: [] }
      if (row.menu_id) current.menuIds.push(row.menu_id)
      map.set(row.id, current)
    }
    return [...map.values()]
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: RoleBody) {
    this.access.assertPermission(user, 'role:create')
    const input = clean(body)
    await this.ensureCode(input.code)
    await this.ensureMenus(input.menuIds)
    const id = randomUUID()
    await this.db.transaction(async (conn) => {
      await conn.query('INSERT INTO roles (id, code, name, is_system) VALUES (?, ?, ?, 0)', [id, input.code, input.name])
      for (const menuId of input.menuIds) {
        await conn.query('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [id, menuId])
      }
    })
    return { id }
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: RoleBody) {
    if (!this.access.can(user, 'role:update') && !this.access.can(user, 'role:assign')) {
      this.access.assertPermission(user, 'role:update')
    }
    const input = clean(body)
    const current = await this.role(id)
    if (current.is_system && current.code !== input.code) fail('系统角色的编码不能修改')
    await this.ensureCode(input.code, id)
    await this.ensureMenus(input.menuIds)
    await this.db.transaction(async (conn) => {
      await conn.query('UPDATE roles SET code = ?, name = ? WHERE id = ?', [input.code, input.name, id])
      await conn.query('DELETE FROM role_menus WHERE role_id = ?', [id])
      for (const menuId of input.menuIds) {
        await conn.query('INSERT INTO role_menus (role_id, menu_id) VALUES (?, ?)', [id, menuId])
      }
    })
    return { id }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.access.assertPermission(user, 'role:delete')
    const current = await this.role(id)
    if (current.is_system) fail('系统角色不能删除')
    const used = await this.db.query<RowDataPacket & { count: number }>('SELECT COUNT(*) AS count FROM account_roles WHERE role_id = ?', [id])
    if (Number(used[0]?.count ?? 0) > 0) fail('还有用户使用这个角色')
    await this.db.transaction(async (conn) => {
      await conn.query('DELETE FROM role_menus WHERE role_id = ?', [id])
      await conn.query('DELETE FROM roles WHERE id = ?', [id])
    })
    return { id }
  }

  private async role(id: string) {
    const rows = await this.db.query<RowDataPacket & { id: string; code: string; is_system: number }>('SELECT id, code, is_system FROM roles WHERE id = ?', [id])
    if (!rows[0]) fail('角色不存在')
    return rows[0]
  }

  private async ensureCode(code: string, id?: string) {
    const rows = await this.db.query<RowDataPacket & { id: string }>('SELECT id FROM roles WHERE code = ? AND id <> ?', [code, id ?? ''])
    if (rows.length) fail('角色编码已存在')
  }

  private async ensureMenus(menuIds: string[]) {
    if (!menuIds.length) return
    const rows = await this.db.query<RowDataPacket & { id: string }>(`SELECT id FROM menus WHERE id IN (${menuIds.map(() => '?').join(',')})`, menuIds)
    if (rows.length !== menuIds.length) fail('菜单不存在')
  }
}

function clean(body: RoleBody) {
  const name = body.name?.trim() ?? ''
  const code = body.code?.trim() ?? ''
  if (!name || !code) fail('请填写角色名称和编码')
  return { name, code, menuIds: [...new Set(body.menuIds ?? [])] }
}
