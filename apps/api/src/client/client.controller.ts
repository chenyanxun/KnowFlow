import { Body, Controller, Get, Param, Post, StreamableFile, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare } from 'bcryptjs'
import { createReadStream, existsSync } from 'fs'
import { RowDataPacket } from 'mysql2/promise'
import { extname, join } from 'path'
import { fail } from '../common/access.service'
import { DbService } from '../db/db.service'
import { extractDocumentText } from '../documents/extract-text'
import { AnswerService } from './answer.service'
import { ClientGuard, EmployeeUser } from './client.guard'
import { CurrentEmployee } from './current-employee.decorator'

const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
}

@Controller('client')
export class ClientController {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly answers: AnswerService,
  ) {}

  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    const username = body.username?.trim() ?? ''
    const password = body.password ?? ''
    const rows = await this.db.query<RowDataPacket & { id: string; username: string; password_hash: string; name: string; status: string; portal: string }>(
      'SELECT id, username, password_hash, name, status, portal FROM accounts WHERE username = ?',
      [username],
    )
    const account = rows[0]
    if (!account || !(await compare(password, account.password_hash))) fail('账号或密码不正确')
    if (account.portal !== 'employee') fail('这个账号不能使用知识库')
    if (account.status !== 'enabled') fail('账号已停用')
    const token = await this.jwt.signAsync({ sub: account.id })
    return { token, account: { id: account.id, username: account.username, name: account.name } }
  }

  @Get('profile')
  @UseGuards(ClientGuard)
  profile(@CurrentEmployee() employee: EmployeeUser) {
    return { account: employee }
  }

  @Post('ask')
  @UseGuards(ClientGuard)
  ask(@Body() body: { question?: string }) {
    const question = body.question?.trim() ?? ''
    if (!question) fail('请输入问题')
    if (question.length > 1000) fail('问题请控制在 1000 字以内')
    return this.answers.ask(question)
  }

  @Get('documents')
  @UseGuards(ClientGuard)
  async documents() {
    const rows = await this.db.query<RowDataPacket & { id: string; original_name: string; uploaded_at: Date }>(
      `SELECT id, original_name, uploaded_at
       FROM documents
       WHERE vector_status = 'done'
       ORDER BY uploaded_at DESC`,
    )
    return rows.map((row) => ({
      id: row.id,
      originalName: row.original_name,
      uploadedAt: row.uploaded_at,
    }))
  }

  @Get('documents/:id')
  @UseGuards(ClientGuard)
  async document(@Param('id') id: string) {
    const document = await this.find(id)
    return {
      id: document.id,
      originalName: document.original_name,
      kind: viewKind(document.stored_name),
    }
  }

  @Get('documents/:id/file')
  @UseGuards(ClientGuard)
  async file(@Param('id') id: string) {
    const document = await this.find(id)
    const extension = extname(document.stored_name).slice(1).toLowerCase()
    const type = FILE_TYPES[extension]
    if (!type) fail('这个文件暂不能在线浏览')
    return new StreamableFile(createReadStream(safePath(document.stored_name)), {
      type,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(document.original_name)}`,
    })
  }

  @Get('documents/:id/text')
  @UseGuards(ClientGuard)
  async text(@Param('id') id: string) {
    const document = await this.find(id)
    const extension = extname(document.stored_name).slice(1).toLowerCase()
    if (extension !== 'docx') fail('这个文件暂不能在线浏览')
    const text = await extractDocumentText(safePath(document.stored_name))
    return { text }
  }

  private async find(id: string) {
    const rows = await this.db.query<RowDataPacket & { id: string; original_name: string; stored_name: string }>(
      `SELECT id, original_name, stored_name FROM documents WHERE id = ? AND vector_status = 'done'`,
      [id],
    )
    if (!rows[0]) fail('文件不存在')
    return rows[0]
  }
}

function viewKind(storedName: string) {
  const extension = extname(storedName).slice(1).toLowerCase()
  if (extension === 'pdf') return 'pdf'
  if (extension === 'docx') return 'docx'
  if (extension === 'txt' || extension === 'md') return 'text'
  fail('这个文件暂不能在线浏览')
}

function safePath(storedName: string) {
  if (!storedName || storedName.includes('..') || storedName.includes('/') || storedName.includes('\\')) fail('文件不存在')
  const path = join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', storedName)
  if (!existsSync(path)) fail('文件不存在')
  return path
}
