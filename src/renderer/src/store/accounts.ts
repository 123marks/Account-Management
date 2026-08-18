import { create } from 'zustand'
import type { Account, AccountInput } from '@shared/types'
import { api } from '@renderer/lib/api'

interface AccountsState {
  accounts: Account[]
  loading: boolean
  load: () => Promise<void>
  create: (input: AccountInput) => Promise<Account>
  update: (id: string, patch: Partial<AccountInput>) => Promise<Account>
  replace: (acc: Account) => void
  remove: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
}

export const useAccountsStore = create<AccountsState>((set) => ({
  accounts: [],
  loading: false,
  load: async () => {
    set({ loading: true })
    try {
      set({ accounts: await api.accounts.list() })
    } finally {
      set({ loading: false })
    }
  },
  create: async (input) => {
    const acc = await api.accounts.create(input)
    set((s) => ({ accounts: [acc, ...s.accounts] }))
    return acc
  },
  update: async (id, patch) => {
    const acc = await api.accounts.update(id, patch)
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? acc : a)) }))
    return acc
  },
  replace: (acc) => {
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === acc.id ? acc : a)) }))
  },
  remove: async (id) => {
    await api.accounts.remove(id)
    set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }))
  },
  restore: async (id) => {
    await api.accounts.restore(id)
    const acc = await api.accounts.get(id)
    if (acc) set((s) => ({ accounts: [acc, ...s.accounts.filter((a) => a.id !== id)] }))
  }
}))
