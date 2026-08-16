import React, { useEffect, useRef, useState } from 'react'
import { Copy, Eye, EyeOff, Fingerprint, Link2, Plus, QrCode, SlidersHorizontal, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Account, AccountInput, AccountStatus, Platform } from '@shared/types'
import { estimatePasswordStrength, strengthLabel } from '@shared/security'
import { api } from '@renderer/lib/api'
import { randomIdentity } from '@renderer/lib/identity'
import { genPassword } from '@renderer/lib/utils'
import { decodeQrFromFile } from '@renderer/lib/qr'
import { PLATFORMS } from '@renderer/lib/platforms'
import { PasswordGeneratorDialog } from '@renderer/components/PasswordGeneratorDialog'
import { useAccountsStore } from '@renderer/store/accounts'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { Separator } from '@renderer/components/ui/separator'
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

interface FormState {
  platform: Platform
  label: string
  username: string
  email: string
  password: string
  totpSecret: string
  recoveryEmail: string
  recoveryPhone: string
  backupCodesText: string
  refreshToken: string
  groupName: string
  tagsText: string
  proxyUrl: string
  userAgent: string
  locale: string
  timezone: string
  customFields: { key: string; value: string }[]
  notes: string
  status: AccountStatus
}

const EMPTY: FormState = {
  platform: 'google',
  label: '',
  username: '',
  email: '',
  password: '',
  totpSecret: '',
  recoveryEmail: '',
  recoveryPhone: '',
  backupCodesText: '',
  refreshToken: '',
  groupName: '',
  tagsText: '',
  proxyUrl: '',
  userAgent: '',
  locale: '',
  timezone: '',
  customFields: [],
  notes: '',
  status: 'active'
}

function PasswordStrength({ value }: { value: string }): React.JSX.Element {
  const score = estimatePasswordStrength(value)
  const { label, tone } = strengthLabel(score)
  const color =
    tone === 'success'
      ? 'hsl(var(--success))'
      : tone === 'warning'
        ? 'hsl(var(--warning))'
        : 'hsl(var(--destructive))'
  return (
    <div className="flex items-center gap-2 pt-0.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-14 text-right text-xs" style={{ color }}>
        强度：{label}
      </span>
    </div>
  )
}

