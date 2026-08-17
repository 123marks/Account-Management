import { create } from 'zustand'
import { clearSecretsCache } from '@renderer/lib/secretsCache'

const KEY = 'aam.privacy.revealed'

interface PrivacyState {
  revealed: boolean
  toggle: () => void
  set: (v: boolean) => void
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  revealed: sessionStorage.getItem(KEY) === '1',
  toggle: () =>
    set((s) => {
      const next = !s.revealed
      sessionStorage.setItem(KEY, next ? '1' : '0')
      if (!next) clearSecretsCache()
      return { revealed: next }
    }),
  set: (v) => {
    sessionStorage.setItem(KEY, v ? '1' : '0')
    if (!v) clearSecretsCache()
    set({ revealed: v })
  }
}))
