const TARGET = 700
const OVERLAP = 100

export function chunkText(input: string) {
  const normalized = input.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
  if (!normalized) return []
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const chunks: string[] = []
  let current = ''
  const push = (value: string) => {
    const text = value.trim()
    if (text) chunks.push(text)
  }
  for (const paragraph of paragraphs) {
    if (paragraph.length > TARGET) {
      push(current)
      current = ''
      pushLong(paragraph, chunks)
      continue
    }
    const next = current ? `${current}\n${paragraph}` : paragraph
    if (next.length <= TARGET) {
      current = next
      continue
    }
    push(current)
    const tail = current.slice(-OVERLAP).trim()
    current = tail ? `${tail}\n${paragraph}` : paragraph
    if (current.length > TARGET) current = paragraph
  }
  push(current)
  return chunks
}

function pushLong(paragraph: string, chunks: string[]) {
  const step = TARGET - OVERLAP
  for (let start = 0; start < paragraph.length; start += step) {
    const text = paragraph.slice(start, start + TARGET).trim()
    if (text) chunks.push(text)
    if (start + TARGET >= paragraph.length) break
  }
}
