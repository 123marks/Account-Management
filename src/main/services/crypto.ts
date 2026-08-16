import { safeStorage } from 'electron'
import {
  randomBytes,
  createCipheriv,
  createDecipheriv
} from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { paths } from '../paths'

const PREFIX = 'enc:v1:'
let masterKey: Buffer | null = null
let osBacked = false

/**
 * Master key lifecycle:
 *  - First run: generate 32 random bytes, seal with OS keychain (safeStorage), persist.
 *  - Later runs: read + unseal.
 *  - If safeStorage is unavailable (e.g. Linux without keyring), degrade to storing the
 *    base64 key on disk (documented fallback; still keeps DB fields obfuscated at rest).
 */
export function initCrypto(): void {
  const keyFile = paths().keyFile
  osBacked = safeStorage.isEncryptionAvailable()

  if (existsSync(keyFile)) {
    const raw = readFileSync(keyFile)
    if (osBacked) {
      masterKey = Buffer.from(safeStorage.decryptString(raw), 'base64')
    } else {
      masterKey = Buffer.from(raw.toString('utf8'), 'base64')
    }
  } else {
    masterKey = randomBytes(32)
    const b64 = masterKey.toString('base64')
    if (osBacked) {
      writeFileSync(keyFile, safeStorage.encryptString(b64))
    } else {
      writeFileSync(keyFile, b64, 'utf8')
    }
  }
}

export function isCryptoAvailable(): boolean {
  return osBacked
}

export function encryptField(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return null
  if (!masterKey) throw new Error('Crypto not initialized')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decryptField(enc: string | null | undefined): string | null {
  if (!enc) return null
  if (!enc.startsWith(PREFIX)) return enc // tolerate plaintext (e.g. freshly imported)
  if (!masterKey) throw new Error('Crypto not initialized')
  const parts = enc.slice(PREFIX.length).split(':')
  if (parts.length !== 3) return null
  const [ivB, tagB, ctB] = parts
  const iv = Buffer.from(ivB, 'base64')
  const tag = Buffer.from(tagB, 'base64')
  const ct = Buffer.from(ctB, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', masterKey, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}
