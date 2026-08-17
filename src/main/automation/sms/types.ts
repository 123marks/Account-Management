import type { SmsRental, SmsServiceOption } from '@shared/types'

export interface SmsDriverContext {
  config: Record<string, string | number | boolean>
  signal?: AbortSignal
}

export interface SmsDriver {
  driver: string
  rent(ctx: SmsDriverContext, service: string, country?: string): Promise<SmsRental>
  fetchCode(ctx: SmsDriverContext, remoteId: string): Promise<string | null>
  cancel(ctx: SmsDriverContext, remoteId: string): Promise<void>
  finish(ctx: SmsDriverContext, remoteId: string): Promise<void>
  balance(ctx: SmsDriverContext): Promise<{ amount: number; currency: string }>
  services?(ctx: SmsDriverContext, country?: string): Promise<SmsServiceOption[]>
}
