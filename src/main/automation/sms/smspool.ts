import type { SmsRental } from '@shared/types'
import type { SmsDriver, SmsDriverContext } from './types'

function baseOf(ctx: SmsDriverContext): string {
  return String(ctx.config.apiBase || 'https://api.smspool.net').replace(/\/+$/, '')
}

function keyOf(ctx: SmsDriverContext): string {
  const key = String(ctx.config.apiKey || '').trim()
  if (!key) throw new Error('未配置 SMSPool API Key，请到「服务中心」填写')
  return key
}

async function post(
  ctx: SmsDriverContext,
  path: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${baseOf(ctx)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ key: keyOf(ctx), ...body }),
    signal: ctx.signal ?? AbortSignal.timeout(20000)
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`SMSPool 响应不是 JSON：${text.slice(0, 120)}`)
  }
}

export const smspoolDriver: SmsDriver = {
  driver: 'smspool',
  async rent(ctx, service, country) {
    const c = String(country || ctx.config.country || '').trim()
    const data = await post(ctx, '/purchase/sms', { service, country: c })
    if (!data.success && data.success !== 1) {
      throw new Error(`SMSPool 租号失败：${String(data.message || data.error || '未知错误')}`)
    }
    const remoteId = String(data.order_id ?? data.orderid ?? '')
    const phone = String(data.number ?? data.phone ?? '')
    if (!remoteId || !phone) throw new Error('SMSPool 未返回订单或号码')
    const withPlus = phone.startsWith('+') ? phone : `+${phone}`
    return {
      id: '',
      remoteId,
      phone: withPlus,
      localNumber: withPlus.replace(/^\+\d{1,3}/, ''),
      countryCode: String(data.cc ?? c),
      driver: 'smspool',
      service,
      status: 'pending',
      code: null,
      createdAt: Date.now(),
      expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : Date.now() + 20 * 60 * 1000
    } satisfies SmsRental
  },
  async fetchCode(ctx, remoteId) {
    const data = await post(ctx, '/sms/check', { orderid: remoteId })
    const status = Number(data.status)
    if (status === 3) return String(data.sms || data.code || '').trim() || null
    if (status === 1 || status === 2) return null
    if (data.sms || data.code) return String(data.sms || data.code).trim()
    return null
  },
  async cancel(ctx, remoteId) {
    await post(ctx, '/sms/cancel', { orderid: remoteId })
  },
  async finish() {
    // SMSPool has no separate finish endpoint.
  },
  async balance(ctx) {
    const data = await post(ctx, '/request/balance', {})
    const amount = Number(data.balance ?? data.amount ?? 0)
    if (Number.isNaN(amount)) throw new Error('SMSPool 余额查询失败')
    return { amount, currency: 'USD' }
  }
}
