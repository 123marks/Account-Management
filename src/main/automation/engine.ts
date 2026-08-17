import { join } from 'node:path'
import type { Page } from 'playwright-core'
import type { AccountInput, AutomationTask, EnqueueRequest, LogLevel } from '@shared/types'
import { createTask, getTask, updateTask } from '../db/repositories/tasks'
import { getAccountForAutomation, touchLastUsed, updateAccount } from '../db/repositories/accounts'
import { getSettings } from '../services/settings'
import { logger } from '../services/logger'
import { currentCode } from '../services/totp'
import { paths } from '../paths'
import { openContext, reserveProfile, releaseProfile } from './browser'
import { resolveProxy, maskProxy, socksAuthUnsupported, SOCKS_AUTH_MESSAGE } from './proxy'
import { detectHumanChallenge, solveToken } from './captcha'
import { clearTaskSecrets } from './secrets'
import { getFlow } from './flows/registry'
import type { StepContext } from './types'

type TaskEmitter = (task: AutomationTask) => void

let emit: TaskEmitter = () => {}
export function setTaskEmitter(fn: TaskEmitter): void {
  emit = fn
}

/** Apply a task patch and emit it, skipping safely if the task was deleted. */
function emitUpdate(id: string, patch: Parameters<typeof updateTask>[1]): void {
  const t = updateTask(id, patch)
  if (t) emit(t)
}

interface ActiveHandle {
  controller: AbortController
  close?: () => Promise<void>
}

const queue: string[] = []
const active = new Map<string, ActiveHandle>()
// Accounts currently driving a browser. A single account must never run two
// tasks at once: they share one persistent Chrome profile dir, and a second
// launch collides with the first ("Target page/browser has been closed").
const busyAccounts = new Set<string>()
let running = 0

/** True if an automation task is currently running for this account. */
export function isAccountBusy(accountId: string): boolean {
  return busyAccounts.has(accountId)
}

/** Translate raw Playwright/Chromium errors into actionable Chinese guidance. */
function friendlyError(msg: string): string {
  if (/has been closed|Target (page|frame|browser)/i.test(msg))
    return '浏览器/页面已被关闭，操作中断（可能是手动关闭了浏览器，或同一账号有其他任务在占用配置目录）'
  if (/Timeout.*(exceeded|ms)|waitForTimeout|waiting for/i.test(msg))
    return '操作超时：目标页面结构可能已变化，或需要在弹出的浏览器中手动完成验证后重试'
  if (/executablePath|Chromium|channel|spawn|ENOENT.*chrome/i.test(msg))
    return '未找到可用的本地 Chrome，请在「设置」中指定 Chrome 路径后重试'
  if (/net::|ERR_|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg))
    return '网络错误：无法访问目标站点，请检查网络或代理后重试'
  if (/socks.*proxy authentication|socks5 proxy/i.test(msg)) return SOCKS_AUTH_MESSAGE
  return msg
}

export function enqueue(req: EnqueueRequest): AutomationTask[] {
  const created: AutomationTask[] = []
  for (const accountId of req.accountIds) {
    const task = createTask(accountId, req.type, req.params ?? {})
    created.push(task)
    queue.push(task.id)
    emit(task)
  }
  pump()
  return created
}

/** Re-run a finished task with the same account/action/params as a new task. */
export function retry(taskId: string): AutomationTask | null {
  const t = getTask(taskId)
  if (!t) return null
  const [created] = enqueue({ accountIds: [t.accountId], type: t.type, params: t.params })
  return created ?? null
}

export function cancel(taskId: string): void {
  const idx = queue.indexOf(taskId)
  if (idx >= 0) {
    queue.splice(idx, 1)
    emitUpdate(taskId, { status: 'canceled', finishedAt: Date.now() })
    return
  }
  const handle = active.get(taskId)
  if (handle) {
    handle.controller.abort()
    handle.close?.().catch(() => undefined)
  }
}

function pump(): void {
  const raw = getSettings().maxConcurrency
  const max = Number.isFinite(raw) && raw >= 1 ? Math.min(10, Math.floor(raw)) : 2
  while (running < max) {
    // Pick the first queued task whose account is not already busy, so tasks
    // for the same account run one-after-another instead of colliding.
    const idx = queue.findIndex((id) => {
      const t = getTask(id)
      return t ? !busyAccounts.has(t.accountId) : true
    })
    if (idx === -1) break
    const id = queue.splice(idx, 1)[0]
    void runTask(id)
  }
}

async function safeShot(page: Page, taskId: string, name: string): Promise<string | null> {
  try {
    const safe = name.replace(/[^\w]+/g, '_').slice(0, 40)
    const file = join(paths().screenshots, `${taskId}-${Date.now()}-${safe}.png`)
    await page.screenshot({ path: file })
    return file
  } catch {
    return null
  }
}

