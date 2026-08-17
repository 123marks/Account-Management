import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdate
} from '../services/updater'

export function registerUpdaterIpc(): void {
  ipcMain.handle(IPC.updater.status, () => getUpdateStatus())
  ipcMain.handle(IPC.updater.check, () => checkForUpdates())
  ipcMain.handle(IPC.updater.download, () => downloadUpdate())
  ipcMain.handle(IPC.updater.install, () => {
    installUpdate()
  })
}
