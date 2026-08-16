import type { Flow, FlowResult, StepContext } from '../types'
import { firstVisible, genPassword } from './util'
import { guardHumanChallenge } from './challenge'

const NEXT = /next|下一步|继续|continue/i

async function isSignedIn(ctx: StepContext): Promise<boolean> {
  const url = ctx.page.url()
  return url.includes('myaccount.google.com') && !url.includes('signin') && !url.includes('/signin/')
}

/**
 * Ensure the target Google account is logged in within this persistent profile.
 * NOTE: Google actively fights automation. Using the account's own persistent
 * profile (real cookies) is the most reliable path; a cold login may still hit
 * captcha / device-verification and require manual assistance. Selectors below
 * are best-effort and may need maintenance as Google's UI changes.
 */
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
  const { page } = ctx
  const btn = page.getByRole('button', { name: NEXT }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => undefined)
    return
  }
  await page.keyboard.press('Enter').catch(() => undefined)
}

const checkLogin: Flow = {
  platform: 'google',
  action: 'check_login',
  title: 'Google 登录检测',
  description: '使用账号的持久化 Chrome 配置验证是否可正常登录，必要时自动完成登录。',
  params: [],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    ctx.setProgress(100)
    return { ok: true, message: '登录状态正常' }
  }
}

const changePassword: Flow = {
  platform: 'google',
  action: 'change_password',
  title: 'Google 修改密码',
  description: '登录后进入安全设置修改登录密码；可自动生成强密码并写回账号库。',
  params: [
    {
      key: 'newPassword',
      label: '新密码（留空则自动生成强密码）',
      type: 'password',
      required: false,
      placeholder: '至少 8 位'
    },
    { key: 'saveBack', label: '成功后写回账号库', type: 'boolean', defaultValue: true }
  ],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    ctx.setProgress(40)

    const provided = String(ctx.params.newPassword ?? '').trim()
    const newPassword = provided || genPassword(16)

    await ctx.step('打开修改密码页', async () => {
      await ctx.page.goto('https://myaccount.google.com/signinoptions/password', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })
      await ctx.page.waitForTimeout(2000)
    })

    await ctx.step('监控人机验证', async () => {
      await guardHumanChallenge(ctx)
    })

    await ctx.step('必要时重新验证当前密码', async () => {
      const fields = ctx.page.locator('input[type="password"]:visible')
      const count = await fields.count()
      if (count === 1 && ctx.secrets.password) {
        await fields.first().fill(ctx.secrets.password)
        await ctx.page.keyboard.press('Enter')
        await ctx.page.waitForTimeout(2500)
      }
    })
    ctx.setProgress(65)

    await ctx.step('填写并提交新密码', async () => {
      const fields = ctx.page.locator('input[type="password"]:visible')
      await fields.first().waitFor({ state: 'visible', timeout: 20000 })
      const count = await fields.count()
      if (count < 2) throw new Error('未找到新密码/确认密码输入框（页面结构可能已变化）')
      await fields.nth(0).fill(newPassword)
      await fields.nth(1).fill(newPassword)
      const btn = ctx.page
        .getByRole('button', { name: /change password|更改密码|save|保存|update|更新/i })
        .first()
      await btn.click({ timeout: 10000 })
      await ctx.page.waitForTimeout(3000)
    })

    await ctx.step('提交后确认无人机验证', async () => {
      await guardHumanChallenge(ctx)
    })
    ctx.setProgress(95)

    const saveBack = ctx.params.saveBack !== false
    return {
      ok: true,
      message: '已提交新密码修改' + (saveBack ? '（将写回账号库）' : ''),
      data: {
        newPassword,
        accountPatch: saveBack ? { password: newPassword } : undefined
      }
    }
  }
}

const changeRecovery: Flow = {
  platform: 'google',
  action: 'change_recovery',
  title: 'Google 修改恢复信息',
  description: '修改恢复邮箱（recovery email）；可选写回账号库。恢复手机因流程复杂暂为尽力而为。',
  params: [
    { key: 'recoveryEmail', label: '新的恢复邮箱', type: 'text', required: true, placeholder: 'name@example.com' },
    { key: 'saveBack', label: '成功后写回账号库', type: 'boolean', defaultValue: true }
  ],
  async run(ctx): Promise<FlowResult> {
    const recoveryEmail = String(ctx.params.recoveryEmail ?? '').trim()
    if (!recoveryEmail) throw new Error('未提供新的恢复邮箱')

    await ensureGoogleLogin(ctx)
    ctx.setProgress(45)

    await ctx.step('打开恢复邮箱设置页', async () => {
      await ctx.page.goto('https://myaccount.google.com/recovery/email', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })
      await ctx.page.waitForTimeout(2000)
    })

    await ctx.step('监控人机验证', async () => {
      await guardHumanChallenge(ctx)
    })

    await ctx.step('必要时重新验证当前密码', async () => {
      const fields = ctx.page.locator('input[type="password"]:visible')
      if ((await fields.count()) === 1 && ctx.secrets.password) {
        await fields.first().fill(ctx.secrets.password)
        await ctx.page.keyboard.press('Enter')
        await ctx.page.waitForTimeout(2500)
      }
    })
    ctx.setProgress(70)

    await ctx.step('填写并保存恢复邮箱', async () => {
      const input = await firstVisible(ctx.page, ['input[type="email"]:visible', 'input[type="text"]:visible'], 20000)
      if (!input) throw new Error('未找到恢复邮箱输入框')
      await input.fill(recoveryEmail)
      const btn = ctx.page.getByRole('button', { name: /save|保存|done|完成|update|更新/i }).first()
      await btn.click({ timeout: 10000 })
      await ctx.page.waitForTimeout(3000)
    })
    ctx.setProgress(95)

    const saveBack = ctx.params.saveBack !== false
    return {
      ok: true,
      message: '已提交恢复邮箱修改',
      data: { recoveryEmail, accountPatch: saveBack ? { recoveryEmail } : undefined }
    }
  }
}

const manage2fa: Flow = {
  platform: 'google',
  action: 'manage_2fa',
  title: 'Google 两步验证状态',
  description: '打开两步验证 (2SV) 页面并读取当前开启状态。启用/轮换 2FA 因流程复杂暂不自动执行。',
  params: [],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    ctx.setProgress(50)
    let enabled = false
    await ctx.step('读取两步验证状态', async () => {
      await ctx.page.goto('https://myaccount.google.com/signinoptions/two-step-verification', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })
      await ctx.page.waitForTimeout(2500)
      const body = (await ctx.page.textContent('body').catch(() => '')) ?? ''
      enabled = /(is on|已开启|已开启两步验证|turn off|关闭两步验证)/i.test(body)
    })
    ctx.setProgress(100)
    return { ok: true, message: `两步验证当前${enabled ? '已开启' : '未开启/未知'}`, data: { enabled } }
  }
}

export const googleFlows: Flow[] = [checkLogin, changePassword, changeRecovery, manage2fa]
