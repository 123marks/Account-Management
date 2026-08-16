import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { getDb } from '../db'

/**
 * App-lock: an application-level gate that requires a PIN/passphrase to view the
 * vault, plus idle auto-lock. This is a UI/shoulder-surf protection layer on top
 * of the at-rest encryption (which is keyed by the OS keychain), not a replacement
 * for it. The PIN is stored only as a scrypt hash + random salt, never in plaintext
 * and never sent to the renderer.
 */

export interface LockStatus {
  enabled: boolean
  autoLockMinutes: number
}

interface LockRow {
  enabled: number
  salt: string | null
  hash: string | null
  auto_lock_minutes: number
}

// In-memory unlock state for the main process. Starts locked when a PIN is
// configured, so sensitive IPC is refused until the correct PIN is entered —
// the renderer overlay alone is not a security boundary.
let unlocked = false

/** True when the vault may serve secrets: lock disabled, or unlocked this session. */
export function isUnlocked(): boolean {
  return !getLockStatus().enabled || unlocked
}

/** Re-lock the vault (idle timeout / manual lock). */
export function lockNow(): void {
  unlocked = false
}

/** Throw a uniform error from any sensitive IPC handler when locked. */
export function requireUnlocked(): void {
  if (!isUnlocked()) throw new Error('应用已锁定，请先解锁后再操作')
}

function row(): LockRow {
  return getDb()
    .prepare('SELECT enabled, salt, hash, auto_lock_minutes FROM app_lock WHERE id = 1')
    .get() as LockRow
}

export function getLockStatus(): LockStatus {
  const r = row()
  return { enabled: !!r.enabled, autoLockMinutes: r.auto_lock_minutes }
}

function derive(pin: string, salt: Buffer): Buffer {
  return scryptSync(pin, salt, 32)
}

export function setLockPin(pin: string, autoLockMinutes: number): LockStatus {
  if (!pin || pin.length < 4) throw new Error('PIN 至少 4 位')
  const salt = randomBytes(16)
  const hash = derive(pin, salt)
  getDb()
    .prepare('UPDATE app_lock SET enabled = 1, salt = ?, hash = ?, auto_lock_minutes = ? WHERE id = 1')
    .run(salt.toString('base64'), hash.toString('base64'), Math.max(0, Math.floor(autoLockMinutes || 0)))
  unlocked = true // just configured → treat this session as unlocked
  return getLockStatus()
}

export function verifyLockPin(pin: string): boolean {
  const r = row()
  if (!r.enabled || !r.salt || !r.hash) {
    unlocked = true
    return true
  }
  const expected = Buffer.from(r.hash, 'base64')
  const got = derive(pin, Buffer.from(r.salt, 'base64'))
  const ok = expected.length === got.length && timingSafeEqual(expected, got)
  if (ok) unlocked = true
  return ok
}

export function disableLock(pin: string): boolean {
  if (!verifyLockPin(pin)) return false
  getDb().prepare('UPDATE app_lock SET enabled = 0, salt = NULL, hash = NULL WHERE id = 1').run()
  unlocked = true
  return true
}

export function setAutoLock(minutes: number): LockStatus {
  getDb()
    .prepare('UPDATE app_lock SET auto_lock_minutes = ? WHERE id = 1')
    .run(Math.max(0, Math.floor(minutes || 0)))
  return getLockStatus()
}
