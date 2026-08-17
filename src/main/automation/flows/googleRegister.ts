import type { Locator, Page } from 'playwright-core'
import type { Flow, FlowResult, StepContext } from '../types'
import type { Platform } from '@shared/types'
import { MONTH_EN, sanitizeGmailLocal } from '@shared/registerProfile'
import { fillControlled, firstVisible, typeInto } from './util'
import { waitForVerify } from '../mailbox'
import { getTaskSecret } from '../secrets'
import { cancelRental, rentNumber, resolveDefaultSms, waitForSmsCode } from '../sms'
import { serviceCode } from '../sms/services'

const SIGNUP =
  'https://accounts.google.com/signup/v2/createaccount?flowName=GlifWebSignIn&flowEntry=SignUp&hl=en'

type Screen =
  | 'name'
  | 'birthday'
  | 'username'
  | 'existing_email'
  | 'password'
  | 'phone'
  | 'recovery'
  | 'verify'
  | 'tos'
  | 'done'
  | 'unknown'

async function isVisible(root: Page | Locator, sel: string): Promise<boolean> {
  return root.locator(sel).first().isVisible().catch(() => false)
}

async function headingOf(page: Page): Promise<string> {
  const el = page.locator('#headingText, h1, h2').first()
  return ((await el.innerText().catch(() => '')) || '').trim()
}

async function readErrors(page: Page): Promise<string> {
  const bits: string[] = []
  const locs = page.locator('[role="alert"], [aria-live="assertive"], [aria-invalid="true"]')
  const n = Math.min(await locs.count(), 8)
  for (let i = 0; i < n; i++) {
    const t = ((await locs.nth(i).innerText().catch(() => '')) || '').trim()
    if (t && !bits.includes(t)) bits.push(t)
  }
  return bits.join(' / ').slice(0, 240)
}

async function clickNext(page: Page): Promise<boolean> {
  const named = page.getByRole('button', { name: /^(next|下一步)$/i })
  if ((await named.count()) > 0 && (await named.first().isVisible().catch(() => false))) {
    await named.first().click({ timeout: 6000 })
    return true
  }
  const ids = page.locator(
    '#collectNameNext, #collectBirthdayNext, #collectUsernameNext, #passwdNext, #next, button[jsname][type="button"]'
  )
  const n = await ids.count()
  for (let i = 0; i < n; i++) {
    const btn = ids.nth(i)
    const text = ((await btn.innerText().catch(() => '')) || '').trim()
    if (/^(next|下一步)$/i.test(text) && (await btn.isVisible().catch(() => false))) {
      await btn.click({ timeout: 6000 })
      return true
    }
  }
  return false
}

async function clickNamed(page: Page, re: RegExp): Promise<boolean> {
  const btn = page.getByRole('button', { name: re }).first()
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ timeout: 6000 })
    return true
  }
  const link = page.getByRole('link', { name: re }).first()
  if (await link.isVisible().catch(() => false)) {
    await link.click({ timeout: 6000 })
    return true
  }
  const text = page.getByText(re).first()
  if (await text.isVisible().catch(() => false)) {
    await text.click({ timeout: 6000 })
    return true
  }
  return false
}

async function detectScreen(page: Page): Promise<Screen> {
  const url = page.url()
  if (/myaccount\.google\.com|youtube\.com\/(premium|account)/i.test(url) && !/signup|signin/i.test(url)) {
    return 'done'
  }
  const heading = (await headingOf(page)).toLowerCase()
  if (/enter your name|create a google account/.test(heading) && (await isVisible(page, 'input[name="firstName"], #firstName'))) {
    return 'name'
  }
  if (/birthday|basic information|gender/.test(heading) && (await isVisible(page, '#month, #day, #year, select[name="month"]'))) {
    return 'birthday'
  }
  if (/strong password|create a password|confirm your password/.test(heading)) return 'password'
  if (await isVisible(page, 'input[name="Passwd"], input[name="passwd"], input[name="PasswdAgain"], input[name="ConfirmPasswd"]')) {
    return 'password'
  }
  if (/use your existing email|enter your email|how you.ll sign in/.test(heading)) return 'existing_email'
  if (/create an email|gmail address/.test(heading)) return 'username'
  if (await isVisible(page, 'input[type="tel"], input[autocomplete="tel"], input[id="phoneNumberId"]')) return 'phone'
  if (/recovery email|add a recovery/.test(heading)) return 'recovery'
  if (/verify your email|confirm.*email|enter the code/.test(heading)) return 'verify'
  if (/privacy and terms|review.*terms/.test(heading)) return 'tos'
  if (await isVisible(page, 'input[name="firstName"], #firstName')) return 'name'
  if (/myaccount\.google\.com/i.test(url)) return 'done'
  return 'unknown'
}

