import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare } from 'bcryptjs'
import { RowDataPacket } from 'mysql2/promise'
import { AccessService, AuthUser, fail } from '../common/access.service'
import { AuthGuard } from '../common/auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { DbService } from '../db/db.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    const username = body.username?.trim() ?? ''
    const password = body.password ?? ''
    const rows = await this.db.query<RowDataPacket & { id: string; username: string; password_hash: string; name: string; status: 'enabled' | 'disabled'; portal: string; created_at: Date }>(
      'SELECT id, username, password_hash, name, status, portal, created_at FROM accounts WHERE username = ?',
      [username],
    )
    const account = rows[0]
    if (!account || !(await compare(password, account.password_hash))) fail('账号或密码不正确')
    if (account.portal === 'employee') fail('这个账号不能登录管理后台')
    if (account.status === 'disabled') fail('账号已停用')
    const access = await this.access.forAccount(account.id)
    const token = await this.jwt.signAsync({ sub: account.id })
    return {
      token,
      account: profileAccount(account, access.roleIds, access.roleNames),
      menus: access.menus,
      permissions: access.permissions,
      homePath: access.homePath,
    }
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  profile(@CurrentUser() user: AuthUser) {
    return {
      account: {
        id: user.id,
        username: user.username,
        name: user.name,
        status: user.status,
        roleIds: user.roleIds,
        roleNames: user.roleNames,
      },
      menus: user.menus,
      permissions: user.permissions,
      homePath: user.homePath,
    }
  }
}

function profileAccount(
  account: { id: string; username: string; name: string; status: 'enabled' | 'disabled'; created_at: Date },
  roleIds: string[],
  roleNames: string[],
) {
  return {
    id: account.id,
    username: account.username,
    name: account.name,
    status: account.status,
    roleIds,
    roleNames,
    createdAt: account.created_at,
  }
}
