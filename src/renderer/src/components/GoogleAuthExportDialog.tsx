import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, FileDown, Loader2, QrCode, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { Account } from '@shared/types'
import { api } from '@renderer/lib/api'
import { platformMeta } from '@renderer/lib/platforms'
import { encodeMigrationBatches, type GAuthEntry } from '@renderer/lib/gauth'
import { buildOtpauthUri } from '@renderer/lib/totp'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export function GoogleAuthExportDialog({
  open,
  onOpenChange,
  accounts
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  accounts: Account[]
}): React.JSX.Element {
  const [entries, setEntries] = useState<GAuthEntry[]>([])
  const [links, setLinks] = useState<string[]>([])
  const [qrs, setQrs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    const build = async (): Promise<void> => {
      setLoading(true)
      setError('')
      setEntries([])
      setLinks([])
      setQrs([])
      try {
        const built: GAuthEntry[] = []
        for (const a of accounts) {
          const s = await api.accounts.reveal(a.id)
          if (!s.totpSecret) continue
          built.push({
            secret: s.totpSecret,
            issuer: platformMeta(a.platform).label,
            label: a.email || a.username || a.label,
            digits: 6,
            type: 'totp'
          })
        }
        if (!active) return
        if (built.length === 0) {
          setError('所选账号里没有可导出的 2FA 密钥。')
          setLoading(false)
          return
        }
        const uris = encodeMigrationBatches(built, 10)
        const urls = await Promise.all(
          uris.map((u) =>
            QRCode.toDataURL(u, { width: 440, margin: 1, color: { dark: '#0b0f1a', light: '#ffffff' } })
          )
        )
        if (!active) return
        setEntries(built)
        setLinks(uris)
        setQrs(urls)
      } catch (e) {
        if (active) setError((e as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    }
    void build()
    return () => {
      active = false
    }
  }, [open, accounts])

  const copyLinks = (): void => {
    void navigator.clipboard.writeText(links.join('\n'))
    toast.success('已复制迁移链接')
  }

  const exportText = async (): Promise<void> => {
    const text = entries
      .map((e) => buildOtpauthUri({ secret: e.secret, issuer: e.issuer, account: e.label }))
      .join('\n')
    const path = await api.system.saveFile(`aam-2fa-${stamp()}.txt`, text)
    if (path) toast.success(`已导出 ${entries.length} 条 otpauth 到 ${path}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> 导出 / 迁移 2FA
          </DialogTitle>
          <DialogDescription>
            用 Google 验证器「转移账号 → 导入」扫描下方二维码，即可把这些 2FA 一次性导入手机。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>二维码 / 链接 / 文本都包含明文 2FA 密钥，请在安全环境操作，用后及时清理，切勿截图外发。</span>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在读取并生成二维码…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && qrs.length > 0 && (
            <>
              <div className="text-sm">
                共 <span className="font-semibold text-foreground">{entries.length}</span> 条 2FA
                {qrs.length > 1 && `，分 ${qrs.length} 张二维码（依次扫描）`}
              </div>
              <div className="flex flex-wrap justify-center gap-4">
                {qrs.map((url, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <img
                      src={url}
                      width={220}
                      height={220}
                      alt={`迁移二维码 ${i + 1}`}
                      className="rounded-lg bg-white p-1 shadow-sm"
                    />
                    {qrs.length > 1 && (
                      <span className="text-xs text-muted-foreground">
                        第 {i + 1} / {qrs.length} 张
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyLinks} disabled={links.length === 0}>
              <Copy className="h-4 w-4" /> 复制迁移链接
            </Button>
            <Button variant="outline" onClick={() => void exportText()} disabled={entries.length === 0}>
              <FileDown className="h-4 w-4" /> 导出 otpauth 文本
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
