import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { AppSettings } from '@shared/types'
import { getSettings, setSettings } from '../services/settings'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.settings.get, () => getSettings())
  ipcMain.handle(IPC.settings.set, (_e, patch: Partial<AppSettings>) => setSettings(patch))
}
