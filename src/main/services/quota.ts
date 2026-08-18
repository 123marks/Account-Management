import type { Account, AccountQuota, Platform } from '@shared/types'
import { normalizeCursorSession } from '@shared/tokenImport'
import { isProfileBusy, readProfileCookies } from '../automation/browser'
import { getAccount, revealSecrets, updateAccount } from '../db/repositories/accounts'
import { applySessionToProfile, captureSessionFromProfile } from './sessionSync'

const QUOTA_PLATFORMS = new Set<Platform>(['cursor', 'openai', 'anthropic', 'windsurf', 'kiro'])

type Cookie = { name: string; value: string; domain: string }

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function cookieHeader(cookies: Cookie[], host: string): string {
  const key = host.replace(/^www\./, '')
  return cookies
    .filter((c) => (c.domain || '').includes(key))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function asRec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

async function requestJson(
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: string }
): Promise<unknown> {
  const res = await fetch(url, {
    method: init?.method || 'GET',
    headers: {
      accept: 'application/json',
      'user-agent': UA,
      ...headers
    },
    body: init?.body
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('接口返回的不是 JSON')
  }
}

async function firstJson(
  urls: string[],
  headers: Record<string, string>,
  init?: { method?: string; body?: string }
): Promise<unknown> {
  let last = '接口全部失败'
  for (const url of urls) {
    try {
      return await requestJson(url, headers, init)
    } catch (e) {
      last = (e as Error).message
    }
  }
  throw new Error(last)
}

function ok(plan: string, used: number | null, limit: number | null, unit: string, resetAt: number | null): AccountQuota {
  return { plan, used, limit, unit, resetAt, error: '', fetchedAt: Date.now() }
}

async function readCookiesSafe(profileDir: string): Promise<Cookie[]> {
  if (isProfileBusy(profileDir)) return []
  try {
    return (await readProfileCookies(profileDir)) as Cookie[]
  } catch {
    return []
  }
}

async function fetchCursor(cookies: Cookie[], sessionToken: string): Promise<AccountQuota> {
  const cur =
    normalizeCursorSession(sessionToken) ||
    normalizeCursorSession(
      cookies.find((c) => c.name === 'WorkosCursorSessionToken')?.value || ''
    )
  if (!cur) throw new Error('未登录 Cursor。请粘贴 WorkosCursorSessionToken / JWT，或点「官方授权」登录后再刷新')

  const header = {
    cookie: `WorkosCursorSessionToken=${cur.headerValue}`,
    origin: 'https://cursor.com',
    referer: 'https://cursor.com/dashboard?tab=usage'
  }

  const me = asRec(await requestJson('https://cursor.com/api/auth/me', header).catch(() => ({})))
  const stripe = asRec(
    await requestJson('https://cursor.com/api/auth/stripe', header).catch(() => ({}))
  )
  let used: number | null = null
  let limit: number | null = null
  let resetAt: number | null = null
  let plan = String(
    stripe.membershipType || stripe.subscriptionStatus || me.subscriptionStatus || 'Cursor'
  )
  let unit = '次'

  const summary = asRec(
    await requestJson('https://cursor.com/api/usage-summary', header).catch(() => ({}))
  )
  const individual = asRec(asRec(summary.individualUsage).plan)
  if (individual.used != null || individual.limit != null) {
    used = num(individual.used)
    limit = num(individual.limit)
    unit = '¢'
    if (summary.billingCycleEnd) resetAt = Date.parse(String(summary.billingCycleEnd))
    if (summary.membershipType) plan = String(summary.membershipType)
    if (summary.isUnlimited) limit = null
  }

  if (used == null || limit == null) {
    const user = encodeURIComponent(String(me.id || cur.userId))
    const usage = asRec(
      await requestJson(`https://cursor.com/api/usage?user=${user}`, header).catch(() => ({}))
    )
    const gpt4 = asRec(usage['gpt-4'] || usage.gpt4)
    used = used ?? num(gpt4.numRequests ?? usage.numRequests ?? usage.used)
    limit = limit ?? num(gpt4.maxRequestUsage ?? usage.maxRequestUsage ?? usage.limit)
    if (usage.startOfMonth) resetAt = resetAt ?? Date.parse(String(usage.startOfMonth))
  }

  if (used == null) {
    const period = asRec(
      await requestJson(
        'https://cursor.com/api/dashboard/get-current-period-usage',
        { ...header, 'content-type': 'application/json' },
        { method: 'POST', body: '{}' }
      ).catch(() =>
        requestJson(
          'https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage',
          {
            authorization: `Bearer ${cur.jwt}`,
            'connect-protocol-version': '1',
            'content-type': 'application/json',
            origin: 'https://cursor.com'
          },
          { method: 'POST', body: '{}' }
        ).catch(() => ({}))
      )
    )
    used = used ?? num(period.planUsage ?? period.autoPercentUsed ?? period.used)
    limit = limit ?? num(period.limit ?? (period.autoPercentUsed != null ? 100 : null))
    if (period.autoPercentUsed != null) unit = '%'
  }

  if (!plan) plan = 'Cursor'
  return ok(plan, used, limit, unit, resetAt)
}

async function fetchOpenAI(cookies: Cookie[], sessionToken: string): Promise<AccountQuota> {
  let header = cookieHeader(cookies, 'chatgpt.com') || cookieHeader(cookies, 'openai.com')
  if (!header && sessionToken) {
    header = `__Secure-next-auth.session-token=${sessionToken}`
  }
  if (!header) throw new Error('未登录 ChatGPT。请粘贴 Session Cookie，或点「官方授权」登录后再刷新额度')

  const data = asRec(
    await firstJson(
      [
        'https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27',
        'https://chatgpt.com/backend-api/accounts/check',
        'https://chatgpt.com/backend-api/subscriptions'
      ],
      { cookie: header, origin: 'https://chatgpt.com', referer: 'https://chatgpt.com/' }
    )
  )
  const accounts = asRec(data.accounts || data)
  const def = asRec(accounts.default || Object.values(accounts)[0])
  const ent = asRec(def.entitlement || def.plan || data)
  const plan = String(
    ent.subscription_plan ||
      ent.plan_type ||
      data.plan_type ||
      data.subscription_plan ||
      (ent.has_plus || data.has_plus ? 'Plus' : 'Free')
  )
  return ok(
    plan,
    num(ent.used ?? def.used ?? data.used),
    num(ent.limit ?? def.limit ?? data.limit),
    '',
    ent.expires_at || data.expires_at ? Date.parse(String(ent.expires_at || data.expires_at)) : null
  )
}

async function fetchAnthropic(cookies: Cookie[], sessionKey: string, orgId: string): Promise<AccountQuota> {
  const key =
    sessionKey ||
    cookies.find((c) => c.name === 'sessionKey')?.value ||
    ''
  if (!key.startsWith('sk-ant-')) {
    throw new Error('未登录 Claude。请粘贴 sessionKey（sk-ant-sid…），或点「官方授权」登录后再刷新')
  }
  const orgCookie = orgId || cookies.find((c) => c.name === 'lastActiveOrg')?.value || ''
  const cookie = [
    `sessionKey=${key}`,
    orgCookie ? `lastActiveOrg=${orgCookie}` : '',
    cookieHeader(cookies, 'claude.ai')
  ]
    .filter(Boolean)
    .join('; ')
  const headers = {
    cookie,
    origin: 'https://claude.ai',
    referer: 'https://claude.ai/'
  }
  let org = orgCookie
  if (!org) {
    const orgs = await requestJson('https://claude.ai/api/organizations', headers)
    const list = Array.isArray(orgs) ? orgs : ((asRec(orgs).organizations || asRec(orgs).data) as unknown[])
    const first = asRec(Array.isArray(list) ? list[0] : list)
    org = String(first.uuid || first.id || first.organization_uuid || '')
  }
  if (!org) throw new Error('Claude 已登录，但读不到组织 ID。把 lastActiveOrg 一并粘贴进 JSON')

  const usage = asRec(await requestJson(`https://claude.ai/api/organizations/${org}/usage`, headers))
  const five = asRec(usage.five_hour)
  const week = asRec(usage.seven_day)
  const used = num(five.utilization)
  const reset = five.resets_at || week.resets_at
  return ok(
    week.utilization != null ? `5h ${used ?? 0}% · 7d ${num(week.utilization)}%` : 'Claude',
    used,
    used != null ? 100 : null,
    '%',
    reset ? Date.parse(String(reset)) : null
  )
}

async function fetchWindsurf(cookies: Cookie[], apiKey: string): Promise<AccountQuota> {
  const key = apiKey.startsWith('sk-ws-') ? apiKey : ''
  if (key) {
    const body = JSON.stringify({
      metadata: {
        apiKey: key,
        ideName: 'windsurf',
        ideVersion: '0.0.0',
        extensionName: 'windsurf',
        extensionVersion: '0.0.0',
        locale: 'en'
      }
    })
    const data = asRec(
      await requestJson(
        'https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus',
        {
          'content-type': 'application/json',
          'connect-protocol-version': '1'
        },
        { method: 'POST', body }
      )
    )
    const planStatus = asRec(asRec(asRec(data.userStatus).planStatus))
    const info = asRec(planStatus.planInfo)
    const usedRaw = num(planStatus.usedPromptCredits)
    const avail = num(planStatus.availablePromptCredits)
    const used = usedRaw != null ? usedRaw / 100 : null
    const limit = avail != null && avail >= 0 ? avail / 100 : null
    return ok(
      String(info.planName || 'Windsurf'),
      used,
      limit,
      'credit',
      planStatus.planEnd ? Date.parse(String(planStatus.planEnd)) : null
    )
  }

  const header = cookieHeader(cookies, 'windsurf.com') || cookieHeader(cookies, 'codeium.com')
  if (!header) {
    throw new Error('没有 Windsurf API Key。请粘贴 sk-ws-01-…，或点「官方授权」登录后再刷新')
  }
  const session = asRec(
    await requestJson('https://windsurf.com/api/auth/session', {
      cookie: header,
      origin: 'https://windsurf.com',
      referer: 'https://windsurf.com/'
    })
  )
  const user = asRec(session.user)
  return ok(String(user.plan || session.plan || 'Windsurf · 已登录'), null, null, '', null)
}

function parseKiroUsage(usage: Record<string, unknown>): AccountQuota {
  const list = (Array.isArray(usage.usageBreakdownList) ? usage.usageBreakdownList : []) as Record<
    string,
    unknown
  >[]
  const credit = asRec(list.find((b) => String(b.resourceType) === 'CREDIT') || list[0])
  let used = num(credit.currentUsageWithPrecision ?? credit.currentUsage) ?? 0
  let limit = num(credit.usageLimitWithPrecision ?? credit.usageLimit) ?? 0
  const ft = asRec(credit.freeTrialInfo)
  if (String(ft.freeTrialStatus || ft.status) === 'ACTIVE') {
    used += num(ft.currentUsageWithPrecision ?? ft.currentUsage) ?? 0
    limit += num(ft.usageLimitWithPrecision ?? ft.usageLimit) ?? 0
  }
  const bonuses = (Array.isArray(credit.bonuses) ? credit.bonuses : []) as Record<string, unknown>[]
  for (const b of bonuses) {
    if (String(b.status) !== 'ACTIVE') continue
    used += num(b.currentUsageWithPrecision ?? b.currentUsage ?? b.current) ?? 0
    limit += num(b.usageLimitWithPrecision ?? b.usageLimit ?? b.limit) ?? 0
  }
  const sub = asRec(usage.subscriptionInfo)
  const plan = String(sub.subscriptionTitle || sub.type || usage.subscriptionType || 'Kiro')
  let resetAt: number | null = null
  if (usage.nextDateReset != null) {
    const n = Number(usage.nextDateReset)
    if (Number.isFinite(n) && n > 1e12) resetAt = n
    else if (Number.isFinite(n) && n > 1e9) resetAt = n * 1000
    else resetAt = Date.parse(String(usage.nextDateReset))
    if (!Number.isFinite(resetAt)) resetAt = null
  }
  return ok(plan, used, limit || null, 'credit', resetAt)
}

async function fetchKiro(accountId: string): Promise<AccountQuota> {
  const acc = getAccount(accountId)
  if (!acc) throw new Error('账号不存在')
  const secrets = revealSecrets(accountId)
  const refreshToken = secrets.refreshToken
  if (!refreshToken) throw new Error('没有 Kiro Token。请粘贴 JSON / refreshToken，或点「官方授权」登录后再刷新')
  const clientId = acc.customFields.clientId || acc.mailboxClientId
  const clientSecret = acc.customFields.clientSecret
  const body: Record<string, string> = { grantType: 'refresh_token', refreshToken }
  if (clientId) body.clientId = clientId
  if (clientSecret) body.clientSecret = clientSecret
  const res = await fetch('https://oidc.us-east-1.amazonaws.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'KiroIDE/0.12.155',
      'x-amz-user-agent': 'KiroIDE/0.12.155'
    },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Kiro Token 刷新失败 HTTP ${res.status}`)
  const data = asRec(JSON.parse(text))
  const access = String(data.accessToken || data.access_token || '')
  const nextRefresh = String(data.refreshToken || data.refresh_token || '')
  if (nextRefresh && nextRefresh !== refreshToken) {
    updateAccount(accountId, { refreshToken: nextRefresh })
  }
  if (!access) throw new Error('Kiro 未返回 accessToken')

  const auth = {
    authorization: `Bearer ${access}`,
    'x-amz-user-agent': 'KiroIDE/0.12.155'
  }
  try {
    const usage = asRec(
      await firstJson(
        [
          'https://q.us-east-1.amazonaws.com/getUsageLimits',
          'https://q.eu-central-1.amazonaws.com/getUsageLimits'
        ],
        auth
      )
    )
    return parseKiroUsage(usage)
  } catch {
    const exp = num(data.expiresIn)
    return ok('Kiro · Token 有效', null, null, '', exp ? Date.now() + exp * 1000 : null)
  }
}

export function supportsQuota(platform: Platform): boolean {
  return QUOTA_PLATFORMS.has(platform)
}

export async function refreshAccountQuota(accountId: string): Promise<Account> {
  const acc = getAccount(accountId)
  if (!acc) throw new Error('账号不存在')
  if (!supportsQuota(acc.platform)) throw new Error(`${acc.platform} 没有可查询的订阅额度`)

  const locked = isProfileBusy(getAccount(accountId)!.profileDir)
  if (!locked) {
    await captureSessionFromProfile(accountId).catch(() => null)
    await applySessionToProfile(accountId).catch(() => undefined)
  }

  const latest = getAccount(accountId)!
  const secrets = revealSecrets(accountId)
  const session =
    latest.customFields.sessionToken ||
    latest.customFields.sessionKey ||
    latest.customFields.apiKey ||
    secrets.refreshToken ||
    ''
  if (locked && !session && latest.platform !== 'kiro') {
    throw new Error('请先关掉该账号的浏览器窗口，再点刷新额度（才能抓登录会话）')
  }

  let quota: AccountQuota
  try {
    if (latest.platform === 'kiro') {
      quota = await fetchKiro(accountId)
    } else {
      const cookies = await readCookiesSafe(latest.profileDir)
      if (latest.platform === 'cursor') quota = await fetchCursor(cookies, session)
      else if (latest.platform === 'openai') quota = await fetchOpenAI(cookies, session)
      else if (latest.platform === 'anthropic') {
        quota = await fetchAnthropic(cookies, session, latest.customFields.lastActiveOrg || '')
      } else if (latest.platform === 'windsurf') quota = await fetchWindsurf(cookies, session)
      else throw new Error(`${latest.platform} 额度接口尚未对接`)
    }
  } catch (e) {
    quota = {
      plan: latest.quota?.plan || '',
      used: latest.quota?.used ?? null,
      limit: latest.quota?.limit ?? null,
      unit: latest.quota?.unit || '',
      resetAt: latest.quota?.resetAt ?? null,
      error: (e as Error).message,
      fetchedAt: Date.now()
    }
  }
  return updateAccount(accountId, { quota })
}

export async function refreshAccountQuotas(ids: string[]): Promise<Account[]> {
  const out: Account[] = []
  for (const id of ids) out.push(await refreshAccountQuota(id))
  return out
}
