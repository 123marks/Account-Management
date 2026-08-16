import * as OTPAuth from 'otpauth'
import type { TotpParseResult, TotpResult } from '@shared/types'

function normalize(secret: string): string {
  return secret.replace(/\s+/g, '').toUpperCase()
}

export function currentCode(secret: string, digits = 6, period = 30): TotpResult | null {
  try {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(normalize(secret)),
      digits,
      period,
      algorithm: 'SHA1'
    })
    const code = totp.generate()
    const now = Math.floor(Date.now() / 1000)
    const remainingSeconds = period - (now % period)
    return { code, remainingSeconds, period, digits }
  } catch {
    return null
  }
}

export function parseUri(uri: string): TotpParseResult | null {
  try {
    const parsed = OTPAuth.URI.parse(uri)
    if (!(parsed instanceof OTPAuth.TOTP)) return null
    return {
      secret: parsed.secret.base32,
      issuer: parsed.issuer || undefined,
      label: parsed.label || undefined,
      digits: parsed.digits,
      period: parsed.period
    }
  } catch {
    return null
  }
}
