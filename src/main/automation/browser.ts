import { chromium, type BrowserContext } from 'playwright-core'
import { getSettings } from '../services/settings'
import { logger } from '../services/logger'
import { detectChrome } from './chrome'
import type { PwProxy } from './proxy'

export interface OpenedContext {
  context: BrowserContext
  close: () => Promise<void>
}

/** Per-profile browser identity overrides (anti-detect). */
export interface BrowserIdentity {
  userAgent?: string | null
  locale?: string | null
  timezone?: string | null
}

const LAUNCH_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-blink-features=AutomationControlled'
]

/**
 * Build an init script that lightly randomizes fingerprint-relevant signals so
 * each isolated profile looks like a distinct device: hides the webdriver flag,
 * aligns navigator.languages with the locale, adds per-session canvas noise, and
 * spoofs the WebGL vendor/renderer. Returned as a string so no DOM types leak
 * into the main-process build.
 */
function buildStealthScript(identity?: BrowserIdentity | null): string {
  const locale = (identity?.locale || 'en-US').trim() || 'en-US'
  const base = locale.split('-')[0]
  const languages = JSON.stringify(base && base !== locale ? [locale, base] : [locale])
  return `(() => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); } catch (e) {}
  try { Object.defineProperty(navigator, 'languages', { get: () => ${languages} }); } catch (e) {}
  try {
    const noise = (Math.random() * 10) | 0;
    const orig = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function () {
      try {
        const ctx = this.getContext('2d');
        if (ctx && this.width && this.height) {
          const img = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < img.data.length; i += 4) img.data[i] = (img.data[i] + noise) & 255;
          ctx.putImageData(img, 0, 0);
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  } catch (e) {}
  try {
    const gp = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return 'Intel Inc.';
      if (p === 37446) return 'Intel Iris OpenGL Engine';
      return gp.call(this, p);
    };
  } catch (e) {}
})();`
}

/**
 * Open a browser context bound to the given per-account persistent profile.
 * - launch mode: start the locally installed Google Chrome with a dedicated
 *   user-data-dir so each account keeps its own cookies/session (isolation + multi-open).
 *   An optional per-account proxy routes this account through its own exit IP, and
 *   an optional identity presents a distinct UA/locale/timezone + fingerprint noise.
 * - cdp mode: attach to a Chrome the user started with --remote-debugging-port
 *   (proxy/identity cannot be applied there).
 */
export async function openContext(
  profileDir: string,
  proxy?: PwProxy | null,
  identity?: BrowserIdentity | null
): Promise<OpenedContext> {
  const s = getSettings()

  if (s.connectMode === 'cdp') {
    if (proxy) {
      logger.warn('automation', 'CDP 连接模式无法为单账号设置代理，将使用被连接 Chrome 自身的网络')
    }
    const browser = await chromium.connectOverCDP(s.cdpEndpoint)
    const context = browser.contexts()[0] ?? (await browser.newContext())
    return {
      context,
      close: async () => {
        await browser.close()
      }
    }
  }

  const chrome = detectChrome(s.chromePathOverride)
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: chrome.path ?? undefined,
    channel: chrome.path ? undefined : 'chrome',
    headless: s.headless,
    slowMo: s.slowMo,
    viewport: null,
    proxy: proxy ?? undefined,
    userAgent: identity?.userAgent || undefined,
    locale: identity?.locale || undefined,
    timezoneId: identity?.timezone || undefined,
    args: LAUNCH_ARGS
  })
  await context.addInitScript(buildStealthScript(identity)).catch(() => undefined)
  return {
    context,
    close: async () => {
      await context.close()
    }
  }
}

// One lock per persistent profile dir, shared by automation, manual launch and
// cookie I/O. A profile's user-data-dir can only be driven by one Chrome at a
// time; a second launch collides ("Target closed" / profile lock). Reserving is
// synchronous so there is no check-then-act (TOCTOU) window across awaits.
const openProfiles = new Set<string>()

/** True if the profile dir is currently driven by any op (automation/manual/cookie). */
export function isProfileBusy(profileDir: string): boolean {
  return openProfiles.has(profileDir)
}

/** Try to take the profile lock synchronously. Returns false if already held. */
export function reserveProfile(profileDir: string): boolean {
  if (openProfiles.has(profileDir)) return false
  openProfiles.add(profileDir)
  return true
}

export function releaseProfile(profileDir: string): void {
  openProfiles.delete(profileDir)
}

async function withPersistentContext<T>(
  profileDir: string,
  fn: (context: BrowserContext) => Promise<T>
): Promise<T> {
  if (!reserveProfile(profileDir)) {
    throw new Error('该账号的配置目录正被占用（有浏览器或任务在运行），请稍后再试')
  }
  const s = getSettings()
  const chrome = detectChrome(s.chromePathOverride)
  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath: chrome.path ?? undefined,
      channel: chrome.path ? undefined : 'chrome',
      headless: true,
      args: LAUNCH_ARGS
    })
    try {
      return await fn(context)
    } finally {
      await context.close()
    }
  } finally {
    releaseProfile(profileDir)
  }
}

/** Read all cookies stored in an account's isolated profile. */
export async function readProfileCookies(profileDir: string): Promise<unknown[]> {
  return withPersistentContext(profileDir, (context) => context.cookies())
}

/** Cookies + localStorage (official login often leaves tokens in origin storage). */
export async function readProfileStorageState(profileDir: string): Promise<unknown> {
  return withPersistentContext(profileDir, (context) => context.storageState())
}

/** Write cookies into an account's isolated profile (warm-up / session transfer). */
export async function writeProfileCookies(profileDir: string, cookies: unknown[]): Promise<number> {
  return withPersistentContext(profileDir, async (context) => {
    await context.addCookies(cookies as Parameters<BrowserContext['addCookies']>[0])
    return cookies.length
  })
}

// Manually-launched profiles kept open for the user (keyed by profile dir).
const manualContexts = new Map<string, BrowserContext>()

/** True if the account's profile is currently open as a manual browser window. */
export function isProfileOpen(profileDir: string): boolean {
  return manualContexts.has(profileDir)
}

/**
 * Launch the account's isolated profile as a real, headed browser for manual use
 * (log in, solve a challenge, warm up cookies). Stays open until the user closes
 * it. Returns `{ opened: false }` if that profile already has a window open.
 */
export async function launchManualProfile(
  profileDir: string,
  proxy?: PwProxy | null,
  identity?: BrowserIdentity | null,
  url?: string
): Promise<{ opened: boolean }> {
  // Take the lock synchronously so two concurrent launches can't both pass.
  if (!reserveProfile(profileDir)) return { opened: false }
  const s = getSettings()
  const chrome = detectChrome(s.chromePathOverride)
  try {
    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath: chrome.path ?? undefined,
      channel: chrome.path ? undefined : 'chrome',
      headless: false,
      viewport: null,
      proxy: proxy ?? undefined,
      userAgent: identity?.userAgent || undefined,
      locale: identity?.locale || undefined,
      timezoneId: identity?.timezone || undefined,
      args: LAUNCH_ARGS
    })
    await context.addInitScript(buildStealthScript(identity)).catch(() => undefined)
    manualContexts.set(profileDir, context)
    // Hold the lock for the whole manual session; release when the user closes it.
    context.on('close', () => {
      manualContexts.delete(profileDir)
      releaseProfile(profileDir)
    })
    const page = context.pages()[0] ?? (await context.newPage())
    await page
      .goto(url || 'about:blank', { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => undefined)
    return { opened: true }
  } catch (e) {
    releaseProfile(profileDir)
    throw e
  }
}
