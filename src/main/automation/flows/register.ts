import type { Flow, FlowResult, StepContext } from '../types'
import { githubRegister } from './githubRegister'
import type { Platform } from '@shared/types'
import { firstVisible } from './util'
import { waitForVerify } from '../mailbox'
import { getTaskSecret } from '../secrets'

/**
 * A data-driven registration flow. Each platform provides selectors + URL, so
 * adding a browser-form platform is just adding a spec (no bespoke code). Real
 * sites vary and add anti-bot measures, so selectors are best-effort and may
 * need tuning; the flow logs each step and screenshots on failure to help.
 *
 * Optional fields (name / TOS / confirm-password) cover multi-field signups
 * like Windsurf while staying no-op for minimal ones like Cursor.
 */
export interface RegisterSpec {
  platform: Platform
  title: string
  description: string
  signupUrl: string
  firstNameSelectors?: string[]
  lastNameSelectors?: string[]
  emailSelectors: string[]
  tosSelectors?: string[]
  passwordSelectors?: string[]
  confirmPasswordSelectors?: string[]
  submitSelectors?: string[]
  codeSelectors: string[]
  emailKeyword?: string
  successUrlIncludes?: string
}

function deriveName(email: string): { first: string; last: string } {
  const local = (email.split('@')[0] || 'user').replace(/[^a-zA-Z]/g, '') || 'user'
  const first = local.slice(0, 8) || 'User'
  return { first: first.charAt(0).toUpperCase() + first.slice(1), last: 'User' }
}

async function clickOrEnter(ctx: StepContext, selectors?: string[]): Promise<void> {
  const { page } = ctx
  if (selectors?.length) {
    for (const sel of selectors) {
      const btn = page.locator(sel).first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => undefined)
        return
      }
    }
  }
  const roleBtn = page
    .getByRole('button', { name: /continue|next|sign ?up|create|submit|下一步|继续|注册|创建/i })
    .first()
  if (await roleBtn.isVisible().catch(() => false)) {
    await roleBtn.click().catch(() => undefined)
    return
  }
  await page.keyboard.press('Enter').catch(() => undefined)
}

async function handleChallenge(ctx: StepContext): Promise<void> {
  const ch = await ctx.detectChallenge()
  if (!ch.present) return
  ctx.log('warn', `检测到人机验证(${ch.kind})`)
  if (ch.sitekey) {
    const token = await ctx.solveCaptcha({ kind: ch.kind, sitekey: ch.sitekey })
    if (token) {
      ctx.log('info', '打码服务已返回 token')
      return
    }
  }
  if (ctx.headless) {
    throw new Error('检测到人机验证，且无可用自动打码；请到「设置」关闭无头模式后重试并手动完成。')
  }
  ctx.log('warn', '请在弹出的浏览器中手动完成人机验证，随后自动继续…')
  await ctx.page.waitForTimeout(10000)
}

