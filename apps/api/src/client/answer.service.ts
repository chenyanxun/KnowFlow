import { Injectable } from '@nestjs/common'
import { fail } from '../common/access.service'
import { EmbeddingService } from '../documents/embedding.service'
import { VectorStoreService } from '../documents/vector-store.service'

const MATCH_LIMIT = 4
const MAX_DISTANCE = 0.56

@Injectable()
export class AnswerService {
  constructor(
    private readonly embeddings: EmbeddingService,
    private readonly vectors: VectorStoreService,
  ) {}

  async ask(question: string) {
    if (!this.embeddings.configured() || !this.vectors.configured()) fail('知识库还没有配置完成')
    let hits
    try {
      const [vector] = await this.embeddings.embed([question])
      hits = await this.vectors.search(vector, MATCH_LIMIT)
    } catch (error) {
      const message = error instanceof Error ? error.message : '检索失败'
      fail(message.slice(0, 120))
    }
    const matched = hits.filter((hit) => hit.text && hit.documentId && hit.distance <= MAX_DISTANCE)
    if (!matched.length) {
      return { answer: '资料里没有找到相关内容。', sources: [] }
    }
    const answer = await this.complete(question, matched)
    const found = answer.replace(/\s+/g, '').replace(/[。.]/g, '') !== '资料里没有找到相关内容'
    return {
      answer,
      sources: found ? matched.map((hit) => ({
        documentId: hit.documentId,
        originalName: hit.originalName || '未命名文档',
        excerpt: excerpt(hit.text),
        passage: hit.text,
      })) : [],
    }
  }

  private async complete(question: string, hits: Array<{ text: string; originalName: string }>) {
    const materials = hits.map((hit, index) => `【${index + 1}】${hit.originalName || '未命名文档'}\n${hit.text}`).join('\n\n')
    const base = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')
    let response: Response
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.DASHSCOPE_CHAT_MODEL || 'qwen-plus',
          messages: [
            {
              role: 'system',
              content: '你是企业知识库助手。只根据提供的资料回答问题。使用中文，写清楚，不要使用 Markdown。不要编造资料里没有的内容。如果资料不足以回答，只回复这一句：资料里没有找到相关内容。',
            },
            { role: 'user', content: `资料：\n${materials}\n\n问题：${question}` },
          ],
        }),
      })
    } catch {
      fail('回答生成失败')
    }
    const payload = await response.text()
    if (!response.ok) fail('回答生成失败')
    let answer = ''
    try {
      const body = JSON.parse(payload) as { choices?: Array<{ message?: { content?: string } }> }
      answer = body.choices?.[0]?.message?.content?.trim() ?? ''
    } catch {
      fail('回答生成失败')
    }
    if (!answer) fail('回答生成失败')
    return answer
  }
}

function excerpt(text: string) {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > 140 ? `${compact.slice(0, 140)}…` : compact
}
