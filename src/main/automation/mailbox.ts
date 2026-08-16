import { randomBytes } from 'node:crypto'
import { listProviders } from '../services/providers'

export interface Inbox {
  driver: string
  email: string
  token: string
}

export interface MailboxRef {
  driver: string
  config: Record<string, string | number | boolean>
}

/** The default (or first enabled) mailbox provider, if configured. */
export function resolveDefaultMailbox(): MailboxRef | null {
  const items = listProviders('mailbox')
  const chosen = items.find((p) => p.isDefault && p.enabled) ?? items.find((p) => p.enabled)
  return chosen ? { driver: chosen.driver, config: chosen.config } : null
}

function tempmailBase(config: Record<string, string | number | boolean>): string {
  return String(config.apiBase || 'https://api.tempmail.lol/v2').replace(/\/+$/, '')
}

/** Provision a fresh inbox from the default mailbox provider. */
export async function createInbox(): Promise<Inbox> {
  const m = resolveDefaultMailbox()
  if (!m) throw new Error('未配置可用的默认邮箱服务，请到「服务中心」添加并设为默认')

  if (m.driver === 'tempmail_lol') {
    const res = await fetch(`${tempmailBase(m.config)}/inbox/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    if (!res.ok) throw new Error(`创建临时邮箱失败：HTTP ${res.status}`)
    const data = (await res.json()) as { address?: string; email?: string; token?: string }
    const email = data.address || data.email || ''
    const token = data.token || ''
    if (!email || !token) throw new Error('邮箱接口未返回地址或令牌')
    return { driver: m.driver, email, token }
  }

  if (m.driver === 'testmail') {
    const namespace = String(m.config.namespace || '').trim()
    const apiKey = String(m.config.apiKey || '').trim()
    if (!namespace || !apiKey) throw new Error('testmail 需要配置 API Key 与 namespace')
    const prefix = String(m.config.tagPrefix || '')
      .trim()
      .replace(/^\.+|\.+$/g, '')
    const suffix = randomBytes(6).toString('hex')
    const tag = prefix ? `${prefix}.${suffix}` : suffix
    const email = `${namespace}.${tag}@inbox.testmail.app`
    return { driver: 'testmail', email, token: tag }
  }

  throw new Error(`邮箱驱动「${m.driver}」的注册运行时尚未接入（当前支持 TempMail.lol / testmail）`)
}

interface WaitOpts {
  timeoutMs?: number
  keyword?: string
  pattern?: RegExp
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function extractFromMails(
  mails: Array<Record<string, unknown>>,
  seen: Set<string>,
  opts: WaitOpts,
  mode: 'code' | 'link'
): string | null {
  const pattern = opts.pattern ?? /(?<!\d)(\d{6})(?!\d)/
  for (const mail of mails) {
    const id = String(mail.id ?? mail.message_id ?? `${mail.date ?? mail.timestamp ?? ''}:${mail.subject ?? ''}`)
    if (seen.has(id)) continue
    seen.add(id)
    const text = `${mail.subject ?? ''} ${mail.body ?? ''} ${mail.text ?? ''} ${mail.html ?? ''}`
    if (opts.keyword && !text.toLowerCase().includes(opts.keyword.toLowerCase())) continue
    if (mode === 'code') {
      const m = pattern.exec(text)
      if (m) return m[1] ?? m[0]
    } else {
      const link = /https?:\/\/[^\s"'<>]+/i.exec(text)
      if (link) return link[0].replace(/[).,;]+$/, '')
    }
  }
  return null
}

async function pollMails(driver: string, token: string): Promise<Array<Record<string, unknown>>> {
  const m = resolveDefaultMailbox()
  if (driver === 'tempmail_lol') {
    const base = tempmailBase(m?.config ?? {})
    const res = await fetch(`${base}/inbox?token=${encodeURIComponent(token)}`)
    if (!res.ok) return []
    const data = (await res.json()) as { emails?: Array<Record<string, unknown>> }
    return data.emails ?? []
  }
  if (driver === 'testmail') {
    const apiKey = String(m?.config.apiKey || '').trim()
    const namespace = String(m?.config.namespace || '').trim()
    if (!apiKey || !namespace) throw new Error('testmail 配置缺失（API Key / namespace）')
    const url = `https://api.testmail.app/api/json?apikey=${encodeURIComponent(apiKey)}&namespace=${encodeURIComponent(namespace)}&tag=${encodeURIComponent(token)}&limit=20`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as { result?: string; message?: string; emails?: Array<Record<string, unknown>> }
    if (data.result === 'fail') throw new Error(`testmail 查询失败：${data.message ?? '未知错误'}`)
    return data.emails ?? []
  }
  throw new Error(`邮箱驱动「${driver}」暂不支持收信`)
}

async function poll(driver: string, token: string, opts: WaitOpts, mode: 'code' | 'link'): Promise<string> {
  const timeout = opts.timeoutMs ?? 120000
  const seen = new Set<string>()
  const start = Date.now()
  while (Date.now() - start < timeout) {
    let mails: Array<Record<string, unknown>> = []
    try {
      mails = await pollMails(driver, token)
    } catch (e) {
      // A hard config error should surface immediately, not silently time out.
      if (/配置|apikey|namespace/i.test((e as Error).message)) throw e
    }
    const found = extractFromMails(mails, seen, opts, mode)
    if (found) return found
    await sleep(3000)
  }
  throw new Error(
    mode === 'code'
      ? `等待邮箱验证码超时（${Math.round(timeout / 1000)}s）`
      : `等待验证链接超时（${Math.round(timeout / 1000)}s）`
  )
}

/** Poll the inbox and return the first verification code (default: a 6-digit code). */
export function waitForCode(driver: string, token: string, opts: WaitOpts = {}): Promise<string> {
  return poll(driver, token, opts, 'code')
}

/** Poll the inbox and return the first verification link. */
export function waitForLink(driver: string, token: string, opts: WaitOpts = {}): Promise<string> {
  return poll(driver, token, opts, 'link')
}
