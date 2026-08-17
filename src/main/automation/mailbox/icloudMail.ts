import type { Inbox, MailboxDriver, MailboxDriverContext, MailMessage } from './types'

function baseOf(ctx: MailboxDriverContext): string {
  const raw = String(ctx.config.apiBase || 'https://mail.no-replyca.xyz').trim()
  return raw
    .replace(/\/+$/, '')
    .replace(/\/api\/user\/(email|mail)$/i, '')
}

function keyOf(ctx: MailboxDriverContext): string {
  const key = String(ctx.config.apiKey || '').trim()
  if (!key) throw new Error('未填写 iCloud Mail API Key')
  return key
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function unwrap(data: unknown): unknown {
  const rec = asRecord(data)
  if (rec && 'data' in rec) return rec.data
  return data
}

export const icloudMailDriver: MailboxDriver = {
  driver: 'icloud_mail',
  async createInbox(ctx) {
    const kind = String(ctx.config.mailType || 'icloud').trim().toLowerCase()
    if (kind !== 'icloud' && kind !== 'icloud-code') {
      throw new Error('mailType 只能是 icloud 或 icloud-code')
    }
    const params = new URLSearchParams({ type: kind, apikey: keyOf(ctx) })
    if (kind === 'icloud-code') {
      params.set('service', String(ctx.config.service || 'github'))
    }
    const res = await fetch(`${baseOf(ctx)}/api/user/email?${params.toString()}`)
    const json = (await res.json().catch(() => ({}))) as unknown
    if (!res.ok) {
      const rec = asRecord(json)
      throw new Error(String(rec?.message || rec?.error || `申请 iCloud 邮箱失败（HTTP ${res.status}）`))
    }
    const body = asRecord(unwrap(json))
    const email = String(body?.email || body?.address || '')
    if (!email.includes('@')) throw new Error(`iCloud Mail 未返回地址：${JSON.stringify(json).slice(0, 160)}`)
    return { driver: 'icloud_mail', email, token: email }
  },
  async fetchMails(ctx, inbox) {
    const email = inbox.email || inbox.token
    if (!email.includes('@')) return []
    const params = new URLSearchParams({ email, apikey: keyOf(ctx) })
    const res = await fetch(`${baseOf(ctx)}/api/user/mail?${params.toString()}`, {
      headers: { 'cache-control': 'no-cache' }
    })
    if (!res.ok) return []
    const json = (await res.json().catch(() => ({}))) as unknown
    const rec = asRecord(json)
    if (rec && rec.code === 0 && rec.data == null) return []
    let body: unknown = unwrap(json)
    const inner = asRecord(body)
    if (inner) {
      for (const k of ['messages', 'mails', 'mail', 'items', 'results', 'content']) {
        if (Array.isArray(inner[k])) {
          body = inner[k]
          break
        }
      }
    }
    const list = Array.isArray(body) ? body : inner ? [inner] : []
    return list.map((item, i) => {
      if (typeof item === 'string') {
        return {
          id: String(i),
          subject: '',
          from: '',
          to: email,
          text: item,
          html: '',
          receivedAt: Date.now()
        }
      }
      const m = asRecord(item) ?? {}
      return {
        id: String(m.id ?? m.message_id ?? i),
        subject: String(m.subject ?? ''),
        from: String(m.from ?? m.sender ?? ''),
        to: String(m.to ?? email),
        text: String(m.text ?? m.body ?? m.content ?? m.html ?? m.preview ?? ''),
        html: String(m.html ?? ''),
        receivedAt: Number(m.date ?? m.timestamp ?? Date.now())
      }
    })
  },
  async test(ctx) {
    try {
      const inbox = await this.createInbox(ctx)
      return { ok: true, message: `已申请 iCloud 地址：${inbox.email}` }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }
}
