import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../db'
import { paths } from '../paths'
import type { LogEntry, LogFilter, LogLevel } from '@shared/types'

type Emitter = (entry: LogEntry) => void

let emitter: Emitter | null = null

export function setLogEmitter(fn: Emitter | null): void {
  emitter = fn
}

interface LogRow {
  id: number
  ts: number
  level: LogLevel
  category: string
  account_id: string | null
  task_id: string | null
  message: string
  meta: string | null
}

interface LogOpts {
  accountId?: string | null
  taskId?: string | null
  meta?: Record<string, unknown> | null
}

function mapRow(r: LogRow): LogEntry {
  return {
    id: r.id,
    ts: r.ts,
    level: r.level,
    category: r.category,
    accountId: r.account_id,
    taskId: r.task_id,
    message: r.message,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null
  }
}

export function log(
  level: LogLevel,
  category: string,
  message: string,
  opts: LogOpts = {}
): LogEntry {
  const ts = Date.now()
  const accountId = opts.accountId ?? null
  const taskId = opts.taskId ?? null
  const meta = opts.meta ?? null

  const info = getDb()
    .prepare(
      'INSERT INTO logs (ts, level, category, account_id, task_id, message, meta) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(ts, level, category, accountId, taskId, message, meta ? JSON.stringify(meta) : null)

  const entry: LogEntry = {
    id: Number(info.lastInsertRowid),
    ts,
    level,
    category,
    accountId,
    taskId,
    message,
    meta
  }

  try {
    const day = new Date(ts).toISOString().slice(0, 10).replace(/-/g, '')
    const line =
      JSON.stringify({
        ts: new Date(ts).toISOString(),
        level,
        category,
        accountId,
        taskId,
        message,
        meta
      }) + '\n'
    appendFileSync(join(paths().logs, `app-${day}.log`), line, 'utf8')
  } catch {
    // file logging is best-effort
  }

  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(`[${category}] ${message}`)

  emitter?.(entry)
  return entry
}

export const logger = {
  debug: (category: string, message: string, opts?: LogOpts) => log('debug', category, message, opts),
  info: (category: string, message: string, opts?: LogOpts) => log('info', category, message, opts),
  warn: (category: string, message: string, opts?: LogOpts) => log('warn', category, message, opts),
  error: (category: string, message: string, opts?: LogOpts) => log('error', category, message, opts)
}

export function queryLogs(filter: LogFilter = {}): LogEntry[] {
  const cond: string[] = []
  const args: unknown[] = []
  if (filter.level) {
    cond.push('level = ?')
    args.push(filter.level)
  }
  if (filter.category) {
    cond.push('category = ?')
    args.push(filter.category)
  }
  if (filter.accountId) {
    cond.push('account_id = ?')
    args.push(filter.accountId)
  }
  if (filter.taskId) {
    cond.push('task_id = ?')
    args.push(filter.taskId)
  }
  if (filter.search) {
    cond.push('message LIKE ?')
    args.push(`%${filter.search}%`)
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  const limit = Math.min(filter.limit ?? 500, 5000)
  const rows = getDb()
    .prepare(`SELECT * FROM logs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...args, limit) as LogRow[]
  return rows.map(mapRow).reverse()
}

export function clearLogs(): void {
  getDb().exec('DELETE FROM logs')
}
