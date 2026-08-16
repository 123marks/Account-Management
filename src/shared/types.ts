// Shared domain types used by both the main process and the renderer.
// Keep this file free of any Node/Electron/DOM specific imports.

export type Platform =
  | 'google'
  | 'github'
  | 'microsoft'
  | 'apple'
  | 'x'
  | 'youtube'
  | 'discord'
  | 'openai'
  | 'anthropic'
  | 'cursor'
  | 'windsurf'
  | 'custom'

export type AccountStatus = 'active' | 'disabled' | 'error'

/** Account as exposed to the renderer. Secrets are NEVER included here. */
export interface Account {
  id: string
  platform: Platform
  label: string
  username: string
  email: string
  hasPassword: boolean
  hasTotp: boolean
  recoveryEmail: string
  recoveryPhone: string
  hasBackupCodes: boolean
  hasRefreshToken: boolean
  customFields: Record<string, string>
  groupName: string
  tags: string[]
  status: AccountStatus
  favorite: boolean
  profileDir: string
  proxyUrl: string
  /** Per-profile browser identity (anti-detect): overrides for the isolated Chrome. */
  userAgent: string
  locale: string
  timezone: string
  notes: string
  lastUsedAt: number | null
  createdAt: number
  updatedAt: number
}

/** A previous password (masked preview + timestamp); plaintext fetched on demand. */
export interface PasswordHistoryEntry {
  id: number
  changedAt: number
  preview: string
}

/** Decrypted secrets, only returned on an explicit, single reveal call. */
export interface AccountSecrets {
  password: string | null
  totpSecret: string | null
  backupCodes: string[]
  refreshToken: string | null
}

/** Payload for creating/updating an account. */
export interface AccountInput {
  platform: Platform
  label: string
  username: string
  email: string
  password?: string | null
  totpSecret?: string | null
  recoveryEmail?: string
  recoveryPhone?: string
  backupCodes?: string[]
  refreshToken?: string | null
  customFields?: Record<string, string>
  groupName?: string
  tags?: string[]
  status?: AccountStatus
  favorite?: boolean
  proxyUrl?: string
  userAgent?: string
  locale?: string
  timezone?: string
  notes?: string
}

export type TaskType =
  | 'check_login'
  | 'change_password'
  | 'change_recovery'
  | 'manage_2fa'
  | 'register'

export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'canceled'

