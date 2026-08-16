import React, { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import type { Account } from '@shared/types'
import { api } from '@renderer/lib/api'
import { randomIdentity } from '@renderer/lib/identity'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Checkbox } from '@renderer/components/ui/checkbox'

/**
 * Clone an account into N copies — like an anti-detect "copy profile". Each copy
 * duplicates the structure (platform / group / tags / notes / proxy) and gets a
 * fresh, distinct browser identity by default, so the copies aren't linkable.
 * Login credentials are copied only if explicitly requested.
 */
export function CloneAccountDialog({
  open,
  onOpenChange,
  account,
  onDone
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  account: Account | null
  onDone: () => void | Promise<void>
}): React.JSX.Element {
  const [count, setCount] = useState(1)
  const [randomize, setRandomize] = useState(true)
  const [copyCreds, setCopyCreds] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setCount(1)
      setRandomize(true)
      setCopyCreds(false)
      setBusy(false)
    }
  }, [open])

  const clone = async (): Promise<void> => {
    if (!account) return
    const n = Math.max(1, Math.min(50, Math.floor(count || 1)))
    setBusy(true)
    try {
      const secrets = copyCreds ? await api.accounts.reveal(account.id) : null
      for (let i = 1; i <= n; i++) {
        const id = randomize
          ? randomIdentity()
          : { userAgent: account.userAgent, locale: account.locale, timezone: account.timezone }
        await api.accounts.create({
          platform: account.platform,
          label: `${account.label}-${i}`,
          username: copyCreds ? account.username : '',
          email: copyCreds ? account.email : '',
          password: copyCreds ? secrets?.password ?? null : null,
          totpSecret: copyCreds ? secrets?.totpSecret ?? null : null,
          recoveryEmail: copyCreds ? account.recoveryEmail : '',
          recoveryPhone: copyCreds ? account.recoveryPhone : '',
          backupCodes: copyCreds ? secrets?.backupCodes ?? [] : [],
          refreshToken: copyCreds ? secrets?.refreshToken ?? null : null,
          customFields: account.customFields,
          groupName: account.groupName,
          tags: account.tags,
          notes: account.notes,
          proxyUrl: account.proxyUrl,
          status: 'active',
          favorite: false,
          userAgent: id.userAgent,
          locale: id.locale,
          timezone: id.timezone
        })
      }
      toast.success(`已克隆 ${n} 个副本`)
      await onDone()
      onOpenChange(false)
    } catch (e) {
      toast.error('克隆失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" /> 克隆账号
          </DialogTitle>
          <DialogDescription>
            {account ? `以「${account.label}」为模板批量创建副本。` : ''}
            副本沿用平台 / 分组 / 标签 / 备注 / 代理，命名为「原名-序号」。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>数量（1–50）</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
            <Checkbox checked={randomize} onCheckedChange={(v) => setRandomize(!!v)} className="mt-0.5" />
            <span>
              <span className="font-medium">为每个副本随机分配浏览器身份</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                各副本 UA / 语言 / 时区各不相同（推荐，避免多账号被关联）。
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <Checkbox checked={copyCreds} onCheckedChange={(v) => setCopyCreds(!!v)} className="mt-0.5" />
            <span>
              <span className="font-medium">复制登录凭据（密码 / 2FA / 恢复信息）</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                默认关闭——副本通常是新账号的空壳。开启后所有副本与原账号凭据相同。
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void clone()} disabled={busy || !account}>
            {busy ? '克隆中…' : `克隆 ${Math.max(1, Math.min(50, Math.floor(count || 1)))} 个`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
