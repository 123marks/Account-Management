import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { runSecurityAudit } from '../services/security'
import { checkVaultBreaches } from '../services/breach'

export function registerSecurityIpc(): void {
  ipcMain.handle(IPC.security.audit, () => runSecurityAudit())
  ipcMain.handle(IPC.security.checkBreaches, () => checkVaultBreaches())
}
