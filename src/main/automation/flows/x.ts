import type { Flow, FlowResult, StepContext } from '../types'
import { firstVisible } from './util'

/**
 * X (Twitter) has very aggressive anti-automation. This flow does a best-effort
 * login using the account's persistent profile and reports the result honestly.
 */
async function ensureXLogin(ctx: StepContext): Promise<void> {
  const { page, account, secrets } = ctx

  await ctx.step('打开 X 主页', async () => {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2000)
  })

  const loggedIn = !/\/(login|i\/flow\/login)/.test(page.url()) && !(await isLoginScreen(page))
  if (loggedIn) {
    ctx.log('info', '检测到已是登录态，跳过登录')
    return
  }

  await ctx.step('输入用户名', async () => {
    await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2000)
    const user = await firstVisible(page, ['input[autocomplete="username"]', 'input[name="text"]'], 20000)
    if (!user) throw new Error('未找到用户名输入框')
    await user.fill(account.username || account.email)
    await clickText(ctx, /next|下一步/i)
    await page.waitForTimeout(2000)
  })

  await ctx.step('输入密码', async () => {
    if (!secrets.password) throw new Error('账号未配置密码，无法登录')
    const pwd = await firstVisible(page, ['input[name="password"]', 'input[type="password"]'], 20000)
    if (!pwd) throw new Error('未找到密码输入框（可能要求先验证用户名/手机）')
    await pwd.fill(secrets.password)
    await clickText(ctx, /log in|登录/i)
    await page.waitForTimeout(3000)
  })

  const otp = await firstVisible(
    page,
    ['input[data-testid="ocfEnterTextTextInput"]', 'input[name="text"]', 'input[autocomplete="one-time-code"]'],
    4000
  )
  if (otp) {
    await ctx.step('输入两步验证码 (TOTP)', async () => {
      const code = ctx.totp()
      if (!code) throw new Error('X 要求 2FA，但账号未配置 TOTP 密钥')
      await otp.fill(code)
      await clickText(ctx, /next|下一步|log in|登录|verify|验证/i)
      await page.waitForTimeout(3000)
    })
  }

  await ctx.step('确认登录结果', async () => {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2500)
    if (await isLoginScreen(page)) {
      throw new Error('X 登录未成功（常因风控/验证码/异常登录挑战，建议在浏览器中手动登录一次）')
    }
  })
}

async function isLoginScreen(page: StepContext['page']): Promise<boolean> {
  const url = page.url()
  if (/\/(login|i\/flow\/login)/.test(url)) return true
  const loginBtn = page.getByRole('link', { name: /log in|登录/i }).first()
  return await loginBtn.isVisible().catch(() => false)
}

async function clickText(ctx: StepContext, name: RegExp): Promise<void> {
  const { page } = ctx
  const byRole = page.getByRole('button', { name }).first()
  if (await byRole.isVisible().catch(() => false)) {
    await byRole.click().catch(() => undefined)
    return
  }
  const byText = page.getByText(name).first()
  if (await byText.isVisible().catch(() => false)) {
    await byText.click().catch(() => undefined)
    return
  }
  await page.keyboard.press('Enter').catch(() => undefined)
}

const checkLogin: Flow = {
  platform: 'x',
  action: 'check_login',
  title: 'X 登录检测',
  description: '验证 X(Twitter) 账号登录状态，必要时尽力自动登录（含 2FA）。',
  params: [],
  async run(ctx): Promise<FlowResult> {
    await ensureXLogin(ctx)
    ctx.setProgress(100)
    return { ok: true, message: '登录状态正常' }
  }
}

export const xFlows: Flow[] = [checkLogin]
