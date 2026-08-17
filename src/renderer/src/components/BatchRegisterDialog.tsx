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

  const accounts = useAccountsStore((s) => s.accounts)
  const [mode, setMode] = useState<'email' | 'oauth'>('email')
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [oauthPlatforms, setOauthPlatforms] = useState<Platform[]>([])
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [count, setCount] = useState(1)
  const [mailboxReady, setMailboxReady] = useState<boolean | null>(null)
  const [oauthProvider, setOauthProvider] = useState<'google' | 'github'>('google')
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const sources = accounts.filter(
    (a) => a.platform === oauthProvider && a.status === 'active'
  )

  useEffect(() => {
    if (!open) return
    setCount(1)
    setSourceIds([])
    void api.automation.registerPlatforms().then((ps) => {
      setPlatforms(ps)
      if (mode === 'email') setPlatform(ps[0] ?? '')
    })
    void api.automation.oauthPlatforms().then((ps) => {
      setOauthPlatforms(ps)
      if (mode === 'oauth') setPlatform(ps[0] ?? '')
    })
    void api.providers.list('mailbox').then((list) => setMailboxReady(list.some((p) => p.enabled)))
  }, [open, mode])

  const submit = async (): Promise<void> => {
    if (!platform) {
      toast.error('请选择平台')
      return
    }
    setBusy(true)
    try {
      const r =
        mode === 'oauth'
          ? await api.automation.registerOauth(platform, sourceIds, oauthProvider)
          : await api.automation.registerBatch(platform, count)
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
          <DialogDescription>邮箱注册或用已有 Google/GitHub 账号 OAuth 注册。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === 'email' ? 'default' : 'outline'} onClick={() => setMode('email')}>
              邮箱注册
            </Button>
            <Button size="sm" variant={mode === 'oauth' ? 'default' : 'outline'} onClick={() => setMode('oauth')}>
              OAuth 注册
            </Button>
          </div>
          {mailboxReady === false && mode === 'email' && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="flex-1">
                <p className="text-foreground">尚未配置可用的邮箱服务</p>
                <p className="text-xs text-muted-foreground">
                  邮箱注册会申请收件箱并读取邮件正文提取验证码/链接。也可用已有 Google / GitHub 账号走 OAuth
                  授权回调。请先配置邮箱服务，或在账号详情点「用作收信」。
                </p>
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
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">
                {platform === 'github' ? '1 · 申请苹果邮箱' : '1 · 生成临时邮箱'}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">2 · 浏览器注册 + 收码</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded bg-primary/15 px-2 py-0.5 text-primary">3 · 自动入库</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              每个账号使用独立 Chrome 配置与代理；遇人机验证会用「服务中心」的打码服务或提示手动完成。任务在「自动化」页查看，同平台自动排队。
              GitHub 建议用苹果邮箱（iCloud IMAP / Hide My Email / iCloud Mail API），并关闭无头模式；提交按钮只会点 Create account，不会误点 Google。
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
                  {(mode === 'oauth' ? oauthPlatforms : platforms).map((p) => (
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
            {mode === 'email' ? (
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
            ) : (
              <div className="space-y-1.5">
                <Label>授权方式</Label>
                <Select value={oauthProvider} onValueChange={(v) => setOauthProvider(v as 'google' | 'github')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="github">GitHub</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {mode === 'oauth' && (
            <div className="space-y-1.5">
              <Label>授权源账号（可多选）</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {sources.length === 0 && (
                  <p className="text-xs text-muted-foreground">账号库中没有可用的 Google/GitHub 账号。</p>
                )}
                {sources.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sourceIds.includes(a.id)}
                      onChange={() =>
                        setSourceIds((ids) =>
                          ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id]
                        )
                      }
                    />
                    <span>
                      {a.label} · {a.email || a.username}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={submit}
            disabled={
              busy ||
              !platform ||
              (mode === 'email' && mailboxReady === false) ||
              (mode === 'oauth' && sourceIds.length === 0)
            }
          >
            <Rocket className="h-4 w-4" />{' '}
            {busy ? '提交中…' : `开始注册 (${mode === 'oauth' ? sourceIds.length : count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
