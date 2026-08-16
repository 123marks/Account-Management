import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { ProviderSettingInput } from '@shared/types'
import type { ProviderType } from '@shared/providers'
import {
  listProvidersMasked,
  saveProvider,
  maskSetting,
  removeProvider,
  setDefaultProvider,
  testProvider
} from '../services/providers'

export function registerProvidersIpc(): void {
  ipcMain.handle(IPC.providers.list, (_e, type: ProviderType) => listProvidersMasked(type))
  ipcMain.handle(IPC.providers.save, (_e, input: ProviderSettingInput & { id?: string }) =>
    maskSetting(saveProvider(input))
  )
  ipcMain.handle(IPC.providers.remove, (_e, id: string) => removeProvider(id))
  ipcMain.handle(IPC.providers.setDefault, (_e, id: string) => setDefaultProvider(id))
  ipcMain.handle(IPC.providers.test, (_e, id: string) => testProvider(id))
}
