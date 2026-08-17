import type { Flow, FlowResult } from '../../types'
import { ensureGoogleLogin } from './login'
import { firstVisible } from '../util'
import { clickNamed, gotoSecurityPage } from './common'
import { cancelRental, finishRental, rentNumber, resolveDefaultSms, waitForSmsCode } from '../../sms'
import { serviceCode } from '../../sms/services'

export const changePhone: Flow = {
  platform: 'google',
  action: 'change_phone',
  title: 'Google 绑定/更换手机号',
  description: '建议关闭无头模式首次运行。可用接码平台自动收短信；失败会自动释放号码。',
  params: [
    { key: 'useSmsProvider', label: '使用接码平台自动获取号码', type: 'boolean', defaultValue: true },
    { key: 'manualPhone', label: '手填号码（关闭接码时）', type: 'text', placeholder: '+86138xxxx' },
    { key: 'country', label: '接码国家代码', type: 'text', placeholder: '留空用服务默认' },
    { key: 'removeOld', label: '尝试删除旧号码', type: 'boolean', defaultValue: false }
  ],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    ctx.setProgress(20)

    const useSms = ctx.params.useSmsProvider !== false
    let phone = String(ctx.params.manualPhone ?? '').trim()
    let rentalId = ''
    let local = phone.replace(/^\+\d{1,3}/, '')

    if (useSms) {
      const family = resolveDefaultSms()?.driver.driver === 'smspool' ? 'smspool' : 'handler_api'
      const rental = await rentNumber({
        service: serviceCode('google', family),
        country: String(ctx.params.country || '') || undefined,
        accountId: ctx.account.id,
        taskId: ctx.taskId,
        signal: ctx.signal
      })
      rentalId = rental.id
      phone = rental.phone
      local = rental.localNumber
      ctx.log('info', `已租用号码（${phone.slice(0, 5)}…）`)
    }
    if (!phone) throw new Error('未提供手机号。请开启接码或填写 manualPhone')

    try {
      await ctx.step('打开恢复手机页', async () => {
        await gotoSecurityPage(ctx, 'https://myaccount.google.com/recovery/phone')
      })
      ctx.setProgress(40)

      if (ctx.params.removeOld) {
        await clickNamed(ctx, /delete|remove|删除|移除/i)
        await ctx.page.waitForTimeout(1000)
      }

      await ctx.step('填写新号码', async () => {
        await clickNamed(ctx, /add|添加|change|更改|新的/i)
        const input = await firstVisible(ctx.page, ['input[type="tel"]', 'input[autocomplete="tel"]'], 15000)
        if (!input) throw new Error('未找到手机号输入框（页面结构可能已变化）')
        await input.fill(local || phone)
        await clickNamed(ctx, /next|继续|send|发送|get code|获取/i)
        await ctx.page.waitForTimeout(2000)
      })
      ctx.setProgress(60)

      let code = ''
      if (useSms && rentalId) {
        await ctx.step('等待短信验证码', async () => {
          code = await waitForSmsCode(rentalId, { timeoutMs: 180000, signal: ctx.signal })
          ctx.log('info', `已收到短信验证码（${code.length} 位）`)
        })
      } else if (!ctx.headless) {
        ctx.log('warn', '请在弹出的浏览器中查看短信并填写验证码，随后自动继续…')
        await ctx.page.waitForTimeout(30000)
      } else {
        throw new Error('无头模式下必须使用接码平台收短信')
      }

      if (code) {
        await ctx.step('填写短信验证码', async () => {
          const el = await firstVisible(
            ctx.page,
            ['input[autocomplete="one-time-code"]', 'input[inputmode="numeric"]', 'input[type="tel"]'],
            15000
          )
          if (!el) throw new Error('未找到验证码输入框')
          await el.fill(code)
          await clickNamed(ctx, /verify|验证|next|继续|done|完成/i)
          await ctx.page.waitForTimeout(2500)
        })
      }

      if (rentalId) await finishRental(rentalId).catch(() => undefined)
      ctx.setProgress(95)
      return {
        ok: true,
        message: '已提交手机号绑定',
        data: { accountPatch: { recoveryPhone: phone } }
      }
    } catch (e) {
      if (rentalId) await cancelRental(rentalId).catch(() => undefined)
      throw e
    }
  }
}
