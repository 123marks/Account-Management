import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import initSqlJs, { type Database as RawDatabase, type SqlValue } from 'sql.js'
import { paths } from '../paths'
import { runMigrations } from './migrations'

/**
 * We use sql.js (SQLite compiled to WebAssembly) to avoid any native build step.
 * The database lives in memory and is persisted to a single file on disk
 * (debounced after writes, and flushed on close).
 *
 * This module exposes a thin `Db` facade that mimics the subset of the
 * better-sqlite3 API used by the repositories, so the rest of the code is
 * driver-agnostic.
 */

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export interface Stmt {
  // Callers cast the result to their concrete row type immediately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (...params: unknown[]) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  all: (...params: unknown[]) => any[]
  run: (...params: unknown[]) => RunResult
}

export interface Db {
  prepare: (sql: string) => Stmt
  exec: (sql: string) => void
  transaction: <T extends (...args: never[]) => unknown>(fn: T) => T
  pragma: (statement: string) => void
  persist: () => void
  close: () => void
}

let raw: RawDatabase | null = null
let dbFacade: Db | null = null
let persistTimer: NodeJS.Timeout | null = null

function toSqlValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'string' || v instanceof Uint8Array) return v
  return String(v)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Uint8Array)
  )
}

function bind(stmt: ReturnType<RawDatabase['prepare']>, params: unknown[]): void {
  if (params.length === 1 && isPlainObject(params[0])) {
    const obj = params[0]
    const named: Record<string, SqlValue> = {}
    for (const k of Object.keys(obj)) named['@' + k] = toSqlValue(obj[k])
    stmt.bind(named)
  } else if (params.length > 0) {
    stmt.bind(params.map(toSqlValue))
  }
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(persistNow, 400)
}

function persistNow(): void {
  if (!raw) return
  try {
    const data = raw.export()
    writeFileSync(paths().dbFile, Buffer.from(data))
  } catch {
    // best-effort persistence
  }
}

function makeFacade(db: RawDatabase): Db {
  return {
    prepare(sql: string): Stmt {
      return {
        get: (...params) => {
          const stmt = db.prepare(sql)
          try {
            bind(stmt, params)
            return stmt.step() ? stmt.getAsObject() : undefined
          } finally {
            stmt.free()
          }
        },
        all: (...params) => {
          const stmt = db.prepare(sql)
          const rows: Record<string, SqlValue>[] = []
          try {
            bind(stmt, params)
            while (stmt.step()) rows.push(stmt.getAsObject())
          } finally {
            stmt.free()
          }
          return rows
        },
        run: (...params) => {
          const stmt = db.prepare(sql)
          try {
            bind(stmt, params)
            stmt.step()
          } finally {
            stmt.free()
          }
          const changes = db.getRowsModified()
          const res = db.exec('SELECT last_insert_rowid() AS id')
          const lastInsertRowid = Number(res[0]?.values[0]?.[0] ?? 0)
          schedulePersist()
          return { changes, lastInsertRowid }
        }
      }
    },
    exec: (sql: string) => {
      db.run(sql)
      schedulePersist()
    },
    transaction: (fn) => {
      return ((...args: never[]) => {
        db.run('BEGIN')
        try {
          const result = fn(...args)
          db.run('COMMIT')
          schedulePersist()
          return result
        } catch (e) {
          db.run('ROLLBACK')
          throw e
        }
      }) as typeof fn
    },
    pragma: (statement: string) => {
      try {
        db.run('PRAGMA ' + statement)
      } catch {
        // pragmas like WAL are no-ops for the in-memory WASM build
      }
    },
    persist: persistNow,
    close: () => {
      persistNow()
      db.close()
    }
  }
}

export async function initDatabase(): Promise<Db> {
  const req = createRequire(__filename)
  const wasmPath = req.resolve('sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })

  const file = paths().dbFile
  raw = existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database()

  dbFacade = makeFacade(raw)
  dbFacade.pragma('foreign_keys = ON')
  runMigrations(dbFacade)
  persistNow()
  return dbFacade
}

export function getDb(): Db {
  if (!dbFacade) throw new Error('Database not initialized. Call initDatabase() first.')
  return dbFacade
}

export function closeDatabase(): void {
  if (persistTimer) clearTimeout(persistTimer)
  dbFacade?.close()
  dbFacade = null
  raw = null
}
