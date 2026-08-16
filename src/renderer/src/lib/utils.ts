import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`
}

export function genPassword(len = 16): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%^&*-_=+']
  const all = sets.join('')
  const bytes = new Uint32Array(Math.max(len, sets.length))
  crypto.getRandomValues(bytes)
  const out: string[] = []
  sets.forEach((s, i) => out.push(s[bytes[i] % s.length]))
  for (let i = sets.length; i < len; i++) out.push(all[bytes[i] % all.length])
  const sh = new Uint32Array(out.length)
  crypto.getRandomValues(sh)
  for (let i = out.length - 1; i > 0; i--) {
    const j = sh[i] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join('')
}

export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return '从未'
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s} 秒前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return `${d} 天前`
}
