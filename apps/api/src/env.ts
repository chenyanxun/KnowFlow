import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const file = join(process.cwd(), '.env')
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    const key = trimmed.slice(0, index).trim()
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim()
  }
}
