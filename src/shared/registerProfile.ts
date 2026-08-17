import type { Platform, RegisterDraft } from './types'

const FIRST = [
  'James',
  'Emma',
  'Liam',
  'Olivia',
  'Noah',
  'Ava',
  'Mason',
  'Sophia',
  'Ethan',
  'Mia',
  'Lucas',
  'Isabella'
]
const LAST = [
  'Walker',
  'Chen',
  'Miller',
  'Garcia',
  'Reed',
  'Nguyen',
  'Brooks',
  'Patel',
  'Hayes',
  'Cooper',
  'Bennett',
  'Foster'
]
const ADJ = ['cool', 'fast', 'blue', 'neo', 'sky', 'dev', 'byte', 'code', 'pixel', 'quiet']
const NOUN = ['fox', 'wolf', 'owl', 'bear', 'hawk', 'lion', 'frog', 'deer', 'nova', 'leaf']

export const MONTH_OPTIONS = [
  { value: '1', label: '1 月 / January' },
  { value: '2', label: '2 月 / February' },
  { value: '3', label: '3 月 / March' },
  { value: '4', label: '4 月 / April' },
  { value: '5', label: '5 月 / May' },
  { value: '6', label: '6 月 / June' },
  { value: '7', label: '7 月 / July' },
  { value: '8', label: '8 月 / August' },
  { value: '9', label: '9 月 / September' },
  { value: '10', label: '10 月 / October' },
  { value: '11', label: '11 月 / November' },
  { value: '12', label: '12 月 / December' }
]

export const MONTH_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

export const GENDER_OPTIONS = [
  { value: '1', label: '男' },
  { value: '2', label: '女' },
  { value: '3', label: '不愿透露' }
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

export function isGoogleFamily(platform: Platform): boolean {
  return platform === 'google' || platform === 'youtube'
}

export function randomPersonName(): { firstName: string; lastName: string } {
  return { firstName: pick(FIRST), lastName: pick(LAST) }
}

export function randomAdultBirth(): { birthYear: string; birthMonth: string; birthDay: string } {
  const year = 1988 + Math.floor(Math.random() * 16)
  const month = 1 + Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 28)
  return { birthYear: String(year), birthMonth: String(month), birthDay: String(day) }
}

export function githubUsername(): string {
  return `${pick(ADJ)}${pick(NOUN)}${1000 + Math.floor(Math.random() * 9000)}`
}

export function sanitizeGmailLocal(raw: string): string {
  const local = raw
    .replace(/@gmail\.com$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 30)
  return local.length >= 6 ? local : `${local}user12`.slice(0, 30)
}

export function gmailLocal(firstName: string, lastName: string): string {
  const a = firstName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8) || 'user'
  const b = lastName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 6) || 'mail'
  const n = String(10 + Math.floor(Math.random() * 90))
  return sanitizeGmailLocal(`${a}.${b}${n}`)
}

export function loginEmailOf(platform: Platform, draft: Pick<RegisterDraft, 'email' | 'username' | 'googleMode'>): string {
  if (isGoogleFamily(platform) && draft.googleMode === 'gmail') {
    return `${sanitizeGmailLocal(draft.username)}@gmail.com`
  }
  return draft.email
}

export function syncDraftIdentity(platform: Platform, draft: RegisterDraft): RegisterDraft {
  const username =
    isGoogleFamily(platform) && draft.googleMode === 'gmail'
      ? sanitizeGmailLocal(draft.username)
      : draft.username
  const loginEmail = loginEmailOf(platform, { ...draft, username })
  return { ...draft, username, loginEmail }
}

export function draftIssues(platform: Platform, draft: RegisterDraft): string[] {
  const d = syncDraftIdentity(platform, draft)
  const out: string[] = []
  if (!d.email.includes('@')) out.push('收信邮箱无效')
  if (!d.loginEmail.includes('@')) out.push('登录邮箱无效')
  if (d.password.length < 8) out.push('密码至少 8 位')
  if (d.confirmPassword && d.confirmPassword !== d.password) out.push('两次密码不一致')
  if (isGoogleFamily(platform)) {
    if (!d.firstName.trim()) out.push('缺少 First name')
    if (!d.birthYear || !d.birthMonth || !d.birthDay) out.push('生日不完整')
    if (d.googleMode === 'gmail') {
      if (d.username.length < 6) out.push('Gmail 用户名至少 6 位字母或数字')
      if (!d.loginEmail.toLowerCase().endsWith('@gmail.com')) out.push('自建 Gmail 的登录邮箱必须是 @gmail.com')
    }
  }
  if (platform === 'github') {
    if (!/^[A-Za-z0-9-]{1,39}$/.test(d.username)) out.push('GitHub 用户名只能是字母、数字和连字符')
    if (d.password.length < 15) out.push('GitHub 密码至少 15 位')
    if (!d.country.trim()) out.push('缺少国家/地区')
  }
  return out
}
