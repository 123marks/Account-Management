import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cookie,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  Inbox,
  Mail,
  History,
  Pencil,
  Play,
  QrCode,
  RotateCcw,
  Star,
  Trash2,
  Wifi
} from 'lucide-react'
import { toast } from 'sonner'
import type { Account, AccountSecrets, PasswordHistoryEntry } from '@shared/types'
import { accountTitle } from '@shared/accountDisplay'
import { mailboxKindLabel } from '@shared/mailboxAccount'
import { estimatePasswordStrength, strengthLabel } from '@shared/security'
import { api } from '@renderer/lib/api'
import { formatTime, relativeTime } from '@renderer/lib/utils'
import { platformMeta } from '@renderer/lib/platforms'
import { useAppStore } from '@renderer/store/app'
import { useAccountsStore } from '@renderer/store/accounts'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { AccountStatusBadge } from '@renderer/components/status'
import { TotpCell } from '@renderer/components/TotpCell'
import { TotpQR } from '@renderer/components/TotpQR'
import { AccountDialog } from '@renderer/components/AccountDialog'
import { RunAutomationDialog } from '@renderer/components/RunAutomationDialog'
import { CloneAccountDialog } from '@renderer/components/CloneAccountDialog'
import { MailPeekDialog } from '@renderer/components/MailPeekDialog'
import { Sheet, SheetContent, SheetTitle } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { SkeletonRows } from '@renderer/components/ui/skeleton'

function Field({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{value || <span className="text-muted-foreground">—</span>}</span>
    </div>
  )
}

function copy(text: string | null | undefined, label: string): void {
  if (!text) {
    toast.error(`没有可复制的${label}`)
    return
  }
  void navigator.clipboard.writeText(text)
  toast.success(`${label}已复制`)
}

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>
}

