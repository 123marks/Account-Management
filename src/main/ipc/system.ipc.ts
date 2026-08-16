import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { IPC } from '@shared/ipc'
import { detectChrome } from '../automation/chrome'
import { getSettings } from '../services/settings'
import { isCryptoAvailable } from '../services/crypto'
import { getAccount } from '../db/repositories/accounts'
import { paths } from '../paths'

export function registerSystemIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.system.detectChrome, () => detectChrome(getSettings().chromePathOverride))
  ipcMain.handle(IPC.system.openPath, async (_e, p: string) => {
    await shell.openPath(p)
  })
  ipcMain.handle(IPC.system.revealProfile, async (_e, accountId: string) => {
    const acc = getAccount(accountId)
    if (acc?.profileDir) await shell.openPath(acc.profileDir)
  })
  ipcMain.handle(IPC.system.openDataDir, async () => {
    await shell.openPath(paths().userData)
  })
  ipcMain.handle(IPC.system.openLogDir, async () => {
    await shell.openPath(paths().logs)
  })
  ipcMain.handle(IPC.system.saveFile, async (_e, defaultName: string, content: string) => {
    const win = getWindow()
    const opts = { defaultPath: defaultName }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    await writeFile(res.filePath, content, 'utf8')
    return res.filePath
  })
  ipcMain.handle(IPC.system.cryptoAvailable, () => isCryptoAvailable())
}
