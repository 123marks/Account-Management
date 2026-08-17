import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { encryptField, decryptField } from './crypto'
import type { ProviderSetting, ProviderSettingInput, ProviderTestResult } from '@shared/types'
import { getDriver, type ProviderType } from '@shared/providers'
import { parseProxy, socksAuthUnsupported, SOCKS_AUTH_MESSAGE } from '../automation/proxy'
import { detectChrome } from '../automation/chrome'
import { testMailboxDriver } from '../automation/mailbox'
import { testSmsDriver } from '../automation/sms'
import { countStockLines } from '../automation/mailbox/stock'

interface Row {
  id: string
  type: string
  driver: string
  name: string
  enabled: number
  is_default: number
  config_enc: string | null
  created_at: number
  updated_at: number
}

function parseConfig(enc: string | null): Record<string, string | number | boolean> {
  const raw = decryptField(enc)
  if (!raw) return {}
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function mapRow(r: Row): ProviderSetting {
  return {
    id: r.id,
    type: r.type as ProviderType,
    driver: r.driver,
    name: r.name,
    enabled: !!r.enabled,
    isDefault: !!r.is_default,
    config: parseConfig(r.config_enc),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function listProviders(type: ProviderType): ProviderSetting[] {
  const rows = getDb()
    .prepare('SELECT * FROM provider_settings WHERE type = ? ORDER BY is_default DESC, created_at ASC')
    .all(type) as Row[]
  return rows.map(mapRow)
}

/** The secret field keys for a given driver (from its field template). */
function secretKeys(type: ProviderType, driver: string): string[] {
  const d = getDriver(type, driver)
  return d ? d.fields.filter((f) => f.secret).map((f) => f.key) : []
}

/** Drop secret fields (API keys, proxy creds) so they are never sent to the renderer. */
export function maskSetting(s: ProviderSetting): ProviderSetting {
  const keys = secretKeys(s.type, s.driver)
  if (keys.length === 0) return s
  const config = { ...s.config }
  for (const k of keys) delete config[k]
  return { ...s, config }
}

/** Renderer-facing list with secrets stripped (the UI never needs the raw key). */
export function listProvidersMasked(type: ProviderType): ProviderSetting[] {
  return listProviders(type).map(maskSetting)
}

function getRow(id: string): Row | undefined {
  return getDb().prepare('SELECT * FROM provider_settings WHERE id = ?').get(id) as Row | undefined
}

export function getProvider(id: string): ProviderSetting | null {
  const r = getRow(id)
  return r ? mapRow(r) : null
}

function countOfType(type: ProviderType): number {
  const r = getDb()
    .prepare('SELECT COUNT(*) AS n FROM provider_settings WHERE type = ?')
    .get(type) as { n: number }
  return r?.n ?? 0
}

function clearDefault(type: ProviderType, exceptId?: string): void {
  getDb()
    .prepare('UPDATE provider_settings SET is_default = 0 WHERE type = ? AND id != ?')
    .run(type, exceptId ?? '')
}

export function saveProvider(input: ProviderSettingInput & { id?: string }): ProviderSetting {
  const now = Date.now()
  // Merge incoming config over the existing one, keeping stored secret values when
  // the renderer sends them blank (it only ever receives masked config).
  const cfg: Record<string, string | number | boolean> = { ...(input.config ?? {}) }
  const existingRow = input.id ? getRow(input.id) : undefined
  if (existingRow) {
    const existing = parseConfig(existingRow.config_enc)
    for (const k of secretKeys(input.type, input.driver)) {
      const v = cfg[k]
      if ((v === undefined || v === '') && existing[k] !== undefined) cfg[k] = existing[k]
    }
  }
  if (typeof cfg.stock === 'string') {
    cfg.poolRemaining = countStockLines(String(cfg.stock))
  }
  const configEnc = encryptField(JSON.stringify(cfg))

  if (input.id && getRow(input.id)) {
    const enabled = input.enabled !== false
    const makeDefault = input.isDefault === true
    getDb()
      .prepare(
        `UPDATE provider_settings SET driver=@driver, name=@name, enabled=@enabled,
           is_default=@is_default, config_enc=@config_enc, updated_at=@updated_at WHERE id=@id`
      )
      .run({
        id: input.id,
        driver: input.driver,
        name: input.name,
        enabled: enabled ? 1 : 0,
        is_default: makeDefault ? 1 : getRow(input.id)!.is_default,
        config_enc: configEnc,
        updated_at: now
      })
    if (makeDefault) clearDefault(input.type, input.id)
    return getProvider(input.id)!
  }

  const id = randomUUID()
  // First provider of a type becomes the default automatically.
  const isDefault = input.isDefault === true || countOfType(input.type) === 0
  getDb()
    .prepare(
      `INSERT INTO provider_settings (id, type, driver, name, enabled, is_default, config_enc, created_at, updated_at)
       VALUES (@id, @type, @driver, @name, @enabled, @is_default, @config_enc, @created_at, @updated_at)`
    )
    .run({
      id,
      type: input.type,
      driver: input.driver,
      name: input.name,
      enabled: input.enabled === false ? 0 : 1,
      is_default: isDefault ? 1 : 0,
      config_enc: configEnc,
      created_at: now,
      updated_at: now
    })
  if (isDefault) clearDefault(input.type, id)
  return getProvider(id)!
}

export function removeProvider(id: string): void {
  const row = getRow(id)
  getDb().prepare('DELETE FROM provider_settings WHERE id = ?').run(id)
  // If we removed the default, promote the oldest remaining one of that type.
  if (row && row.is_default) {
    const next = getDb()
      .prepare('SELECT id FROM provider_settings WHERE type = ? ORDER BY created_at ASC LIMIT 1')
      .get(row.type) as { id: string } | undefined
    if (next) {
      getDb().prepare('UPDATE provider_settings SET is_default = 1 WHERE id = ?').run(next.id)
    }
  }
}

export function setDefaultProvider(id: string): void {
  const row = getRow(id)
  if (!row) return
  clearDefault(row.type as ProviderType, id)
  getDb().prepare('UPDATE provider_settings SET is_default = 1, enabled = 1 WHERE id = ?').run(id)
}

/** Connectivity test dispatched by provider type. */
export async function testProvider(id: string): Promise<ProviderTestResult> {
  const p = getProvider(id)
  if (!p) return { ok: false, message: '未找到服务' }
  try {
    if (p.type === 'mailbox') return await testMailboxDriver(p.driver, p.config)
    if (p.type === 'captcha') return await testCaptcha(p)
    if (p.type === 'proxy') return await testProxy(p)
    if (p.type === 'sms') return await testSmsDriver(p.driver, p.config)
    return { ok: false, message: '该类型暂不支持一键测试' }
  } catch (e) {
    return { ok: false, message: `测试失败：${(e as Error).message}` }
  }
}

async function testCaptcha(p: ProviderSetting): Promise<ProviderTestResult> {
  const apiKey = String(p.config.apiKey || '').trim()
  if (p.driver === 'manual') return { ok: true, message: '手动打码无需测试' }
  if (!apiKey) return { ok: false, message: '未填写 API Key' }

  if (p.driver === 'twocaptcha') {
    const res = await fetch(
      `https://2captcha.com/res.php?key=${encodeURIComponent(apiKey)}&action=getbalance&json=1`
    )
    const data = (await res.json()) as { status?: number; request?: string }
    if (data.status === 1) return { ok: true, message: `2Captcha 余额：$${data.request}` }
    return { ok: false, message: `2Captcha 校验失败：${data.request ?? '未知错误'}` }
  }
  if (p.driver === 'yescaptcha') {
    const res = await fetch('https://api.yescaptcha.com/getBalance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientKey: apiKey })
    })
    const data = (await res.json()) as { errorId?: number; balance?: number; errorDescription?: string }
    if (!data.errorId) return { ok: true, message: `YesCaptcha 余额：${data.balance}` }
    return { ok: false, message: `YesCaptcha 校验失败：${data.errorDescription ?? '未知错误'}` }
  }
  return { ok: false, message: '该打码驱动暂不支持一键测试' }
}

async function testProxy(p: ProviderSetting): Promise<ProviderTestResult> {
  const url = String(p.config.url || '').trim()
  if (!url) return { ok: false, message: '未填写代理地址' }
  if (socksAuthUnsupported(url)) return { ok: false, message: SOCKS_AUTH_MESSAGE }
  const proxy = parseProxy(url)
  if (!proxy) return { ok: false, message: '代理地址格式无效' }

  // Launch a throwaway headless browser through the proxy and read the exit IP.
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
    await page.goto('https://api.ipify.org?format=json', { timeout: 20000, waitUntil: 'domcontentloaded' })
    const body = (await page.textContent('body')) || '{}'
    const ip = (JSON.parse(body) as { ip?: string }).ip || ''
    if (!ip) return { ok: false, message: '代理连通，但未取得出口 IP' }
    return { ok: true, message: `代理可用，出口 IP：${ip}`, detail: ip }
  } finally {
    await browser.close()
  }
}
