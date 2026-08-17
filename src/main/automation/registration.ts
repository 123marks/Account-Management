import type { AutomationTask, Platform } from '@shared/types'
import { enqueue } from './engine'
import { createInbox } from './mailbox'
import { setTaskSecret } from './secrets'
import { createAccount, getAccount } from '../db/repositories/accounts'
import { genPassword } from './flows/util'
import { logger } from '../services/logger'

export interface RegisterBatchResult {
  created: AutomationTask[]
  errors: string[]
}

/**
 * Batch account registration. For each unit: provision a temp inbox, create a
 * placeholder account (email + generated password), and enqueue a `register`
 * task that runs the platform's signup flow. One failed provisioning does not
 * abort the whole batch — it is collected and reported.
 */
export async function enqueueRegistrations(
  platform: Platform,
  count: number,
  params: Record<string, unknown> = {}
): Promise<RegisterBatchResult> {
  const created: AutomationTask[] = []
  const errors: string[] = []
  const n = Math.max(1, Math.min(50, Math.floor(count || 1)))

  for (let i = 0; i < n; i++) {
    try {
      const inbox = await createInbox()
      const password = genPassword(platform === 'github' ? 18 : 16)
      const local = inbox.email.split('@')[0] || 'user'
      const account = createAccount({
        platform,
        label: inbox.email,
        username: local,
        email: inbox.email,
        password,
        status: 'active',
        tags: ['auto-register'],
        notes: `自动注册待完成 · ${inbox.email} · 驱动 ${inbox.driver}`,
        mailboxKind: inbox.driver,
        mailboxAppPassword: inbox.token
      })
      const tasks = enqueue({
        accountIds: [account.id],
        type: 'register',
        // Keep only non-secret refs in params; the token lives in memory per task.
        params: { ...params, mailboxDriver: inbox.driver }
      })
      for (const t of tasks) setTaskSecret(t.id, 'mailboxToken', inbox.token)
      created.push(...tasks)
    } catch (e) {
      const msg = `#${i + 1}: ${(e as Error).message}`
      errors.push(msg)
      logger.warn('automation', `注册入队失败 ${msg}`)
    }
  }
  return { created, errors }
}

export async function enqueueOauthRegistrations(
  platform: Platform,
  sourceAccountIds: string[],
  oauthProvider: 'google' | 'github'
): Promise<RegisterBatchResult> {
  const created: AutomationTask[] = []
  const errors: string[] = []
  for (const sourceId of sourceAccountIds) {
    try {
      const source = getAccount(sourceId)
      if (!source) throw new Error('源账号不存在')
      const account = createAccount({
        platform,
        label: source.email || source.label || `${platform}-oauth`,
        username: source.username || source.email.split('@')[0] || '',
        email: source.email,
        status: 'active',
        tags: ['oauth-register'],
        notes: `OAuth 待完成 · 源 ${source.label || source.email}`,
        oauthProvider,
        oauthSourceAccountId: source.id
      })
      created.push(
        ...enqueue({
          accountIds: [account.id],
          type: 'register_oauth',
          params: { oauthProvider, sourceAccountId: source.id }
        })
      )
    } catch (e) {
      errors.push(`${sourceId}: ${(e as Error).message}`)
    }
  }
  return { created, errors }
}
