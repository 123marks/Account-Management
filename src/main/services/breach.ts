import { createHash } from 'node:crypto'
import { getDb } from '../db'
import { decryptField } from './crypto'
import type { BreachResult } from '@shared/types'

/**
 * Check a password against HaveIBeenPwned's Pwned Passwords range API using
 * k-anonymity: only the first 5 chars of the SHA-1 hash are sent, and the API
 * returns all matching suffixes + breach counts. The plaintext (and full hash)
 * never leave this machine. Returns the breach count (0 if not found).
 */
async function pwnedCount(password: string): Promise<number> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
  const prefix = sha1.slice(0, 5)
  const suffix = sha1.slice(5)
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true' }
  })
  if (!res.ok) throw new Error(`HIBP HTTP ${res.status}`)
  const text = await res.text()
  for (const line of text.split('\n')) {
    const [hashSuffix, count] = line.trim().split(':')
    if (hashSuffix === suffix) return parseInt(count || '0', 10) || 0
  }
  return 0
}

/**
 * Check every stored password against HaveIBeenPwned. Passwords are decrypted
 * in memory only, de-duplicated by value (so identical passwords cost one
 * request), and only breached accounts are returned.
 */
export async function checkVaultBreaches(): Promise<BreachResult[]> {
  const rows = getDb()
    .prepare('SELECT id, password_enc FROM accounts')
    .all() as { id: string; password_enc: string | null }[]

  const cache = new Map<string, number>()
  const results: BreachResult[] = []
  for (const r of rows) {
    const pw = decryptField(r.password_enc)
    if (!pw) continue
    let count = cache.get(pw)
    if (count === undefined) {
      count = await pwnedCount(pw).catch(() => -1)
      cache.set(pw, count)
    }
    if (count > 0) results.push({ accountId: r.id, count })
  }
  return results
}
