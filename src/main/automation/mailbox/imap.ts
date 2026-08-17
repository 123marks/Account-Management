import { randomBytes } from 'node:crypto'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import type { Inbox, MailboxDriver, MailboxDriverContext, MailMessage } from './types'

const clients = new Map<string, ImapFlow>()

function poolKey(ctx: MailboxDriverContext): string {
  return `${ctx.config.host}|${ctx.config.user}`
}

async function getClient(ctx: MailboxDriverContext): Promise<ImapFlow> {
  const key = poolKey(ctx)
  const existing = clients.get(key)
  if (existing && existing.usable) return existing
  const client = new ImapFlow({
    host: String(ctx.config.host),
    port: Number(ctx.config.port || 993),
    secure: ctx.config.secure !== false,
    auth: { user: String(ctx.config.user), pass: String(ctx.config.pass) },
    logger: false
  })
  await client.connect()
  clients.set(key, client)
  client.on('close', () => {
    if (clients.get(key) === client) clients.delete(key)
  })
  return client
}

function plusAddress(base: string, tag: string): string {
  const [local, domain] = base.split('@')
  if (!local || !domain) return base
  return `${local}+${tag}@${domain}`
}

export const imapDriver: MailboxDriver = {
  driver: 'imap',
  async createInbox(ctx) {
    const base = String(ctx.config.baseAddress || ctx.config.user || '').trim()
    if (!base.includes('@')) throw new Error('IMAP 需要有效的登录邮箱或派生基址')
    if (ctx.config.plusAddressing === false) return { driver: 'imap', email: base, token: '' }
    const tag = randomBytes(4).toString('hex')
    return { driver: 'imap', email: plusAddress(base, tag), token: tag }
  },
  async fetchMails(ctx, inbox) {
    const client = await getClient(ctx)
    const box = String(ctx.config.mailbox || 'INBOX')
    const lock = await client.getMailboxLock(box)
    try {
      const since = new Date(Date.now() - 15 * 60 * 1000)
      const uids = await client.search({ since }, { uid: true })
      const list = Array.isArray(uids) ? uids.slice(-20) : []
      if (list.length === 0) return []
      const out: MailMessage[] = []
      const plusTag = inbox.token ? inbox.token.toLowerCase() : ''
      for await (const msg of client.fetch(list, { envelope: true, source: true }, { uid: true })) {
        const parsed = msg.source ? await simpleParser(msg.source) : null
        const to = (msg.envelope?.to ?? [])
          .map((a) => a.address || '')
          .filter(Boolean)
          .join(',')
        const hay = `${to} ${parsed?.subject || ''} ${parsed?.text || ''}`.toLowerCase()
        if (inbox.email && to && !to.toLowerCase().includes(inbox.email.toLowerCase())) {
          if (!plusTag || !hay.includes(plusTag)) continue
        }
        out.push({
          id: String(msg.uid),
          subject: parsed?.subject || msg.envelope?.subject || '',
          from: parsed?.from?.text || msg.envelope?.from?.[0]?.address || '',
          text: parsed?.text || '',
          html: typeof parsed?.html === 'string' ? parsed.html : '',
          receivedAt: (msg.envelope?.date ?? new Date()).getTime(),
          to
        })
      }
      return out
    } finally {
      lock.release()
    }
  },
  async test(ctx) {
    try {
      const client = await getClient(ctx)
      const box = String(ctx.config.mailbox || 'INBOX')
      const status = await client.status(box, { messages: true })
      return { ok: true, message: `IMAP 连接正常，${box} 共 ${status.messages ?? 0} 封` }
    } catch (e) {
      const msg = (e as Error).message
      if (/auth|invalid credentials|login/i.test(msg)) {
        return { ok: false, message: '认证失败：密码错误。Gmail 请使用应用专用密码' }
      }
      return { ok: false, message: `IMAP 连接失败：${msg}` }
    }
  },
  async send(ctx, mail) {
    const host = String(ctx.config.smtpHost || '')
    if (!host) throw new Error('未配置 SMTP 服务器')
    const port = Number(ctx.config.smtpPort || 465)
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: String(ctx.config.user), pass: String(ctx.config.pass) }
    })
    await transport.sendMail({
      from: String(ctx.config.user),
      to: mail.to,
      subject: mail.subject,
      text: mail.text
    })
  }
}