export function makeRegisterFlow(spec: RegisterSpec): Flow {
  return {
    platform: spec.platform,
    action: 'register',
    title: spec.title,
    description: spec.description,
    params: [],
    async run(ctx): Promise<FlowResult> {
      const { page, account, secrets } = ctx
      const driver = String(ctx.params.mailboxDriver || '')
      // The mailbox token is a secret kept in memory (not in persisted params).
      const token = getTaskSecret(ctx.taskId, 'mailboxToken') || ''
      if (!driver || !token) {
        throw new Error('缺少邮箱令牌，请通过「批量注册」发起注册任务')
      }
      const name = deriveName(account.email)

      await ctx.step('打开注册页', async () => {
        await page.goto(spec.signupUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(1500)
      })
      ctx.setProgress(18)

      await ctx.step('填写注册信息', async () => {
        if (spec.firstNameSelectors?.length) {
          const el = await firstVisible(page, spec.firstNameSelectors, 8000)
          if (el) await el.fill(name.first)
        }
        if (spec.lastNameSelectors?.length) {
          const el = await firstVisible(page, spec.lastNameSelectors, 4000)
          if (el) await el.fill(name.last)
        }
        const email = await firstVisible(page, spec.emailSelectors, 20000)
        if (!email) throw new Error('未找到邮箱输入框（该平台选择器可能需要调整）')
        await email.fill(account.email)
        if (spec.tosSelectors?.length) {
          for (const sel of spec.tosSelectors) {
            const cb = page.locator(sel).first()
            if (await cb.isVisible().catch(() => false)) {
              await cb.check().catch(() => cb.click().catch(() => undefined))
              break
            }
          }
        }
        await clickOrEnter(ctx, spec.submitSelectors)
        await page.waitForTimeout(2000)
      })
      ctx.setProgress(35)

      if (spec.passwordSelectors?.length && secrets.password) {
        await ctx.step('设置密码', async () => {
          const el = await firstVisible(page, spec.passwordSelectors as string[], 8000)
          if (el) {
            await el.fill(secrets.password as string)
            if (spec.confirmPasswordSelectors?.length) {
              const c = await firstVisible(page, spec.confirmPasswordSelectors, 3000)
              if (c) await c.fill(secrets.password as string)
            }
            await clickOrEnter(ctx, spec.submitSelectors)
            await page.waitForTimeout(2000)
          }
        })
      }
      ctx.setProgress(50)

      await ctx.step('处理人机验证', () => handleChallenge(ctx))
      ctx.setProgress(60)

      const verify = { kind: 'code' as 'code' | 'link', value: '' }
      await ctx.step('等待邮箱验证码 / 验证链接', async () => {
        const got = await waitForVerify(driver, token, {
          timeoutMs: 150000,
          keyword: spec.emailKeyword,
          toAddress: account.email
        })
        verify.kind = got.kind
        verify.value = got.value
        ctx.log('info', got.kind === 'code' ? `已收到邮箱验证码（${got.value.length} 位）` : '已收到验证链接')
      })
      ctx.setProgress(80)

      await ctx.step(verify.kind === 'link' ? '打开验证链接' : '填写验证码', async () => {
        if (!verify.value) throw new Error('未收到邮箱验证')
        if (verify.kind === 'link') {
          await page.goto(verify.value, { waitUntil: 'domcontentloaded', timeout: 30000 })
          await page.waitForTimeout(2500)
          return
        }
        const el = await firstVisible(page, spec.codeSelectors, 15000)
        if (!el) throw new Error('未找到验证码输入框')
        await el.fill(verify.value)
        await clickOrEnter(ctx, spec.submitSelectors)
        await page.waitForTimeout(3000)
      })
      ctx.setProgress(95)

      await handleChallenge(ctx)

      const url = page.url()
      const success = spec.successUrlIncludes ? url.includes(spec.successUrlIncludes) : true
      return {
        ok: true,
        message: success ? '注册流程已完成' : '注册流程已执行（请人工确认结果）',
        data: {
          accountPatch: {
            status: 'active',
            notes: `自动注册于 ${new Date().toLocaleString()} · ${url}`
          }
        }
      }
    }
  }
}

const CURSOR_REGISTER: RegisterSpec = {
  platform: 'cursor',
  title: 'Cursor 注册',
  description: '在 Cursor 认证页用临时邮箱注册：填邮箱/密码 → 收邮箱验证码 → 完成。',
  signupUrl: 'https://authenticator.cursor.sh/sign-up',
  emailSelectors: ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="username"]'],
  passwordSelectors: ['input[type="password"]', 'input[name="password"]'],
  submitSelectors: ['button[type="submit"]'],
  codeSelectors: ['input[autocomplete="one-time-code"]', 'input[name="code"]', 'input[inputmode="numeric"]'],
  emailKeyword: 'cursor',
  successUrlIncludes: 'cursor.com'
}

const WINDSURF_REGISTER: RegisterSpec = {
  platform: 'windsurf',
  title: 'Windsurf 注册',
  description: '在 Windsurf 注册页用临时邮箱注册：填姓名/邮箱 → 设密码 → 收邮箱验证码 → 完成。',
  signupUrl: 'https://windsurf.com/account/register',
  firstNameSelectors: ['input[autocomplete="given-name"]'],
  lastNameSelectors: ['input[autocomplete="family-name"]'],
  emailSelectors: ['input[type="email"]'],
  tosSelectors: ['#auth1-agree-tos'],
  passwordSelectors: ['input[name="password"]'],
  confirmPasswordSelectors: ['input[name="confirmPassword"]'],
  submitSelectors: ['button[type="submit"]'],
  codeSelectors: ['input[autocomplete="one-time-code"]'],
  emailKeyword: 'windsurf',
  successUrlIncludes: 'windsurf.com'
}

export const registerFlows: Flow[] = [
  makeRegisterFlow(CURSOR_REGISTER),
  makeRegisterFlow(WINDSURF_REGISTER),
  githubRegister
]
