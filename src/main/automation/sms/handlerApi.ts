import type { SmsRental } from '@shared/types'
import type { SmsDriver, SmsDriverContext } from './types'

const ERRORS: Record<string, string> = {
  BAD_KEY: 'API Key 无效',
  BAD_ACTION: '不支持的操作',
  BAD_SERVICE: '服务代号错误',
  WRONG_SERVICE: '服务代号错误',
  BAD_COUNTRY: '国家代码无效',
  NO_NUMBERS: '当前无可用号码，请换国家或稍后再试',
  NO_BALANCE: '余额不足，请到接码平台充值',
  NO_ACTIVATION: '租用记录不存在或不属于当前 Key',
  WRONG_MAX_PRICE: '超过设定的最高价格',
  BANNED: '账号被平台封禁',
  RATE_LIMITED: '请求过于频繁，请稍后重试',
  ERROR_SQL: '平台内部错误'
}

function mergeSignal(extra?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(20000)
  if (!extra) return timeout
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([timeout, extra])
  return extra
}

async function call(base: string, params: Record<string, string>, signal?: AbortSignal): Promise<string> {
  const url = new URL(base)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { signal: mergeSignal(signal) })
  const text = (await res.text()).trim()
  if (!res.ok) throw new Error(`接码接口 HTTP ${res.status}：${text.slice(0, 120)}`)
  return text
}

function translate(raw: string): string {
  const code = raw.split(':')[0]
  return ERRORS[code] ? `${ERRORS[code]}（${raw}）` : `接码平台返回：${raw}`
}

function splitPhone(phone: string): { phone: string; localNumber: string } {
  const digits = phone.replace(/[^\d+]/g, '')
  const withPlus = digits.startsWith('+') ? digits : `+${digits}`
  const local = withPlus.replace(/^\+\d{1,3}/, '')
  return { phone: withPlus, localNumber: local || withPlus.replace(/^\+/, '') }
}

export function makeHandlerApiDriver(driver: string, defaultBase: string): SmsDriver {
  const baseOf = (ctx: SmsDriverContext): string =>
    String(ctx.config.apiBase || defaultBase).replace(/\/+$/, '')

  const keyOf = (ctx: SmsDriverContext): string => {
    const key = String(ctx.config.apiKey || '').trim()
    if (!key) throw new Error('未配置接码 API Key，请到「服务中心」填写')
    return key
  }

  return {
    driver,
    async rent(ctx, service, country) {
      const key = keyOf(ctx)
      const c = String(country || ctx.config.country || '').trim()
      const params: Record<string, string> = { api_key: key, action: 'getNumber', service }
      if (c) params.country = c
      const max = ctx.config.maxPrice
      if (max !== undefined && max !== '') params.maxPrice = String(max)
      const raw = await call(baseOf(ctx), params, ctx.signal)
      if (!raw.startsWith('ACCESS_NUMBER:')) throw new Error(translate(raw))
      const parts = raw.split(':')
      const remoteId = parts[1] || ''
      const { phone, localNumber } = splitPhone(parts.slice(2).join(':'))
      if (!remoteId || !phone) throw new Error(`租号响应无法解析：${raw}`)
      return {
        id: '',
        remoteId,
        phone,
        localNumber,
        countryCode: c,
        driver,
        service,
        status: 'pending',
        code: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + 20 * 60 * 1000
      }
    },
    async fetchCode(ctx, remoteId) {
      const raw = await call(
        baseOf(ctx),
        { api_key: keyOf(ctx), action: 'getStatus', id: remoteId },
        ctx.signal
      )
      if (raw.startsWith('STATUS_OK:')) return raw.slice('STATUS_OK:'.length).trim() || null
      if (raw === 'STATUS_WAIT_CODE' || raw.startsWith('STATUS_WAIT_RETRY')) return null
      if (raw === 'STATUS_CANCEL') throw new Error('平台已取消该号码')
      throw new Error(translate(raw))
    },
    async cancel(ctx, remoteId) {
      await call(
        baseOf(ctx),
        { api_key: keyOf(ctx), action: 'setStatus', id: remoteId, status: '8' },
        ctx.signal
      )
    },
    async finish(ctx, remoteId) {
      await call(
        baseOf(ctx),
        { api_key: keyOf(ctx), action: 'setStatus', id: remoteId, status: '6' },
        ctx.signal
      )
    },
    async balance(ctx) {
      const raw = await call(baseOf(ctx), { api_key: keyOf(ctx), action: 'getBalance' }, ctx.signal)
      if (!raw.startsWith('ACCESS_BALANCE:')) throw new Error(translate(raw))
      return { amount: Number(raw.split(':')[1] || 0), currency: 'USD' }
    },
    async services(ctx, country) {
      const params: Record<string, string> = { api_key: keyOf(ctx), action: 'getPrices' }
      const c = String(country || ctx.config.country || '').trim()
      if (c) params.country = c
      const raw = await call(baseOf(ctx), params, ctx.signal)
      try {
        const json = JSON.parse(raw) as Record<string, Record<string, { cost?: number; count?: number }>>
        const out: { code: string; label: string; available?: number; price?: number }[] = []
        for (const [svc, countries] of Object.entries(json)) {
          const first = Object.values(countries || {})[0]
          out.push({
            code: svc,
            label: svc,
            available: first?.count,
            price: first?.cost
          })
        }
        return out.slice(0, 200)
      } catch {
        return []
      }
    }
  }
}

export const smsActivateDriver = makeHandlerApiDriver(
  'sms_activate',
  'https://smsbower.online/stubs/handler_api.php'
)
export const smsBowerDriver = makeHandlerApiDriver(
  'smsbower',
  'https://smsbower.online/stubs/handler_api.php'
)
