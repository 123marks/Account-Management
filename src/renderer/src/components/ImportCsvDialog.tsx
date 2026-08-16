import React, { useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, ShieldAlert, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { parseCsv, mapCsv, type CsvMapResult, type ImportAccount } from '@renderer/lib/csv'
import { platformMeta } from '@renderer/lib/platforms'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
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
import { Badge } from '@renderer/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'

export function ImportCsvDialog({
  open,
  onOpenChange,
  onDone
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void | Promise<void>
}): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<CsvMapResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [group, setGroup] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = (): void => {
    setResult(null)
    setFileName('')
    setGroup('')
    setError('')
    setBusy(false)
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setResult(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      const mapped = mapCsv(parseCsv(text))
      if (mapped.accounts.length === 0) {
        setError('未从该文件解析出任何可导入的账号。')
        return
      }
      setResult(mapped)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const doImport = async (): Promise<void> => {
    if (!result) return
    setBusy(true)
    try {
      const accounts: ImportAccount[] = result.accounts.map((a) =>
        group && !a.groupName ? { ...a, groupName: group } : a
      )
      const { imported } = await api.accounts.importJson(JSON.stringify({ accounts }))
      toast.success(`已导入 ${imported} 个账号`)
      await onDone()
      onOpenChange(false)
      reset()
    } catch (err) {
      toast.error('导入失败：' + (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const preview = result?.accounts.slice(0, 10) ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> 从 CSV 导入账号
          </DialogTitle>
          <DialogDescription>
            支持 Chrome / Edge、Bitwarden、1Password、KeePass、LastPass 等导出的 CSV，自动识别列并推断平台。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e)} />

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> 选择 CSV 文件
            </Button>
            {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span>
                  可导入 <span className="font-semibold text-foreground">{result.accounts.length}</span> 个
                </span>
                {result.skipped > 0 && (
                  <span className="text-muted-foreground">跳过 {result.skipped} 个空行</span>
                )}
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">默认分组（可选）</Label>
                  <Input
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    placeholder="如 导入-Chrome"
                    className="h-8 w-40"
                  />
                </div>
              </div>

              <div className="max-h-[42vh] overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>账号</TableHead>
                      <TableHead>用户名 / 邮箱</TableHead>
                      <TableHead className="w-20">密码</TableHead>
                      <TableHead className="w-16">2FA</TableHead>
                      <TableHead className="w-28">分组</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <PlatformGlyph platform={a.platform} size={22} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium">{a.label}</div>
                              <div className="text-xs text-muted-foreground">{platformMeta(a.platform).label}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{a.email || a.username || '—'}</TableCell>
                        <TableCell>
                          {a.password ? <Badge variant="secondary">有</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {a.totpSecret ? <Badge variant="secondary">有</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(group && !a.groupName ? group : a.groupName) || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {result.accounts.length > preview.length && (
                  <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                    仅预览前 {preview.length} 条，导入时将处理全部 {result.accounts.length} 条
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>
                  导入的凭据会以 AES-256-GCM 加密存入本地库。请在导入完成后删除源 CSV 文件——它是明文的。
                </span>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void doImport()} disabled={!result || busy}>
            {busy ? '导入中…' : result ? `导入 ${result.accounts.length} 条` : '导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
