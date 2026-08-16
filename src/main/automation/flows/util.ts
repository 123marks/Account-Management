import { randomBytes } from 'node:crypto'
import type { Locator, Page } from 'playwright-core'

/** Generate a strong password with at least one upper/lower/digit/symbol. */
export function genPassword(len = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%^&*-_=+'
  const all = upper + lower + digits + symbols
  const pick = (set: string, n: number): string => {
    const b = randomBytes(n)
    let s = ''
    for (let i = 0; i < n; i++) s += set[b[i] % set.length]
    return s
  }
  const base =
    pick(upper, 1) + pick(lower, 1) + pick(digits, 1) + pick(symbols, 1) + pick(all, Math.max(4, len - 4))
  const arr = base.split('')
  const b = randomBytes(arr.length)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = b[i] % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

/** Poll a list of selectors, returning the first visible Locator (or null on timeout). */
export async function firstVisible(
  page: Page,
  selectors: string[],
  timeout = 15000
): Promise<Locator | null> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first()
      if (await loc.isVisible().catch(() => false)) return loc
    }
    await page.waitForTimeout(300)
  }
  return null
}
