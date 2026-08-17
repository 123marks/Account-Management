export type MailboxKind = '' | 'gmail_app' | 'icloud_app' | 'outlook_app' | 'outlook_graph'

export const MAILBOX_KINDS: { value: MailboxKind; label: string }[] = [
  { value: '', label: '不收信 / 稍后配置' },
  { value: 'gmail_app', label: 'Gmail · 应用专用密码 IMAP' },
  { value: 'icloud_app', label: 'iCloud · App 专用密码 IMAP' },
  { value: 'outlook_app', label: 'Outlook · 应用密码 IMAP' },
  { value: 'outlook_graph', label: 'Outlook · Graph / OAuth2 双令牌' }
]

export function suggestMailboxKind(platform: string, email: string): MailboxKind {
  const domain = (email.split('@')[1] || '').toLowerCase()
  if (platform === 'apple' || /icloud\.com|me\.com|mac\.com/.test(domain)) return 'icloud_app'
  if (platform === 'microsoft' || /outlook\.|hotmail\.|live\.com/.test(domain)) return 'outlook_app'
  if (platform === 'google' || /gmail\.com|googlemail\.com/.test(domain)) return 'gmail_app'
  return ''
}

export function mailboxKindHelp(kind: MailboxKind): string {
  switch (kind) {
    case 'gmail_app':
      return 'Gmail 不能用登录密码收信。打开 myaccount.google.com → 安全性 → 开启 2FA → 应用专用密码，把 16 位密码填到「收信专用密码」。'
    case 'icloud_app':
      return 'iCloud 用 appleid.apple.com → 登录和安全 → App 专用密码，填到「收信专用密码」。服务器 imap.mail.me.com。'
    case 'outlook_app':
      return 'Outlook/Hotmail 可在 account.microsoft.com 生成应用密码，填「收信专用密码」走 IMAP（outlook.office365.com）。'
    case 'outlook_graph':
      return '商业/长效号：填写 Azure client_id + refresh token（可与登录密码一起粘贴）。优先 Graph 读信，失败再走 OAuth2 IMAP。'
    default:
      return 'Google / Apple / 微软邮箱都能收验证码，但凭证不同：Gmail 和 iCloud 必须用应用专用密码，Outlook 可用应用密码或 Graph 令牌。'
  }
}

export function mailboxKindLabel(kind: string): string {
  return MAILBOX_KINDS.find((k) => k.value === kind)?.label || (kind ? `邮箱服务 · ${kind}` : '未配置收信')
}

export const MAILBOX_SERVICE_DRIVERS = new Set([
  'tempmail_lol',
  'testmail',
  'generic_http',
  'cfworker',
  'icloud_hme',
  'icloud_mail',
  'mail_pickup',
  'outlook_graph',
  'imap',
  'icloud_imap'
])

export function mailboxImapHost(kind: MailboxKind, email: string): string {
  if (kind === 'icloud_app') return 'imap.mail.me.com'
  if (kind === 'outlook_app' || kind === 'outlook_graph') return 'outlook.office365.com'
  const domain = (email.split('@')[1] || '').toLowerCase()
  if (/icloud|me\.com|mac\.com/.test(domain)) return 'imap.mail.me.com'
  if (/outlook|hotmail|live\.com/.test(domain)) return 'outlook.office365.com'
  return 'imap.gmail.com'
}
