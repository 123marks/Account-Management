import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from './logger'
import type { UpdateStatus } from '@shared/types'

let current: UpdateStatus = { state: 'idle' }
let emit: ((s: UpdateStatus) => void) | null = null

export function getUpdateStatus(): UpdateStatus {
  return current
}

export function setUpdateEmitter(fn: (s: UpdateStatus) => void): void {
  emit = fn
}

function setStatus(s: UpdateStatus): void {
  current = s
  emit?.(s)
}

export function updaterGate(): { ok: boolean; message: string } {
  if (!app.isPackaged) return { ok: false, message: '开发模式不检查更新' }
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return { ok: false, message: '便携版请到 GitHub Releases 手动下载；安装版（setup）会自动更新' }
  }
  return { ok: true, message: '' }
}

function notesOf(info: { releaseNotes?: string | { note: string | null }[] | null }): string {
  const raw = info.releaseNotes
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) return raw.map((n) => n.note || '').filter(Boolean).join('\n')
  return ''
}

export function initUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = {
    info: (m) => logger.info('updater', String(m)),
    warn: (m) => logger.warn('updater', String(m)),
    error: (m) => logger.error('updater', String(m)),
    debug: () => undefined
  }

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    setStatus({ state: 'available', version: info.version, releaseNotes: notesOf(info) })
    logger.info('updater', `发现新版本 ${info.version}`)
  })
  autoUpdater.on('update-not-available', (info) => {
    setStatus({ state: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (p) => {
    setStatus({
      state: 'downloading',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'downloaded', version: info.version })
    logger.info('updater', `新版本 ${info.version} 已下载，重启后安装`)
  })
  autoUpdater.on('error', (err) => {
    setStatus({ state: 'error', message: err.message })
    logger.warn('updater', err.message)
  })
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  const gate = updaterGate()
  if (!gate.ok) {
    setStatus({ state: 'disabled', message: gate.message })
    return current
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    setStatus({ state: 'error', message: (e as Error).message })
  }
  return current
}

export async function downloadUpdate(): Promise<void> {
  if (!updaterGate().ok) return
  await autoUpdater.downloadUpdate()
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}

export function scheduleStartupCheck(): void {
  if (!updaterGate().ok) return
  setTimeout(() => {
    void checkForUpdates()
  }, 8000)
  setInterval(() => {
    void checkForUpdates()
  }, 4 * 60 * 60 * 1000)
}
