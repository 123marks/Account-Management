import { create } from 'zustand'
import type { ProviderSetting, ProviderSettingInput } from '@shared/types'
import type { ProviderType } from '@shared/providers'
import { api } from '@renderer/lib/api'

const TYPES: ProviderType[] = ['mailbox', 'captcha', 'sms', 'proxy']

interface ProvidersState {
  items: ProviderSetting[]
  loading: boolean
  load: () => Promise<void>
  save: (input: ProviderSettingInput & { id?: string }) => Promise<void>
  remove: (id: string) => Promise<void>
  setDefault: (id: string) => Promise<void>
}

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  items: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      const lists = await Promise.all(TYPES.map((t) => api.providers.list(t)))
      set({ items: lists.flat() })
    } finally {
      set({ loading: false })
    }
  },
  save: async (input) => {
    await api.providers.save(input)
    await get().load()
  },
  remove: async (id) => {
    await api.providers.remove(id)
    await get().load()
  },
  setDefault: async (id) => {
    await api.providers.setDefault(id)
    await get().load()
  }
}))
