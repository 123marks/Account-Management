import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import type { AutomationTask, Platform, TaskStatus, TaskType } from '@shared/types'

interface TaskRow {
  id: string
  account_id: string
  type: string
  status: string
  params: string
  result: string | null
  error: string | null
  progress: number
  created_at: number
  started_at: number | null
  finished_at: number | null
  account_label: string | null
  account_platform: string | null
}

const SELECT =
  `SELECT t.*, a.label AS account_label, a.platform AS account_platform
   FROM automation_tasks t
   LEFT JOIN accounts a ON a.id = t.account_id`

function safeParse(s: string | null): Record<string, unknown> | null {
  if (!s) return null
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function mapRow(r: TaskRow): AutomationTask {
  return {
    id: r.id,
    accountId: r.account_id,
    accountLabel: r.account_label ?? '(deleted)',
    platform: (r.account_platform ?? 'custom') as Platform,
    type: r.type as TaskType,
    status: r.status as TaskStatus,
    params: safeParse(r.params) ?? {},
    result: safeParse(r.result),
    error: r.error,
    progress: r.progress,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at
  }
}

export function createTask(
  accountId: string,
  type: TaskType,
  params: Record<string, unknown>
): AutomationTask {
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO automation_tasks (id, account_id, type, status, params, progress, created_at)
       VALUES (?, ?, ?, 'queued', ?, 0, ?)`
    )
    .run(id, accountId, type, JSON.stringify(params ?? {}), now)
  return getTask(id)!
}

export function getTask(id: string): AutomationTask | null {
  const r = getDb().prepare(`${SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined
  return r ? mapRow(r) : null
}

export function listTasks(limit = 200): AutomationTask[] {
  const rows = getDb()
    .prepare(`${SELECT} ORDER BY t.created_at DESC LIMIT ?`)
    .all(limit) as TaskRow[]
  return rows.map(mapRow)
}

export interface TaskPatch {
  status?: TaskStatus
  result?: Record<string, unknown> | null
  error?: string | null
  progress?: number
  startedAt?: number | null
  finishedAt?: number | null
}

/**
 * Apply a patch to a task. Returns null (no throw) when the row no longer exists
 * — e.g. it was deleted while a run was mid-flight — so callers can safely skip
 * emitting instead of crashing the main process with an unhandled rejection.
 */
export function updateTask(id: string, patch: TaskPatch): AutomationTask | null {
  if (!getTask(id)) return null
  const w: Record<string, unknown> = {}
  if (patch.status !== undefined) w.status = patch.status
  if (patch.result !== undefined) w.result = patch.result ? JSON.stringify(patch.result) : null
  if (patch.error !== undefined) w.error = patch.error
  if (patch.progress !== undefined) w.progress = patch.progress
  if (patch.startedAt !== undefined) w.started_at = patch.startedAt
  if (patch.finishedAt !== undefined) w.finished_at = patch.finishedAt
  if (Object.keys(w).length > 0) {
    const setClause = Object.keys(w)
      .map((k) => `${k} = @${k}`)
      .join(', ')
    getDb()
      .prepare(`UPDATE automation_tasks SET ${setClause} WHERE id = @id`)
      .run({ ...w, id })
  }
  return getTask(id)
}

export function deleteTask(id: string): void {
  getDb().prepare('DELETE FROM automation_tasks WHERE id = ?').run(id)
}

/** Remove all tasks in a terminal state (success/failed/canceled). Returns count removed. */
export function deleteFinishedTasks(): number {
  const info = getDb()
    .prepare(`DELETE FROM automation_tasks WHERE status IN ('success','failed','canceled')`)
    .run()
  return info.changes
}

/** Mark any tasks left mid-flight by a previous crash as failed. */
export function reconcileOrphanTasks(): void {
  getDb()
    .prepare(
      `UPDATE automation_tasks SET status = 'failed', error = 'interrupted (app restart)', finished_at = ?
       WHERE status IN ('queued','running')`
    )
    .run(Date.now())
}
