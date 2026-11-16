import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type Source } from '../api'

interface Turn {
  question: string
  answer: string | null
  sources: Source[]
  failed?: boolean
}

function uniqueSources(sources: Source[]) {
  const seen = new Set<string>()
  return sources.filter((source) => {
    if (!source.documentId || seen.has(source.documentId)) return false
    seen.add(source.documentId)
    return true
  })
}

export default function AskPage() {
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [turns])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (!text || pending) return
    setTurns((current) => [...current, { question: text, answer: null, sources: [] }])
    setQuestion('')
    setPending(true)
    try {
      const result = await api<{ answer: string; sources: Source[] }>('/client/ask', {
        method: 'POST',
        body: JSON.stringify({ question: text }),
      })
      setTurns((current) => current.map((turn, index) => (
        index === current.length - 1 ? { question: text, answer: result.answer, sources: result.sources } : turn
      )))
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '提问失败'
      setTurns((current) => current.map((turn, index) => (
        index === current.length - 1 ? { ...turn, answer: message, failed: true } : turn
      )))
    } finally {
      setPending(false)
    }
  }

  const composer = (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      <textarea
        value={question}
        rows={turns.length ? 2 : 3}
        placeholder="输入问题"
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }
        }}
      />
      <button type="submit" disabled={pending || !question.trim()} aria-label="提问">
        {pending ? '…' : '↑'}
      </button>
    </form>
  )

  if (!turns.length) {
    return (
      <section className="ask empty">
        <div className="ask-hero">
          <h1>有什么可以帮你？</h1>
          <p>回答会带上出处，点开就能看原文。</p>
          {composer}
        </div>
      </section>
    )
  }

  return (
    <section className="ask chatting">
      <div className="thread" ref={threadRef}>
        {turns.map((turn, index) => {
          const sources = uniqueSources(turn.sources)
          return (
          <article key={`${turn.question}-${index}`} className="turn">
            <p className="question">{turn.question}</p>
            <p className={turn.failed ? 'answer failed' : turn.answer ? 'answer' : 'answer pending'}>{turn.answer ?? '正在查找…'}</p>
            {sources.length ? (
              <div className="sources">
                {sources.map((source) => (
                  <Link
                    key={source.documentId}
                    to={`/documents/${source.documentId}`}
                    state={{ focus: source.passage }}
                  >
                    {source.originalName}
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
          )
        })}
      </div>
      {composer}
    </section>
  )
}