export function AccountDialog({
  open,
  onOpenChange,
  account
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  account: Account | null
}): React.JSX.Element {
  const create = useAccountsStore((s) => s.create)
  const update = useAccountsStore((s) => s.update)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [showPwd, setShowPwd] = useState(false)
  const [preview, setPreview] = useState('')
  const [uri, setUri] = useState('')
  const [saving, setSaving] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setShowPwd(false)
    setUri('')
    if (account) {
      void (async () => {
        const s = await api.accounts.reveal(account.id)
        setForm({
          platform: account.platform,
          label: account.label,
          username: account.username,
          email: account.email,
          password: s.password ?? '',
          totpSecret: s.totpSecret ?? '',
          recoveryEmail: account.recoveryEmail,
          recoveryPhone: account.recoveryPhone,
          backupCodesText: (s.backupCodes ?? []).join('\n'),
          refreshToken: s.refreshToken ?? '',
          groupName: account.groupName,
          tagsText: account.tags.join(', '),
          proxyUrl: account.proxyUrl,
          userAgent: account.userAgent,
          locale: account.locale,
          timezone: account.timezone,
          customFields: Object.entries(account.customFields).map(([key, value]) => ({ key, value })),
          notes: account.notes,
          status: account.status
        })
      })()
    } else {
      setForm(EMPTY)
    }
  }, [open, account])

  useEffect(() => {
    let active = true
    if (!form.totpSecret) {
      setPreview('')
      return
    }
    const run = async (): Promise<void> => {
      const r = await api.totp.preview(form.totpSecret)
      if (active) setPreview(r?.code ?? '无效')
    }
    void run()
    const id = window.setInterval(run, 1000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [form.totpSecret])

  const set = (patch: Partial<FormState>): void => setForm((f) => ({ ...f, ...patch }))

  const importUri = async (): Promise<void> => {
    const r = await api.totp.parseUri(uri.trim())
    if (!r) {
      toast.error('无法解析该 otpauth URI')
      return
    }
    set({ totpSecret: r.secret })
    if (!form.label && r.label) set({ label: r.label })
    toast.success('已导入 2FA 密钥')
  }

  const pickQr = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await decodeQrFromFile(file)
    if (!text) {
      toast.error('未识别到二维码')
    } else {
      const r = await api.totp.parseUri(text)
      if (r) {
        set({ totpSecret: r.secret })
        toast.success('已从二维码导入 2FA 密钥')
      } else {
        set({ totpSecret: text })
        toast.message('已读取二维码内容，请确认密钥')
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const submit = async (): Promise<void> => {
    if (!form.label.trim()) {
      toast.error('请填写标签名')
      return
    }
    setSaving(true)
    try {
      const input: AccountInput = {
        platform: form.platform,
        label: form.label.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password || null,
        totpSecret: form.totpSecret || null,
        recoveryEmail: form.recoveryEmail.trim(),
        recoveryPhone: form.recoveryPhone.trim(),
        backupCodes: form.backupCodesText
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        refreshToken: form.refreshToken || null,
        groupName: form.groupName.trim(),
        tags: form.tagsText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        proxyUrl: form.proxyUrl.trim(),
        userAgent: form.userAgent.trim(),
        locale: form.locale.trim(),
        timezone: form.timezone.trim(),
        customFields: Object.fromEntries(
          form.customFields
            .map((f) => [f.key.trim(), f.value] as const)
            .filter(([k]) => k.length > 0)
        ),
        notes: form.notes,
        status: form.status
      }
      if (account) {
        await update(account.id, input)
        toast.success('已保存修改')
      } else {
        await create(input)
        toast.success('账号已创建')
      }
      onOpenChange(false)
    } catch (err) {
      toast.error('保存失败: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => genOpen && e.preventDefault()}
        onEscapeKeyDown={(e) => genOpen && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{account ? '编辑账号' : '新增账号'}</DialogTitle>
          <DialogDescription>密码、2FA 密钥、备用码、Token 将以 AES-256-GCM 加密存储在本地。</DialogDescription>
        </DialogHeader>

        <div className="max-h-[64vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>平台</Label>
              <Select value={form.platform} onValueChange={(v) => set({ platform: v as Platform })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(v) => set({ status: v as AccountStatus })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="disabled">停用</SelectItem>
                  <SelectItem value="error">异常</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>标签名 *</Label>
            <Input
              value={form.label}
              onChange={(e) => set({ label: e.target.value })}
              placeholder="例如：主号 / 备用号 / 客户A"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>用户名</Label>
              <Input value={form.username} onChange={(e) => set({ username: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>邮箱</Label>
              <Input value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="name@example.com" />
            </div>
          </div>

          <Separator />
          <div className="space-y-1.5">
            <Label>密码</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => set({ password: e.target.value })}
                  placeholder="登录密码"
                  className="pr-9 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" size="icon" title="快速生成强密码" onClick={() => set({ password: genPassword(16) })}>
                <Wand2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" title="密码生成器（可配置）" onClick={() => setGenOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="复制"
                onClick={() => {
                  if (form.password) {
                    void navigator.clipboard.writeText(form.password)
                    toast.success('密码已复制')
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {form.password && <PasswordStrength value={form.password} />}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>两步验证 (TOTP) 密钥</Label>
              {preview && (
                <span className="font-mono text-sm font-semibold text-primary">当前: {preview}</span>
              )}
            </div>
            <Input
              value={form.totpSecret}
              onChange={(e) => set({ totpSecret: e.target.value })}
              placeholder="Base32 密钥，如 JBSWY3DPEHPK3PXP"
              className="font-mono"
            />
            <div className="flex gap-2">
              <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="粘贴 otpauth://totp/... URI" className="flex-1 font-mono text-xs" />
              <Button type="button" variant="outline" onClick={importUri} disabled={!uri.trim()}>
                <Link2 className="h-4 w-4" /> 解析
              </Button>
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <QrCode className="h-4 w-4" /> 二维码
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickQr} />
            </div>
          </div>

          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>恢复邮箱</Label>
              <Input value={form.recoveryEmail} onChange={(e) => set({ recoveryEmail: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>恢复手机</Label>
              <Input value={form.recoveryPhone} onChange={(e) => set({ recoveryPhone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>备用验证码（每行一个）</Label>
            <Textarea
              value={form.backupCodesText}
              onChange={(e) => set({ backupCodesText: e.target.value })}
              placeholder={'1234-5678\n2345-6789'}
              className="font-mono text-xs"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Refresh Token</Label>
            <Textarea
              value={form.refreshToken}
              onChange={(e) => set({ refreshToken: e.target.value })}
              className="font-mono text-xs"
              rows={2}
            />
          </div>

          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>分组</Label>
              <Input value={form.groupName} onChange={(e) => set({ groupName: e.target.value })} placeholder="默认分组" />
            </div>
            <div className="space-y-1.5">
              <Label>标签（逗号分隔）</Label>
              <Input value={form.tagsText} onChange={(e) => set({ tagsText: e.target.value })} placeholder="工作, 长期" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>代理地址（可选）</Label>
            <Input
              value={form.proxyUrl}
              onChange={(e) => set({ proxyUrl: e.target.value })}
              placeholder="http://user:pass@host:port 或 socks5://host:port"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              为该账号指定独立出口 IP（不同账号=不同网络环境）；留空则使用「服务中心」的默认代理。推荐
              HTTP(S) 代理；Chromium 不支持带账号密码的 SOCKS5。
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Fingerprint className="h-4 w-4 text-primary" /> 浏览器身份（可选）
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const id = randomIdentity()
                  set({ userAgent: id.userAgent, locale: id.locale, timezone: id.timezone })
                }}
              >
                <Wand2 className="h-3.5 w-3.5" /> 随机生成一套
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              让该账号的独立浏览器呈现不同的 UA / 语言 / 时区 + 画布/WebGL 噪声，降低多账号被关联的风险。留空使用系统默认。
            </p>
            <Input
              value={form.userAgent}
              onChange={(e) => set({ userAgent: e.target.value })}
              placeholder="User-Agent（留空用默认）"
              className="font-mono text-xs"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={form.locale}
                onChange={(e) => set({ locale: e.target.value })}
                placeholder="语言，如 en-US"
                className="font-mono text-xs"
              />
              <Input
                value={form.timezone}
                onChange={(e) => set({ timezone: e.target.value })}
                placeholder="时区，如 America/New_York"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>自定义字段</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set({ customFields: [...form.customFields, { key: '', value: '' }] })}
              >
                <Plus className="h-3.5 w-3.5" /> 添加字段
              </Button>
            </div>
            {form.customFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                可存放安全问题、会员号、备用邮箱等任意键值对（加密存储）。
              </p>
            ) : (
              <div className="space-y-2">
                {form.customFields.map((f, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={f.key}
                      onChange={(e) => {
                        const next = [...form.customFields]
                        next[i] = { ...next[i], key: e.target.value }
                        set({ customFields: next })
                      }}
                      placeholder="字段名"
                      className="w-1/3"
                    />
                    <Input
                      value={f.value}
                      onChange={(e) => {
                        const next = [...form.customFields]
                        next[i] = { ...next[i], value: e.target.value }
                        set({ customFields: next })
                      }}
                      placeholder="值"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="删除"
                      onClick={() => set({ customFields: form.customFields.filter((_, j) => j !== i) })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>备注</Label>
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <PasswordGeneratorDialog open={genOpen} onOpenChange={setGenOpen} onUse={(pw) => set({ password: pw })} />
    </>
  )
}
