import type { Account, AccountQuota, Platform } from '@shared/types'
import { getAccount, updateAccount } from '../db/repositories/accounts'
import { readProfileCookies } from '../automation/browser'

const QUOTA_PLATFORMS = new Set<Platform>(['cursor', 'openai', 'anthropic', 'windsurf'])

type Cookie = { name: string; value: string; domain: string }

function cookieHeader(cookies: Cookie[], host: string): string {
  const key = host.replace(/^www\./, '')
  return cookies
    .filter((c) => (c.domain || '').includes(key))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
}

function hasName(header: string, name: string): boolean {
  return new RegExp(`(?:^|;\\s*)${name}=`, 'i').test(header)
}

async function getJson(url: string, cookie: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      cookie,
      accept: 'application/json',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    }
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('接口返回的不是 JSON')
  }
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function fetchCursor(cookies: Cookie[]): Promise<AccountQuota> {
  const cookie = cookieHeader(cookies, 'cursor.com')
  if (!hasName(cookie, 'WorkosCursorSessionToken')) {
    throw new Error('未登录 Cursor。请先点「打开浏览器」登录后再刷新额度')
  }
  const me = (await getJson('https://www.cursor.com/api/auth/me', cookie).catch(() => ({}))) as Record<
    string,
    unknown
  >
  const usage = (await getJson('https://www.cursor.com/api/usage', cookie)) as Record<string, unknown>
  const stripe = (await getJson('https://www.cursor.com/api/auth/stripe', cookie).catch(() => ({}))) as Record<
    string,
    unknown
  >
  const plan = String(stripe.membershipType || stripe.subscriptionStatus || me.subscriptionStatus || 'Cursor')
  const gpt4 = (usage['gpt-4'] || usage.gpt4 || {}) as Record<string, unknown>
  const used = num(gpt4.numRequests ?? usage.numRequests ?? usage.used)
  const limit = num(gpt4.maxRequestUsage ?? usage.maxRequestUsage ?? usage.limit)
  const resetAt = usage.startOfMonth ? Date.parse(String(usage.startOfMonth)) : null
  return {
    plan,
    used,
    limit,
    unit: '次',
    resetAt: Number.isFinite(resetAt) ? resetAt : null,
    error: '',
    fetchedAt: Date.now()
  }
}

async function fetchOpenAI(cookies: Cookie[]): Promise<AccountQuota> {
  const cookie = cookieHeader(cookies, 'chatgpt.com') || cookieHeader(cookies, 'openai.com')
  if (!cookie) throw new Error('未登录 ChatGPT。请先点「打开浏览器」登录后再刷新额度')
  const data = (await getJson(
    'https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27',
    cookie
  ).catch(() => getJson('https://chatgpt.com/backend-api/accounts/check', cookie))) as Record<
    string,
    unknown
  >
  const accounts = (data.accounts || data) as Record<string, unknown>
  const def = (accounts.default || Object.values(accounts)[0] || {}) as Record<string, unknown>
  const ent = (def.entitlement || def.plan || {}) as Record<string, unknown>
  const plan = String(ent.subscription_plan || ent.plan_type || (ent.has_plus ? 'Plus' : 'Free'))
  return {
    plan,
    used: num(ent.used ?? def.used),
    limit: num(ent.limit ?? def.limit),
    unit: '',
    resetAt: ent.expires_at ? Date.parse(String(ent.expires_at)) : null,
    error: '',
    fetchedAt: Date.now()
  }
}

async function fetchGeneric(platform: Platform, cookies: Cookie[]): Promise<AccountQuota> {
  if (platform === 'cursor') return fetchCursor(cookies)
  if (platform === 'openai') return fetchOpenAI(cookies)
  throw new Error(`${platform} 额度接口尚未对接。请先打开浏览器登录，后续版本会补齐`)
}

export function supportsQuota(platform: Platform): boolean {
  return QUOTA_PLATFORMS.has(platform)
}

export async function refreshAccountQuota(accountId: string): Promise<Account> {
  const acc = getAccount(accountId)
  if (!acc) throw new Error('账号不存在')
  if (!supportsQuota(acc.platform)) {
    throw new Error(`${acc.platform} 没有可查询的订阅额度`)
  }
  let quota: AccountQuota
  try {
    const cookies = (await readProfileCookies(acc.profileDir)) as Cookie[]
    quota = await fetchGeneric(acc.platform, cookies)
  } catch (e) {
    quota = {
      plan: acc.quota?.plan || '',
      used: acc.quota?.used ?? null,
      limit: acc.quota?.limit ?? null,
      unit: acc.quota?.unit || '',
      resetAt: acc.quota?.resetAt ?? null,
      error: (e as Error).message,
      fetchedAt: Date.now()
    }
  }
  return updateAccount(accountId, { quota })
}

export async function refreshAccountQuotas(ids: string[]): Promise<Account[]> {
  const out: Account[] = []
  for (const id of ids) {
    out.push(await refreshAccountQuota(id))
  }
  return out
}
