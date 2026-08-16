import type { AutomationTask, Platform } from '@shared/types'
import { enqueue } from './engine'
import { createInbox } from './mailbox'
import { setTaskSecret } from './secrets'
import { createAccount } from '../db/repositories/accounts'
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
      const password = genPassword(16)
      const account = createAccount({
        platform,
        label: `${platform}-${inbox.email.split('@')[0]}`,
        username: '',
        email: inbox.email,
        password,
        status: 'active',
        notes: '自动注册待完成'
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
