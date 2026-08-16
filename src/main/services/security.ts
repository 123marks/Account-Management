import { getDb } from '../db'
import { decryptField } from './crypto'
import {
  estimatePasswordStrength,
  WEAK_PASSWORD_SCORE,
  STALE_PASSWORD_DAYS
} from '@shared/security'
import type {
  AccountAudit,
  Platform,
  SecurityIssueKind,
  SecurityReport
} from '@shared/types'

interface AuditRow {
  id: string
  platform: string
  label: string
  password_enc: string | null
  totp_secret_enc: string | null
  recovery_email: string
  recovery_phone: string
  password_updated_at: number | null
}

// Per-issue penalty applied to a starting per-account score of 100.
const PENALTY: Record<SecurityIssueKind, number> = {
  no_password: 55,
  weak_password: 35,
  reused_password: 30,
  no_2fa: 20,
  no_recovery: 12,
  stale_password: 10
}

function accountScore(issues: SecurityIssueKind[]): number {
  const penalty = issues.reduce((sum, i) => sum + PENALTY[i], 0)
  return Math.max(0, 100 - penalty)
}

/**
 * Audit the whole vault for credential hygiene. Runs in the main process so it
 * can briefly decrypt secrets in memory; plaintext never leaves this function
 * (only derived flags/labels are returned to the renderer).
 */
export function runSecurityAudit(): SecurityReport {
  const rows = getDb()
    .prepare(
      `SELECT id, platform, label, password_enc, totp_secret_enc,
              recovery_email, recovery_phone, password_updated_at
       FROM accounts`
    )
    .all() as AuditRow[]

  const now = Date.now()
  const staleCutoff = now - STALE_PASSWORD_DAYS * 86_400_000

  // Decrypt once; group identical passwords to detect reuse.
  const passwordById = new Map<string, string | null>()
  const idsByPassword = new Map<string, string[]>()
  const labelById = new Map<string, string>()
  for (const r of rows) {
    labelById.set(r.id, r.label)
    const pw = decryptField(r.password_enc)
    passwordById.set(r.id, pw)
    if (pw) {
      const arr = idsByPassword.get(pw)
      if (arr) arr.push(r.id)
      else idsByPassword.set(pw, [r.id])
    }
  }

  const totals = {
    accounts: rows.length,
    noPassword: 0,
    weakPassword: 0,
    reusedPassword: 0,
    no2fa: 0,
    noRecovery: 0,
    stalePassword: 0
  }

  const audits: AccountAudit[] = rows.map((r) => {
    const pw = passwordById.get(r.id) ?? null
    const issues: SecurityIssueKind[] = []
    const strength = pw ? estimatePasswordStrength(pw) : 0

    if (!pw) {
      issues.push('no_password')
      totals.noPassword += 1
    } else if (strength < WEAK_PASSWORD_SCORE) {
      issues.push('weak_password')
      totals.weakPassword += 1
    }

    const shared = pw ? (idsByPassword.get(pw) ?? []).filter((id) => id !== r.id) : []
    if (shared.length > 0) {
      issues.push('reused_password')
      totals.reusedPassword += 1
    }

    if (!r.totp_secret_enc) {
      issues.push('no_2fa')
      totals.no2fa += 1
    }

    if (!r.recovery_email && !r.recovery_phone) {
      issues.push('no_recovery')
      totals.noRecovery += 1
    }

    if (pw && r.password_updated_at && r.password_updated_at < staleCutoff) {
      issues.push('stale_password')
      totals.stalePassword += 1
    }

    return {
      accountId: r.id,
      label: r.label,
      platform: r.platform as Platform,
      hasPassword: !!pw,
      passwordStrength: strength,
      issues,
      reusedWith: shared.map((id) => labelById.get(id) ?? '未知'),
      passwordUpdatedAt: r.password_updated_at
    }
  })

  const score = audits.length
    ? Math.round(audits.reduce((sum, a) => sum + accountScore(a.issues), 0) / audits.length)
    : 100

  // Worst accounts first so the UI leads with what needs attention.
  audits.sort((a, b) => accountScore(a.issues) - accountScore(b.issues))

  return { generatedAt: now, score, totals, accounts: audits }
}
