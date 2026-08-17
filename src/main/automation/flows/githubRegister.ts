import type { Page } from 'playwright-core'
import type { Flow, FlowResult, StepContext } from '../types'
import { firstVisible, genPassword } from './util'
import { waitForCode } from '../mailbox'
import { getTaskSecret } from '../secrets'
import { getActiveCaptcha, solveFunCaptcha, solveToken } from '../captcha'

const SIGNUP = 'https://github.com/signup'
const ARKOSE_PK = '747B83EC-2CA3-43AD-A7DF-701F286FBABA'
const ARKOSE_SUB = 'github-api.arkoselabs.com'

const ADJ = ['cool', 'fast', 'blue', 'neo', 'sky', 'dev', 'byte', 'code', 'pixel', 'quiet']
const NOUN = ['fox', 'wolf', 'owl', 'bear', 'hawk', 'lion', 'frog', 'deer', 'nova', 'leaf']

function randUsername(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]
  return `${a}${n}${1000 + Math.floor(Math.random() * 9000)}`
}

async function hasArkose(page: Page): Promise<boolean> {
  if (page.frames().some((f) => /octocaptcha|arkoselabs|funcaptcha/i.test(f.url()))) return true
  return (await page.locator('iframe[src*="octocaptcha"], iframe[src*="arkoselabs"]').count()) > 0
}

async function clickCreateAccount(page: Page): Promise<boolean> {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const btn = page.getByRole('button', { name: 'Create account', exact: true }).last()
    if ((await btn.count()) > 0) {
      const disabled = await btn.getAttribute('disabled')
      const aria = await btn.getAttribute('aria-disabled')
      if (disabled === null && aria !== 'true') {
        await btn.click({ timeout: 6000 })
        return true
      }
    }
    await page.waitForTimeout(800)
  }
  return false
}

async function selectCountry(page: Page, country: string): Promise<boolean> {
  try {
    let opener = page.locator('button:has-text("Country"), button:has-text("Region"), [aria-label*="Country" i]').first()
    if ((await opener.count()) === 0) opener = page.getByRole('combobox').first()
    if ((await opener.count()) === 0) return false
    await opener.click({ timeout: 4000 })
    await page.waitForTimeout(600)
    const filt = page.locator('input[placeholder*="Filter" i], input[aria-label*="Filter" i]').first()
    if ((await filt.count()) > 0) {
      await filt.fill(country.slice(0, 16))
      await page.waitForTimeout(700)
    }
    let item = page.getByRole('button', { name: country, exact: true }).first()
    if ((await item.count()) === 0) item = page.locator(`button:has-text("${country}")`).first()
    if ((await item.count()) === 0) return false
    await item.click({ timeout: 4000 })
    await page.waitForTimeout(600)
    return true
  } catch {
    return false
  }
}

async function clickVisualPuzzle(page: Page): Promise<void> {
  const deadline = Date.now() + 50000
  while (Date.now() < deadline) {
    for (const fr of page.frames()) {
      if (!/octocaptcha|arkose|funcaptcha/i.test(fr.url())) continue
      const el = fr.getByText('Visual puzzle', { exact: false }).first()
      if ((await el.count().catch(() => 0)) > 0) {
        await el.click({ timeout: 4000 }).catch(() => undefined)
        return
      }
    }
    await page.waitForTimeout(2500)
  }
}

async function readBlob(page: Page): Promise<string> {
  for (const fr of page.frames()) {
    if (!/octocaptcha|arkose|funcaptcha/i.test(fr.url())) continue
    const blob = String(
      (await fr
        .evaluate(
          `(() => { var el=document.querySelector('#funcaptcha'); return el ? (el.getAttribute('data-data-exchange-payload')||'') : ''; })()`
        )
        .catch(() => '')) || ''
    )
    if (blob.trim()) return blob.trim()
  }
  return ''
}

async function injectArkoseToken(page: Page, token: string): Promise<void> {
  for (const fr of page.frames()) {
    if (!/octocaptcha/i.test(fr.url())) continue
    const origin =
      ((await fr
        .evaluate(
          `(() => { var el=document.querySelector('#funcaptcha'); return el ? (el.getAttribute('data-target-origin')||'') : ''; })()`
        )
        .catch(() => '')) as string) || 'https://github.com'
    await fr
      .evaluate(
        `(([tok, org]) => { parent.postMessage({event:'captcha-complete', sessionToken: tok}, org || '*'); })(${JSON.stringify(
          [token, origin]
        )})`
      )
      .catch(() => undefined)
    return
  }
  await page
    .evaluate(`(function(tok){ window.postMessage({event:'captcha-complete', sessionToken: tok}, '*'); })(${JSON.stringify(token)})`)
    .catch(() => undefined)
}

