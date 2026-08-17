import type { Inbox, MailboxDriver, MailboxDriverContext, MailMessage } from './types'

interface HmeSession {
  cookie: string
  csrf: string
  expiresAt: number
}

const sessions = new Map<string, HmeSession>()

function baseOf(ctx: MailboxDriverContext): string {
  return String(ctx.config.apiUrl || 'http://127.0.0.1:8081').replace(/\/+$/, '')
}

function cookieFrom(res: Response): string {
  const list =
    typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  if (list.length) return list.map((c) => c.split(';')[0]).filter(Boolean).join('; ')
  const one = res.headers.get('set-cookie')
  return one ? one.split(';')[0] : ''
}

async function login(ctx: MailboxDriverContext): Promise<HmeSession> {
  const base = baseOf(ctx)
  const password = String(ctx.config.adminPassword || '').trim()
  if (!password) throw new Error('未填写 icloud-hme 管理员密码')
  const key = `${base}|${password}`
  const hit = sessions.get(key)
  if (hit && hit.expiresAt > Date.now() + 30_000) return hit

  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password })
  })
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean
    message?: string
    data?: { csrf_token?: string }
  }
  if (!res.ok || !json.success) {
    throw new Error(json.message || `icloud-hme 登录失败（HTTP ${res.status}）`)
  }
  const cookie = cookieFrom(res)
  const csrf = json.data?.csrf_token || ''
  if (!cookie || !csrf) throw new Error('icloud-hme 未返回会话，请确认服务已启动且密码正确')
  const sess = { cookie, csrf, expiresAt: Date.now() + 10 * 60 * 60 * 1000 }
  sessions.set(key, sess)
  return sess
}

async function api<T>(
  ctx: MailboxDriverContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const sess = await login(ctx)
  const method = (init.method || 'GET').toUpperCase()
  const headers: Record<string, string> = {
    cookie: sess.cookie,
    ...(init.headers as Record<string, string> | undefined)
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers['content-type'] = headers['content-type'] || 'application/json'
    headers['x-csrf-token'] = sess.csrf
  }
  const res = await fetch(`${baseOf(ctx)}${path}`, { ...init, headers })
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean
    message?: string
    code?: string
    data?: T
  }
  if (res.status === 401 || json.code === 'AUTH_REQUIRED') {
    sessions.delete(`${baseOf(ctx)}|${String(ctx.config.adminPassword || '').trim()}`)
    throw new Error('icloud-hme 会话失效，请重试或检查管理员密码')
  }
  if (!res.ok || json.success === false) {
    throw new Error(json.message || `icloud-hme ${path} 失败（HTTP ${res.status}）`)
  }
  return (json.data ?? json) as T
}

async function resolveAccountId(ctx: MailboxDriverContext): Promise<string> {
  const configured = String(ctx.config.accountId || '').trim()
  if (configured) return configured
  const list = await api<Array<{ id: string; status?: string; has_cookies?: boolean; has_app_password?: boolean }>>(
    ctx,
    '/api/accounts'
  )
  const rows = Array.isArray(list) ? list : []
  const ready =
    rows.find((a) => a.status === 'active' && (a.has_cookies || a.has_app_password)) ??
    rows.find((a) => a.status === 'active') ??
    rows[0]
  if (!ready?.id) throw new Error('icloud-hme 没有可用账号。请先在 8081 管理页添加 iCloud 并登录/填 App 专用密码')
  return ready.id
}

export const icloudHmeDriver: MailboxDriver = {
  driver: 'icloud_hme',
  async createInbox(ctx) {
    const accountId = await resolveAccountId(ctx)
    const created = await api<{ email?: string }>(ctx, '/api/create', {
      method: 'POST',
      body: JSON.stringify({ account_id: accountId, label: `AAM ${new Date().toISOString()}` })
    })
    const email = String(created.email || '')
    if (!email.includes('@')) throw new Error('icloud-hme 未返回 Hide My Email 地址')
    return { driver: 'icloud_hme', email, token: `${accountId}|${email}` }
  },
  async fetchMails(ctx, inbox) {
    const [accountId, alias] = inbox.token.includes('|')
      ? inbox.token.split('|')
      : [inbox.token, inbox.email]
    const q = new URLSearchParams({
      account_id: accountId,
      alias: alias || inbox.email,
      limit: '20',
      days: '2'
    })
    const data = await api<{
      messages?: Array<Record<string, unknown>>
    }>(ctx, `/api/inbox?${q.toString()}`)
    return (data.messages ?? []).map((m, i) => ({
      id: String(m.id ?? i),
      subject: String(m.subject ?? ''),
      from: String(m.from ?? ''),
      to: String(m.to ?? (alias || inbox.email)),
      text: String(m.preview ?? m.text ?? m.body ?? m.html ?? ''),
      html: String(m.html ?? ''),
      receivedAt: m.date ? Date.parse(String(m.date)) || Date.now() : Date.now()
    }))
  },
  async test(ctx) {
    try {
      const accounts = await api<Array<{ id: string; name?: string; status?: string }>>(ctx, '/api/accounts')
      const n = Array.isArray(accounts) ? accounts.length : 0
      return { ok: true, message: `icloud-hme 已连接，账号 ${n} 个` }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  }
}
