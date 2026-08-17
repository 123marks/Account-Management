import type { StepContext } from '../../types'
import { firstVisible } from '../util'
import { guardHumanChallenge } from '../challenge'

const NEXT = /next|下一步|继续|continue/i

async function isSignedIn(ctx: StepContext): Promise<boolean> {
  const url = ctx.page.url()
  return url.includes('myaccount.google.com') && !url.includes('signin') && !url.includes('/signin/')
}

export async function ensureGoogleLogin(ctx: StepContext): Promise<void> {
  const { page, account, secrets } = ctx

  await ctx.step('打开 Google 账户主页', async () => {
    await page.goto('https://myaccount.google.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await page.waitForTimeout(1500)
  })

  if (await isSignedIn(ctx)) {
    ctx.log('info', '检测到已是登录态，跳过登录')
    return
  }

  await ctx.step('输入账号邮箱', async () => {
    await page
      .goto('https://accounts.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => undefined)
    const email = await firstVisible(page, ['input[type="email"]', 'input#identifierId'], 20000)
    if (!email) throw new Error('未找到邮箱输入框')
    await email.fill(account.email || account.username)
    await clickNext(ctx)
    await page.waitForTimeout(1500)
  })

  await ctx.step('输入密码', async () => {
    if (!secrets.password) throw new Error('账号未配置密码，无法登录')
    const pwd = await firstVisible(page, ['input[type="password"]'], 20000)
    if (!pwd) throw new Error('未找到密码输入框')
    await pwd.fill(secrets.password)
    await clickNext(ctx)
    await page.waitForTimeout(2500)
  })

  await ctx.step('检查人机验证', async () => {
    await guardHumanChallenge(ctx)
  })

  const totpInput = await firstVisible(
    page,
    ['input[name="totpPin"]', 'input#totpPin', 'input[type="tel"]'],
    4000
  )
  if (totpInput) {
    await ctx.step('输入两步验证码 (TOTP)', async () => {
      const code = ctx.totp()
      if (!code) throw new Error('目标要求 2FA，但账号未配置 TOTP 密钥')
      await totpInput.fill(code)
      await clickNext(ctx)
      await page.waitForTimeout(2500)
    })
  }

  await ctx.step('确认登录结果', async () => {
    await page.goto('https://myaccount.google.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await page.waitForTimeout(1500)
    if (!(await isSignedIn(ctx))) {
      throw new Error('登录未成功（可能触发验证码/设备验证/风控，请在弹出的浏览器中手动完成一次登录后重试）')
    }
  })
}

async function clickNext(ctx: StepContext): Promise<void> {
  const btn = ctx.page.getByRole('button', { name: NEXT }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => undefined)
    return
  }
  await ctx.page.keyboard.press('Enter').catch(() => undefined)
}
