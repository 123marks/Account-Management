import type { AccountInput, Platform } from '@shared/types'
import { inferPlatform } from '@renderer/lib/csv'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const YEAR_RE = /^(19|20)\d{2}$/
const TOTP_RE = /^[a-z2-7]{16,64}$/i
const COUNTRY: Record<string, { locale: string; timezone: string }> = {
  'united states': { locale: 'en-US', timezone: 'America/New_York' },
  usa: { locale: 'en-US', timezone: 'America/New_York' },
  us: { locale: 'en-US', timezone: 'America/New_York' },
  'united kingdom': { locale: 'en-GB', timezone: 'Europe/London' },
  uk: { locale: 'en-GB', timezone: 'Europe/London' },
  japan: { locale: 'ja-JP', timezone: 'Asia/Tokyo' },
  china: { locale: 'zh-CN', timezone: 'Asia/Shanghai' },
  singapore: { locale: 'en-SG', timezone: 'Asia/Singapore' },
  germany: { locale: 'de-DE', timezone: 'Europe/Berlin' },
  france: { locale: 'fr-FR', timezone: 'Europe/Paris' },
  canada: { locale: 'en-CA', timezone: 'America/Toronto' },
  australia: { locale: 'en-AU', timezone: 'Australia/Sydney' },
  india: { locale: 'en-IN', timezone: 'Asia/Kolkata' },
  brazil: { locale: 'pt-BR', timezone: 'America/Sao_Paulo' }
}

export function splitAccountLine(line: string): string[] {
  const t = line.trim()
  if (!t || t.startsWith('#')) return []
  if (t.includes('----')) return t.split('----').map((s) => s.trim()).filter(Boolean)
  if (t.includes('---')) return t.split('---').map((s) => s.trim()).filter(Boolean)
  if (t.includes('\t')) return t.split('\t').map((s) => s.trim()).filter(Boolean)
  if (t.includes('|')) return t.split('|').map((s) => s.trim()).filter(Boolean)
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+[:：]/.test(t)) {
    const i = t.search(/[:：]/)
    return [t.slice(0, i).trim(), t.slice(i + 1).trim()].filter(Boolean)
  }
  return [t]
}

function looksUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

function looksTotp(s: string): boolean {
  return TOTP_RE.test(s.replace(/\s+/g, '')) && !EMAIL_RE.test(s) && s.length >= 16
}

export function parseAccountLine(line: string): AccountInput | null {
  const parts = splitAccountLine(line)
  if (parts.length === 0) return null
  const emails = parts.filter((p) => EMAIL_RE.test(p))
  if (emails.length === 0 && !looksUrl(parts[0] || '')) return null

  const email = emails[0] || ''
  const recoveryEmail = emails[1] || ''
  const url = parts.find(looksUrl) || ''
  const clientId = parts.find((p) => UUID_RE.test(p)) || ''
  const refresh =
    [...parts]
      .reverse()
      .find((p) => p.length > 60 && !EMAIL_RE.test(p) && !looksUrl(p) && !UUID_RE.test(p)) || ''
  const totp =
    parts.find((p) => looksTotp(p) && p !== refresh && p !== clientId) || ''
  const year = parts.find((p) => YEAR_RE.test(p)) || ''
  const countryPart = parts.find((p) => COUNTRY[p.toLowerCase()]) || ''
  const used = new Set(
    [email, recoveryEmail, url, clientId, refresh, totp, year, countryPart].filter(Boolean)
  )
  const password =
    parts.find((p) => !used.has(p) && !EMAIL_RE.test(p) && !looksUrl(p) && p.length < 80) || ''

  const loc = countryPart ? COUNTRY[countryPart.toLowerCase()] : undefined
  const customFields: Record<string, string> = {}
  if (year) customFields.year = year
  if (countryPart) customFields.country = countryPart
  if (clientId) customFields.clientId = clientId
  if (url) customFields.pickupUrl = url

  const platform: Platform = refresh
    ? 'microsoft'
    : inferPlatform(email)
  const local = email.split('@')[0] || 'account'
  const notes = [url && `取件: ${url}`, countryPart, year && `年 ${year}`].filter(Boolean).join(' · ')

  return {
    platform,
    label: local,
    username: '',
    email,
    password: password || null,
    totpSecret: totp || null,
    recoveryEmail,
    recoveryPhone: '',
    refreshToken: refresh || null,
    groupName: '',
    tags: [],
    notes,
    locale: loc?.locale || '',
    timezone: loc?.timezone || '',
    customFields,
    status: 'active'
  }
}

export function parseAccountPaste(text: string): AccountInput[] {
  const seen = new Set<string>()
  const out: AccountInput[] = []
  for (const raw of text.split(/\r?\n/)) {
    const acc = parseAccountLine(raw)
    if (!acc?.email) continue
    const key = acc.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(acc)
  }
  return out
}
