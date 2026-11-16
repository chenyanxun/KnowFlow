import { Controller, Get, UseGuards } from '@nestjs/common'
import { RowDataPacket } from 'mysql2/promise'
import { AccessService, AuthUser } from '../common/access.service'
import { AuthGuard } from '../common/auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { DbService } from '../db/db.service'

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async summary(@CurrentUser() user: AuthUser) {
    this.access.assertPage(user, ['/dashboard'])
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const [accounts, enabled, documents, today, recent] = await Promise.all([
      this.count("SELECT COUNT(*) AS count FROM accounts WHERE portal = 'admin'"),
      this.count("SELECT COUNT(*) AS count FROM accounts WHERE portal = 'admin' AND status = 'enabled'"),
      this.count('SELECT COUNT(*) AS count FROM documents'),
      this.count('SELECT COUNT(*) AS count FROM documents WHERE uploaded_at >= ? AND uploaded_at < ?', [sqlDate(start), sqlDate(end)]),
      this.db.query<RowDataPacket & { id: string; original_name: string; uploaded_by_name: string | null; uploaded_at: Date }>(
        `SELECT d.id, d.original_name, a.name AS uploaded_by_name, d.uploaded_at
         FROM documents d
         LEFT JOIN accounts a ON a.id = d.uploaded_by
         ORDER BY d.uploaded_at DESC
         LIMIT 5`,
      ),
    ])
    return {
      accountCount: accounts,
      enabledAccountCount: enabled,
      documentCount: documents,
      todayUploadCount: today,
      recent: recent.map((row) => ({
        id: row.id,
        originalName: row.original_name,
        uploadedByName: row.uploaded_by_name ?? '未知用户',
        uploadedAt: row.uploaded_at,
      })),
    }
  }

  private async count(sql: string, params: unknown[] = []) {
    const rows = await this.db.query<RowDataPacket & { count: number }>(sql, params)
    return Number(rows[0]?.count ?? 0)
  }
}

function sqlDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
