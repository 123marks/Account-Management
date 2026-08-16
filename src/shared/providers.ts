// Provider catalog shared by main + renderer. A "provider" is an external
// service used during account automation/registration:
//   - mailbox : receive email verification codes / links
//   - captcha : solve Turnstile / reCAPTCHA / hCaptcha
//   - sms     : rent a phone number and receive SMS codes
//   - proxy   : route browser / HTTP traffic
//
// Each driver declares a `fields` template so the settings UI can render a
// dynamic form. Keep this file free of Node/DOM imports.

export type ProviderType = 'mailbox' | 'captcha' | 'sms' | 'proxy'

export type ProviderFieldType = 'text' | 'password' | 'textarea' | 'number' | 'boolean'

export interface ProviderField {
  key: string
  label: string
  type: ProviderFieldType
  required?: boolean
  placeholder?: string
  help?: string
  secret?: boolean // stored encrypted, masked in UI
  defaultValue?: string | number | boolean
}

export interface ProviderDriver {
  type: ProviderType
  driver: string
  label: string
  description: string
  /** true when the driver needs no configuration (e.g. free temp-mail, manual solve). */
  noConfig?: boolean
  fields: ProviderField[]
  /** mailbox drivers that can create an inbox + poll for codes support a "test" action. */
  testable?: boolean
}

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  mailbox: '邮箱服务',
  captcha: '验证码服务',
  sms: '接码服务',
  proxy: '代理资源'
}

export const PROVIDER_DRIVERS: ProviderDriver[] = [
  // ── Mailbox ──────────────────────────────────────────────
  {
    type: 'mailbox',
    driver: 'tempmail_lol',
    label: 'TempMail.lol（免费临时邮箱）',
    description: '免注册、自动生成临时邮箱并轮询收信，适合快速起步。',
    testable: true,
    fields: [
      {
        key: 'apiBase',
        label: 'API 地址（可选）',
        type: 'text',
        placeholder: 'https://api.tempmail.lol/v2',
        help: '留空使用默认公共 API。'
      }
    ]
  },
  {
    type: 'mailbox',
    driver: 'testmail',
    label: 'testmail.app',
    description: '需 API Key 与命名空间，地址形如 {namespace}.{tag}@inbox.testmail.app。',
    testable: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
      { key: 'namespace', label: 'Namespace', type: 'text', required: true },
      { key: 'tagPrefix', label: 'Tag 前缀（可选）', type: 'text' }
    ]
  },
  {
    type: 'mailbox',
    driver: 'cfworker',
    label: 'Cloudflare Worker 自建邮箱',
    description: '对接自建的 Cloudflare 邮件 Worker / Cloud Mail。',
    fields: [
      { key: 'apiUrl', label: 'API 地址', type: 'text', required: true, placeholder: 'https://mail.example.com' },
      { key: 'adminToken', label: '管理 Token', type: 'password', secret: true },
      { key: 'domain', label: '邮箱域名', type: 'text', placeholder: 'example.com' }
    ]
  },
  {
    type: 'mailbox',
    driver: 'generic_http',
    label: '通用 HTTP 邮箱',
    description: '自定义"创建邮箱 / 拉取邮件"两个 HTTP 接口，用占位符 {email}/{token} 拼装。',
    fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', required: true },
      { key: 'token', label: 'Token / Bearer（可选）', type: 'password', secret: true }
    ]
  },
  // ── Captcha ──────────────────────────────────────────────
  {
    type: 'captcha',
    driver: 'twocaptcha',
    label: '2Captcha',
    description: '主流打码平台，支持 Turnstile / reCAPTCHA / hCaptcha。',
    testable: true,
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true }]
  },
  {
    type: 'captcha',
    driver: 'yescaptcha',
    label: 'YesCaptcha',
    description: '打码平台，2Captcha 兼容协议。',
    testable: true,
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true }]
  },
  {
    type: 'captcha',
    driver: 'manual',
    label: '手动打码',
    description: '弹出浏览器让你手动完成验证，无需 API Key。',
    noConfig: true,
    fields: []
  },
  // ── SMS ──────────────────────────────────────────────────
  {
    type: 'sms',
    driver: 'sms_activate',
    label: 'SMS-Activate',
    description: '按需租用号码接收短信验证码。',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
      { key: 'country', label: '国家代码（可选）', type: 'text', placeholder: '如 0=俄罗斯 6=印尼' }
    ]
  },
  {
    type: 'sms',
    driver: 'smsbower',
    label: 'SMSBower',
    description: '接码平台。',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true }]
  },
  // ── Proxy ────────────────────────────────────────────────
  {
    type: 'proxy',
    driver: 'static',
    label: '静态代理',
    description: '单个固定代理地址。',
    testable: true,
    fields: [
      {
        key: 'url',
        label: '代理地址',
        type: 'text',
        required: true,
        placeholder: 'http://user:pass@host:port 或 socks5://host:port',
        help: '推荐 HTTP(S) 代理。注意：Chromium 不支持带账号密码的 SOCKS5（无鉴权的 SOCKS5 可用）。'
      }
    ]
  },
  {
    type: 'proxy',
    driver: 'rotating_gateway',
    label: '动态代理网关',
    description: '每次请求经网关自动轮换出口 IP。',
    testable: true,
    fields: [{ key: 'url', label: '网关地址', type: 'text', required: true }]
  },
  {
    type: 'proxy',
    driver: 'api_extract',
    label: 'API 提取代理',
    description: '调用提取 API 动态获取代理列表。',
    fields: [{ key: 'fetchUrl', label: '提取 API 地址', type: 'text', required: true }]
  }
]

export function driversFor(type: ProviderType): ProviderDriver[] {
  return PROVIDER_DRIVERS.filter((d) => d.type === type)
}

export function getDriver(type: ProviderType, driver: string): ProviderDriver | undefined {
  return PROVIDER_DRIVERS.find((d) => d.type === type && d.driver === driver)
}
