import { currentCode } from '../../../services/totp'
import type { Flow, FlowResult } from '../../types'
import { ensureGoogleLogin } from './login'
import { firstVisible } from '../util'
import { clickNamed, gotoSecurityPage } from './common'

export const rotate2fa: Flow = {
  platform: 'google',
  action: 'rotate_2fa',
  title: 'Google 轮换 2FA 密钥',
  description: '新密钥校验通过前不会覆盖旧密钥。建议关闭无头模式。',
  params: [{ key: 'saveSecret', label: '把新密钥写回账号库', type: 'boolean', defaultValue: true }],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    await ctx.step('打开身份验证器页', async () => {
      await gotoSecurityPage(
        ctx,
        'https://myaccount.google.com/signinoptions/two-step-verification/authenticator'
      )
    })
    ctx.setProgress(30)

    await ctx.step('更换验证器', async () => {
      const changed = await clickNamed(ctx, /change|更换|replace|更改|set up|设置/i)
      if (!changed) throw new Error('未找到更换验证器入口')
      await ctx.page.waitForTimeout(1500)
    })

    let secret = ''
    await ctx.step('提取新密钥', async () => {
      await clickNamed(ctx, /can.?t scan|无法扫描|can't scan|手动输入/i)
      await ctx.page.waitForTimeout(800)
      const body = (await ctx.page.textContent('body').catch(() => '')) ?? ''
      const m = /[A-Z2-7]{16,64}/.exec(body.replace(/\s+/g, ''))
      if (!m) throw new Error('未能提取新 TOTP 密钥，旧密钥未改动')
      secret = m[0].toUpperCase()
    })
    ctx.setProgress(70)

    await ctx.step('校验新密钥', async () => {
      const code = currentCode(secret)?.code
      if (!code) throw new Error('新密钥无法生成验证码，旧密钥未改动')
      const input = await firstVisible(
        ctx.page,
        ['input[autocomplete="one-time-code"]', 'input[inputmode="numeric"]'],
        15000
      )
      if (!input) throw new Error('未找到验证码确认框，旧密钥未改动')
      await input.fill(code)
      await clickNamed(ctx, /verify|验证|next|继续|done|完成/i)
      await ctx.page.waitForTimeout(2000)
    })

    const saveSecret = ctx.params.saveSecret !== false
    return {
      ok: true,
      message: '已轮换身份验证器密钥',
      data: { accountPatch: saveSecret ? { totpSecret: secret } : undefined }
    }
  }
}
