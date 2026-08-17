import { fillTemplate, pick, pickString } from '../../utils/jsonPath'
import type { MailboxDriver, MailMessage } from './types'

export const genericHttpDriver: MailboxDriver = {
  driver: 'generic_http',
  async createInbox(ctx) {
    const method = String(ctx.config.createMethod || 'POST').toUpperCase()
    const url = fillTemplate(String(ctx.config.createUrl || ''), {
      token: String(ctx.config.token || '')
    })
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    const bearer = String(ctx.config.token || '')
    if (bearer) headers.authorization = `Bearer ${bearer}`
    const res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : '{}' })
    const json = (await res.json()) as unknown
    const email = pickString(json, String(ctx.config.emailPath || 'data.address'))
    const token = pickString(json, String(ctx.config.tokenPath || 'data.token')) || email
    if (!email) throw new Error('通用 HTTP 邮箱未返回地址，请检查 emailPath')
    return { driver: 'generic_http', email, token }
  },
  async fetchMails(ctx, inbox) {
    const url = fillTemplate(String(ctx.config.listUrl || ''), {
      email: inbox.email,
      token: inbox.token
    })
    const headers: Record<string, string> = {}
    const bearer = String(ctx.config.token || '')
    if (bearer) headers.authorization = `Bearer ${bearer}`
    const res = await fetch(url, { headers })
    if (!res.ok) return []
    const json = (await res.json()) as unknown
    const arr = pick(json, String(ctx.config.listPath || 'emails'))
    const list = Array.isArray(arr) ? arr : []
    return list.map((m, i) => {
      const rec = m as Record<string, unknown>
      return {
        id: String(rec.id ?? rec.message_id ?? i),
        subject: String(rec.subject ?? ''),
        from: String(rec.from ?? ''),
        text: String(rec.body ?? rec.text ?? rec.html ?? ''),
        html: String(rec.html ?? ''),
        receivedAt: Number(rec.date ?? rec.timestamp ?? Date.now())
      } satisfies MailMessage
    })
  },
  async test(ctx) {
    const inbox = await this.createInbox(ctx)
    return { ok: true, message: `已创建邮箱：${inbox.email}` }
  }
}
