import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Info, Play } from 'lucide-react'
import { toast } from 'sonner'
import type { Account, AutomationActionDescriptor, TaskType } from '@shared/types'
import { api } from '@renderer/lib/api'
import { platformMeta } from '@renderer/lib/platforms'
import { useTasksStore } from '@renderer/store/tasks'
import { useAppStore } from '@renderer/store/app'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Badge } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

export function RunAutomationDialog({
  open,
  onOpenChange,
  accounts
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  accounts: Account[]
}): React.JSX.Element {
  const enqueue = useTasksStore((s) => s.enqueue)
  const setPage = useAppStore((s) => s.setPage)
  const [actions, setActions] = useState<AutomationActionDescriptor[]>([])
  const [actionKey, setActionKey] = useState<TaskType | ''>('')
  const [params, setParams] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)

  const platform = accounts[0]?.platform
  const current = useMemo(() => actions.find((a) => a.action === actionKey), [actions, actionKey])

  useEffect(() => {
    if (!open || !platform) return
    void api.automation.actions(platform).then((a) => {
      setActions(a)
      setActionKey(a[0]?.action ?? '')
    })
  }, [open, platform])

  useEffect(() => {
    if (!current) return
    const d: Record<string, unknown> = {}
    current.params.forEach((p) => {
      if (p.defaultValue !== undefined) d[p.key] = p.defaultValue
    })
    setParams(d)
  }, [actionKey, current])

  const run = async (): Promise<void> => {
    if (!current) return
    for (const p of current.params) {
      if (p.required && !String(params[p.key] ?? '').trim()) {
        toast.error(`请填写：${p.label}`)
        return
      }
    }
    setBusy(true)
    try {
      await enqueue({ accountIds: accounts.map((a) => a.id), type: current.action, params })
      toast.success(`已提交 ${accounts.length} 个任务到队列`)
      onOpenChange(false)
      setPage('automation')
    } catch (e) {
      toast.error('提交失败: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>运行自动化</DialogTitle>
          <DialogDescription>先登录 / 授权账号，再执行你选择的操作。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            {platform && <Badge variant="secondary">{platformMeta(platform).label}</Badge>}
            <span className="text-muted-foreground">已选</span>
            <span className="font-semibold">{accounts.length}</span>
            <span className="text-muted-foreground">个账号</span>
          </div>

          <div className="rounded-lg border bg-secondary/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Info className="h-3.5 w-3.5 text-primary" /> 执行流程
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">1 · 登录 / 授权</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">
                2 · {current?.title ?? '执行所选操作'}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              使用每个账号独立的 Chrome 持久化配置执行；若尚未登录或登录态失效，会先在弹出的浏览器里完成登录（可能需手动过验证），随后自动执行上面选择的操作。并发数可在「设置」调整。
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>操作</Label>
            <Select value={actionKey} onValueChange={(v) => setActionKey(v as TaskType)}>
              <SelectTrigger>
                <SelectValue placeholder="选择操作" />
              </SelectTrigger>
              <SelectContent>
                {actions.map((a) => (
                  <SelectItem key={a.action} value={a.action}>
                    {a.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {current && <p className="text-xs text-muted-foreground">{current.description}</p>}
          </div>

          {current?.params.map((p) => (
            <div key={p.key} className="space-y-1.5">
              {p.type === 'boolean' ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <Label className="cursor-pointer">{p.label}</Label>
                  <Switch
                    checked={Boolean(params[p.key])}
                    onCheckedChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))}
                  />
                </div>
              ) : p.type === 'select' ? (
                <>
                  <Label>{p.label}</Label>
                  <Select
                    value={String(params[p.key] ?? '')}
                    onValueChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {(p.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <Label>
                    {p.label}
                    {p.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    type={p.type === 'password' ? 'password' : 'text'}
                    value={String(params[p.key] ?? '')}
                    placeholder={p.placeholder}
                    onChange={(e) => setParams((s) => ({ ...s, [p.key]: e.target.value }))}
                  />
                  {p.help && <p className="text-xs text-muted-foreground">{p.help}</p>}
                </>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={run} disabled={busy || !current}>
            <Play className="h-4 w-4" /> {busy ? '提交中…' : `运行 (${accounts.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