async function runTask(taskId: string): Promise<void> {
  running++
  const controller = new AbortController()
  const handle: ActiveHandle = { controller }
  active.set(taskId, handle)
  let accountId: string | null = null
  let reservedDir: string | null = null
  let before: Record<string, unknown> | undefined

  try {
    const task = getTask(taskId)
    if (!task) throw new Error('任务不存在')
    accountId = task.accountId
    busyAccounts.add(accountId)
    const bundle = getAccountForAutomation(task.accountId)
    if (!bundle) throw new Error('账号不存在')
    const sourceAccountId = String(task.params.sourceAccountId || '')
    const sourceBundle =
      sourceAccountId && sourceAccountId !== accountId ? getAccountForAutomation(sourceAccountId) : null
    if (sourceAccountId && sourceAccountId !== accountId) {
      if (!sourceBundle) throw new Error('授权源账号不存在')
      if (busyAccounts.has(sourceAccountId)) throw new Error('授权源账号正在被其他任务占用')
      busyAccounts.add(sourceAccountId)
    }
    // Snapshot the account state before the flow mutates anything, so the UI
    // can show a clear before/after comparison for each task.
    before = {
      status: bundle.account.status,
      hasPassword: bundle.account.hasPassword,
      hasTotp: bundle.account.hasTotp,
      recoveryEmail: bundle.account.recoveryEmail,
      recoveryPhone: bundle.account.recoveryPhone
    }
    const flow = getFlow(bundle.account.platform, task.type)
    if (!flow) throw new Error(`平台 ${bundle.account.platform} 不支持操作 ${task.type}`)

    emitUpdate(taskId, { status: 'running', startedAt: Date.now(), progress: 1, error: null })
    logger.info('automation', `开始任务: ${flow.title}`, { accountId: task.accountId, taskId })

    // Take the shared profile lock so a manually-opened browser or cookie op on
    // the same account can't collide with this run.
    const profileAccount = sourceBundle?.account ?? bundle.account
    const authSecrets = sourceBundle?.secrets ?? bundle.secrets
    if (!reserveProfile(profileAccount.profileDir)) {
      throw new Error('该账号的浏览器已手动打开或配置目录被占用，请关闭后再运行自动化')
    }
    reservedDir = profileAccount.profileDir

    const resolved = resolveProxy(profileAccount.proxyUrl || bundle.account.proxyUrl)
    if (resolved.raw) {
      if (socksAuthUnsupported(resolved.raw)) throw new Error(SOCKS_AUTH_MESSAGE)
      logger.info('automation', `使用代理(${resolved.source}): ${maskProxy(resolved.raw)}`, {
        accountId: task.accountId,
        taskId
      })
    }
    const opened = await openContext(profileAccount.profileDir, resolved.proxy, {
      userAgent: profileAccount.userAgent || bundle.account.userAgent,
      locale: profileAccount.locale || bundle.account.locale,
      timezone: profileAccount.timezone || bundle.account.timezone
    })
    handle.close = opened.close
    const page = opened.context.pages()[0] ?? (await opened.context.newPage())

    const log = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
      logger[level]('automation', message, { accountId: task.accountId, taskId, meta })
    }
    const throwIfCanceled = (): void => {
      if (controller.signal.aborted) throw new Error('已取消')
    }

    const ctx: StepContext = {
      page,
      context: opened.context,
      account: bundle.account,
      secrets: authSecrets,
      params: task.params,
      signal: controller.signal,
      taskId,
      headless: getSettings().headless,
      totp: () =>
        authSecrets.totpSecret ? currentCode(authSecrets.totpSecret)?.code ?? null : null,
      log,
      throwIfCanceled,
      setProgress: (percent: number) => {
        const p = Math.max(0, Math.min(100, Math.round(percent)))
        emitUpdate(taskId, { progress: p })
      },
      screenshot: (name: string) => safeShot(page, taskId, name),
      detectChallenge: () => detectHumanChallenge(page),
      solveCaptcha: (o) => solveToken({ kind: o.kind, sitekey: o.sitekey, url: o.url ?? page.url() }),
      step: async (name, fn) => {
        throwIfCanceled()
        log('info', `▶ ${name}`)
        try {
          const r = await fn()
          log('info', `✔ ${name}`)
          return r
        } catch (e) {
          const shot = await safeShot(page, taskId, name)
          log('error', `✖ ${name}: ${(e as Error).message}`, { screenshot: shot })
          throw e
        }
      }
    }

    const result = await flow.run(ctx)
    touchLastUsed(task.accountId)

    const patch = (result.data?.accountPatch ?? null) as Partial<AccountInput> | null
    if (result.ok && patch && Object.keys(patch).length > 0) {
      try {
        updateAccount(task.accountId, patch)
        log('info', '已将变更写回账号库')
      } catch (e) {
        log('warn', `写回账号库失败: ${(e as Error).message}`)
      }
    }

    // Never persist secrets in the task result: drop the internal accountPatch
    // and the generated newPassword (the new value lives on the account + in
    // encrypted password history, and can be revealed there).
    const {
      accountPatch: _patch,
      newPassword: _pw,
      totpSecret: _totp,
      backupCodes: _codes,
      ...after
    } = (result.data ?? {}) as Record<string, unknown>
    emitUpdate(taskId, {
      status: result.ok ? 'success' : 'failed',
      progress: 100,
      result: { message: result.message, before, after },
      error: result.ok ? null : result.message,
      finishedAt: Date.now()
    })
    logger[result.ok ? 'info' : 'error'](
      'automation',
      `任务${result.ok ? '成功' : '失败'}: ${result.message}`,
      { accountId: task.accountId, taskId }
    )
  } catch (e) {
    const aborted = active.get(taskId)?.controller.signal.aborted ?? false
    const msg = (e as Error).message
    emitUpdate(taskId, {
      status: aborted ? 'canceled' : 'failed',
      error: aborted ? '已取消' : friendlyError(msg),
      result: before ? { before } : undefined,
      finishedAt: Date.now()
    })
    logger.error('automation', `任务${aborted ? '取消' : '异常'}: ${msg}`, { taskId })
  } finally {
    const h = active.get(taskId)
    if (h?.close) {
      try {
        await h.close()
      } catch {
        // best-effort
      }
    }
    active.delete(taskId)
    clearTaskSecrets(taskId)
    if (reservedDir) releaseProfile(reservedDir)
    if (accountId) busyAccounts.delete(accountId)
    const src = String(getTask(taskId)?.params.sourceAccountId || '')
    if (src) busyAccounts.delete(src)
    running--
    pump()
  }
}
