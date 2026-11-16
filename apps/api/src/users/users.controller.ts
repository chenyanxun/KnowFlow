import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { hash } from 'bcryptjs'
import { randomUUID } from 'crypto'
import { RowDataPacket } from 'mysql2/promise'
import { AccessService, AuthUser, fail } from '../common/access.service'
import { AuthGuard } from '../common/auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { DbService } from '../db/db.service'

interface AccountBody {
  username?: string
  name?: string
  password?: string
  status?: 'enabled' | 'disabled'
  roleIds?: string[]
}

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    this.access.assertPage(user, ['/system/users'])
    const rows = await this.db.query<RowDataPacket & { id: string; username: string; name: string; status: 'enabled' | 'disabled'; created_at: Date; role_id: string | null }>(
      `SELECT a.id, a.username, a.name, a.status, a.created_at, ar.role_id
       FROM accounts a
       LEFT JOIN account_roles ar ON ar.account_id = a.id
       WHERE a.portal = 'admin'
       ORDER BY a.created_at DESC`,
    )
    const map = new Map<string, { id: string; username: string; name: string; status: string; createdAt: Date; roleIds: string[] }>()
    for (const row of rows) {
      const current = map.get(row.id) ?? {
        id: row.id,
        username: row.username,
        name: row.name,
        status: row.status,
        createdAt: row.created_at,
        roleIds: [],
      }
      if (row.role_id) current.roleIds.push(row.role_id)
      map.set(row.id, current)
    }
    return [...map.values()]
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: AccountBody) {
    this.access.assertPermission(user, 'user:create')
    const input = clean(body, true)
    await this.ensureUsername(input.username)
    await this.ensureRoles(input.roleIds)
    const id = randomUUID()
    await this.db.transaction(async (conn) => {
      await conn.query(
        `INSERT INTO accounts (id, username, password_hash, name, status, portal, created_at) VALUES (?, ?, ?, ?, ?, 'admin', NOW())`,
        [id, input.username, await hash(input.password, 10), input.name, input.status],
      )
      for (const roleId of input.roleIds) {
        await conn.query('INSERT INTO account_roles (account_id, role_id) VALUES (?, ?)', [id, roleId])
      }
    })
    return { id }
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AccountBody) {
    this.access.assertPermission(user, 'user:update')
    const input = clean(body, false)
    await this.account(id)
    await this.ensureUsername(input.username, id)
    await this.ensureRoles(input.roleIds)
    if (await this.dropsLastSuper(id, input.roleIds, input.status)) fail('至少保留一个启用的超级管理员')
    await this.db.transaction(async (conn) => {
      await conn.query('UPDATE accounts SET username = ?, name = ?, status = ? WHERE id = ?', [input.username, input.name, input.status, id])
      await conn.query('DELETE FROM account_roles WHERE account_id = ?', [id])
      for (const roleId of input.roleIds) {
        await conn.query('INSERT INTO account_roles (account_id, role_id) VALUES (?, ?)', [id, roleId])
      }
    })
    return { id }
  }

  @Post(':id/status')
  async status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status?: string }) {
    this.access.assertPermission(user, 'user:disable')
    const status = body.status === 'disabled' ? 'disabled' : 'enabled'
    await this.account(id)
    const roleRows = await this.db.query<RowDataPacket & { role_id: string }>('SELECT role_id FROM account_roles WHERE account_id = ?', [id])
    if (await this.dropsLastSuper(id, roleRows.map((row) => row.role_id), status)) fail('至少保留一个启用的超级管理员')
    await this.db.query('UPDATE accounts SET status = ? WHERE id = ?', [status, id])
    return { id }
  }

  @Post(':id/password')
  async password(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { password?: string }) {
    this.access.assertPermission(user, 'user:reset-password')
    const password = body.password ?? ''
    if (password.length < 6) fail('密码至少 6 位')
    await this.account(id)
    await this.db.query('UPDATE accounts SET password_hash = ? WHERE id = ?', [await hash(password, 10), id])
    return { id }
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.access.assertPermission(user, 'user:update')
    if (id === user.id) fail('不能删除当前登录用户')
    await this.account(id)
    if (await this.dropsLastSuper(id, [], 'disabled')) fail('至少保留一个启用的超级管理员')
    await this.db.transaction(async (conn) => {
      await conn.query('DELETE FROM account_roles WHERE account_id = ?', [id])
      await conn.query('DELETE FROM accounts WHERE id = ?', [id])
    })
    return { id }
  }

  private async account(id: string) {
    const rows = await this.db.query<RowDataPacket & { id: string }>("SELECT id FROM accounts WHERE id = ? AND portal = 'admin'", [id])
    if (!rows[0]) fail('用户不存在')
  }

  private async ensureUsername(username: string, id?: string) {
    const rows = await this.db.query<RowDataPacket & { id: string }>('SELECT id FROM accounts WHERE username = ? AND id <> ?', [username, id ?? ''])
    if (rows.length) fail('账号已存在')
  }

  private async ensureRoles(roleIds: string[]) {
    if (!roleIds.length) return
    const rows = await this.db.query<RowDataPacket & { id: string }>(`SELECT id FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`, roleIds)
    if (rows.length !== roleIds.length) fail('角色不存在')
  }

  private async dropsLastSuper(id: string, nextRoleIds: string[], nextStatus: string) {
    const current = await this.db.query<RowDataPacket & { code: string; status: string }>(
      `SELECT r.code, a.status
       FROM accounts a
       JOIN account_roles ar ON ar.account_id = a.id
       JOIN roles r ON r.id = ar.role_id
       WHERE a.id = ?`,
      [id],
    )
    const wasEnabledSuper = current.some((row) => row.code === 'super_admin' && row.status === 'enabled')
    if (!wasEnabledSuper) return false
    const nextRoles = nextRoleIds.length
      ? await this.db.query<RowDataPacket & { code: string }>(`SELECT code FROM roles WHERE id IN (${nextRoleIds.map(() => '?').join(',')})`, nextRoleIds)
      : []
    const keeps = nextStatus === 'enabled' && nextRoles.some((role) => role.code === 'super_admin')
    if (keeps) return false
    const others = await this.db.query<RowDataPacket & { count: number }>(
      `SELECT COUNT(*) AS count FROM accounts a
       JOIN account_roles ar ON ar.account_id = a.id
       JOIN roles r ON r.id = ar.role_id
       WHERE r.code = 'super_admin' AND a.status = 'enabled' AND a.id <> ?`,
      [id],
    )
    return Number(others[0]?.count ?? 0) === 0
  }
}

function clean(body: AccountBody, creating: boolean) {
  const username = body.username?.trim() ?? ''
  const name = body.name?.trim() ?? ''
  const password = body.password ?? ''
  if (!username || !name) fail('请填写账号和姓名')
  if (creating && password.length < 6) fail('密码至少 6 位')
  if (!creating && password && password.length < 6) fail('密码至少 6 位')
  return {
    username,
    name,
    password,
    status: body.status === 'disabled' ? 'disabled' : 'enabled',
    roleIds: [...new Set(body.roleIds ?? [])],
  }
}
