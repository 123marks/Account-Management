import { imapDriver } from './imap'
import type { Inbox, MailboxDriver, MailboxDriverContext, MailMessage } from './types'

function withIcloudDefaults(ctx: MailboxDriverContext): MailboxDriverContext {
  return {
    ...ctx,
    config: {
      plusAddressing: true,
      mailbox: 'INBOX',
      smtpHost: 'smtp.mail.me.com',
      smtpPort: 587,
      ...ctx.config,
      host: String(ctx.config.host || 'imap.mail.me.com'),
      port: Number(ctx.config.port || 993),
      secure: ctx.config.secure !== false,
      user: String(ctx.config.user || ctx.config.baseAddress || ''),
      pass: String(ctx.config.pass || ''),
      baseAddress: String(ctx.config.baseAddress || ctx.config.user || '')
    }
  }
}

export const icloudImapDriver: MailboxDriver = {
  driver: 'icloud_imap',
  async createInbox(ctx) {
    const inbox = await imapDriver.createInbox(withIcloudDefaults(ctx))
    return { ...inbox, driver: 'icloud_imap' }
  },
  fetchMails(ctx, inbox): Promise<MailMessage[]> {
    return imapDriver.fetchMails(withIcloudDefaults(ctx), { ...inbox, driver: 'imap' })
  },
  test(ctx) {
    return imapDriver.test(withIcloudDefaults(ctx))
  },
  send(ctx, mail) {
    if (!imapDriver.send) throw new Error('IMAP 驱动不支持发信')
    return imapDriver.send(withIcloudDefaults(ctx), mail)
  }
}

export type { Inbox }
