import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import { revealSecrets } from '../db/repositories/accounts'
import { currentCode, parseUri } from '../services/totp'
import { requireUnlocked } from '../services/lock'

export function registerTotpIpc(): void {
  ipcMain.handle(IPC.totp.get, (_e, id: string) => {
    requireUnlocked()
    const secrets = revealSecrets(id)
    if (!secrets.totpSecret) return null
    return currentCode(secrets.totpSecret)
  })
  ipcMain.handle(IPC.totp.preview, (_e, secret: string) => currentCode(secret))
  ipcMain.handle(IPC.totp.parseUri, (_e, uri: string) => parseUri(uri))
}