async function solveGithubArkose(ctx: StepContext): Promise<boolean> {
  const page = ctx.page
  if (!(await hasArkose(page))) return true
  ctx.log('warn', '检测到 GitHub Arkose 验证')
  await clickVisualPuzzle(page)
  await page.waitForTimeout(2500)
  const blob = await readBlob(page)
  const active = getActiveCaptcha()
  const apiKey = String(active?.config.apiKey || '').trim()
  if (active && active.driver !== 'manual' && apiKey) {
    const token =
      (await solveFunCaptcha(apiKey, active.driver, {
        kind: 'funcaptcha',
        sitekey: ARKOSE_PK,
        url: SIGNUP,
        subdomain: ARKOSE_SUB,
        blob,
        timeoutMs: 180000
      })) ||
      (await solveToken({ kind: 'funcaptcha', sitekey: ARKOSE_PK, url: SIGNUP }))
    if (token) {
      await injectArkoseToken(page, token)
      await page.waitForTimeout(4000)
      if (!(await hasArkose(page))) {
        ctx.log('info', 'Arkose 已自动通过')
        return true
      }
    }
  }
  if (ctx.headless) {
    throw new Error(
      'GitHub 需要 Arkose 人机验证。请到「设置」关闭无头模式，或在「服务中心」配置 YesCaptcha/2Captcha 后重试'
    )
  }
  ctx.log('warn', '请在弹出的浏览器中完成拼图验证（最多 3 分钟）…')
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    ctx.throwIfCanceled()
    await page.waitForTimeout(3000)
    const otp = await firstVisible(page, ['input[name="otp"]', 'input[autocomplete="one-time-code"]'], 800)
    if (otp || !(await hasArkose(page))) return true
  }
  throw new Error('等待 GitHub 人机验证超时')
}

export const githubRegister: Flow = {
  platform: 'github',
  action: 'register',
  title: 'GitHub 注册',
  description:
    '用苹果邮箱注册 GitHub。单页表单只点 Create account（不会误点 Google）。遇 Arkose 可自动打码或手动完成，再收 launch code。',
  params: [
    {
      key: 'country',
      label: '国家/地区',
      type: 'text',
      defaultValue: 'United States of America',
      placeholder: 'United States of America'
    }
  ],
  async run(ctx): Promise<FlowResult> {
    const { page, account, secrets } = ctx
    const driver = String(ctx.params.mailboxDriver || '')
    const token = getTaskSecret(ctx.taskId, 'mailboxToken') || ''
    if (!driver || !token) throw new Error('缺少邮箱令牌，请通过「批量注册」发起')

    const password = secrets.password && secrets.password.length >= 15 ? secrets.password : genPassword(18)
    let username = account.username.trim() || randUsername()
    const country = String(ctx.params.country || 'United States of America')

    await ctx.step('打开 GitHub 注册页', async () => {
      await page.goto(SIGNUP, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(2500)
    })
    ctx.setProgress(15)

    await ctx.step('填写邮箱 / 密码 / 用户名', async () => {
      const emailEl = await firstVisible(
        page,
        ['input#email', 'input[name="user[email]"]', 'input[type="email"]'],
        20000
      )
      if (!emailEl) throw new Error('未找到邮箱输入框。GitHub 页面结构可能已变化')
      await emailEl.fill(account.email)
      const pwEl = await firstVisible(page, ['input#password', 'input[name="user[password]"]', 'input[type="password"]'], 8000)
      if (!pwEl) throw new Error('未找到密码输入框')
      await pwEl.fill(password)
      for (let i = 0; i < 3; i++) {
        const userEl = await firstVisible(page, ['input#login', 'input[name="user[login]"]'], 8000)
        if (!userEl) throw new Error('未找到用户名输入框')
        await userEl.fill(username)
        await page.waitForTimeout(2200)
        const body = ((await page.textContent('body').catch(() => '')) || '').toLowerCase()
        if (/unavailable|already taken|not available|is already/.test(body)) {
          username = randUsername()
          ctx.log('info', '用户名已被占用，已换一个')
          continue
        }
        break
      }
    })
    ctx.setProgress(35)

    await ctx.step('选择国家/地区', async () => {
      const ok = await selectCountry(page, country)
      if (!ok) ctx.log('warn', '未能自动选择国家，若 Create account 仍禁用请手动点选')
    })
    ctx.setProgress(45)

    ctx.log('info', '等待 Arkose 脚本初始化…')
    await page.waitForTimeout(8000)

    await ctx.step('提交 Create account', async () => {
      let triggered = false
      for (let i = 0; i < 4; i++) {
        await clickCreateAccount(page)
        await page.waitForTimeout(2500)
        if (await hasArkose(page)) {
          triggered = true
          break
        }
        const otp = await firstVisible(page, ['input[name="otp"]', 'input[autocomplete="one-time-code"]'], 1500)
        if (otp) break
      }
      if (!triggered) ctx.log('info', '未立刻出现 Arkose，继续检测验证码页')
    })
    ctx.setProgress(55)

    await ctx.step('处理 Arkose 人机验证', async () => {
      await solveGithubArkose(ctx)
    })
    ctx.setProgress(70)

    let code = ''
    await ctx.step('等待 GitHub launch code', async () => {
      code = await waitForCode(driver, token, {
        timeoutMs: 180000,
        keyword: 'github',
        pattern: /(?<!\d)(\d{6,8})(?!\d)/,
        toAddress: account.email
      })
      ctx.log('info', `已收到 launch code（${code.length} 位）`)
    })
    ctx.setProgress(88)

    await ctx.step('填写验证码', async () => {
      const el = await firstVisible(
        page,
        ['input[name="otp"]', 'input[autocomplete="one-time-code"]', 'input[inputmode="numeric"]'],
        20000
      )
      if (!el) throw new Error('未找到验证码输入框。请确认人机验证已通过')
      await el.fill(code)
      await page.waitForTimeout(3500)
    })

    await page.goto('https://github.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined)
    await page.waitForTimeout(2000)
    const url = page.url()
    const loggedIn = !/\/(login|signup|session)/i.test(url)

    return {
      ok: true,
      message: loggedIn ? 'GitHub 注册完成' : '注册流程已执行（请人工确认是否已登录）',
      data: {
        accountPatch: {
          username,
          password,
          status: 'active',
          notes: `GitHub 自动注册于 ${new Date().toLocaleString()} · ${url}`
        }
      }
    }
  }
}
