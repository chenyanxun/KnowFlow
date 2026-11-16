import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type DocumentItem } from '../api'

export default function DocumentListPage() {
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<DocumentItem[]>('/client/documents')
      .then(setDocuments)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '读取失败'))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!documents) return <p className="muted">正在读取文档…</p>
  if (!documents.length) return <p className="muted">还没有可以阅读的文档。</p>

  return (
    <section className="library">
      <h1>文档</h1>
      <ul>
        {documents.map((document) => (
          <li key={document.id}>
            <Link to={`/documents/${document.id}`}>
              <strong>{document.originalName}</strong>
              <time>{formatTime(document.uploadedAt)}</time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (item: number) => String(item).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