export function AccountDetailDrawer(): React.JSX.Element {
  const detailAccountId = useAppStore((s) => s.detailAccountId)
  const closeDetail = useAppStore((s) => s.closeDetail)
  const accounts = useAccountsStore((s) => s.accounts)
  const remove = useAccountsStore((s) => s.remove)
  const restore = useAccountsStore((s) => s.restore)
  const reloadAccounts = useAccountsStore((s) => s.load)
  const update = useAccountsStore((s) => s.update)

  const account = accounts.find((a) => a.id === detailAccountId) ?? null

  const [secrets, setSecrets] = useState<AccountSecrets | null>(null)
  const [revealPw, setRevealPw] = useState(false)
  const [revealCodes, setRevealCodes] = useState(false)
  const [revealToken, setRevealToken] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [editing, setEditing] = useState(false)
  const [running, setRunning] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [mailOpen, setMailOpen] = useState(false)
  const [history, setHistory] = useState<PasswordHistoryEntry[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [proxyProbe, setProxyProbe] = useState<{ loading: boolean; ok: boolean; text: string } | null>(null)

  const accountId = account?.id ?? null

  const reveal = useCallback(async (): Promise<void> => {
    if (!accountId) return
    try {
      setSecrets(await api.accounts.reveal(accountId))
    } catch {
      setSecrets(null)
    }
  }, [accountId])

  useEffect(() => {
    setSecrets(null)
    setRevealPw(false)
    setRevealCodes(false)
    setRevealToken(false)
    setShowQr(false)
    setHistory(null)
    setShowHistory(false)
    setProxyProbe(null)
    void reveal()
  }, [accountId, reveal])

  const testProxy = async (): Promise<void> => {
    if (!accountId) return
    setProxyProbe({ loading: true, ok: false, text: '测试中…' })
    const r = await api.automation.checkProxy(accountId)
    setProxyProbe({ loading: false, ok: r.ok, text: r.message })
  }

  const cookieRef = useRef<HTMLInputElement>(null)
  const exportCookies = async (): Promise<void> => {
    if (!account) return
    try {
      const json = await api.automation.exportCookies(account.id)
      const path = await api.system.saveFile(`cookies-${account.label}-${Date.now()}.json`, json)
      if (path) toast.success('已导出 Cookie 到 ' + path)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  const onCookieFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !account) return
    try {
      const { imported } = await api.automation.importCookies(account.id, await f.text())
      toast.success(`已导入 ${imported} 条 Cookie`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const loadHistory = useCallback(async (): Promise<void> => {
    if (!accountId) return
    setHistory(await api.accounts.passwordHistory(accountId))
  }, [accountId])

  const toggleHistory = (): void => {
    const next = !showHistory
    setShowHistory(next)
    if (next && history === null) void loadHistory()
  }

  const copyHistory = async (id: number): Promise<void> => {
    copy(await api.accounts.revealPasswordHistory(id), '历史密码')
  }

  const restoreHistory = async (id: number): Promise<void> => {
    if (!accountId) return
    if (!window.confirm('确认把该账号的密码恢复为这条历史密码？当前密码会被存入历史。')) return
    await api.accounts.restorePassword(accountId, id)
    toast.success('已恢复为该历史密码')
    await Promise.all([reveal(), reloadAccounts(), loadHistory()])
  }

  // If the account was deleted elsewhere while the drawer points at it, close.
  useEffect(() => {
    if (detailAccountId && !account) closeDetail()
  }, [detailAccountId, account, closeDetail])

  const onDelete = async (): Promise<void> => {
    if (!account) return
    const id = account.id
    const label = account.label
    await remove(id)
    closeDetail()
    toast(`已将「${label}」移至回收站`, {
      action: { label: '撤销', onClick: () => void restore(id) }
    })
  }

  const launchBrowser = async (): Promise<void> => {
    if (!account) return
    const r = await api.automation.launchProfile(account.id)
    if (r.ok) toast.success(r.message)
    else toast.error(r.message)
  }

  const strength = secrets?.password ? estimatePasswordStrength(secrets.password) : -1
  const sLabel = strength >= 0 ? strengthLabel(strength) : null
  const open = !!account
  const blockClose = editing || running || cloning

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && closeDetail()}>
        {account && (
          <SheetContent
            onInteractOutside={(e) => blockClose && e.preventDefault()}
            onEscapeKeyDown={(e) => blockClose && e.preventDefault()}
          >
            <div className="flex items-center gap-3 border-b p-5 pr-12">
              <PlatformGlyph platform={account.platform} size={40} />
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-base font-semibold">{accountTitle(account)}</SheetTitle>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {platformMeta(account.platform).label}
                  <AccountStatusBadge status={account.status} />
                </div>
              </div>
              <button
                onClick={() => void update(account.id, { favorite: !account.favorite })}
                title={account.favorite ? '取消收藏' : '收藏'}
                className="shrink-0 text-muted-foreground/50 transition-colors hover:text-warning"
              >
                <Star className={`h-5 w-5 ${account.favorite ? 'fill-warning text-warning' : ''}`} />
              </button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-5 pt-2">
                <SectionTitle>账号信息</SectionTitle>
                <div className="divide-y">
                  <Field label="用户名" value={account.username} />
                  <Field label="邮箱" value={account.email} />
                  <Field label="收信方式" value={mailboxKindLabel(account.mailboxKind)} />
                  <Field label="收信密码" value={account.hasMailboxPass ? '已配置' : '未配置'} />
                  {account.oauthSourceAccountId && (
                    <Field
                      label="OAuth 来源"
                      value={`${account.oauthProvider || 'oauth'} · ${
                        accounts.find((x) => x.id === account.oauthSourceAccountId)?.label ||
                        account.oauthSourceAccountId.slice(0, 8)
                      }`}
                    />
                  )}
                  {accounts.some((x) => x.oauthSourceAccountId === account.id) && (
                    <Field
                      label="已授权注册"
                      value={accounts
                        .filter((x) => x.oauthSourceAccountId === account.id)
                        .map((x) => x.label || x.platform)
                        .join('、')}
                    />
                  )}
                  <Field label="分组" value={account.groupName} />
                  <Field
                    label="标签"
                    value={
                      account.tags.length ? (
                        <span className="flex flex-wrap justify-end gap-1">
                          {account.tags.map((t) => (
                            <Badge key={t} variant="secondary">
                              {t}
                            </Badge>
                          ))}
                        </span>
                      ) : null
                    }
                  />
                  <Field
                    label="代理"
                    value={account.proxyUrl ? <span className="font-mono text-xs">{account.proxyUrl}</span> : null}
                  />
                  <Field
                    label="浏览器身份"
                    value={
                      account.userAgent || account.locale || account.timezone ? (
                        <span className="text-xs" title={account.userAgent || undefined}>
                          {[account.locale, account.timezone].filter(Boolean).join(' · ') || '自定义 UA'}
                        </span>
                      ) : null
                    }
                  />
                  <Field label="最近使用" value={relativeTime(account.lastUsedAt)} />
                  <Field label="创建时间" value={formatTime(account.createdAt)} />
                  <Field label="更新时间" value={formatTime(account.updatedAt)} />
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void testProxy()}
                    disabled={proxyProbe?.loading}
                    title="通过该账号的代理访问外网并读取出口 IP"
                  >
                    <Wifi className="h-4 w-4" /> {proxyProbe?.loading ? '测试中…' : '测试代理'}
                  </Button>
                  {proxyProbe && !proxyProbe.loading && (
                    <span className={`text-xs ${proxyProbe.ok ? 'text-success' : 'text-destructive'}`}>
                      {proxyProbe.text}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void exportCookies()}>
                    <Cookie className="h-4 w-4" /> 导出 Cookie
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => cookieRef.current?.click()}>
                    <Cookie className="h-4 w-4" /> 导入 Cookie
                  </Button>
                  <input
                    ref={cookieRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => void onCookieFile(e)}
                  />
                  <span className="text-[11px] text-muted-foreground">预热 / 迁移登录态（含敏感令牌，妥善保管）</span>
                </div>

                <SectionTitle>凭据</SectionTitle>
                <div className="space-y-3">
                  <div className="rounded-lg border p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">密码</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setRevealPw((v) => !v)}
                          title={revealPw ? '隐藏' : '显示'}
                          aria-label={revealPw ? '隐藏密码' : '显示密码'}
                        >
                          {revealPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => copy(secrets?.password, '密码')}
                          title="复制"
                          aria-label="复制密码"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {secrets?.password ? (
                      <>
                        <div className="font-mono text-sm break-all">
                          {revealPw ? secrets.password : '•'.repeat(Math.min(secrets.password.length, 24))}
                        </div>
                        {sLabel && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${strength}%`,
                                  backgroundColor:
                                    sLabel.tone === 'success'
                                      ? 'hsl(var(--success))'
                                      : sLabel.tone === 'warning'
                                        ? 'hsl(var(--warning))'
                                        : 'hsl(var(--destructive))'
                                }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">强度 {sLabel.label}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">未设置</div>
                    )}
                  </div>

                  <div className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">两步验证 (2FA)</span>
                      {account.hasTotp && (
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowQr((v) => !v)}>
                          <QrCode className="h-4 w-4" /> {showQr ? '隐藏二维码' : '显示二维码'}
                        </Button>
                      )}
                    </div>
                    {account.hasTotp ? (
                      <div className="mt-2">
                        <TotpCell accountId={account.id} hasTotp={account.hasTotp} />
                        {showQr && secrets?.totpSecret && (
                          <div className="mt-3 flex flex-col items-center gap-2">
                            <TotpQR
                              secret={secrets.totpSecret}
                              issuer={platformMeta(account.platform).label}
                              account={account.email || account.username || account.label}
                            />
                            <p className="text-center text-[11px] text-muted-foreground">
                              用手机验证器 App 扫码即可添加此账号的 2FA。
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-muted-foreground">未设置</div>
                    )}
                  </div>

                  {account.hasBackupCodes && (
                    <div className="rounded-lg border p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">备用验证码</span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={revealCodes ? '隐藏备用码' : '显示备用码'}
                            onClick={() => setRevealCodes((v) => !v)}
                          >
                            {revealCodes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="复制备用码"
                            onClick={() => copy((secrets?.backupCodes ?? []).join('\n'), '备用码')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {revealCodes ? (
                        <div className="grid grid-cols-2 gap-1 font-mono text-xs">
                          {(secrets?.backupCodes ?? []).map((c, i) => (
                            <span key={i}>{c}</span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {(secrets?.backupCodes ?? []).length} 个（已隐藏）
                        </div>
                      )}
                    </div>
                  )}

                  {account.hasRefreshToken && (
                    <div className="rounded-lg border p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Refresh Token</span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label={revealToken ? '隐藏 Token' : '显示 Token'}
                            onClick={() => setRevealToken((v) => !v)}
                          >
                            {revealToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="复制 Token"
                            onClick={() => copy(secrets?.refreshToken, 'Token')}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="font-mono text-xs break-all">
                        {revealToken ? secrets?.refreshToken : '••••••••••••••••'}
                      </div>
                    </div>
                  )}
                </div>

                <SectionTitle>密码历史</SectionTitle>
                <div className="rounded-lg border">
                  <button
                    onClick={toggleHistory}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-accent/40"
                  >
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <History className="h-4 w-4" /> 历史密码
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {history ? `${history.length} 条` : '点击查看'}
                    </span>
                  </button>
                  {showHistory &&
                    (history === null ? (
                      <div className="px-3 pb-3">
                        <SkeletonRows rows={2} />
                      </div>
                    ) : history.length === 0 ? (
                      <div className="border-t px-3 py-3 text-xs text-muted-foreground">
                        暂无历史。更换密码后（手动或自动化）会自动记录上一版本，可在此回滚。
                      </div>
                    ) : (
                      <div className="divide-y border-t">
                        {history.map((h) => (
                          <div key={h.id} className="flex items-center gap-2 px-3 py-2">
                            <span className="flex-1 font-mono text-xs">{h.preview}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {relativeTime(h.changedAt)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="复制"
                              onClick={() => void copyHistory(h.id)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="恢复为该密码"
                              onClick={() => void restoreHistory(h.id)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>

                <SectionTitle>恢复信息</SectionTitle>
                <div className="divide-y">
                  <Field label="恢复邮箱" value={account.recoveryEmail} />
                  <Field label="恢复手机" value={account.recoveryPhone} />
                </div>

                {Object.keys(account.customFields).length > 0 && (
                  <>
                    <SectionTitle>自定义字段</SectionTitle>
                    <div className="divide-y">
                      {Object.entries(account.customFields).map(([k, v]) => (
                        <Field key={k} label={k} value={v} />
                      ))}
                    </div>
                  </>
                )}

                {account.notes && (
                  <>
                    <SectionTitle>备注</SectionTitle>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{account.notes}</p>
                  </>
                )}
              </div>
            </ScrollArea>

            <div className="flex flex-wrap items-center gap-2 border-t p-4">
              <Button size="sm" onClick={() => void launchBrowser()} title="打开该账号的独立浏览器">
                <Globe className="h-4 w-4" /> 打开浏览器
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRunning(true)}>
                <Play className="h-4 w-4" /> 运行自动化
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMailOpen(true)}>
                <Inbox className="h-4 w-4" /> 读信
              </Button>
              <Button
                size="sm"
                variant="outline"
                title="用该账号的收信凭证创建邮箱服务，供批量注册收验证码"
                onClick={() => {
                  void api.providers
                    .useAccountAsMailbox(account.id)
                    .then(() => toast.success('已加入服务中心，可作默认收信源'))
                    .catch((e) => toast.error((e as Error).message))
                }}
              >
                <Mail className="h-4 w-4" /> 用作收信
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> 编辑
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCloning(true)}>
                <Copy className="h-4 w-4" /> 克隆
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void api.system.revealProfile(account.id)}
                title="打开该账号的浏览器配置目录"
              >
                <FolderOpen className="h-4 w-4" /> 配置目录
              </Button>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void onDelete()}>
                <Trash2 className="h-4 w-4" /> 删除
              </Button>
            </div>
          </SheetContent>
        )}
      </Sheet>

      {account && (
        <>
          <AccountDialog
            open={editing}
            account={account}
            onOpenChange={(v) => {
              setEditing(v)
              if (!v) void reveal()
            }}
          />
          <RunAutomationDialog
            open={running}
            accounts={[account]}
            onOpenChange={setRunning}
          />
          <CloneAccountDialog
            open={cloning}
            account={account}
            onOpenChange={setCloning}
            onDone={() => void reloadAccounts()}
          />
          <MailPeekDialog open={mailOpen} accountId={account.id} onOpenChange={setMailOpen} />
        </>
      )}
    </>
  )
}