async function pickListValue(page: Page, openerSel: string, value: string, label: string): Promise<void> {
  const native = page.locator(`select${openerSel}, select[name="${openerSel.replace('#', '')}"]`).first()
  if (await native.isVisible().catch(() => false)) {
    await native.selectOption(value).catch(async () => {
      await native.selectOption({ label })
    })
    return
  }
  const opener = page.locator(openerSel).first()
  if (!(await opener.isVisible().catch(() => false))) return
  await opener.click()
  await page.waitForTimeout(350)
  const byValue = page.locator(`[data-value="${value}"]`).first()
  if (await byValue.isVisible().catch(() => false)) {
    await byValue.click()
    return
  }
  const opt = page.getByRole('option', { name: new RegExp(`^${label}$`, 'i') }).first()
  if (await opt.isVisible().catch(() => false)) {
    await opt.click()
    return
  }
  await page.getByText(label, { exact: true }).first().click().catch(() => undefined)
}

async function fillMonth(page: Page, month: number): Promise<void> {
  const n = Math.max(1, Math.min(12, month))
  await pickListValue(page, '#month', String(n), MONTH_EN[n - 1] || 'January')
}

async function fillGender(page: Page, gender: string): Promise<void> {
  const label = gender === '1' ? 'Male' : gender === '2' ? 'Female' : 'Rather not say'
  await pickListValue(page, '#gender', gender, label)
}

async function chooseOwnGmail(page: Page): Promise<void> {
  const radio = page.getByRole('radio', { name: /create your own|自己的 gmail|创建自己/i }).first()
  if (await radio.isVisible().catch(() => false)) {
    await radio.check().catch(() => radio.click())
    await page.waitForTimeout(400)
    return
  }
  await clickNamed(page, /create your own gmail|创建自己的 gmail|创建您自己的/i)
}

async function chooseExistingEmail(page: Page): Promise<void> {
  await clickNamed(page, /use your existing email|使用现有.*邮件|使用您现有/i)
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
    throw new Error('Google 出现人机验证，且无可用自动打码。请到「设置」关闭无头模式后重试并手动完成。')
  }
  ctx.log('warn', '请在弹出的浏览器中完成人机验证，随后自动继续…')
  await ctx.page.waitForTimeout(15000)
}

function profileOf(ctx: StepContext): {
  firstName: string
  lastName: string
  birthYear: string
  birthMonth: string
  birthDay: string
  gender: string
  googleMode: 'gmail' | 'existing'
  username: string
  loginEmail: string
  mailboxEmail: string
  password: string
} {
  const cf = ctx.account.customFields || {}
  const firstName = String(ctx.params.firstName || cf.firstName || 'Alex')
  const lastName = String(ctx.params.lastName || cf.lastName || 'Walker')
  const username = sanitizeGmailLocal(String(ctx.params.username || ctx.account.username || firstName))
  const googleMode = (String(ctx.params.googleMode || cf.googleMode || 'gmail') === 'existing'
    ? 'existing'
    : 'gmail') as 'gmail' | 'existing'
  const mailboxEmail = String(ctx.params.mailboxEmail || ctx.account.recoveryEmail || ctx.account.email)
  const loginEmail =
    googleMode === 'gmail'
      ? `${username}@gmail.com`
      : String(ctx.params.loginEmail || ctx.account.email || mailboxEmail)
  return {
    firstName,
    lastName,
    birthYear: String(ctx.params.birthYear || cf.birthYear || '1996'),
    birthMonth: String(ctx.params.birthMonth || cf.birthMonth || '6'),
    birthDay: String(ctx.params.birthDay || cf.birthDay || '15'),
    gender: String(ctx.params.gender || cf.gender || '3'),
    googleMode,
    username,
    loginEmail,
    mailboxEmail,
    password: String(ctx.secrets.password || ctx.params.confirmPassword || '')
  }
}

