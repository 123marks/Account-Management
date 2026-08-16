// Ephemeral, in-memory per-task secrets (e.g. a temp mailbox token used during
// registration). Kept out of the persisted task params so secrets never land in
// the SQLite `automation_tasks` table or the task drawer. Cleared when the task
// finishes.

const store = new Map<string, Record<string, string>>()

export function setTaskSecret(taskId: string, key: string, value: string): void {
  const m = store.get(taskId) ?? {}
  m[key] = value
  store.set(taskId, m)
}

export function getTaskSecret(taskId: string, key: string): string | undefined {
  return store.get(taskId)?.[key]
}

export function clearTaskSecrets(taskId: string): void {
  store.delete(taskId)
}
