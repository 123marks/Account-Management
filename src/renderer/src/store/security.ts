import { create } from 'zustand'
import type { SecurityReport } from '@shared/types'
import { api } from '@renderer/lib/api'

interface SecurityState {
  report: SecurityReport | null
  loading: boolean
  breaches: Record<string, number>
  breachChecked: boolean
  checkingBreaches: boolean
  load: () => Promise<void>
  checkBreaches: () => Promise<void>
}

export const useSecurityStore = create<SecurityState>((set) => ({
  report: null,
  loading: false,
  breaches: {},
  breachChecked: false,
  checkingBreaches: false,
  load: async () => {
    set({ loading: true })
    try {
      set({ report: await api.security.audit() })
    } finally {
      set({ loading: false })
    }
  },
  checkBreaches: async () => {
    set({ checkingBreaches: true })
    try {
      const results = await api.security.checkBreaches()
      const map: Record<string, number> = {}
      for (const r of results) map[r.accountId] = r.count
      set({ breaches: map, breachChecked: true })
    } finally {
      set({ checkingBreaches: false })
    }
  }
}))