async function handlePhone(ctx: StepContext): Promise<string> {
  const page = ctx.page
  if (await clickNamed(page, /^(skip|跳过|not now|以后再说)$/i)) {
    await page.waitForTimeout(1200)
    if ((await detectScreen(page)) !== 'phone') return ''
  }
  const sms = resolveDefaultSms()
  if (sms) {
    const rental = await rentNumber({
      service: serviceCode(ctx.account.platform, sms.driver.driver === 'smspool' ? 'smspool' : 'handler_api'),
      country: String(ctx.params.smsCountry || '') || undefined,
      accountId: ctx.account.id,
      taskId: ctx.taskId,
      signal: ctx.signal
    })
    try {
      ctx.log('info', `已租用接码号码（${rental.phone.slice(0, 5)}…）`)
      const filled = await typeInto(
        page,
        ['input[type="tel"]', 'input[autocomplete="tel"]', 'input[id="phoneNumberId"]'],
        rental.localNumber || rental.phone
      )
      if (!filled) throw new Error('未找到手机号输入框')
      await clickNext(page)
      await page.waitForTimeout(1500)
      const code = await waitForSmsCode(rental.id, { timeoutMs: 180000, signal: ctx.signal })
      ctx.log('info', `已收到短信验证码（${code.length} 位）`)
      const el = await firstVisible(page, ['input[name="code"]', 'input[id="code"]', 'input[autocomplete="one-time-code"]'], 20000)
      if (!el) throw new Error('未找到短信验证码输入框')
      await el.fill(code)
      await clickNext(page)
      return rental.phone
    } catch (e) {
      await cancelRental(rental.id).catch(() => undefined)
      throw e
    }
  }
  if (ctx.headless) {
    throw new Error('Google 要求手机号，请到「服务中心」配置接码，或关闭无头模式后手动填写')
  }
  ctx.log('warn', '请在弹出的浏览器中填写手机号和验证码，随后自动继续…')
  const deadline = Date.now() + 180000
  while (Date.now() < deadline) {
    ctx.throwIfCanceled()
    await page.waitForTimeout(3000)
    if ((await detectScreen(page)) !== 'phone') return String(ctx.params.manualPhone || '')
  }
  throw new Error('等待手动完成手机验证超时')
}

