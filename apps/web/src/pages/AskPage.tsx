import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type Source } from '../api'

interface Turn {
  question: string
  answer: string
  sources: Source[]
}

export default function AskPage() {
  const [question, setQuestion] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = question.trim()
    if (!text || pending) return
    setPending(true)
    setError('')
    try {
      const result = await api<{ answer: string; sources: Source[] }>('/client/ask', {
        method: 'POST',
        body: JSON.stringify({ question: text }),
      })
      setTurns((current) => [...current, { question: text, answer: result.answer, sources: result.sources }])
      setQuestion('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提问失败')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="ask">
      <div className="thread">
        {turns.length === 0 ? <p className="muted">问问公司资料里的内容。回答会带上出处，点开就能看原文。</p> : null}
        {turns.map((turn, index) => (
          <article key={`${turn.question}-${index}`} className="turn">
            <p className="question">{turn.question}</p>
            <p className="answer">{turn.answer}</p>
            {turn.sources.length ? (
              <div className="sources">
                {turn.sources.map((source, sourceIndex) => (
                  <Link
                    key={`${source.documentId}-${sourceIndex}`}
                    to={`/documents/${source.documentId}`}
                    state={{ focus: source.passage }}
                  >
                    <strong>{source.originalName}</strong>
                    <span>{source.excerpt}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
        {error ? <p className="error">{error}</p> : null}
      </div>
      <form className="composer" onSubmit={(event) => void submit(event)}>
        <textarea
          value={question}
          rows={3}
          placeholder="输入问题"
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
        />
        <button type="submit" disabled={pending || !question.trim()}>{pending ? '正在查找…' : '提问'}</button>
      </form>
    </section>
  )
}
