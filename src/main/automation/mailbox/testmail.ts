import { randomBytes } from 'node:crypto'
import type { MailboxDriver } from './types'

export const testmailDriver: MailboxDriver = {
  driver: 'testmail',
  async createInbox(ctx) {
    const namespace = String(ctx.config.namespace || '').trim()
    const apiKey = String(ctx.config.apiKey || '').trim()
    if (!namespace || !apiKey) throw new Error('testmail 需要配置 API Key 与 namespace')
    const prefix = String(ctx.config.tagPrefix || '')
      .trim()
      .replace(/^\.+|\.+$/g, '')
    const suffix = randomBytes(6).toString('hex')
    const tag = prefix ? `${prefix}.${suffix}` : suffix
    return { driver: 'testmail', email: `${namespace}.${tag}@inbox.testmail.app`, token: tag }
  },
  async fetchMails(ctx, inbox) {
    const apiKey = String(ctx.config.apiKey || '').trim()
    const namespace = String(ctx.config.namespace || '').trim()
    if (!apiKey || !namespace) throw new Error('testmail 配置缺失（API Key / namespace）')
    const url = `https://api.testmail.app/api/json?apikey=${encodeURIComponent(apiKey)}&namespace=${encodeURIComponent(namespace)}&tag=${encodeURIComponent(inbox.token)}&limit=20`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as { result?: string; message?: string; emails?: Array<Record<string, unknown>> }
    if (data.result === 'fail') throw new Error(`testmail 查询失败：${data.message ?? '未知错误'}`)
    return (data.emails ?? []).map((m, i) => ({
      id: String(m.id ?? m.oid ?? i),
      subject: String(m.subject ?? ''),
      from: String(m.from ?? ''),
      text: String(m.text ?? m.html ?? ''),
      html: String(m.html ?? ''),
      receivedAt: Number(m.timestamp ?? Date.now())
    }))
  },
  async test(ctx) {
    const apiKey = String(ctx.config.apiKey || '').trim()
    const namespace = String(ctx.config.namespace || '').trim()
    if (!apiKey || !namespace) return { ok: false, message: '需配置 API Key 与 namespace' }
    const res = await fetch(
      `https://api.testmail.app/api/json?apikey=${encodeURIComponent(apiKey)}&namespace=${encodeURIComponent(namespace)}&limit=1`
    )
    const data = (await res.json()) as { result?: string; message?: string }
    if (data.result === 'fail') return { ok: false, message: `testmail 校验失败：${data.message ?? '未知错误'}` }
    return { ok: true, message: `testmail 连接正常（namespace: ${namespace}）` }
  }
}
