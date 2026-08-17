import { listProviders } from '../services/providers'
import { tempmailDriver } from './mailbox/tempmail'
import { testmailDriver } from './mailbox/testmail'
import { imapDriver } from './mailbox/imap'
import { genericHttpDriver } from './mailbox/genericHttp'
import { cfworkerDriver } from './mailbox/cfworker'
import { icloudImapDriver } from './mailbox/icloudImap'
import { icloudHmeDriver } from './mailbox/icloudHme'
import { icloudMailDriver } from './mailbox/icloudMail'
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
  icloud_mail: icloudMailDriver
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
  const m = resolveDefaultMailbox()
  if (!m) throw new Error('未配置可用的默认邮箱服务，请到「服务中心」添加并设为默认')
  return driverOf(m.driver).createInbox({ config: m.config })
}

interface WaitOpts {
  timeoutMs?: number
  keyword?: string
  pattern?: RegExp
  toAddress?: string
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const DEFAULT_CODE = /(?<!\d)(\d{4,8})(?!\d)/

function extract(mails: MailMessage[], seen: Set<string>, opts: WaitOpts, mode: 'code' | 'link'): string | null {
  const pattern = opts.pattern ?? DEFAULT_CODE
  for (const mail of mails) {
    if (seen.has(mail.id)) continue
    seen.add(mail.id)
    if (opts.toAddress && mail.to && !mail.to.toLowerCase().includes(opts.toAddress.toLowerCase())) continue
    const text = `${mail.subject} ${mail.text} ${mail.html}`
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
      if (/配置|apikey|namespace|认证/i.test((e as Error).message)) throw e
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

export async function testMailboxDriver(
  driver: string,
  config: Record<string, string | number | boolean>
): Promise<{ ok: boolean; message: string }> {
  const d = DRIVERS[driver]
  if (!d) return { ok: false, message: '未知邮箱驱动' }
  return d.test({ config })
}
