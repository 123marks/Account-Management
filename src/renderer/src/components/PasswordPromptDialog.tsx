import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
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

/**
 * Small modal to collect a passphrase. Used for encrypted backup export
 * (with confirmation) and encrypted backup import (single field).
 */
export function PasswordPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = '确定',
  requireConfirm = false,
  fieldLabel = '备份密码',
  placeholder = '用于加解密备份文件',
  onSubmit
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: string
  submitLabel?: string
  requireConfirm?: boolean
  fieldLabel?: string
  placeholder?: string
  onSubmit: (password: string) => Promise<void> | void
}): React.JSX.Element {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPw('')
      setConfirm('')
      setBusy(false)
    }
  }, [open])

  const submit = async (): Promise<void> => {
    if (!pw) {
      toast.error('请输入密码')
      return
    }
    if (requireConfirm && pw !== confirm) {
      toast.error('两次输入的密码不一致')
      return
    }
    setBusy(true)
    try {
      await onSubmit(pw)
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{fieldLabel}</Label>
            <Input
              type="password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !requireConfirm) void submit()
              }}
              placeholder={placeholder}
              className="font-mono"
            />
          </div>
          {requireConfirm && (
            <div className="space-y-1.5">
              <Label>确认{fieldLabel}</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submit()
                }}
                placeholder="再次输入"
                className="font-mono"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? '处理中…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
