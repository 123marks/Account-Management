import { consumeStock, parsePickupLine, splitStockLines, type PickupItem } from './stock'
import type { Inbox, MailboxDriver, MailMessage } from './types'

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

function candidateUrls(item: PickupItem): string[] {
  const out: string[] = []
  const clean = item.url.split('#')[0]
  try {
    const q = new URL(clean)
    if (item.email && !q.searchParams.get('email')) q.searchParams.set('email', item.email)
    if (item.key && !q.searchParams.get('key')) q.searchParams.set('key', item.key)
    out.push(q.toString())
    out.push(clean)
    const origin = q.origin
    const qs = `email=${encodeURIComponent(item.email)}&key=${encodeURIComponent(item.key)}`
    if (item.key) {
      out.push(`${origin}/api/mail?${qs}`)
      out.push(`${origin}/api/messages?${qs}`)
      out.push(`${origin}/api/icloud/mail?${qs}`)
      out.push(`${origin}/icloud/mail?${qs}`)
    }
  } catch {
    if (clean) out.push(clean)
  }
  return [...new Set(out.filter(Boolean))]
}

function toMessages(email: string, body: unknown, rawText: string): MailMessage[] {
  const rec = asRecord(body)
  let list: unknown = body
  if (rec) {
    for (const k of ['messages', 'mails', 'mail', 'items', 'results', 'data', 'content', 'list']) {
      if (Array.isArray(rec[k])) {
        list = rec[k]
        break
      }
    }
    if (!Array.isArray(list) && rec.data != null) list = rec.data
  }
  if (Array.isArray(list)) {
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
      const text = String(m.text ?? m.body ?? m.content ?? m.html ?? m.preview ?? m.code ?? '')
      return {
        id: String(m.id ?? m.message_id ?? i),
        subject: String(m.subject ?? ''),
        from: String(m.from ?? m.sender ?? ''),
        to: String(m.to ?? email),
        text,
        html: String(m.html ?? ''),
        receivedAt: Number(m.date ?? m.timestamp ?? Date.now())
      }
    })
  }
  if (rec) {
    const text = String(rec.text ?? rec.body ?? rec.content ?? rec.html ?? rec.message ?? rec.code ?? '')
    if (text.trim()) {
      return [
        {
          id: String(rec.id ?? '0'),
          subject: String(rec.subject ?? ''),
          from: String(rec.from ?? ''),
          to: email,
          text,
          html: String(rec.html ?? ''),
          receivedAt: Date.now()
        }
      ]
    }
  }
  const plain = stripHtml(rawText)
  if (!plain) return []
  return [
    {
      id: 'html',
      subject: '',
      from: '',
      to: email,
      text: plain,
      html: rawText,
      receivedAt: Date.now()
    }
  ]
}

async function fetchPickup(item: PickupItem): Promise<MailMessage[]> {
  const headers = {
    accept: 'application/json, text/html;q=0.8, */*;q=0.5',
    'cache-control': 'no-cache'
  }
  for (const url of candidateUrls(item)) {
    try {
      const res = await fetch(url, { headers })
      if (!res.ok) continue
      const raw = await res.text()
      if (!raw.trim()) continue
      let parsed: unknown = raw
      try {
        parsed = JSON.parse(raw)
      } catch {
        parsed = raw
      }
      const mails = toMessages(item.email, parsed, raw)
      if (mails.length > 0) return mails
    } catch {
      /* try next candidate */
    }
  }
  return []
}

function decodeToken(token: string): PickupItem | null {
  try {
    const v = JSON.parse(token) as PickupItem
    if (v?.email && v?.url) return v
  } catch {
    /* ignore */
  }
  return parsePickupLine(token)
}

export const pickupDriver: MailboxDriver = {
  driver: 'mail_pickup',
  async createInbox(ctx) {
    const item = consumeStock(ctx, parsePickupLine, '取件链接库存为空。请粘贴 email----url 或 email---token---url')
    return {
      driver: 'mail_pickup',
      email: item.email,
      token: JSON.stringify({ email: item.email, url: item.url, key: item.key })
    }
  },
  async fetchMails(_ctx, inbox) {
    const item = decodeToken(inbox.token)
    if (!item) return []
    return fetchPickup(item)
  },
  async test(ctx) {
    const lines = splitStockLines(String(ctx.config.stock || ''))
    const first = lines[0] ? parsePickupLine(lines[0]) : null
    if (!first) return { ok: false, message: '请粘贴至少一行取件链接（不会消耗库存）' }
    try {
      const mails = await fetchPickup(first)
      return {
        ok: true,
        message: `已识别 ${first.email}，当前可读到 ${mails.length} 封（测试不扣库存，剩余 ${lines.length}）`
      }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }
}
