import type { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import { setLogEmitter } from '../services/logger'
import { setTaskEmitter } from '../automation/engine'
import { registerAccountsIpc } from './accounts.ipc'
import { registerTotpIpc } from './totp.ipc'
import { registerAutomationIpc } from './automation.ipc'
import { registerLogsIpc } from './logs.ipc'
import { registerSettingsIpc } from './settings.ipc'
import { registerSystemIpc } from './system.ipc'
import { registerSecurityIpc } from './security.ipc'
import { registerProvidersIpc } from './providers.ipc'
import { registerLockIpc } from './lock.ipc'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  registerAccountsIpc()
  registerTotpIpc()
  registerAutomationIpc()
  registerLogsIpc()
  registerSettingsIpc()
  registerSystemIpc(getWindow)
  registerSecurityIpc()
  registerProvidersIpc()
  registerLockIpc()

  setLogEmitter((entry) => {
    getWindow()?.webContents.send(IPC.logs.new, entry)
  })
  setTaskEmitter((task) => {
    getWindow()?.webContents.send(IPC.automation.taskUpdated, task)
  })
}
