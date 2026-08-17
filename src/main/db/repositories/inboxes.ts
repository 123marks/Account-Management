import { randomUUID } from 'node:crypto'
import { getDb } from '../index'
import { encryptField, decryptField } from '../../services/crypto'
import type { GeneratedInbox } from '@shared/types'

interface Row {
  id: string
  provider_id: string | null
  driver: string
  email: string
  token_enc: string | null
  source: string
  account_id: string | null
  created_at: number
}

function mapRow(r: Row): GeneratedInbox {
  return {
    id: r.id,
    providerId: r.provider_id ?? '',
    driver: r.driver,
    email: r.email,
    source: r.source as GeneratedInbox['source'],
    accountId: r.account_id ?? '',
    createdAt: r.created_at,
    hasToken: !!r.token_enc
  }
}

export function recordGeneratedInbox(input: {
  providerId?: string
  driver: string
  email: string
  token?: string
  source: GeneratedInbox['source']
  accountId?: string
}): GeneratedInbox {
  const id = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO mailbox_inboxes (
        id, provider_id, driver, email, token_enc, source, account_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.providerId || null,
      input.driver,
      input.email,
      encryptField(input.token || null),
      input.source,
      input.accountId || null,
      Date.now()
    )
  return getGeneratedInbox(id)!
}

export function listGeneratedInboxes(): GeneratedInbox[] {
  const rows = getDb()
    .prepare('SELECT * FROM mailbox_inboxes ORDER BY created_at DESC LIMIT 200')
    .all() as Row[]
  return rows.map(mapRow)
}

export function getGeneratedInbox(id: string): GeneratedInbox | null {
  const r = getDb().prepare('SELECT * FROM mailbox_inboxes WHERE id = ?').get(id) as Row | undefined
  return r ? mapRow(r) : null
}

export function revealInboxToken(id: string): string {
  const r = getDb().prepare('SELECT token_enc FROM mailbox_inboxes WHERE id = ?').get(id) as
    | { token_enc: string | null }
    | undefined
  return r ? decryptField(r.token_enc) ?? '' : ''
}

export function linkInboxToAccount(email: string, accountId: string): void {
  getDb()
    .prepare(
      `UPDATE mailbox_inboxes SET account_id = ?
       WHERE id = (
         SELECT id FROM mailbox_inboxes
         WHERE email = ? AND (account_id IS NULL OR account_id = '')
         ORDER BY created_at DESC LIMIT 1
       )`
    )
    .run(accountId, email)
}

export function removeGeneratedInbox(id: string): void {
  getDb().prepare('DELETE FROM mailbox_inboxes WHERE id = ?').run(id)
}
