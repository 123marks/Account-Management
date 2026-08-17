export interface Inbox {
  driver: string
  email: string
  token: string
}

export interface MailMessage {
  id: string
  subject: string
  from: string
  text: string
  html: string
  receivedAt: number
  to?: string
}

export interface MailboxDriverContext {
  config: Record<string, string | number | boolean>
  signal?: AbortSignal
}

export interface MailboxDriver {
  driver: string
  createInbox(ctx: MailboxDriverContext): Promise<Inbox>
  fetchMails(ctx: MailboxDriverContext, inbox: Inbox): Promise<MailMessage[]>
  test(ctx: MailboxDriverContext): Promise<{ ok: boolean; message: string }>
  send?(ctx: MailboxDriverContext, mail: { to: string; subject: string; text: string }): Promise<void>
}
