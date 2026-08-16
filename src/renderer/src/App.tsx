import React, { useEffect } from 'react'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { Sidebar } from '@renderer/components/Sidebar'
import { TopBar } from '@renderer/components/TopBar'
import { useAppStore } from '@renderer/store/app'
import { useAccountsStore } from '@renderer/store/accounts'
import { useTasksStore } from '@renderer/store/tasks'
import { useLogsStore } from '@renderer/store/logs'
import { useSecurityStore } from '@renderer/store/security'
import { useLockStore } from '@renderer/store/lock'
import { applyTheme } from '@renderer/lib/theme'
import Dashboard from '@renderer/pages/Dashboard'
import Accounts from '@renderer/pages/Accounts'
import Security from '@renderer/pages/Security'
import TwoFactor from '@renderer/pages/TwoFactor'
import Automation from '@renderer/pages/Automation'
import Providers from '@renderer/pages/Providers'
import Logs from '@renderer/pages/Logs'
import SettingsPage from '@renderer/pages/Settings'
import { CommandPalette } from '@renderer/components/CommandPalette'
import { AccountDetailDrawer } from '@renderer/components/AccountDetailDrawer'
import { LockOverlay } from '@renderer/components/LockOverlay'

export default function App(): React.JSX.Element {
  const page = useAppStore((s) => s.page)
  const init = useAppStore((s) => s.init)
  const loadAccounts = useAccountsStore((s) => s.load)
  const loadTasks = useTasksStore((s) => s.load)
  const loadSecurity = useSecurityStore((s) => s.load)
  const subscribeTasks = useTasksStore((s) => s.subscribe)
  const subscribeLogs = useLogsStore((s) => s.subscribe)
  const loadLock = useLockStore((s) => s.load)
  const lockEnabled = useLockStore((s) => s.enabled)
  const autoLockMinutes = useLockStore((s) => s.autoLockMinutes)
  const lockNow = useLockStore((s) => s.lockNow)
  const themePref = useAppStore((s) => s.settings?.theme)

  useEffect(() => {
    void init()
    void loadAccounts()
    void loadTasks()
    void loadSecurity()
    void loadLock()
    const unTasks = subscribeTasks()
    const unLogs = subscribeLogs()
    return () => {
      unTasks()
      unLogs()
    }
  }, [init, loadAccounts, loadTasks, loadSecurity, loadLock, subscribeTasks, subscribeLogs])

  // Idle auto-lock: reset a timer on user activity; lock when it elapses.
  useEffect(() => {
    if (!lockEnabled || autoLockMinutes <= 0) return
    let timer = 0
    const reset = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => lockNow(), autoLockMinutes * 60000)
    }
    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [lockEnabled, autoLockMinutes, lockNow])

  // Apply the saved theme once settings load, and follow the OS when set to "system".
  useEffect(() => {
    if (!themePref) return
    applyTheme(themePref)
    if (themePref !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themePref])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        const s = useAppStore.getState()
        s.setCommandOpen(!s.commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <div className="animate-fade-in p-6">
              {page === 'dashboard' && <Dashboard />}
              {page === 'accounts' && <Accounts />}
              {page === 'security' && <Security />}
              {page === '2fa' && <TwoFactor />}
              {page === 'automation' && <Automation />}
              {page === 'providers' && <Providers />}
              {page === 'logs' && <Logs />}
              {page === 'settings' && <SettingsPage />}
            </div>
          </main>
        </div>
      </div>
      <CommandPalette />
      <AccountDetailDrawer />
      <LockOverlay />
    </TooltipProvider>
  )
}
