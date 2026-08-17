import { listProviders, saveProvider } from '../services/providers'
import { tempmailDriver } from './mailbox/tempmail'
import { testmailDriver } from './mailbox/testmail'
import { imapDriver } from './mailbox/imap'
import { genericHttpDriver } from './mailbox/genericHttp'
import { cfworkerDriver } from './mailbox/cfworker'
import { icloudImapDriver } from './mailbox/icloudImap'
import { icloudHmeDriver } from './mailbox/icloudHme'
import { icloudMailDriver } from './mailbox/icloudMail'
import { pickupDriver } from './mailbox/pickup'
import { outlookGraphDriver } from './mailbox/outlookGraph'
import type { Inbox, MailboxDriver, MailMessage } from './mailbox/types'

export type { Inbox }

export interface MailboxRef {
  driver: string
  config: Record<string, string | number | boolean>
}

const DRIVERS: Record<string, MailboxDriver> = {
  tempmail_lol: tempmailDriver,
  testmail: testmailDriver,
  imap: imapDriver,
  generic_http: genericHttpDriver,
  cfworker: cfworkerDriver,
  icloud_imap: icloudImapDriver,
  icloud_hme: icloudHmeDriver,
  icloud_mail: icloudMailDriver,
  mail_pickup: pickupDriver,
  outlook_graph: outlookGraphDriver
}

export function resolveDefaultMailbox(): MailboxRef | null {
  const items = listProviders('mailbox')
  const chosen = items.find((p) => p.isDefault && p.enabled) ?? items.find((p) => p.enabled)
  return chosen ? { driver: chosen.driver, config: chosen.config } : null
}

function driverOf(name: string): MailboxDriver {
  const d = DRIVERS[name]
  if (!d) throw new Error(`邮箱驱动「${name}」暂不支持收信`)
  return d
}

export async function createInbox(): Promise<Inbox> {
  const items = listProviders('mailbox')
  const chosen = items.find((p) => p.isDefault && p.enabled) ?? items.find((p) => p.enabled)
  if (!chosen) throw new Error('未配置可用的默认邮箱服务，请到「服务中心」添加并设为默认')
  return driverOf(chosen.driver).createInbox({
    config: chosen.config,
    persistConfig: (patch) => {
      saveProvider({
        id: chosen.id,
        type: chosen.type,
        driver: chosen.driver,
        name: chosen.name,
        enabled: chosen.enabled,
        isDefault: false,
        config: { ...chosen.config, ...patch }
      })
    }
  })
}

interface WaitOpts {
  timeoutMs?: number
  keyword?: string
  pattern?: RegExp
  toAddress?: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const DEFAULT_CODE = /(?<!\d)(\d{4,8})(?!\d)/
const LABELED_CODE = /(?:验证码|校验码|launch code|one[- ]?time|otp|code)[^\d]{0,24}(\d{4,8})/i

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
}

function mailText(mail: MailMessage): string {
  return `${mail.subject} ${mail.text} ${stripHtml(mail.html || '')}`
}

function extract(mails: MailMessage[], seen: Set<string>, opts: WaitOpts, mode: 'code' | 'link'): string | null {
  const pattern = opts.pattern ?? DEFAULT_CODE
  for (const mail of mails) {
    if (seen.has(mail.id)) continue
    seen.add(mail.id)
    if (opts.toAddress && mail.to && !mail.to.toLowerCase().includes(opts.toAddress.toLowerCase())) continue
    const text = mailText(mail)
    if (opts.keyword && !text.toLowerCase().includes(opts.keyword.toLowerCase())) continue
    if (mode === 'code') {
      const labeled = LABELED_CODE.exec(text)
      if (labeled?.[1]) return labeled[1]
      const m = pattern.exec(text)
      if (m) return m[1] ?? m[0]
    } else {
      const link = /https?:\/\/[^\s"'<>]+/i.exec(text)
      if (link) return link[0].replace(/[).,;]+$/, '')
    }
  }
  return null
}

async function poll(driver: string, token: string, opts: WaitOpts, mode: 'code' | 'link'): Promise<string> {
  const m = resolveDefaultMailbox()
  const cfg = m?.config ?? {}
  const inbox: Inbox = { driver, email: opts.toAddress || '', token }
  const timeout = opts.timeoutMs ?? 120000
  const seen = new Set<string>()
  const start = Date.now()
  while (Date.now() - start < timeout) {
    let mails: MailMessage[] = []
    try {
      mails = await driverOf(driver).fetchMails({ config: cfg }, inbox)
    } catch (e) {
      if (/配置|apikey|namespace|认证|令牌|库存|用尽|invalid_grant|refresh/i.test((e as Error).message)) throw e
    }
    const found = extract(mails, seen, opts, mode)
    if (found) return found
    await sleep(3000)
  }
  throw new Error(
    mode === 'code'
      ? `等待邮箱验证码超时（${Math.round(timeout / 1000)}s）`
      : `等待验证链接超时（${Math.round(timeout / 1000)}s）`
  )
}

export function waitForCode(driver: string, token: string, opts: WaitOpts = {}): Promise<string> {
  return poll(driver, token, opts, 'code')
}

export function waitForLink(driver: string, token: string, opts: WaitOpts = {}): Promise<string> {
  return poll(driver, token, opts, 'link')
}

export async function waitForVerify(
  driver: string,
  token: string,
  opts: WaitOpts = {}
): Promise<{ kind: 'code' | 'link'; value: string }> {
  const m = resolveDefaultMailbox()
  const cfg = m?.config ?? {}
  const inbox: Inbox = { driver, email: opts.toAddress || '', token }
  const timeout = opts.timeoutMs ?? 120000
  const seenCode = new Set<string>()
  const seenLink = new Set<string>()
  const start = Date.now()
  while (Date.now() - start < timeout) {
    let mails: MailMessage[] = []
    try {
      mails = await driverOf(driver).fetchMails({ config: cfg }, inbox)
    } catch (e) {
      if (/配置|apikey|namespace|认证|令牌|库存|用尽|invalid_grant|refresh/i.test((e as Error).message)) throw e
    }
    const code = extract(mails, seenCode, opts, 'code')
    if (code) return { kind: 'code', value: code }
    const link = extract(mails, seenLink, opts, 'link')
    if (link) return { kind: 'link', value: link }
    await sleep(3000)
  }
  throw new Error(`等待邮箱验证码或验证链接超时（${Math.round(timeout / 1000)}s）`)
}

export async function testMailboxDriver(
  driver: string,
  config: Record<string, string | number | boolean>
): Promise<{ ok: boolean; message: string }> {
  const d = DRIVERS[driver]
  if (!d) return { ok: false, message: '未知邮箱驱动' }
  return d.test({ config })
}
