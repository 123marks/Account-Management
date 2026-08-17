import type { AccountSecrets } from '@shared/types'
import { api } from '@renderer/lib/api'

const cache = new Map<string, AccountSecrets>()
const inflight = new Map<string, Promise<AccountSecrets>>()

export async function getSecrets(accountId: string): Promise<AccountSecrets> {
  const hit = cache.get(accountId)
  if (hit) return hit
  const pending = inflight.get(accountId)
  if (pending) return pending
  const p = api.accounts.reveal(accountId).then((s) => {
    cache.set(accountId, s)
    inflight.delete(accountId)
    return s
  })
  inflight.set(accountId, p)
  return p
}

export function clearSecretsCache(): void {
  cache.clear()
  inflight.clear()
}

export function invalidateSecrets(accountId: string): void {
  cache.delete(accountId)
}
