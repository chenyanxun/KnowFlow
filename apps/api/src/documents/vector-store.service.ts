import { Injectable, OnModuleDestroy } from '@nestjs/common'
import type { WeaviateClient } from 'weaviate-client'

const COLLECTION = 'DocumentChunk'
const VECTOR = 'embedding'

interface ChunkObject {
  text: string
  documentId: string
  chunkIndex: number
  originalName: string
  vector: number[]
}

@Injectable()
export class VectorStoreService implements OnModuleDestroy {
  private clientPromise: Promise<WeaviateClient> | null = null
  private vectorReady: Promise<void> | null = null

  configured() {
    return Boolean(process.env.WEAVIATE_URL && process.env.WEAVIATE_API_KEY)
  }

  async replace(documentId: string, chunks: ChunkObject[]) {
    const collection = await this.collection()
    await collection.data.deleteMany(collection.filter.byProperty('documentId').equal(documentId))
    if (!chunks.length) return
    const result = await collection.data.insertMany(chunks.map((chunk) => ({
      properties: {
        text: chunk.text,
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        originalName: chunk.originalName,
      },
      vectors: { [VECTOR]: chunk.vector },
    })))
    if (result.hasErrors) {
      const first = Object.values(result.errors)[0]
      throw new Error(first?.message ? `写入向量库失败：${first.message}` : '写入向量库失败')
    }
  }

  async search(vector: number[], limit: number) {
    const collection = await this.collection()
    const result = await collection.query.nearVector(vector, {
      limit,
      targetVector: VECTOR,
      returnMetadata: ['distance'],
    })
    return result.objects.map((object) => ({
      text: String(object.properties.text ?? ''),
      documentId: String(object.properties.documentId ?? ''),
      chunkIndex: Number(object.properties.chunkIndex ?? 0),
      originalName: String(object.properties.originalName ?? ''),
      distance: object.metadata?.distance ?? 1,
    }))
  }

  async deleteByDocument(documentId: string) {
    const collection = await this.collection()
    await collection.data.deleteMany(collection.filter.byProperty('documentId').equal(documentId))
  }

  async onModuleDestroy() {
    if (!this.clientPromise) return
    const client = await this.clientPromise.catch(() => null)
    await client?.close()
  }

  private async collection() {
    if (!this.clientPromise) {
      const url = process.env.WEAVIATE_URL ?? ''
      const apiKey = process.env.WEAVIATE_API_KEY ?? ''
      this.clientPromise = import('weaviate-client').then((weaviate) => weaviate.connectToWeaviateCloud(url, {
        authCredentials: new weaviate.ApiKey(apiKey),
        timeout: { init: 20, insert: 90, query: 30 },
      })).catch((error: unknown) => {
        this.clientPromise = null
        throw error
      })
    }
    const client = await this.clientPromise
    const collection = client.collections.get<{
      text: string
      documentId: string
      chunkIndex: number
      originalName: string
    }>(COLLECTION)
    if (!this.vectorReady) {
      this.vectorReady = collection.config.get().then(async (config) => {
        if (config.vectorizers?.[VECTOR]) return
        const weaviate = await import('weaviate-client')
        await collection.config.addVector(weaviate.configure.vectors.selfProvided({ name: VECTOR }))
      }).catch((error: unknown) => {
        this.vectorReady = null
        throw error
      })
    }
    await this.vectorReady
    return collection
  }
}
