import type { Inbox, MailboxDriver, MailMessage } from './types'

function base(config: Record<string, string | number | boolean>): string {
  return String(config.apiBase || 'https://api.tempmail.lol/v2').replace(/\/+$/, '')
}

export const tempmailDriver: MailboxDriver = {
  driver: 'tempmail_lol',
  async createInbox(ctx) {
    const res = await fetch(`${base(ctx.config)}/inbox/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    if (!res.ok) throw new Error(`创建临时邮箱失败：HTTP ${res.status}`)
    const data = (await res.json()) as { address?: string; email?: string; token?: string }
    const email = data.address || data.email || ''
    const token = data.token || ''
    if (!email || !token) throw new Error('邮箱接口未返回地址或令牌')
    return { driver: 'tempmail_lol', email, token }
  },
  async fetchMails(ctx, inbox) {
    const res = await fetch(`${base(ctx.config)}/inbox?token=${encodeURIComponent(inbox.token)}`)
    if (!res.ok) return []
    const data = (await res.json()) as { emails?: Array<Record<string, unknown>> }
    return (data.emails ?? []).map((m, i) => ({
      id: String(m.id ?? m.message_id ?? i),
      subject: String(m.subject ?? ''),
      from: String(m.from ?? ''),
      text: String(m.body ?? m.text ?? ''),
      html: String(m.html ?? ''),
      receivedAt: Number(m.date ?? m.timestamp ?? Date.now())
    })) satisfies MailMessage[]
  },
  async test(ctx) {
    const inbox = await this.createInbox(ctx)
    return { ok: true, message: `已生成临时邮箱：${inbox.email}` }
  }
}

export type { Inbox }
