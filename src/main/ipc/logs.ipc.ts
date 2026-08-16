import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { LogFilter } from '@shared/types'
import { clearLogs, queryLogs } from '../services/logger'

export function registerLogsIpc(): void {
  ipcMain.handle(IPC.logs.query, (_e, filter: LogFilter | undefined) => queryLogs(filter))
  ipcMain.handle(IPC.logs.clear, () => clearLogs())
}
