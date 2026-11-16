import { Injectable } from '@nestjs/common'

const BATCH = 10

@Injectable()
export class EmbeddingService {
  configured() {
    return Boolean(process.env.DASHSCOPE_API_KEY)
  }

  async embed(texts: string[]) {
    const vectors: number[][] = []
    for (let index = 0; index < texts.length; index += BATCH) {
      const batch = texts.slice(index, index + BATCH)
      const response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-v4',
          input: batch,
          dimensions: 1024,
          encoding_format: 'float',
        }),
      })
      const payload = await response.text()
      if (!response.ok) throw new Error(errorMessage(payload))
      const body = JSON.parse(payload) as { data?: Array<{ index: number; embedding: number[] }> }
      const ordered = [...(body.data ?? [])].sort((left, right) => left.index - right.index)
      if (ordered.length !== batch.length || ordered.some((item) => item.embedding.length !== 1024)) {
        throw new Error('向量生成失败')
      }
      vectors.push(...ordered.map((item) => item.embedding))
    }
    return vectors
  }

  private endpoint() {
    const base = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')
    return `${base}/embeddings`
  }
}

function errorMessage(payload: string) {
  try {
    const body = JSON.parse(payload) as { message?: string; error?: { message?: string } }
    const message = body.error?.message || body.message
    if (message) return `向量生成失败：${message.slice(0, 120)}`
  } catch {
    return '向量生成失败'
  }
  return '向量生成失败'
}
