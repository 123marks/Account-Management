import React, { useEffect, useState } from 'react'
import { ArrowRight, Info, Rocket, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { Platform } from '@shared/types'
import { api } from '@renderer/lib/api'
import { platformMeta } from '@renderer/lib/platforms'
import { useAppStore } from '@renderer/store/app'
import { useAccountsStore } from '@renderer/store/accounts'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
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

export function BatchRegisterDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): React.JSX.Element {
  const setPage = useAppStore((s) => s.setPage)
  const loadAccounts = useAccountsStore((s) => s.load)

  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [count, setCount] = useState(1)
  const [mailboxReady, setMailboxReady] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setCount(1)
    void api.automation.registerPlatforms().then((ps) => {
      setPlatforms(ps)
      setPlatform(ps[0] ?? '')
    })
    void api.providers.list('mailbox').then((list) => setMailboxReady(list.some((p) => p.enabled)))
  }, [open])

  const submit = async (): Promise<void> => {
    if (!platform) {
      toast.error('请选择平台')
      return
    }
    setBusy(true)
    try {
      const r = await api.automation.registerBatch(platform, count)
      await loadAccounts()
      if (r.created.length > 0) toast.success(`已提交 ${r.created.length} 个注册任务`)
      if (r.errors.length > 0) toast.error(`${r.errors.length} 个未能入队：${r.errors[0]}`)
      if (r.created.length > 0) {
        onOpenChange(false)
        setPage('automation')
      }
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
          <DialogTitle>批量注册</DialogTitle>
          <DialogDescription>用临时邮箱批量注册账号，注册成功后自动入库。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mailboxReady === false && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="flex-1">
                <p className="text-foreground">尚未配置可用的邮箱服务</p>
                <p className="text-xs text-muted-foreground">注册需要邮箱接收验证码，请先到「服务中心」添加并启用。</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false)
                  setPage('providers')
                }}
              >
                去配置
              </Button>
            </div>
          )}

          <div className="rounded-lg border bg-secondary/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Info className="h-3.5 w-3.5 text-primary" /> 执行流程
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">1 · 生成临时邮箱</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">2 · 浏览器注册 + 收码</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">3 · 自动入库</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              每个账号使用独立 Chrome 配置与代理；遇人机验证会用「服务中心」的打码服务或提示手动完成。任务在「自动化」页查看，同平台自动排队。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>平台</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                <SelectTrigger>
                  <SelectValue placeholder="选择平台" />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p} value={p}>
                      {platformMeta(p).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {platforms.length === 0 && (
                <p className="text-xs text-muted-foreground">暂无支持注册的平台。</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>数量</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy || !platform || mailboxReady === false}>
            <Rocket className="h-4 w-4" /> {busy ? '提交中…' : `开始注册 (${count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
