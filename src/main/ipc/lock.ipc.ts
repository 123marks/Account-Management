import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import {
  getLockStatus,
  setLockPin,
  verifyLockPin,
  disableLock,
  setAutoLock,
  lockNow
} from '../services/lock'

export function registerLockIpc(): void {
  ipcMain.handle(IPC.lock.status, () => getLockStatus())
  ipcMain.handle(IPC.lock.set, (_e, pin: string, autoLockMinutes: number) =>
    setLockPin(pin, autoLockMinutes)
  )
  ipcMain.handle(IPC.lock.verify, (_e, pin: string) => verifyLockPin(pin))
  ipcMain.handle(IPC.lock.disable, (_e, pin: string) => disableLock(pin))
  ipcMain.handle(IPC.lock.setAuto, (_e, minutes: number) => setAutoLock(minutes))
  ipcMain.handle(IPC.lock.lockNow, () => lockNow())
}
