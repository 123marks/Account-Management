import type { StepContext } from '../types'
import type { CaptchaKind } from '../captcha'

const POLL_MS = 3000

// Where each captcha widget stores its response token, so an auto-solved token
// can be injected back into the page.
const RESPONSE_SELECTOR: Partial<Record<CaptchaKind, string>> = {
  turnstile: 'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]',
  hcaptcha: 'textarea[name="h-captcha-response"]',
  recaptcha_v2: 'textarea#g-recaptcha-response, textarea[name="g-recaptcha-response"]'
}

async function injectToken(ctx: StepContext, kind: CaptchaKind, token: string): Promise<void> {
  const sel = RESPONSE_SELECTOR[kind]
  if (!sel) return
  // String-form evaluate keeps DOM types out of the main-process TS build.
  const js = `(function(){var els=document.querySelectorAll(${JSON.stringify(
    sel
  )});els.forEach(function(el){el.value=${JSON.stringify(
    token
  )};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});})()`
  await ctx.page.evaluate(js).catch(() => undefined)
}

/**
 * Systematic human-verification handling used across every flow:
 *   1. Detect whether a challenge (Turnstile / reCAPTCHA / hCaptcha / generic) is on the page.
 *   2. If a captcha provider is configured and we have a sitekey, try to auto-solve
 *      and inject the token ("try to skip").
 *   3. Otherwise fall back to the user solving it in the headed browser, polling
 *      until the challenge clears ("manual verification"), then continue.
 *
 * Returns true when a challenge was handled, false when none was present.
 */
export async function guardHumanChallenge(
  ctx: StepContext,
  opts: { manualWaitMs?: number } = {}
): Promise<boolean> {
  const info = await ctx.detectChallenge()
  if (!info.present) return false

  ctx.log('warn', `检测到人机验证(${info.kind})，尝试自动处理…`)

  if (info.sitekey) {
    const token = await ctx
      .solveCaptcha({ kind: info.kind, sitekey: info.sitekey })
      .catch(() => null)
    if (token) {
      await injectToken(ctx, info.kind, token)
      await ctx.page.waitForTimeout(2500)
      if (!(await ctx.detectChallenge()).present) {
        ctx.log('info', '验证码已自动通过')
        return true
      }
      ctx.log('warn', '自动打码未直接通过，转人工验证')
    }
  }

  if (ctx.headless) {
    throw new Error(
      '检测到人机验证，但当前为无头模式；请到「设置」关闭无头模式后重试，在弹出的浏览器中手动完成验证。'
    )
  }

  const budget = opts.manualWaitMs ?? 120000
  ctx.log('warn', `请在弹出的浏览器中手动完成人机验证（最多等待 ${Math.round(budget / 1000)} 秒）…`)
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    ctx.throwIfCanceled()
    await ctx.page.waitForTimeout(POLL_MS)
    if (!(await ctx.detectChallenge()).present) {
      ctx.log('info', '人机验证已完成，继续执行')
      return true
    }
  }
  throw new Error('等待人工验证超时；请重试并尽快在浏览器中完成验证。')
}
