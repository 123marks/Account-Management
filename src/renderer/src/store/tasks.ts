import { create } from 'zustand'
import type { AutomationTask, EnqueueRequest } from '@shared/types'
import { api } from '@renderer/lib/api'

interface TasksState {
  tasks: AutomationTask[]
  load: () => Promise<void>
  enqueue: (req: EnqueueRequest) => Promise<AutomationTask[]>
  cancel: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  clearFinished: () => Promise<void>
  retry: (id: string) => Promise<void>
  subscribe: () => () => void
  upsert: (t: AutomationTask) => void
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  load: async () => {
    set({ tasks: await api.automation.tasks() })
  },
  enqueue: async (req) => {
    const created = await api.automation.enqueue(req)
    set((s) => ({ tasks: [...created, ...s.tasks] }))
    return created
  },
  cancel: async (id) => {
    await api.automation.cancel(id)
  },
  remove: async (id) => {
    await api.automation.delete(id)
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
  },
  clearFinished: async () => {
    await api.automation.clear()
    set((s) => ({
      tasks: s.tasks.filter((t) => t.status === 'queued' || t.status === 'running')
    }))
  },
  retry: async (id) => {
    const t = await api.automation.retry(id)
    if (t) set((s) => ({ tasks: [t, ...s.tasks] }))
  },
  upsert: (t) =>
    set((s) => {
      const idx = s.tasks.findIndex((x) => x.id === t.id)
      if (idx === -1) return { tasks: [t, ...s.tasks] }
      const next = s.tasks.slice()
      next[idx] = t
      return { tasks: next }
    }),
  subscribe: () => api.automation.onTaskUpdated((t) => get().upsert(t))
}))
