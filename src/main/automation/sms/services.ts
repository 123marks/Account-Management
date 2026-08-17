import type { Platform } from '@shared/types'

/** Internal platform → handler_api / SMSPool service codes. */
export const SERVICE_CODES: Partial<Record<Platform, { handler_api: string; smspool: string }>> = {
  google: { handler_api: 'go', smspool: '395' },
  github: { handler_api: 'dr', smspool: 'github' },
  x: { handler_api: 'tw', smspool: 'twitter' },
  discord: { handler_api: 'ds', smspool: 'discord' },
  microsoft: { handler_api: 'mm', smspool: 'microsoft' },
  apple: { handler_api: 'wx', smspool: 'apple' },
  openai: { handler_api: 'oi', smspool: 'openai' },
  youtube: { handler_api: 'go', smspool: '395' }
}

export function serviceCode(platform: Platform | string, family: 'handler_api' | 'smspool'): string {
  const row = SERVICE_CODES[platform as Platform]
  if (row) return row[family]
  return String(platform)
}
