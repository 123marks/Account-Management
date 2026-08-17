import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { cancelRental, listRentals, listSmsServices, rentNumber, waitForSmsCode } from '../automation/sms'

export function registerSmsIpc(): void {
  ipcMain.handle(IPC.sms.rent, (_e, opts: { service: string; country?: string; accountId?: string }) =>
    rentNumber(opts)
  )
  ipcMain.handle(IPC.sms.waitCode, (_e, rentalId: string, timeoutMs?: number) =>
    waitForSmsCode(rentalId, { timeoutMs })
  )
  ipcMain.handle(IPC.sms.cancel, (_e, rentalId: string) => cancelRental(rentalId))
  ipcMain.handle(IPC.sms.list, () => listRentals())
  ipcMain.handle(IPC.sms.services, (_e, country?: string) => listSmsServices(country))
}
