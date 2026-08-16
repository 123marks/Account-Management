import { listProviders } from '../services/providers'
import { detectChrome } from './chrome'

export interface PwProxy {
  server: string
  username?: string
  password?: string
}

export interface ProxyProbe {
  ok: boolean
  ip?: string
  message: string
}

/**
 * Launch a headless Chrome through the proxy and read the exit IP, so the user
 * can confirm an account's proxy actually works before running automation.
 */
export async function probeProxy(proxy: PwProxy): Promise<ProxyProbe> {
  const { chromium } = await import('playwright-core')
  const chrome = detectChrome()
  const browser = await chromium.launch({
    headless: true,
    executablePath: chrome.path ?? undefined,
    channel: chrome.path ? undefined : 'chrome',
    proxy
  })
  try {
    const page = await browser.newPage()
    await page.goto('https://api.ipify.org?format=json', {
      timeout: 20000,
      waitUntil: 'domcontentloaded'
    })
    const body = (await page.textContent('body')) || '{}'
    const ip = (JSON.parse(body) as { ip?: string }).ip || ''
    if (!ip) return { ok: false, message: '代理连通，但未取得出口 IP' }
    return { ok: true, ip, message: `代理可用，出口 IP：${ip}` }
  } finally {
    await browser.close()
  }
}

/** Parse a proxy URL (http/https/socks5) into Playwright's proxy config. */
export function parseProxy(url: string | null | undefined): PwProxy | null {
  const raw = (url || '').trim()
  if (!raw) return null
  try {
    const withScheme = /:\/\//.test(raw) ? raw : `http://${raw}`
    const u = new URL(withScheme)
    if (!u.hostname) return null
    const proxy: PwProxy = { server: `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}` }
    if (u.username) proxy.username = decodeURIComponent(u.username)
    if (u.password) proxy.password = decodeURIComponent(u.password)
    return proxy
  } catch {
    return null
  }
}

/** The URL of the default (or first enabled) proxy provider, if configured. */
export function defaultProxyUrl(): string | null {
  const items = listProviders('proxy')
  const chosen = items.find((p) => p.isDefault && p.enabled) ?? items.find((p) => p.enabled)
  if (!chosen) return null
  const url = chosen.config.url ?? chosen.config.fetchUrl
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

export type ProxySource = 'account' | 'default' | 'none'

/** Resolve the effective proxy for a task: per-account override, else the default provider. */
export function resolveProxy(accountProxyUrl?: string | null): {
  proxy: PwProxy | null
  source: ProxySource
  raw: string | null
} {
  const acct = (accountProxyUrl || '').trim()
  if (acct) return { proxy: parseProxy(acct), source: 'account', raw: acct }
  const def = defaultProxyUrl()
  if (def) return { proxy: parseProxy(def), source: 'default', raw: def }
  return { proxy: null, source: 'none', raw: null }
}

/** Hide credentials in a proxy URL for logging. */
export function maskProxy(url: string): string {
  return url.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:****@')
}

/**
 * Chromium cannot authenticate SOCKS proxies (username/password). Such a proxy
 * fails at launch with a cryptic error, so we detect it up-front and surface
 * clear guidance instead.
 */
export function socksAuthUnsupported(url?: string | null): boolean {
  const raw = (url || '').trim()
  if (!raw) return false
  try {
    const u = new URL(/:\/\//.test(raw) ? raw : `http://${raw}`)
    return /^socks/i.test(u.protocol) && !!u.username
  } catch {
    return false
  }
}

export const SOCKS_AUTH_MESSAGE =
  'Chromium 不支持带账号密码的 SOCKS5 代理；请改用 HTTP(S) 代理，或使用无需鉴权的 SOCKS5。'
