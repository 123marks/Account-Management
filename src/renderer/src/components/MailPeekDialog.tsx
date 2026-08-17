import React, { useEffect, useState } from 'react'
import { Inbox, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { MailPreview } from '@shared/types'
import { api } from '@renderer/lib/api'
import { formatTime } from '@renderer/lib/utils'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

export function MailPeekDialog({
  open,
  onOpenChange,
  accountId,
  providerId,
  generatedInboxId
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  accountId?: string
  providerId?: string
  generatedInboxId?: string
}): React.JSX.Element {
  const [mails, setMails] = useState<MailPreview[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const list = generatedInboxId
        ? await api.providers.peekGeneratedInbox(generatedInboxId)
        : accountId
          ? await api.providers.peekAccountInbox(accountId)
          : await api.providers.peekMails(providerId)
      setMails(list)
    } catch (e) {
      setMails([])
      setError(
        (e as Error).message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/i, '')
      )
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open, accountId, providerId, generatedInboxId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>最近邮件</DialogTitle>
          <DialogDescription>
            读取收件箱正文（截断预览），用于确认能否收到验证码 / 验证链接。Gmail / iCloud 必须填应用专用密码；Outlook 可用应用密码或 Graph 令牌。请在「编辑账号 → 收信方式」填写。
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {error && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {error}
            </p>
          )}
          {!error && mails.length === 0 && !busy && (
            <EmptyState icon={Inbox} title="没有读到邮件" description="确认邮箱服务已配置，或该账号 IMAP 密码可用。" />
          )}
          {mails.map((m) => (
            <div key={m.id} className="rounded-lg border bg-card/60 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{m.subject || '（无主题）'}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {m.from || '未知发件人'}
                    {m.to ? ` → ${m.to}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] text-muted-foreground">{formatTime(m.receivedAt)}</div>
              </div>
              {m.text && <p className="mt-1.5 line-clamp-4 text-xs text-muted-foreground">{m.text}</p>}
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 h-7 px-2 text-xs"
                onClick={() => {
                  const code = /(?:验证码|code|otp)[^\d]{0,20}(\d{4,8})/i.exec(m.text)?.[1] || /(\d{6,8})/.exec(m.text)?.[1]
                  if (!code) {
                    toast.message('未从这封信提取到验证码')
                    return
                  }
                  void navigator.clipboard.writeText(code)
                  toast.success('验证码已复制')
                }}
              >
                复制验证码
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