function makeGoogleSignupFlow(platform: Platform): Flow {
  return {
    platform,
    action: 'register',
    title: platform === 'youtube' ? 'YouTube / Google 注册' : 'Google 注册',
    description:
      '按 Google 真实多步向导填表：姓名 → 生日/性别 → 自建 @gmail.com 或使用已有邮箱 → 密码+确认密码。预览里确认过的值会原样填入。人机/手机号需关无头或接码，不会绕过 Google 验证。',
    params: [],
    async run(ctx): Promise<FlowResult> {
      const { page } = ctx
      const driver = String(ctx.params.mailboxDriver || '')
      const token = getTaskSecret(ctx.taskId, 'mailboxToken') || ''
      const p = profileOf(ctx)
      if (!p.password || p.password.length < 8) throw new Error('缺少登录密码，请在预览页确认后再提交')
      ctx.log(
        'info',
        `按预览填表：登录=${p.loginEmail} 收信=${p.mailboxEmail} 名=${p.firstName} 姓=${p.lastName} 生日=${p.birthYear}-${p.birthMonth}-${p.birthDay} 模式=${p.googleMode}`
      )

      await ctx.step('打开 Google 注册页', async () => {
        await page.goto(SIGNUP, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await page.waitForTimeout(1500)
      })
      ctx.setProgress(12)

      let username = p.username
      let loginEmail = p.loginEmail
      let phone = ''
      let sawVerify = false
      const stuck = new Map<Screen, number>()

      for (let i = 0; i < 16; i++) {
        ctx.throwIfCanceled()
        await handleChallenge(ctx)
        const screen = await detectScreen(page)
        const heading = await headingOf(page)
        ctx.log('info', `当前步骤：${screen}${heading ? ` · ${heading}` : ''}`)
        if (screen === 'done') break

        const hits = (stuck.get(screen) || 0) + 1
        stuck.set(screen, hits)
        if (hits >= 3 && screen !== 'unknown' && screen !== 'phone' && screen !== 'verify') {
          const err = await readErrors(page)
          throw new Error(`卡在「${screen}」未前进。${err || heading || '请核对预览字段是否和页面要求一致'}`)
        }

        if (screen === 'name') {
          await ctx.step('填写姓名', async () => {
            const ok = await typeInto(page, ['input[name="firstName"]', '#firstName', 'input[autocomplete="given-name"]'], p.firstName)
            if (!ok) throw new Error('未找到 First name。Google 页面结构可能已变化')
            await typeInto(page, ['input[name="lastName"]', '#lastName', 'input[autocomplete="family-name"]'], p.lastName, 4000)
            if (!(await clickNext(page))) throw new Error('姓名页未找到 Next')
          })
        } else if (screen === 'birthday') {
          await ctx.step('填写生日和性别', async () => {
            await fillMonth(page, Number(p.birthMonth) || 6)
            await typeInto(page, ['#day', 'input[name="day"]', 'input[aria-label*="Day" i]'], p.birthDay, 4000)
            await typeInto(page, ['#year', 'input[name="year"]', 'input[aria-label*="Year" i]'], p.birthYear, 4000)
            await fillGender(page, p.gender)
            if (!(await clickNext(page))) throw new Error('生日页未找到 Next')
          })
        } else if (screen === 'username') {
          await ctx.step(p.googleMode === 'existing' ? '改用已有邮箱' : '自建 Gmail 地址', async () => {
            if (p.googleMode === 'existing') {
              await chooseExistingEmail(page)
              await page.waitForTimeout(800)
              return
            }
            await chooseOwnGmail(page)
            const filled = await typeInto(
              page,
              ['input[name="Username"]', '#username', 'input[aria-label*="Gmail" i]'],
              username
            )
            if (!filled) throw new Error('未找到 Gmail 用户名输入框。请确认已选中 Create your own Gmail address')
            await page.waitForTimeout(900)
            const err = await readErrors(page)
            if (/taken|already|that username|不可用|已被使用/i.test(err + (await headingOf(page)))) {
              username = sanitizeGmailLocal(`${username}${Math.floor(10 + Math.random() * 90)}`)
              loginEmail = `${username}@gmail.com`
              ctx.log('warn', `Gmail 用户名被占用，已改为 ${loginEmail}`)
              await typeInto(page, ['input[name="Username"]', '#username'], username, 4000)
            }
            if (!(await clickNext(page))) throw new Error('邮箱页未找到 Next')
          })
        } else if (screen === 'existing_email') {
          await ctx.step('填写已有邮箱', async () => {
            const filled = await typeInto(
              page,
              ['input[type="email"]', 'input[name="Username"]', '#identifierId'],
              p.mailboxEmail
            )
            if (!filled) throw new Error('未找到已有邮箱输入框')
            loginEmail = p.mailboxEmail
            if (!(await clickNext(page))) throw new Error('已有邮箱页未找到 Next')
          })
        } else if (screen === 'password') {
          await ctx.step('填写密码和确认密码', async () => {
            const pw = await firstVisible(page, ['input[name="Passwd"]', 'input[name="passwd"]'], 12000)
            const boxes = page.locator('input[type="password"]')
            if (pw) {
              if (!(await fillControlled(pw, p.password))) throw new Error('密码未能写入 Passwd')
            } else if ((await boxes.count()) > 0) {
              if (!(await fillControlled(boxes.nth(0), p.password))) throw new Error('密码未能写入')
            } else {
              throw new Error('未找到密码框')
            }
            const confirm = await firstVisible(
              page,
              ['input[name="ConfirmPasswd"]', 'input[name="PasswdAgain"]', 'input[name="ConfirmPassword"]'],
              2500
            )
            if (confirm) {
              if (!(await fillControlled(confirm, p.password))) throw new Error('确认密码未能写入')
            } else if ((await boxes.count()) > 1) {
              await fillControlled(boxes.nth(1), p.password)
            }
            if (!(await clickNext(page))) throw new Error('密码页未找到 Next')
          })
        } else if (screen === 'phone') {
          phone = await ctx.step('处理手机号验证', () => handlePhone(ctx))
        } else if (screen === 'recovery') {
          await ctx.step('填写恢复邮箱', async () => {
            await typeInto(page, ['input[type="email"]', 'input[name="recovery"]', '#recoveryEmailId'], p.mailboxEmail, 8000)
            await clickNext(page)
          })
        } else if (screen === 'verify') {
          sawVerify = true
          if (!driver || !token) throw new Error('需要邮箱验证码，但缺少收信令牌')
          await ctx.step('等待并填写邮箱验证码', async () => {
            const got = await waitForVerify(driver, token, {
              timeoutMs: 180000,
              keyword: 'google',
              toAddress: p.mailboxEmail
            })
            if (got.kind === 'link') {
              await page.goto(got.value, { waitUntil: 'domcontentloaded', timeout: 30000 })
              return
            }
            const el = await firstVisible(page, ['input[name="code"]', 'input[id="code"]', 'input[autocomplete="one-time-code"]'], 15000)
            if (!el) throw new Error('未找到验证码输入框')
            await fillControlled(el, got.value)
            await clickNext(page)
          })
        } else if (screen === 'tos') {
          await ctx.step('同意条款', async () => {
            if (!(await clickNamed(page, /i agree|accept/i))) {
              await clickNext(page)
            }
          })
        } else {
          await ctx.screenshot(`google-unknown-${i}`)
          if (hits >= 3) {
            if (ctx.headless) {
              throw new Error(`Google 出现未识别页面：${heading || page.url()}。请关闭无头模式后对照预览手动点完`)
            }
            ctx.log('warn', '出现未识别页面，请按预览信息手动点完，最多等 3 分钟…')
            const deadline = Date.now() + 180000
            while (Date.now() < deadline) {
              ctx.throwIfCanceled()
              await page.waitForTimeout(3000)
              if ((await detectScreen(page)) !== 'unknown') break
            }
            if ((await detectScreen(page)) === 'unknown') throw new Error('等待手动完成 Google 注册超时')
            stuck.set('unknown', 0)
          } else {
            await page.waitForTimeout(1500)
          }
          continue
        }
        await page.waitForTimeout(1200)
        if ((await detectScreen(page)) !== screen) stuck.set(screen, 0)
        ctx.setProgress(Math.min(90, 12 + i * 6))
      }

      const url = page.url()
      const ok = /myaccount\.google\.com|youtube\.com/i.test(url) || !/signup/i.test(url)
      return {
        ok: true,
        message: ok ? `${platform === 'youtube' ? 'YouTube' : 'Google'} 注册流程已完成` : '注册步骤已按预览执行（请人工确认是否已登录）',
        data: {
          accountPatch: {
            username,
            email: loginEmail,
            password: p.password,
            recoveryEmail: p.mailboxEmail,
            recoveryPhone: phone || undefined,
            status: 'active',
            notes: `Google 多步注册于 ${new Date().toLocaleString()} · 登录 ${loginEmail} · 收信 ${p.mailboxEmail}${sawVerify ? ' · 已验证邮箱' : ''} · ${url}`
          }
        }
      }
    }
  }
}

export const googleRegister = makeGoogleSignupFlow('google')
export const youtubeRegister = makeGoogleSignupFlow('youtube')
