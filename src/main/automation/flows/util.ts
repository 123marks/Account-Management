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

/** Fill a React / Material controlled input and read the value back. */
export async function fillControlled(el: Locator, value: string): Promise<boolean> {
  await el.click({ timeout: 5000 })
  await el.fill('')
  await el.fill(value)
  if ((await el.inputValue().catch(() => '')) === value) return true
  await el.evaluate((node, v) => {
    const input = node as { value: string; dispatchEvent: (ev: unknown) => void }
    const g = globalThis as unknown as {
      HTMLInputElement: { prototype: object }
      Event: new (type: string, init?: { bubbles?: boolean }) => unknown
    }
    const desc = Object.getOwnPropertyDescriptor(g.HTMLInputElement.prototype, 'value')
    desc?.set?.call(input, v)
    input.dispatchEvent(new g.Event('input', { bubbles: true }))
    input.dispatchEvent(new g.Event('change', { bubbles: true }))
  }, value)
  return (await el.inputValue().catch(() => '')) === value
}

export async function typeInto(
  page: Page,
  selectors: string[],
  value: string,
  timeout = 8000
): Promise<boolean> {
  const el = await firstVisible(page, selectors, timeout)
  if (!el) return false
  return fillControlled(el, value)
}
