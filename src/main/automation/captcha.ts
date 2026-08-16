import type { Page } from 'playwright-core'
import { listProviders } from '../services/providers'

export type CaptchaKind = 'turnstile' | 'recaptcha_v2' | 'hcaptcha' | 'unknown'

export interface ActiveCaptcha {
  driver: string
  config: Record<string, string | number | boolean>
}

/** The default (or first enabled) captcha provider, if configured. */
export function getActiveCaptcha(): ActiveCaptcha | null {
  const items = listProviders('captcha')
  const chosen = items.find((p) => p.isDefault && p.enabled) ?? items.find((p) => p.enabled)
  return chosen ? { driver: chosen.driver, config: chosen.config } : null
}

export interface ChallengeInfo {
  present: boolean
  kind: CaptchaKind
  sitekey?: string
}

/** Best-effort detection of a human-verification challenge on the current page. */
export async function detectHumanChallenge(page: Page): Promise<ChallengeInfo> {
  const probe = async (selector: string, kind: CaptchaKind): Promise<ChallengeInfo | null> => {
    const loc = page.locator(selector).first()
    if ((await loc.count().catch(() => 0)) > 0) {
      const sitekey = (await loc.getAttribute('data-sitekey').catch(() => null)) || undefined
      return { present: true, kind, sitekey }
    }
    return null
  }
  try {
    const found =
      (await probe(
        '.cf-turnstile, iframe[src*="challenges.cloudflare.com"], [class*="turnstile"][data-sitekey]',
        'turnstile'
      )) ||
      (await probe('iframe[src*="hcaptcha.com"], .h-captcha[data-sitekey]', 'hcaptcha')) ||
      (await probe('iframe[src*="recaptcha"], .g-recaptcha[data-sitekey]', 'recaptcha_v2'))
    if (found) return found
    const text = ((await page.textContent('body').catch(() => '')) || '').toLowerCase()
    if (/verify you are human|i'm not a robot|人机验证|are you a robot/.test(text)) {
      return { present: true, kind: 'unknown' }
    }
    return { present: false, kind: 'unknown' }
  } catch {
    return { present: false, kind: 'unknown' }
  }
}

export interface SolveOpts {
  kind: CaptchaKind
  sitekey: string
  url: string
  timeoutMs?: number
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Solve a captcha token using the active provider. Returns the token string, or
 * null when no automatic solver is configured (e.g. manual mode) — callers then
 * fall back to letting the user solve it in a headed browser.
 */
export async function solveToken(opts: SolveOpts): Promise<string | null> {
  const active = getActiveCaptcha()
  if (!active || active.driver === 'manual') return null
  const apiKey = String(active.config.apiKey || '').trim()
  if (!apiKey) return null
  if (active.driver === 'twocaptcha') return solveTwoCaptcha(apiKey, opts)
  if (active.driver === 'yescaptcha') return solveYesCaptcha(apiKey, opts)
  return null
}

async function solveTwoCaptcha(apiKey: string, opts: SolveOpts): Promise<string | null> {
  const params = new URLSearchParams({ key: apiKey, json: '1', pageurl: opts.url })
  if (opts.kind === 'turnstile') {
    params.set('method', 'turnstile')
    params.set('sitekey', opts.sitekey)
  } else if (opts.kind === 'hcaptcha') {
    params.set('method', 'hcaptcha')
    params.set('sitekey', opts.sitekey)
  } else {
    params.set('method', 'userrecaptcha')
    params.set('googlekey', opts.sitekey)
  }
  const submit = (await (await fetch(`https://2captcha.com/in.php?${params.toString()}`)).json()) as {
    status?: number
    request?: string
  }
  if (submit.status !== 1 || !submit.request) return null
  const id = submit.request
  const deadline = Date.now() + (opts.timeoutMs ?? 120000)
  while (Date.now() < deadline) {
    await sleep(5000)
    const poll = (await (
      await fetch(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${id}&json=1`)
    ).json()) as { status?: number; request?: string }
    if (poll.status === 1) return poll.request ?? null
    if (poll.request && poll.request !== 'CAPCHA_NOT_READY') return null
  }
  return null
}

async function solveYesCaptcha(apiKey: string, opts: SolveOpts): Promise<string | null> {
  const type =
    opts.kind === 'turnstile'
      ? 'TurnstileTaskProxyless'
      : opts.kind === 'hcaptcha'
        ? 'HCaptchaTaskProxyless'
        : 'NoCaptchaTaskProxyless'
  const create = (await (
    await fetch('https://api.yescaptcha.com/createTask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientKey: apiKey,
        task: { type, websiteURL: opts.url, websiteKey: opts.sitekey }
      })
    })
  ).json()) as { errorId?: number; taskId?: string | number }
  if (create.errorId || !create.taskId) return null
  const deadline = Date.now() + (opts.timeoutMs ?? 120000)
  while (Date.now() < deadline) {
    await sleep(5000)
    const poll = (await (
      await fetch('https://api.yescaptcha.com/getTaskResult', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId: create.taskId })
      })
    ).json()) as {
      status?: string
      solution?: { token?: string; gRecaptchaResponse?: string }
    }
    if (poll.status === 'ready') {
      return poll.solution?.token ?? poll.solution?.gRecaptchaResponse ?? null
    }
  }
  return null
}
