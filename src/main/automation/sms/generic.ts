import { fillTemplate, pickString } from '../../utils/jsonPath'
import type { SmsRental } from '@shared/types'
import type { SmsDriver, SmsDriverContext } from './types'

async function request(url: string, signal?: AbortSignal): Promise<{ text: string; json: unknown }> {
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(20000) })
  const text = await res.text()
  let json: unknown = text
  try {
    json = JSON.parse(text)
  } catch {
    // keep text
  }
  if (!res.ok) throw new Error(`通用接码 HTTP ${res.status}：${text.slice(0, 120)}`)
  return { text, json }
}

function extractCode(text: string, json: unknown, path: string, regex?: string): string | null {
  const raw = path && path !== 'text' ? pickString(json, path) : text
  if (!raw) return null
  if (regex) {
    try {
      const m = new RegExp(regex).exec(raw)
      return m?.[1] ?? m?.[0] ?? null
    } catch {
      return raw
    }
  }
  const m = /(?<!\d)(\d{4,8})(?!\d)/.exec(raw)
  return m?.[1] ?? raw
}

export const genericSmsDriver: SmsDriver = {
  driver: 'generic_sms',
  async rent(ctx, service, country) {
    const vars = {
      apiKey: String(ctx.config.apiKey || ''),
      service,
      country: String(country || ctx.config.country || '')
    }
    const url = fillTemplate(String(ctx.config.rentUrl || ''), vars)
    const { text, json } = await request(url, ctx.signal)
    const remoteId = pickString(json, String(ctx.config.rentIdPath || 'data.id')) || text
    const phone = pickString(json, String(ctx.config.rentPhonePath || 'data.phone'))
    if (!remoteId || !phone) throw new Error('通用接码未返回租用 ID 或号码，请检查 JSON 路径')
    const withPlus = phone.startsWith('+') ? phone : `+${phone}`
    return {
      id: '',
      remoteId,
      phone: withPlus,
      localNumber: withPlus.replace(/^\+\d{1,3}/, ''),
      countryCode: vars.country,
      driver: 'generic_sms',
      service,
      status: 'pending',
      code: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 20 * 60 * 1000
    } satisfies SmsRental
  },
  async fetchCode(ctx, remoteId) {
    const url = fillTemplate(String(ctx.config.codeUrl || ''), {
      apiKey: String(ctx.config.apiKey || ''),
      id: remoteId
    })
    const { text, json } = await request(url, ctx.signal)
    return extractCode(text, json, String(ctx.config.codePath || 'data.code'), String(ctx.config.codeRegex || ''))
  },
  async cancel(ctx, remoteId) {
    const tpl = String(ctx.config.cancelUrl || '')
    if (!tpl) return
    await request(fillTemplate(tpl, { apiKey: String(ctx.config.apiKey || ''), id: remoteId }), ctx.signal)
  },
  async finish(ctx, remoteId) {
    const tpl = String(ctx.config.finishUrl || '')
    if (!tpl) return
    await request(fillTemplate(tpl, { apiKey: String(ctx.config.apiKey || ''), id: remoteId }), ctx.signal)
  },
  async balance(ctx) {
    const tpl = String(ctx.config.balanceUrl || '')
    if (!tpl) return { amount: 0, currency: 'USD' }
    const { json, text } = await request(
      fillTemplate(tpl, { apiKey: String(ctx.config.apiKey || '') }),
      ctx.signal
    )
    const amount = Number(pickString(json, String(ctx.config.balancePath || 'balance')) || text || 0)
    return { amount, currency: 'USD' }
  }
}
