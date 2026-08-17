import { currentCode } from '../../../services/totp'
import type { Flow, FlowResult } from '../../types'
import { ensureGoogleLogin } from './login'
import { firstVisible } from '../util'
import { clickNamed, gotoSecurityPage } from './common'

async function extractSecret(ctx: Parameters<Flow['run']>[0]): Promise<string> {
  await clickNamed(ctx, /can.?t scan|无法扫描|can't scan|cannot scan|手动输入/i)
  await ctx.page.waitForTimeout(800)
  const body = (await ctx.page.textContent('body').catch(() => '')) ?? ''
  const m =
    /[A-Z2-7]{16,64}/.exec(body.replace(/\s+/g, '')) ||
    /secret[=: ]+([A-Z2-7]{16,})/i.exec(body.replace(/\s+/g, ''))
  if (m) return (m[1] ?? m[0]).toUpperCase()
  throw new Error('未能提取 TOTP 密钥。请关闭无头模式，点「无法扫描二维码」后重试')
}

export const enable2fa: Flow = {
  platform: 'google',
  action: 'enable_2fa',
  title: 'Google 启用两步验证',
  description: '建议关闭无头模式首次运行。账号需已绑定手机号。成功后才写回 TOTP 密钥。',
  params: [
    {
      key: 'method',
      label: '方式',
      type: 'select',
      defaultValue: 'totp',
      options: [
        { value: 'totp', label: '身份验证器 (TOTP)' },
        { value: 'sms', label: '短信（仅开启 2SV）' }
      ]
    },
    { key: 'saveSecret', label: '把 TOTP 密钥写回账号库', type: 'boolean', defaultValue: true },
    { key: 'fetchBackupCodes', label: '启用后拉取备用码', type: 'boolean', defaultValue: true }
  ],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    ctx.setProgress(15)
    await ctx.step('打开两步验证页', async () => {
      await gotoSecurityPage(ctx, 'https://myaccount.google.com/signinoptions/twosv')
    })

    const body = (await ctx.page.textContent('body').catch(() => '')) ?? ''
    const alreadyOn = /(is on|已开启|turn off|关闭两步验证)/i.test(body)
    if (alreadyOn && ctx.params.method === 'totp') {
      ctx.log('info', '两步验证已开启，继续绑定身份验证器')
    } else if (!alreadyOn) {
      await ctx.step('开启两步验证', async () => {
        const started = await clickNamed(ctx, /get started|开始使用|turn on|开启/i)
        if (!started) throw new Error('未找到开启按钮。账号可能缺少恢复手机，请先运行「绑定/更换手机号」')
        await ctx.page.waitForTimeout(2000)
      })
    }
    ctx.setProgress(40)

    if (ctx.params.method === 'sms') {
      return { ok: true, message: '两步验证已开启（短信方式）', data: { enabled: true } }
    }

    await ctx.step('打开身份验证器设置', async () => {
      await gotoSecurityPage(
        ctx,
        'https://myaccount.google.com/signinoptions/two-step-verification/authenticator'
      )
      await clickNamed(ctx, /set up|设置|add|添加|authenticator|身份验证/i)
      await ctx.page.waitForTimeout(1500)
    })
    ctx.setProgress(60)

    let secret = ''
    await ctx.step('提取 TOTP 密钥', async () => {
      secret = await extractSecret(ctx)
      ctx.log('info', `已提取 TOTP 密钥（${secret.length} 位）`)
    })

    await ctx.step('用新密钥完成绑定校验', async () => {
      const code = currentCode(secret)?.code
      if (!code) throw new Error('无法用提取的密钥生成验证码，未写回账号库')
      const input = await firstVisible(
        ctx.page,
        ['input[autocomplete="one-time-code"]', 'input[inputmode="numeric"]', 'input[type="tel"]'],
        15000
      )
      if (!input) throw new Error('未找到验证码确认框')
      await input.fill(code)
      await clickNamed(ctx, /verify|验证|next|继续|done|完成/i)
      await ctx.page.waitForTimeout(2000)
    })
    ctx.setProgress(85)

    const saveSecret = ctx.params.saveSecret !== false
    const patch: Record<string, unknown> = {}
    if (saveSecret) patch.totpSecret = secret

    if (ctx.params.fetchBackupCodes !== false) {
      await ctx.step('尝试拉取备用码', async () => {
        await ctx.page.goto('https://myaccount.google.com/two-step-verification/backup-codes', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        })
        await ctx.page.waitForTimeout(1500)
        const text = (await ctx.page.textContent('body').catch(() => '')) ?? ''
        const codes = [...text.matchAll(/\b(\d{4}\s?\d{4})\b/g)].map((x) => x[1].replace(/\s/g, ''))
        if (codes.length >= 8) patch.backupCodes = codes.slice(0, 10)
      })
    }

    return {
      ok: true,
      message: '已启用身份验证器' + (saveSecret ? '（密钥将写回账号库）' : ''),
      data: { accountPatch: patch }
    }
  }
}
