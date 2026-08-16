import { create } from 'zustand'
import type { LogEntry, LogFilter } from '@shared/types'
import { api } from '@renderer/lib/api'

interface LogsState {
  logs: LogEntry[]
  filter: LogFilter
  live: boolean
  setFilter: (patch: Partial<LogFilter>) => void
  setLive: (v: boolean) => void
  query: () => Promise<void>
  clear: () => Promise<void>
  subscribe: () => () => void
}

export const useLogsStore = create<LogsState>((set, get) => ({
  logs: [],
  filter: { limit: 500 },
  live: true,
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  setLive: (v) => set({ live: v }),
  query: async () => {
    set({ logs: await api.logs.query(get().filter) })
  },
  clear: async () => {
    await api.logs.clear()
    set({ logs: [] })
  },
  subscribe: () =>
    api.logs.onNew((entry) => {
      if (!get().live) return
      const f = get().filter
      if (f.level && entry.level !== f.level) return
      if (f.category && entry.category !== f.category) return
      if (f.accountId && entry.accountId !== f.accountId) return
      if (f.taskId && entry.taskId !== f.taskId) return
      if (f.search && !entry.message.includes(f.search)) return
      set((s) => ({ logs: [...s.logs.slice(-999), entry] }))
    })
}))
