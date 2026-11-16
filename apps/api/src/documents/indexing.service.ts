import { Injectable, OnModuleInit } from '@nestjs/common'
import { RowDataPacket } from 'mysql2/promise'
import { join } from 'path'
import { fail } from '../common/access.service'
import { DbService } from '../db/db.service'
import { chunkText } from './chunk'
import { EmbeddingService } from './embedding.service'
import { INDEXABLE_EXTENSIONS, extractDocumentText } from './extract-text'
import { VectorStoreService } from './vector-store.service'

interface DocumentRow extends RowDataPacket {
  id: string
  original_name: string
  stored_name: string
  vector_status: string
}

@Injectable()
export class IndexingService implements OnModuleInit {
  private readonly queued = new Set<string>()
  private readonly cancelled = new Set<string>()
  private pumping = false

  constructor(
    private readonly db: DbService,
    private readonly embeddings: EmbeddingService,
    private readonly vectors: VectorStoreService,
  ) {}

  async onModuleInit() {
    await this.db.ready
    const rows = await this.db.query<RowDataPacket & { id: string }>(
      `SELECT id FROM documents WHERE vector_status IN ('pending', 'processing')`,
    )
    rows.forEach((row) => this.enqueue(row.id))
  }

  enqueue(id: string) {
    this.cancelled.delete(id)
    this.queued.add(id)
    void this.pump()
  }

  async forget(id: string) {
    this.queued.delete(id)
    this.cancelled.add(id)
    const rows = await this.db.query<RowDataPacket & { vector_status: string }>(
      'SELECT vector_status FROM documents WHERE id = ?',
      [id],
    )
    const status = rows[0]?.vector_status
    if (status !== 'done' && status !== 'processing') return
    if (!this.vectors.configured()) {
      if (status === 'done') fail('向量服务未配置，暂时不能删除')
      return
    }
    await this.vectors.deleteByDocument(id)
  }

  private async pump() {
    if (this.pumping) return
    this.pumping = true
    try {
      while (this.queued.size > 0) {
        const id = this.queued.values().next().value
        if (!id) break
        this.queued.delete(id)
        await this.process(id)
      }
    } finally {
      this.pumping = false
      if (this.queued.size > 0) void this.pump()
    }
  }

  private async process(id: string) {
    const document = await this.load(id)
    if (!document || this.cancelled.has(id)) return
    if (!this.embeddings.configured() || !this.vectors.configured()) {
      await this.mark(id, 'pending', '等待配置向量服务', 0)
      return
    }
    await this.mark(id, 'processing', null, 0)
    try {
      const extension = document.stored_name.split('.').pop()?.toLowerCase() ?? ''
      if (!INDEXABLE_EXTENSIONS.has(extension)) {
        await this.mark(id, 'skipped', '这个格式暂不入库', 0)
        return
      }
      const text = await extractDocumentText(join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads', document.stored_name))
      const chunks = chunkText(text)
      if (!chunks.length) {
        await this.mark(id, 'skipped', '没有可提取的文字', 0)
        return
      }
      const vectors = await this.embeddings.embed(chunks)
      if (this.cancelled.has(id) || !(await this.load(id))) return
      await this.vectors.replace(id, chunks.map((chunk, index) => ({
        text: chunk,
        documentId: id,
        chunkIndex: index,
        originalName: document.original_name,
        vector: vectors[index],
      })))
      if (this.cancelled.has(id)) {
        await this.vectors.deleteByDocument(id).catch(() => undefined)
        return
      }
      await this.mark(id, 'done', null, chunks.length)
    } catch (error) {
      if (this.cancelled.has(id)) return
      const message = error instanceof Error ? error.message : '入库失败'
      await this.mark(id, 'failed', message.slice(0, 255), 0)
    }
  }

  private async load(id: string) {
    const rows = await this.db.query<DocumentRow>(
      'SELECT id, original_name, stored_name, vector_status FROM documents WHERE id = ?',
      [id],
    )
    return rows[0]
  }

  private async mark(id: string, status: string, message: string | null, chunkCount: number) {
    await this.db.query(
      'UPDATE documents SET vector_status = ?, vector_message = ?, chunk_count = ? WHERE id = ?',
      [status, message, chunkCount, id],
    )
  }
}
