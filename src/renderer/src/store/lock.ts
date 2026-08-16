import { create } from 'zustand'
import { api } from '@renderer/lib/api'

interface LockState {
  enabled: boolean
  autoLockMinutes: number
  locked: boolean
  load: () => Promise<void>
  lockNow: () => void
  unlock: (pin: string) => Promise<boolean>
  setup: (pin: string, minutes: number) => Promise<void>
  disable: (pin: string) => Promise<boolean>
  setAuto: (minutes: number) => Promise<void>
}

export const useLockStore = create<LockState>((set, get) => ({
  enabled: false,
  autoLockMinutes: 0,
  locked: false,
  load: async () => {
    const s = await api.lock.status()
    // Start locked on launch when a PIN is configured.
    set({ enabled: s.enabled, autoLockMinutes: s.autoLockMinutes, locked: s.enabled })
  },
  lockNow: () => {
    if (!get().enabled) return
    set({ locked: true })
    void api.lock.lockNow()
  },
  unlock: async (pin) => {
    const ok = await api.lock.verify(pin)
    if (ok) set({ locked: false })
    return ok
  },
  setup: async (pin, minutes) => {
    const s = await api.lock.set(pin, minutes)
    set({ enabled: s.enabled, autoLockMinutes: s.autoLockMinutes, locked: false })
  },
  disable: async (pin) => {
    const ok = await api.lock.disable(pin)
    if (ok) set({ enabled: false, locked: false })
    return ok
  },
  setAuto: async (minutes) => {
    const s = await api.lock.setAuto(minutes)
    set({ autoLockMinutes: s.autoLockMinutes })
  }
}))
