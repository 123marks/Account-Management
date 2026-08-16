import type { Flow, FlowResult, StepContext } from '../types'
import { firstVisible, genPassword } from './util'

async function ensureGithubLogin(ctx: StepContext): Promise<void> {
  const { page, account, secrets } = ctx

  await ctx.step('打开 GitHub 设置页', async () => {
    await page.goto('https://github.com/settings/profile', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await page.waitForTimeout(1200)
  })

  if (!page.url().includes('/login')) {
    ctx.log('info', '检测到已是登录态，跳过登录')
    return
  }

  await ctx.step('填写用户名与密码', async () => {
    if (!secrets.password) throw new Error('账号未配置密码，无法登录')
    const login = await firstVisible(page, ['#login_field', 'input[name="login"]'], 20000)
    if (!login) throw new Error('未找到登录名输入框')
    await login.fill(account.username || account.email)
    const pwd = await firstVisible(page, ['#password', 'input[name="password"]'], 10000)
    if (!pwd) throw new Error('未找到密码输入框')
    await pwd.fill(secrets.password)
    const submit = page.getByRole('button', { name: /sign in|登录/i }).first()
    if (await submit.isVisible().catch(() => false)) await submit.click()
    else await page.locator('input[name="commit"]').first().click()
    await page.waitForTimeout(2500)
  })

  const otp = await firstVisible(page, ['#app_totp', 'input[name="otp"]', 'input[autocomplete="one-time-code"]'], 4000)
  if (otp) {
    await ctx.step('输入两步验证码 (TOTP)', async () => {
      const code = ctx.totp()
      if (!code) throw new Error('GitHub 要求 2FA，但账号未配置 TOTP 密钥')
      await otp.fill(code)
      await page.waitForTimeout(2500)
    })
  }

  await ctx.step('确认登录结果', async () => {
    await page.goto('https://github.com/settings/profile', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    })
    await page.waitForTimeout(1200)
    if (page.url().includes('/login')) throw new Error('GitHub 登录未成功')
  })
}

const checkLogin: Flow = {
  platform: 'github',
  action: 'check_login',
  title: 'GitHub 登录检测',
  description: '验证 GitHub 账号是否可正常登录，必要时自动完成登录（含 2FA）。',
  params: [],
  async run(ctx): Promise<FlowResult> {
    await ensureGithubLogin(ctx)
    ctx.setProgress(100)
    return { ok: true, message: '登录状态正常' }
  }
}

const changePassword: Flow = {
  platform: 'github',
  action: 'change_password',
  title: 'GitHub 修改密码',
  description: '在 Password and authentication 页填写旧密码并设置新密码；可自动生成并写回账号库。',
  params: [
    { key: 'newPassword', label: '新密码（留空自动生成）', type: 'password', required: false },
    { key: 'saveBack', label: '成功后写回账号库', type: 'boolean', defaultValue: true }
  ],
  async run(ctx): Promise<FlowResult> {
    await ensureGithubLogin(ctx)
    ctx.setProgress(45)
    if (!ctx.secrets.password) throw new Error('缺少当前密码，无法修改')
    const newPassword = String(ctx.params.newPassword ?? '').trim() || genPassword(18)

    await ctx.step('打开密码设置页', async () => {
      await ctx.page.goto('https://github.com/settings/security', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })
      await ctx.page.waitForTimeout(1500)
    })

    await ctx.step('填写旧密码与新密码', async () => {
      const oldPwd = await firstVisible(
        ctx.page,
        ['#user_old_password', 'input[name="user[old_password]"]'],
        20000
      )
      if (!oldPwd) throw new Error('未找到旧密码输入框（页面结构可能已变化）')
      await oldPwd.fill(ctx.secrets.password as string)
      const newPwd = await firstVisible(ctx.page, ['#user_new_password', 'input[name="user[password]"]'], 10000)
      const confirmPwd = await firstVisible(
        ctx.page,
        ['#user_confirm_new_password', 'input[name="user[password_confirmation]"]'],
        10000
      )
      if (!newPwd || !confirmPwd) throw new Error('未找到新密码/确认密码输入框')
      await newPwd.fill(newPassword)
      await confirmPwd.fill(newPassword)
      const btn = ctx.page.getByRole('button', { name: /update password|更新密码/i }).first()
      await btn.click({ timeout: 10000 })
      await ctx.page.waitForTimeout(2500)
    })
    ctx.setProgress(95)

    const saveBack = ctx.params.saveBack !== false
    return {
      ok: true,
      message: '已提交 GitHub 新密码',
      data: { newPassword, accountPatch: saveBack ? { password: newPassword } : undefined }
    }
  }
}

export const githubFlows: Flow[] = [checkLogin, changePassword]
