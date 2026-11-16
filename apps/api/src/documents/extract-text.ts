import { readFile } from 'fs/promises'
import mammoth from 'mammoth'
import { extname } from 'path'

export const INDEXABLE_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md'])
export const INDEXABLE_TYPE_MESSAGE = '只能上传 pdf、docx、txt、md'

export async function extractDocumentText(path: string) {
  const extension = extname(path).slice(1).toLowerCase()
  if (extension === 'txt' || extension === 'md') return readFile(path, 'utf8')
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ path })
    return result.value
  }
  if (extension === 'pdf') {
    const buffer = await readFile(path)
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const extracted = await extractText(pdf, { mergePages: true })
    return extracted.text
  }
  return ''
}
