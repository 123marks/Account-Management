import type { BrowserContext, Page } from 'playwright-core'
import type {
  Account,
  AccountSecrets,
  ActionParam,
  LogLevel,
  Platform,
  TaskType
} from '@shared/types'
import type { CaptchaKind, ChallengeInfo } from './captcha'

export interface StepContext {
  page: Page
  context: BrowserContext
  account: Account
  secrets: AccountSecrets
  params: Record<string, unknown>
  signal: AbortSignal
  taskId: string
  /** Whether this run is headless (no visible browser for manual solving). */
  headless: boolean
  /** Current TOTP code for this account, or null if no 2FA secret stored. */
  totp: () => string | null
  log: (level: LogLevel, message: string, meta?: Record<string, unknown>) => void
  /** Wrap a named step: logs start/end, screenshots + rethrows on failure. */
  step: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  setProgress: (percent: number) => void
  screenshot: (name: string) => Promise<string | null>
  throwIfCanceled: () => void
  /** Detect a human-verification challenge on the current page. */
  detectChallenge: () => Promise<ChallengeInfo>
  /** Solve a captcha via the active provider; null when none/manual is configured. */
  solveCaptcha: (opts: { kind: CaptchaKind; sitekey: string; url?: string }) => Promise<string | null>
}

export interface FlowResult {
  ok: boolean
  message: string
  data?: Record<string, unknown>
}

export interface Flow {
  platform: Platform
  action: TaskType
  title: string
  description: string
  params: ActionParam[]
  run: (ctx: StepContext) => Promise<FlowResult>
}
