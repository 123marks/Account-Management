// Pure, dependency-free security heuristics shared by the main process
// (auditing the vault) and the renderer (live strength meter). Keep this file
// free of any Node/Electron/DOM imports.

export const WEAK_PASSWORD_SCORE = 50
export const STALE_PASSWORD_DAYS = 180

const COMMON = [
  'password',
  'passw0rd',
  '123456',
  '12345678',
  'qwerty',
  'admin',
  'letmein',
  'welcome',
  'iloveyou',
  'abc123',
  '111111',
  '000000'
]

/**
 * Estimate password strength on a 0..100 scale using a lightweight entropy
 * model plus penalties for common/low-variety patterns. This is intentionally
 * simple (no external dependency) but good enough to flag genuinely weak
 * secrets and rank them for the user.
 */
export function estimatePasswordStrength(pw: string): number {
  if (!pw) return 0
  const lower = /[a-z]/.test(pw)
  const upper = /[A-Z]/.test(pw)
  const digit = /[0-9]/.test(pw)
  const symbol = /[^a-zA-Z0-9]/.test(pw)
  const variety = [lower, upper, digit, symbol].filter(Boolean).length
  const pool = (lower ? 26 : 0) + (upper ? 26 : 0) + (digit ? 10 : 0) + (symbol ? 32 : 0)
  const entropyBits = pw.length * Math.log2(pool || 1)

  // ~80 bits of entropy maps to a full score.
  let score = Math.round((entropyBits / 80) * 100)

  const norm = pw.toLowerCase()
  if (COMMON.some((c) => norm.includes(c))) score = Math.min(score, 20)
  if (/^(.)\1+$/.test(pw)) score = Math.min(score, 8) // all identical chars
  if (/^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer)/i.test(pw)) score = Math.min(score, 22)
  if (pw.length < 8) score = Math.min(score, 30)
  if (variety <= 1) score = Math.min(score, 35)

  return Math.max(0, Math.min(100, score))
}

export type StrengthTone = 'destructive' | 'warning' | 'success'

export function strengthLabel(score: number): { label: string; tone: StrengthTone } {
  if (score < WEAK_PASSWORD_SCORE) return { label: '弱', tone: 'destructive' }
  if (score < 75) return { label: '中', tone: 'warning' }
  return { label: '强', tone: 'success' }
}

export const ISSUE_META: Record<
  string,
  { label: string; tone: StrengthTone; hint: string }
> = {
  no_password: { label: '无密码', tone: 'destructive', hint: '该账号未保存登录密码' },
  weak_password: { label: '弱密码', tone: 'destructive', hint: '密码强度偏低，建议更换为更长、更随机的密码' },
  reused_password: { label: '密码重复', tone: 'warning', hint: '与其他账号使用了相同的密码' },
  no_2fa: { label: '未开启两步验证', tone: 'warning', hint: '未配置 TOTP 两步验证密钥' },
  no_recovery: { label: '无恢复信息', tone: 'warning', hint: '未设置恢复邮箱或恢复手机' },
  stale_password: { label: '长期未更换', tone: 'warning', hint: `密码超过 ${STALE_PASSWORD_DAYS} 天未更新` }
}
