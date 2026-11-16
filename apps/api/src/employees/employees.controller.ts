import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { hash } from 'bcryptjs'
import { randomUUID } from 'crypto'
import { RowDataPacket } from 'mysql2/promise'
import { AccessService, AuthUser, fail } from '../common/access.service'
import { AuthGuard } from '../common/auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { DbService } from '../db/db.service'

@Controller('employees')
@UseGuards(AuthGuard)
export class EmployeesController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    this.access.assertPage(user, ['/system/employees'])
    const rows = await this.db.query<RowDataPacket & { id: string; username: string; name: string; status: 'enabled' | 'disabled'; created_at: Date }>(
      `SELECT id, username, name, status, created_at
       FROM accounts
       WHERE portal = 'employee'
       ORDER BY created_at DESC`,
    )
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
    }))
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: { username?: string; name?: string; password?: string; status?: string }) {
    this.access.assertPermission(user, 'employee:create')
    const username = body.username?.trim() ?? ''
    const name = body.name?.trim() ?? ''
    const password = body.password ?? ''
    if (!username || !name) fail('请填写账号和姓名')
    if (password.length < 6) fail('密码至少 6 位')
    await this.ensureUsername(username)
    const id = randomUUID()
    const status = body.status === 'disabled' ? 'disabled' : 'enabled'
    await this.db.query(
      'INSERT INTO accounts (id, username, password_hash, name, status, portal, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [id, username, await hash(password, 10), name, status, 'employee'],
    )
    return { id }
  }

  @Put(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { name?: string }) {
    this.access.assertPermission(user, 'employee:update')
    const name = body.name?.trim() ?? ''
    if (!name) fail('请填写姓名')
    await this.employee(id)
    await this.db.query('UPDATE accounts SET name = ? WHERE id = ? AND portal = ?', [name, id, 'employee'])
    return { id }
  }

  @Post(':id/status')
  async status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { status?: string }) {
    this.access.assertPermission(user, 'employee:disable')
    await this.employee(id)
    const status = body.status === 'disabled' ? 'disabled' : 'enabled'
    await this.db.query('UPDATE accounts SET status = ? WHERE id = ? AND portal = ?', [status, id, 'employee'])
    return { id }
  }

  @Post(':id/password')
  async password(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { password?: string }) {
    this.access.assertPermission(user, 'employee:reset-password')
    const password = body.password ?? ''
    if (password.length < 6) fail('密码至少 6 位')
    await this.employee(id)
    await this.db.query('UPDATE accounts SET password_hash = ? WHERE id = ? AND portal = ?', [await hash(password, 10), id, 'employee'])
    return { id }
  }

  private async employee(id: string) {
    const rows = await this.db.query<RowDataPacket & { id: string }>(
      "SELECT id FROM accounts WHERE id = ? AND portal = 'employee'",
      [id],
    )
    if (!rows[0]) fail('员工不存在')
  }

  private async ensureUsername(username: string) {
    const rows = await this.db.query<RowDataPacket & { id: string }>('SELECT id FROM accounts WHERE username = ?', [username])
    if (rows.length) fail('账号已存在')
  }
}
