import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { EnqueueRequest, Platform } from '@shared/types'
import { actionsFor, registerablePlatforms } from '../automation/flows/registry'
import { cancel, enqueue, retry, isAccountBusy } from '../automation/engine'
import { enqueueRegistrations } from '../automation/registration'
import {
  launchManualProfile,
  isProfileBusy,
  readProfileCookies,
  writeProfileCookies
} from '../automation/browser'
import { resolveProxy, socksAuthUnsupported, SOCKS_AUTH_MESSAGE, probeProxy } from '../automation/proxy'
import { listTasks, deleteTask, deleteFinishedTasks } from '../db/repositories/tasks'
import { getAccount, touchLastUsed } from '../db/repositories/accounts'
import { requireUnlocked } from '../services/lock'
import { logger } from '../services/logger'

export function registerAutomationIpc(): void {
  ipcMain.handle(IPC.automation.actions, (_e, platform: Platform) => actionsFor(platform))
  ipcMain.handle(IPC.automation.enqueue, (_e, req: EnqueueRequest) => enqueue(req))
  ipcMain.handle(IPC.automation.cancel, (_e, taskId: string) => cancel(taskId))
  ipcMain.handle(IPC.automation.tasks, () => listTasks())
  ipcMain.handle(IPC.automation.delete, (_e, taskId: string) => deleteTask(taskId))
  ipcMain.handle(IPC.automation.clear, () => ({ cleared: deleteFinishedTasks() }))
  ipcMain.handle(IPC.automation.retry, (_e, taskId: string) => retry(taskId))
  ipcMain.handle(IPC.automation.registerPlatforms, () => registerablePlatforms())
  ipcMain.handle(IPC.automation.registerBatch, (_e, platform: Platform, count: number) =>
    enqueueRegistrations(platform, count)
  )
  ipcMain.handle(IPC.automation.launchProfile, async (_e, accountId: string) => {
    const acc = getAccount(accountId)
    if (!acc) return { ok: false, message: '账号不存在' }
    if (isAccountBusy(accountId)) {
      return { ok: false, message: '该账号有自动化任务正在运行，请等待任务结束后再打开浏览器' }
    }
    if (isProfileBusy(acc.profileDir)) {
      return { ok: false, message: '该账号的浏览器已经打开或配置目录被占用，请查看已有窗口' }
    }
    const resolved = resolveProxy(acc.proxyUrl)
    if (resolved.raw && socksAuthUnsupported(resolved.raw)) {
      return { ok: false, message: SOCKS_AUTH_MESSAGE }
    }
    try {
      const { opened } = await launchManualProfile(acc.profileDir, resolved.proxy, {
        userAgent: acc.userAgent,
        locale: acc.locale,
        timezone: acc.timezone
      })
      if (opened) {
        touchLastUsed(accountId)
        logger.info('automation', `打开独立浏览器: ${acc.label}`, { accountId })
      }
      return {
        ok: opened,
        message: opened ? '已打开该账号的独立浏览器（关闭窗口即结束）' : '该账号的浏览器已经打开'
      }
    } catch (e) {
      return { ok: false, message: '打开失败：' + (e as Error).message }
    }
  })
  ipcMain.handle(IPC.automation.checkProxy, async (_e, accountId: string) => {
    const acc = getAccount(accountId)
    if (!acc) return { ok: false, message: '账号不存在' }
    const resolved = resolveProxy(acc.proxyUrl)
    if (!resolved.raw) return { ok: false, message: '未配置代理（账号与默认代理均为空）' }
    if (socksAuthUnsupported(resolved.raw)) return { ok: false, message: SOCKS_AUTH_MESSAGE }
    if (!resolved.proxy) return { ok: false, message: '代理地址格式无效' }
    try {
      return await probeProxy(resolved.proxy)
    } catch (e) {
      return { ok: false, message: '测试失败：' + (e as Error).message }
    }
  })
  ipcMain.handle(IPC.automation.exportCookies, async (_e, accountId: string) => {
    requireUnlocked()
    const acc = getAccount(accountId)
    if (!acc) throw new Error('账号不存在')
    if (isProfileBusy(acc.profileDir)) throw new Error('请先关闭该账号已打开的浏览器再导出 Cookie')
    if (isAccountBusy(accountId)) throw new Error('该账号有自动化任务在运行，请稍后再试')
    const cookies = await readProfileCookies(acc.profileDir)
    return JSON.stringify({ version: 1, exportedAt: Date.now(), cookies }, null, 2)
  })
  ipcMain.handle(IPC.automation.importCookies, async (_e, accountId: string, json: string) => {
    const acc = getAccount(accountId)
    if (!acc) throw new Error('账号不存在')
    if (isProfileBusy(acc.profileDir)) throw new Error('请先关闭该账号已打开的浏览器再导入 Cookie')
    if (isAccountBusy(accountId)) throw new Error('该账号有自动化任务在运行，请稍后再试')
    const parsed = JSON.parse(json) as unknown
    const cookies = Array.isArray(parsed)
      ? parsed
      : (parsed as { cookies?: unknown[] })?.cookies
    if (!Array.isArray(cookies)) throw new Error('Cookie 文件格式无效（应为数组或 { cookies: [...] }）')
    const imported = await writeProfileCookies(acc.profileDir, cookies)
    return { imported }
  })
}
