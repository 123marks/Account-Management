import React, { useEffect, useState } from 'react'
import { Download, Rocket } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'
import { api } from '@renderer/lib/api'
import { useAppStore } from '@renderer/store/app'
import { Logo } from '@renderer/components/Logo'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Progress } from '@renderer/components/ui/progress'

export function UpdateDialog(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const saveSettings = useAppStore((s) => s.saveSettings)
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState('')

  useEffect(() => {
    void api.updater.status().then(setStatus)
    return api.updater.onChanged(setStatus)
  }, [])

  const version = 'version' in status ? status.version : ''
  const skipped = settings?.skipUpdateVersion || ''
  const open =
    (status.state === 'available' || status.state === 'downloading' || status.state === 'downloaded') &&
    version !== skipped &&
    version !== dismissed

  const notes = status.state === 'available' ? status.releaseNotes || '' : ''

  return (
    <Dialog open={open} onOpenChange={(v) => !v && setDismissed(version)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <Logo size={32} />
            <DialogTitle>发现新版本</DialogTitle>
          </div>
          <DialogDescription>
            当前 v{__APP_VERSION__} → 新版本 v{version}
          </DialogDescription>
        </DialogHeader>
        {notes && (
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-secondary/40 p-3 text-xs">
            {notes}
          </div>
        )}
        {status.state === 'downloading' && (
          <Progress value={Math.max(1, Math.min(100, status.percent))} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDismissed(version)}>
            取消
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void saveSettings({ skipUpdateVersion: version })
              setDismissed(version)
            }}
          >
            跳过此版本
          </Button>
          {status.state === 'downloaded' ? (
            <Button onClick={() => void api.updater.install()}>
              <Rocket className="h-4 w-4" /> 立即更新
            </Button>
          ) : (
            <Button onClick={() => void api.updater.download()}>
              <Download className="h-4 w-4" /> 立即更新
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
