import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import type { SmsRental, SmsRentalStatus } from '@shared/types'

interface Row {
  id: string
  provider_id: string
  driver: string
  remote_id: string
  phone: string
  country_code: string
  service: string
  account_id: string | null
  task_id: string | null
  status: string
  code: string | null
  cost: number | null
  created_at: number
  expires_at: number | null
  updated_at: number
}

function map(r: Row): SmsRental {
  return {
    id: r.id,
    remoteId: r.remote_id,
    phone: r.phone,
    localNumber: r.phone.replace(/^\+\d{1,3}/, ''),
    countryCode: r.country_code,
    driver: r.driver,
    service: r.service,
    status: r.status as SmsRentalStatus,
    code: r.code,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    cost: r.cost ?? undefined,
    accountId: r.account_id ?? undefined,
    taskId: r.task_id ?? undefined
  }
}

export function insertRental(input: {
  providerId: string
  rental: SmsRental
  accountId?: string
  taskId?: string
}): SmsRental {
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO sms_rentals (
        id, provider_id, driver, remote_id, phone, country_code, service,
        account_id, task_id, status, code, cost, created_at, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.providerId,
      input.rental.driver,
      input.rental.remoteId,
      input.rental.phone,
      input.rental.countryCode,
      input.rental.service,
      input.accountId ?? null,
      input.taskId ?? null,
      input.rental.status,
      input.rental.code,
      input.rental.cost ?? null,
      now,
      input.rental.expiresAt,
      now
    )
  return { ...input.rental, id, createdAt: now }
}

export function getRental(id: string): (SmsRental & { providerId: string }) | null {
  const r = getDb().prepare('SELECT * FROM sms_rentals WHERE id = ?').get(id) as Row | undefined
  return r ? { ...map(r), providerId: r.provider_id } : null
}

export function updateRental(
  id: string,
  patch: { status?: SmsRentalStatus; code?: string | null }
): void {
  const sets: string[] = ['updated_at = ?']
  const args: unknown[] = [Date.now()]
  if (patch.status !== undefined) {
    sets.push('status = ?')
    args.push(patch.status)
  }
  if (patch.code !== undefined) {
    sets.push('code = ?')
    args.push(patch.code)
  }
  args.push(id)
  getDb()
    .prepare(`UPDATE sms_rentals SET ${sets.join(', ')} WHERE id = ?`)
    .run(...args)
}

export function listRentals(): SmsRental[] {
  const rows = getDb()
    .prepare('SELECT * FROM sms_rentals ORDER BY created_at DESC LIMIT 100')
    .all() as Row[]
  return rows.map(map)
}
