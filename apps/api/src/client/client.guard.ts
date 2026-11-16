import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { RowDataPacket } from 'mysql2/promise'
import { DbService } from '../db/db.service'

export interface EmployeeUser {
  id: string
  username: string
  name: string
}

@Injectable()
export class ClientGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DbService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; employee?: EmployeeUser }>()
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('请先登录')
    let payload: { sub: string }
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(token)
    } catch {
      throw new UnauthorizedException('登录已失效')
    }
    const rows = await this.db.query<RowDataPacket & { id: string; username: string; name: string; status: string; portal: string }>(
      'SELECT id, username, name, status, portal FROM accounts WHERE id = ?',
      [payload.sub],
    )
    const account = rows[0]
    if (!account || account.status !== 'enabled' || account.portal !== 'employee') throw new UnauthorizedException('登录已失效')
    request.employee = { id: account.id, username: account.username, name: account.name }
    return true
  }
}
