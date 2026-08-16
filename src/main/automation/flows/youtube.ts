import type { Flow, FlowResult } from '../types'
import { ensureGoogleLogin } from './google'

const checkLogin: Flow = {
  platform: 'youtube',
  action: 'check_login',
  title: 'YouTube 登录检测',
  description: 'YouTube 使用 Google 账号登录：先确保 Google 登录态，再打开 YouTube 校验。',
  params: [],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    ctx.setProgress(60)
    let signedIn = false
    await ctx.step('打开 YouTube 校验登录', async () => {
      await ctx.page.goto('https://www.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })
      await ctx.page.waitForTimeout(2500)
      const avatar = ctx.page.locator('#avatar-btn, button[aria-label*="Account"], button[aria-label*="账号"]').first()
      signedIn = await avatar.isVisible().catch(() => false)
    })
    ctx.setProgress(100)
    return { ok: signedIn, message: signedIn ? 'YouTube 已登录' : '打开 YouTube 但未检测到登录头像' }
  }
}

export const youtubeFlows: Flow[] = [checkLogin]
