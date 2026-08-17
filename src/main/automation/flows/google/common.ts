import type { StepContext } from '../../types'
import { firstVisible } from '../util'
import { guardHumanChallenge } from '../challenge'

const NEXT = /next|下一步|继续|continue|save|保存|done|完成|confirm|确认/i

export async function reauthenticate(ctx: StepContext): Promise<void> {
  await guardHumanChallenge(ctx)
  const fields = ctx.page.locator('input[type="password"]:visible')
  if ((await fields.count()) >= 1 && ctx.secrets.password) {
    await fields.first().fill(ctx.secrets.password)
    const btn = ctx.page.getByRole('button', { name: NEXT }).first()
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => undefined)
    else await ctx.page.keyboard.press('Enter').catch(() => undefined)
    await ctx.page.waitForTimeout(2000)
  }
  const totp = await firstVisible(ctx.page, ['input[name="totpPin"]', 'input#totpPin'], 2500)
  if (totp) {
    const code = ctx.totp()
    if (!code) throw new Error('需要 2FA 但账号未配置 TOTP 密钥')
    await totp.fill(code)
    await ctx.page.keyboard.press('Enter').catch(() => undefined)
    await ctx.page.waitForTimeout(2000)
  }
}

export async function gotoSecurityPage(ctx: StepContext, url: string): Promise<void> {
  await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await ctx.page.waitForTimeout(1500)
  await reauthenticate(ctx)
  if (ctx.page.url().includes('signin')) {
    throw new Error('需要重新登录。请关闭无头模式后先运行「登录检测」，在浏览器中完成验证再重试')
  }
}

export async function clickNamed(ctx: StepContext, re: RegExp): Promise<boolean> {
  const btn = ctx.page.getByRole('button', { name: re }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    return true
  }
  const link = ctx.page.getByRole('link', { name: re }).first()
  if (await link.isVisible().catch(() => false)) {
    await link.click()
    return true
  }
  return false
}
