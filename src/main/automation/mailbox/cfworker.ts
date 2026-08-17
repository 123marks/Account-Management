import type { MailboxDriver } from './types'

export const cfworkerDriver: MailboxDriver = {
  driver: 'cfworker',
  async createInbox(ctx) {
    const apiUrl = String(ctx.config.apiUrl || '').replace(/\/+$/, '')
    const token = String(ctx.config.adminToken || '')
    if (!apiUrl) throw new Error('未配置 Cloudflare Worker API 地址')
    const res = await fetch(`${apiUrl}/api/inbox`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ domain: ctx.config.domain || undefined })
    })
    if (!res.ok) throw new Error(`创建邮箱失败：HTTP ${res.status}`)
    const data = (await res.json()) as { address?: string; email?: string }
    const email = data.address || data.email || ''
    if (!email) throw new Error('Worker 未返回邮箱地址')
    return { driver: 'cfworker', email, token: email }
  },
  async fetchMails(ctx, inbox) {
    const apiUrl = String(ctx.config.apiUrl || '').replace(/\/+$/, '')
    const token = String(ctx.config.adminToken || '')
    const res = await fetch(`${apiUrl}/api/inbox/${encodeURIComponent(inbox.email)}/messages`, {
      headers: token ? { authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) return []
    const data = (await res.json()) as { messages?: Array<Record<string, unknown>> }
    return (data.messages ?? []).map((m, i) => ({
      id: String(m.id ?? i),
      subject: String(m.subject ?? ''),
      from: String(m.from ?? ''),
      text: String(m.text ?? m.body ?? m.html ?? ''),
      html: String(m.html ?? ''),
      receivedAt: Number(m.date ?? Date.now())
    }))
  },
  async test(ctx) {
    const inbox = await this.createInbox(ctx)
    return { ok: true, message: `已创建邮箱：${inbox.email}` }
  }
}
