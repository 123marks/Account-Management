import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, Info, QrCode, Save, Search, ShieldQuestion } from 'lucide-react'
import { toast } from 'sonner'
import type { Account, TotpParseResult } from '@shared/types'
import { api } from '@renderer/lib/api'
import { decodeQrFromFile } from '@renderer/lib/qr'
import { useAccountsStore } from '@renderer/store/accounts'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { TotpCell } from '@renderer/components/TotpCell'
import { AccountDialog } from '@renderer/components/AccountDialog'
import { GoogleAuthImportDialog } from '@renderer/components/GoogleAuthImportDialog'
import { GoogleAuthExportDialog } from '@renderer/components/GoogleAuthExportDialog'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { EmptyState } from '@renderer/components/ui/empty-state'

interface Parsed extends TotpParseResult {
  raw: string
}

export default function TwoFactor(): React.JSX.Element {
  const accounts = useAccountsStore((s) => s.accounts)
  const createAccount = useAccountsStore((s) => s.create)
  const loadAccounts = useAccountsStore((s) => s.load)

  const [input, setInput] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [previewCode, setPreviewCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [edit, setEdit] = useState<{ open: boolean; account: Account | null }>({
    open: false,
    account: null
  })
  const [gauthOpen, setGauthOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const withTotp = useMemo(() => accounts.filter((a) => a.hasTotp), [accounts])

  // Live preview code for the currently parsed secret.
  useEffect(() => {
    if (!parsed) {
      setPreviewCode('')
      return
    }
    let active = true
    const tick = async (): Promise<void> => {
      const r = await api.totp.preview(parsed.secret)
      if (active) setPreviewCode(r?.code ?? '无效')
    }
    void tick()
    const id = window.setInterval(tick, 1000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [parsed])

  const query = async (): Promise<void> => {
    const value = input.trim()
    if (!value) return
    // Try otpauth URI first, then fall back to treating input as a raw Base32 secret.
    let result = await api.totp.parseUri(value)
    if (!result) {
      const preview = await api.totp.preview(value)
      if (preview) result = { secret: value, digits: preview.digits, period: preview.period }
    }
    if (!result) {
      toast.error('无法识别：请输入有效的 otpauth:// URI 或 Base32 密钥')
      setParsed(null)
      return
    }
    setParsed({ ...result, raw: value })
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
    setInput(text)
    const result = await api.totp.parseUri(text)
    if (result) {
      setParsed({ ...result, raw: text })
      toast.success('已从二维码解析 2FA 密钥')
    } else {
      toast.message('已读取二维码内容，请点击查询确认')
    }
  }

  const saveToList = async (): Promise<void> => {
    if (!parsed) return
    setSaving(true)
    try {
      await createAccount({
        platform: 'custom',
        label: parsed.issuer || parsed.label || '2FA 条目',
        username: parsed.label ?? '',
        email: '',
        totpSecret: parsed.secret
      })
      toast.success('已保存到列表')
      setParsed(null)
      setInput('')
      await loadAccounts()
    } catch (err) {
      toast.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          此处集中管理你的 2FA (TOTP) 验证码。所有密钥仅加密保存在本机，误删、清缓存、换/丢设备都可能导致 2FA 丢失，请务必自行备份（见「账号管理 → 备份导出」）。
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldQuestion className="h-4 w-4 text-primary" /> 查询面板
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void query()
                }}
                placeholder="otpauth://totp/... 或 Base32 Secret"
                className="font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void query()} disabled={!input.trim()}>
                  <Search className="h-4 w-4" /> 查询
                </Button>
                <Button variant="outline" onClick={() => void saveToList()} disabled={!parsed || saving}>
                  <Save className="h-4 w-4" /> {saving ? '保存中…' : '保存到列表'}
                </Button>
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <QrCode className="h-4 w-4" /> 上传二维码图片
                </Button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickQr} />
              </div>
              <p className="text-xs text-muted-foreground">
                支持 otpauth://totp/... 与 Base32 Secret；解析成功后点「保存到列表」会作为一个自定义账号加入。也可直接把二维码图片选进来识别。
              </p>
            </div>

            <div className="flex w-64 shrink-0 flex-col items-center justify-center rounded-lg border bg-secondary/40 p-4">
              {parsed ? (
                <>
                  <div className="font-mono text-3xl font-bold tracking-widest tabular-nums text-primary">
                    {previewCode.length >= 6
                      ? `${previewCode.slice(0, 3)} ${previewCode.slice(3)}`
                      : previewCode}
                  </div>
                  <div className="mt-1 max-w-full truncate text-xs text-muted-foreground">
                    {parsed.issuer || parsed.label || '当前验证码'}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      void navigator.clipboard.writeText(previewCode)
                      toast.success('验证码已复制')
                    }}
                  >
                    <Copy className="h-4 w-4" /> 复制
                  </Button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">暂未查询数据</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="text-sm font-semibold">
              已保存 <span className="text-muted-foreground">({withTotp.length})</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(true)}
                disabled={withTotp.length === 0}
              >
                <QrCode className="h-4 w-4" /> 导出 / 迁移
              </Button>
              <Button variant="outline" size="sm" onClick={() => setGauthOpen(true)}>
                <Download className="h-4 w-4" /> 从 Google 验证器导入
              </Button>
            </div>
          </div>
          {withTotp.length === 0 ? (
            <EmptyState
              icon={ShieldQuestion}
              title="还没有保存的 2FA"
              description="用上方查询面板解析并「保存到列表」，或到「账号管理」为账号添加 2FA 密钥；也可从 Google 验证器批量导入。"
            />
          ) : (
            <div className="divide-y">
              {withTotp.map((a) => (
                <div key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <PlatformGlyph platform={a.platform} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.email || a.username || '—'}
                    </div>
                  </div>
                  <TotpCell accountId={a.id} hasTotp={a.hasTotp} />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEdit({ open: true, account: a })}
                  >
                    编辑
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AccountDialog
        open={edit.open}
        account={edit.account}
        onOpenChange={(v) => {
          setEdit((s) => ({ ...s, open: v }))
          if (!v) void loadAccounts()
        }}
      />
      <GoogleAuthImportDialog open={gauthOpen} onOpenChange={setGauthOpen} />
      <GoogleAuthExportDialog open={exportOpen} onOpenChange={setExportOpen} accounts={withTotp} />
    </div>
  )
}
