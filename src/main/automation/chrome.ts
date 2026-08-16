import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import type { ChromeInfo } from '@shared/types'

function winCandidates(): string[] {
  const pf = process.env['ProgramFiles']
  const pf86 = process.env['ProgramFiles(x86)']
  const local = process.env['LOCALAPPDATA']
  return [
    pf && `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    pf86 && `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    local && `${local}\\Google\\Chrome\\Application\\chrome.exe`
  ].filter(Boolean) as string[]
}

const CANDIDATES: Record<string, string[]> = {
  win32: winCandidates(),
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta'
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
    '/snap/bin/chromium'
  ]
}

function getVersion(execPath: string): string | null {
  if (process.platform === 'win32') {
    // chrome.exe --version does not print to stdout on Windows; skip.
    return null
  }
  try {
    return execFileSync(execPath, ['--version'], { timeout: 3000 }).toString().trim() || null
  } catch {
    return null
  }
}

export function detectChrome(override?: string | null): ChromeInfo {
  if (override && existsSync(override)) {
    return { found: true, path: override, source: 'override', version: getVersion(override) }
  }
  const list = CANDIDATES[process.platform] ?? []
  for (const p of list) {
    if (p && existsSync(p)) {
      return { found: true, path: p, source: 'auto', version: getVersion(p) }
    }
  }
  return { found: false, path: null, source: 'auto', version: null }
}