export interface AutomationTask {
  id: string
  accountId: string
  accountLabel: string
  platform: Platform
  type: TaskType
  status: TaskStatus
  params: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  progress: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface EnqueueRequest {
  accountIds: string[]
  type: TaskType
  params: Record<string, unknown>
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  category: string
  accountId: string | null
  taskId: string | null
  message: string
  meta: Record<string, unknown> | null
}

export interface LogFilter {
  level?: LogLevel
  category?: string
  accountId?: string
  taskId?: string
  search?: string
  limit?: number
}

export interface TotpResult {
  code: string
  remainingSeconds: number
  period: number
  digits: number
}

export interface TotpParseResult {
  secret: string
  issuer?: string
  label?: string
  digits: number
  period: number
}

export type SecurityIssueKind =
  | 'no_password'
  | 'weak_password'
  | 'reused_password'
  | 'no_2fa'
  | 'no_recovery'
  | 'stale_password'

export interface AccountAudit {
  accountId: string
  label: string
  platform: Platform
  hasPassword: boolean
  passwordStrength: number // 0..100 (0 when no password)
  issues: SecurityIssueKind[]
  reusedWith: string[] // labels of other accounts sharing this password
  passwordUpdatedAt: number | null
}

export interface BreachResult {
  accountId: string
  count: number // times this password appeared in known breaches (HaveIBeenPwned)
}

export interface SecurityReport {
  generatedAt: number
  score: number // 0..100 overall health
  totals: {
    accounts: number
    noPassword: number
    weakPassword: number
    reusedPassword: number
    no2fa: number
    noRecovery: number
    stalePassword: number
  }
  accounts: AccountAudit[]
}

export type ActionParamType = 'text' | 'password' | 'boolean' | 'select'

export interface ActionParam {
  key: string
  label: string
  type: ActionParamType
  required?: boolean
  options?: { value: string; label: string }[]
  placeholder?: string
  help?: string
  defaultValue?: string | boolean
}

export interface AutomationActionDescriptor {
  platform: Platform
  action: TaskType
  title: string
  description: string
  params: ActionParam[]
}

import type { ProviderType } from './providers'

/** A user-configured instance of a provider driver (secrets encrypted at rest). */
export interface ProviderSetting {
  id: string
  type: ProviderType
  driver: string
  name: string
  enabled: boolean
  isDefault: boolean
  config: Record<string, string | number | boolean>
  createdAt: number
  updatedAt: number
}

export interface ProviderSettingInput {
  type: ProviderType
  driver: string
  name: string
  enabled?: boolean
  isDefault?: boolean
  config?: Record<string, string | number | boolean>
}

export interface ProviderTestResult {
  ok: boolean
  message: string
  detail?: string
}

export type ConnectMode = 'launch' | 'cdp'

export interface AppSettings {
  maxConcurrency: number
  headless: boolean
  chromePathOverride: string | null
  connectMode: ConnectMode
  cdpEndpoint: string
  language: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
  slowMo: number
}

export interface ChromeInfo {
  found: boolean
  path: string | null
  source: 'auto' | 'override'
  version: string | null
}

/** The typed surface exposed to the renderer via contextBridge (window.api). */
export interface Api {
  accounts: {
    list(): Promise<Account[]>
    get(id: string): Promise<Account | null>
    create(input: AccountInput): Promise<Account>
    update(id: string, input: Partial<AccountInput>): Promise<Account>
    remove(id: string): Promise<void>
    reveal(id: string): Promise<AccountSecrets>
    exportAll(): Promise<string>
    exportSelected(ids: string[]): Promise<string>
    exportEncrypted(password: string): Promise<string>
    importJson(json: string, password?: string): Promise<{ imported: number }>
    passwordHistory(accountId: string): Promise<PasswordHistoryEntry[]>
    revealPasswordHistory(historyId: number): Promise<string>
    restorePassword(accountId: string, historyId: number): Promise<void>
    /** Accounts in the recycle bin (soft-deleted). */
    listDeleted(): Promise<Account[]>
    restore(id: string): Promise<void>
    /** Permanently delete one soft-deleted account. */
    purge(id: string): Promise<void>
    /** Permanently delete everything in the recycle bin. */
    purgeDeleted(): Promise<{ purged: number }>
  }
  security: {
    audit(): Promise<SecurityReport>
    checkBreaches(): Promise<BreachResult[]>
  }
  providers: {
    list(type: ProviderType): Promise<ProviderSetting[]>
    save(input: ProviderSettingInput & { id?: string }): Promise<ProviderSetting>
    remove(id: string): Promise<void>
    setDefault(id: string): Promise<void>
    test(id: string): Promise<ProviderTestResult>
  }
  totp: {
    get(id: string): Promise<TotpResult | null>
    preview(secret: string): Promise<TotpResult | null>
    parseUri(uri: string): Promise<TotpParseResult | null>
  }
  automation: {
    actions(platform: Platform): Promise<AutomationActionDescriptor[]>
    enqueue(req: EnqueueRequest): Promise<AutomationTask[]>
    cancel(taskId: string): Promise<void>
    tasks(): Promise<AutomationTask[]>
    delete(taskId: string): Promise<void>
    clear(): Promise<{ cleared: number }>
    retry(taskId: string): Promise<AutomationTask | null>
    registerPlatforms(): Promise<Platform[]>
    registerBatch(platform: Platform, count: number): Promise<{ created: AutomationTask[]; errors: string[] }>
    /** Open the account's isolated Chrome profile (headed, with its proxy) for manual use. */
    launchProfile(accountId: string): Promise<{ ok: boolean; message: string }>
    /** Probe the account's effective proxy and return the exit IP. */
    checkProxy(accountId: string): Promise<{ ok: boolean; ip?: string; message: string }>
    /** Export the account profile's cookies as a JSON string. */
    exportCookies(accountId: string): Promise<string>
    /** Import cookies (Playwright JSON) into the account profile. */
    importCookies(accountId: string, json: string): Promise<{ imported: number }>
    onTaskUpdated(cb: (task: AutomationTask) => void): () => void
  }
  logs: {
    query(filter?: LogFilter): Promise<LogEntry[]>
    clear(): Promise<void>
    onNew(cb: (entry: LogEntry) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  lock: {
    status(): Promise<{ enabled: boolean; autoLockMinutes: number }>
    set(pin: string, autoLockMinutes: number): Promise<{ enabled: boolean; autoLockMinutes: number }>
    verify(pin: string): Promise<boolean>
    disable(pin: string): Promise<boolean>
    setAuto(minutes: number): Promise<{ enabled: boolean; autoLockMinutes: number }>
    lockNow(): Promise<void>
  }
  system: {
    detectChrome(): Promise<ChromeInfo>
    openPath(p: string): Promise<void>
    revealProfile(accountId: string): Promise<void>
    openDataDir(): Promise<void>
    openLogDir(): Promise<void>
    /** Prompt a native "save as" dialog and write `content`. Returns the path, or null if canceled. */
    saveFile(defaultName: string, content: string): Promise<string | null>
    cryptoAvailable(): Promise<boolean>
  }
}
