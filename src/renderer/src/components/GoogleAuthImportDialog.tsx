import React, { useRef, useState } from 'react'
import { QrCode, Search, Download } from 'lucide-react'
import { toast } from 'sonner'
import { decodeMigration, type GAuthEntry } from '@renderer/lib/gauth'
import { decodeQrFromFile } from '@renderer/lib/qr'
import { useAccountsStore } from '@renderer/store/accounts'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

export function GoogleAuthImportDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): React.JSX.Element {
  const createAccount = useAccountsStore((s) => s.create)
  const loadAccounts = useAccountsStore((s) => s.load)

  const [uri, setUri] = useState('')
  const [entries, setEntries] = useState<GAuthEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const parse = (value: string): void => {
    try {
      const list = decodeMigration(value)
      setEntries(list)
      setSelected(new Set(list.map((_, i) => i)))
      toast.success(`解析出 ${list.length} 个 2FA 条目`)
    } catch (e) {
      setEntries([])
      toast.error((e as Error).message)
    }
  }

  const pickQr = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const text = await decodeQrFromFile(file)
    if (!text) {
      toast.error('未识别到二维码')
      return
    }
    setUri(text)
    parse(text)
  }

  const toggle = (i: number): void =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const importSelected = async (): Promise<void> => {
    const picks = entries.filter((_, i) => selected.has(i))
    if (picks.length === 0) {
      toast.error('请选择要导入的条目')
      return
    }
    setBusy(true)
    try {
      for (const e of picks) {
        await createAccount({
          platform: 'custom',
          label: e.issuer || e.label || '2FA',
          username: e.label,
          email: '',
          totpSecret: e.secret
        })
      }
      await loadAccounts()
      toast.success(`已导入 ${picks.length} 个 2FA 账号`)
      onOpenChange(false)
      setUri('')
      setEntries([])
    } catch (err) {
      toast.error('导入失败: ' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>从 Google 验证器导入</DialogTitle>
          <DialogDescription>
            在 Google Authenticator 中「导出账号」得到迁移二维码，把它上传或把 otpauth-migration:// 链接粘进来。全程离线解析。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder="otpauth-migration://offline?data=..."
            rows={2}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button onClick={() => parse(uri)} disabled={!uri.trim()}>
              <Search className="h-4 w-4" /> 解析
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <QrCode className="h-4 w-4" /> 上传导出二维码
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickQr} />
          </div>

          {entries.length > 0 && (
            <div className="max-h-[40vh] space-y-1 overflow-y-auto rounded-lg border p-2">
              {entries.map((e, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                >
                  <Checkbox checked={selected.has(i)} onCheckedChange={() => toggle(i)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.issuer || e.label || '2FA'}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.label}
                      {e.type === 'hotp' ? ' · HOTP' : ''}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={importSelected} disabled={busy || entries.length === 0}>
            <Download className="h-4 w-4" /> {busy ? '导入中…' : `导入所选 (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
