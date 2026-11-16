import { BadRequestException, Controller, Delete, Get, Param, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { randomUUID } from 'crypto'
import { createReadStream, existsSync, mkdirSync, unlinkSync } from 'fs'
import { diskStorage } from 'multer'
import { RowDataPacket } from 'mysql2/promise'
import { extname, join } from 'path'
import { AccessService, AuthUser, fail } from '../common/access.service'
import { AuthGuard } from '../common/auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { DbService } from '../db/db.service'
import { INDEXABLE_EXTENSIONS } from './extract-text'
import { IndexingService } from './indexing.service'

const ALLOWED = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'png', 'jpg', 'jpeg'])
const MAX_FILE_SIZE = 20 * 1024 * 1024

@Controller('documents')
@UseGuards(AuthGuard)
export class DocumentsController {
  constructor(
    private readonly db: DbService,
    private readonly access: AccessService,
    private readonly indexing: IndexingService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    this.access.assertPage(user, ['/documents'])
    const rows = await this.db.query<RowDataPacket & {
      id: string
      original_name: string
      size_bytes: number
      uploaded_by: string
      uploaded_by_name: string | null
      uploaded_at: Date
      vector_status: string
      vector_message: string | null
      chunk_count: number
    }>(
      `SELECT d.id, d.original_name, d.size_bytes, d.uploaded_by, a.name AS uploaded_by_name, d.uploaded_at,
              d.vector_status, d.vector_message, d.chunk_count
       FROM documents d
       LEFT JOIN accounts a ON a.id = d.uploaded_by
       ORDER BY d.uploaded_at DESC`,
    )
    return rows.map((row) => ({
      id: row.id,
      originalName: row.original_name,
      size: Number(row.size_bytes),
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name ?? '未知用户',
      uploadedAt: row.uploaded_at,
      vectorStatus: row.vector_status,
      vectorMessage: row.vector_message,
      chunkCount: Number(row.chunk_count),
    }))
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_FILE_SIZE },
    storage: diskStorage({
      destination: (_req, _file, callback) => {
        const dir = uploadDir()
        mkdirSync(dir, { recursive: true })
        callback(null, dir)
      },
      filename: (_req, file, callback) => {
        callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`)
      },
    }),
    fileFilter: (_req, file, callback) => {
      const ext = extname(file.originalname).slice(1).toLowerCase()
      if (!ALLOWED.has(ext)) callback(new BadRequestException('不支持这个文件类型'), false)
      else callback(null, true)
    },
  }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!this.access.can(user, 'document:upload')) {
      if (file?.path) unlinkSync(file.path)
      this.access.assertPermission(user, 'document:upload')
    }
    if (!file) fail('请选择文件')
    const ext = extname(file.originalname).slice(1).toLowerCase()
    if (!ALLOWED.has(ext)) {
      unlinkSync(file.path)
      fail('不支持这个文件类型')
    }
    const id = randomUUID()
    const indexable = INDEXABLE_EXTENSIONS.has(ext)
    await this.db.query(
      `INSERT INTO documents (id, original_name, stored_name, size_bytes, uploaded_by, uploaded_at, vector_status, vector_message)
       VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [id, originalName(file.originalname), file.filename, file.size, user.id, indexable ? 'pending' : 'skipped', indexable ? null : '这个格式暂不入库'],
    )
    if (indexable) this.indexing.enqueue(id)
    return { id }
  }

  @Get(':id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.access.assertPermission(user, 'document:download')
    const document = await this.find(id)
    const path = join(uploadDir(), document.stored_name)
    if (!existsSync(path) || document.stored_name.includes('..') || document.stored_name.includes('/') || document.stored_name.includes('\\')) {
      fail('文件不存在')
    }
    return new StreamableFile(createReadStream(path), {
      type: 'application/octet-stream',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`,
    })
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.access.assertPermission(user, 'document:delete')
    const document = await this.find(id)
    await this.indexing.forget(id)
    await this.db.query('DELETE FROM documents WHERE id = ?', [id])
    const path = join(uploadDir(), document.stored_name)
    if (existsSync(path)) unlinkSync(path)
    return { id }
  }

  private async find(id: string) {
    const rows = await this.db.query<RowDataPacket & { id: string; original_name: string; stored_name: string }>(
      'SELECT id, original_name, stored_name FROM documents WHERE id = ?',
      [id],
    )
    if (!rows[0]) fail('文件不存在')
    return rows[0]
  }
}

function uploadDir() {
  return join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads')
}

function originalName(name: string) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8')
  return decoded.includes('\uFFFD') ? name : decoded
}
