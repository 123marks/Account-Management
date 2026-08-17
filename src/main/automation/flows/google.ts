import type { Flow, FlowResult } from '../types'
import { firstVisible, genPassword } from './util'
import { guardHumanChallenge } from './challenge'
import { ensureGoogleLogin } from './google/login'
import { changePhone } from './google/changePhone'
import { enable2fa } from './google/enable2fa'
import { rotate2fa } from './google/rotate2fa'
import { fetchBackupCodes } from './google/backupCodes'

export { ensureGoogleLogin }

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
  title: 'Google 修改恢复邮箱',
  description: '修改恢复邮箱；如需改手机号请使用「Google 绑定/更换手机号」。',
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
  title: 'Google 两步验证状态（只读）',
  description: '读取两步验证开关状态。启用/轮换请使用独立动作。',
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

export const googleFlows: Flow[] = [
  checkLogin,
  changePassword,
  changeRecovery,
  manage2fa,
  changePhone,
  enable2fa,
  rotate2fa,
  fetchBackupCodes
]
