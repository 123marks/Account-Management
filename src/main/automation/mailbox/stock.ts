export function splitStockLines(text: string): string[] {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

export function countStockLines(text: string): number {
  return splitStockLines(text).length
}

export function splitParts(line: string): string[] {
  const raw = line.trim()
  if (raw.includes('----')) return raw.split('----').map((s) => s.trim()).filter(Boolean)
  return raw.split('---').map((s) => s.trim()).filter(Boolean)
}

export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

export function looksLikeUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

export interface PickupItem {
  email: string
  url: string
  key: string
  raw: string
}

export function parsePickupLine(line: string): PickupItem | null {
  const parts = splitParts(line)
  let email = parts.find(looksLikeEmail) || ''
  let url = parts.find(looksLikeUrl) || ''
  let key = parts.find((p) => !looksLikeEmail(p) && !looksLikeUrl(p)) || ''

  if (url.includes('#')) {
    const hash = url.slice(url.indexOf('#') + 1)
    const qs = new URLSearchParams(hash)
    email = email || qs.get('email') || ''
    key = key || qs.get('key') || qs.get('token') || ''
  }
  try {
    const u = new URL(url)
    email = email || u.searchParams.get('email') || ''
    key = key || u.searchParams.get('key') || u.searchParams.get('token') || ''
    const pathEmail = decodeURIComponent(u.pathname).match(/[^\s/]+@[^\s/]+/)
    if (pathEmail) email = email || pathEmail[0]
  } catch {
    /* ignore */
  }
  if (!email.includes('@') || !url) return null
  return { email, url, key, raw: line }
}

export interface OutlookItem {
  email: string
  password: string
  clientId: string
  refreshToken: string
  raw: string
}

export function parseOutlookLine(line: string): OutlookItem | null {
  const parts = splitParts(line)
  const email = parts.find(looksLikeEmail) || ''
  const clientId = parts.find(looksLikeUuid) || ''
  const refreshToken =
    [...parts]
      .reverse()
      .find((p) => p.length > 40 && !looksLikeEmail(p) && !looksLikeUuid(p) && !looksLikeUrl(p)) || ''
  const password =
    parts.find(
      (p) => p !== email && p !== clientId && p !== refreshToken && !looksLikeUrl(p) && p.length < 80
    ) || ''
  if (!email || !refreshToken) return null
  return { email, password, clientId, refreshToken, raw: line }
}

export function consumeStock<T>(
  ctx: { config: Record<string, string | number | boolean>; persistConfig?: (p: Record<string, string | number | boolean>) => void },
  parse: (line: string) => T | null,
  emptyMessage: string
): T {
  const lines = splitStockLines(String(ctx.config.stock || ''))
  if (lines.length === 0) throw new Error(emptyMessage)
  let chosen: T | null = null
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    const item = parse(lines[i])
    if (item) {
      chosen = item
      idx = i
      break
    }
  }
  if (!chosen || idx < 0) throw new Error('库存行格式无法识别，请检查分隔符（---- 或 ---）')
  const remain = lines.filter((_, i) => i !== idx)
  ctx.persistConfig?.({
    stock: remain.join('\n'),
    poolRemaining: remain.length
  })
  return chosen
}
