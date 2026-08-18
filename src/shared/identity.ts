export interface BrowserIdentity {
  userAgent: string
  locale: string
  timezone: string
}

const CHROME = (os: string, ver: string): string =>
  `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`

const WIN = 'Windows NT 10.0; Win64; x64'
const MAC = 'Macintosh; Intel Mac OS X 10_15_7'

const PROFILES: BrowserIdentity[] = [
  { userAgent: CHROME(WIN, '126.0.0.0'), locale: 'en-US', timezone: 'America/New_York' },
  { userAgent: CHROME(WIN, '125.0.0.0'), locale: 'en-GB', timezone: 'Europe/London' },
  { userAgent: CHROME(MAC, '126.0.0.0'), locale: 'en-US', timezone: 'America/Los_Angeles' },
  { userAgent: CHROME(WIN, '124.0.0.0'), locale: 'de-DE', timezone: 'Europe/Berlin' },
  { userAgent: CHROME(MAC, '125.0.0.0'), locale: 'ja-JP', timezone: 'Asia/Tokyo' },
  { userAgent: CHROME(WIN, '126.0.0.0'), locale: 'zh-CN', timezone: 'Asia/Shanghai' },
  { userAgent: CHROME(WIN, '125.0.0.0'), locale: 'fr-FR', timezone: 'Europe/Paris' }
]

export const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney'
]

export function randomIdentity(): BrowserIdentity {
  return PROFILES[Math.floor(Math.random() * PROFILES.length)]
}
