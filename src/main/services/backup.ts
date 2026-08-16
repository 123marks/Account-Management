import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto'
import { exportAll, importJson } from '../db/repositories/accounts'

/**
 * Portable, password-protected backup format. Unlike the plaintext export,
 * this envelope encrypts the whole vault with a key derived from a user
 * passphrase (scrypt) so a backup file is safe to store off-machine.
 */
interface EncEnvelope {
  format: 'aam-enc'
  v: 1
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  data: string
}

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 }

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, SCRYPT_PARAMS)
}

export function exportEncrypted(password: string): string {
  if (!password || password.length < 4) {
    throw new Error('备份密码至少 4 位')
  }
  const plaintext = exportAll()
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(password, salt)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const envelope: EncEnvelope = {
    format: 'aam-enc',
    v: 1,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ct.toString('base64')
  }
  return JSON.stringify(envelope, null, 2)
}

function isEnvelope(v: unknown): v is EncEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { format?: unknown }).format === 'aam-enc'
  )
}

function decryptEnvelope(env: EncEnvelope, password: string): string {
  const salt = Buffer.from(env.salt, 'base64')
  const iv = Buffer.from(env.iv, 'base64')
  const key = deriveKey(password, salt)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'))
  try {
    const pt = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()])
    return pt.toString('utf8')
  } catch {
    throw new Error('解密失败：备份密码错误或文件已损坏')
  }
}

/** Import either a plaintext export or an encrypted envelope (password required). */
export function importData(json: string, password?: string): number {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (isEnvelope(parsed)) {
    if (!password) throw new Error('这是加密备份，请提供备份密码')
    return importJson(decryptEnvelope(parsed, password))
  }
  return importJson(json)
}
