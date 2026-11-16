import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, apiBlob, type DocumentDetail } from '../api'

export default function DocumentReaderPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const focus = typeof location.state === 'object' && location.state && 'focus' in location.state ? String(location.state.focus ?? '') : ''
  const [detail, setDetail] = useState<DocumentDetail | null>(null)
  const [text, setText] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    document.querySelector('mark')?.scrollIntoView({ block: 'center' })
  }, [text, focus])

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''
    setDetail(null)
    setText('')
    setFileUrl('')
    setError('')
    setLoaded(false)
    api<DocumentDetail>(`/client/documents/${id}`)
      .then(async (document) => {
        if (cancelled) return
        setDetail(document)
        if (document.kind === 'pdf') {
          const blob = await apiBlob(`/client/documents/${id}/file`)
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setFileUrl(objectUrl)
        } else if (document.kind === 'docx') {
          const body = await api<{ text: string }>(`/client/documents/${id}/text`)
          if (!cancelled) setText(body.text)
        } else {
          const blob = await apiBlob(`/client/documents/${id}/file`)
          if (!cancelled) setText(await blob.text())
        }
        if (!cancelled) setLoaded(true)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '读取失败')
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id])

  return (
    <section className="reader">
      <Link to="/documents" className="back">返回文档</Link>
      <h1>{detail?.originalName ?? '文档'}</h1>
      {error ? <p className="error">{error}</p> : null}
      {!error && !loaded ? <p className="muted">正在打开…</p> : null}
      {detail?.kind === 'pdf' && fileUrl ? <iframe title={detail.originalName} src={fileUrl} /> : null}
      {loaded && detail && detail.kind !== 'pdf' && text ? <article>{renderText(text, focus)}</article> : null}
      {loaded && detail && detail.kind !== 'pdf' && !text && !error ? <p className="muted">这份文档没有可显示的文字。</p> : null}
    </section>
  )
}

function renderText(text: string, focus: string) {
  const found = findFocus(text, focus)
  if (!found) return text
  return (
    <>
      {text.slice(0, found.index)}
      <mark>{text.slice(found.index, found.index + found.length)}</mark>
      {text.slice(found.index + found.length)}
    </>
  )
}

function findFocus(text: string, focus: string) {
  const chars = focus.replace(/\s+/g, '').slice(0, 24)
  if (chars.length < 8) return null
  const pattern = [...chars].map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*')
  const match = text.match(new RegExp(pattern))
  if (!match || match.index == null) return null
  return { index: match.index, length: match[0].length }
}
