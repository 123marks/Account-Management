import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, KeyRound, RefreshCw, ShieldCheck, ShieldAlert, Pencil, Play } from 'lucide-react'
import { toast } from 'sonner'
import type { Account, AccountAudit, SecurityIssueKind } from '@shared/types'
import { ISSUE_META, strengthLabel } from '@shared/security'
import { genPassword } from '@renderer/lib/utils'
import { useSecurityStore } from '@renderer/store/security'
import { useAccountsStore } from '@renderer/store/accounts'
import { useTasksStore } from '@renderer/store/tasks'
import { useAppStore } from '@renderer/store/app'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { ScoreRing } from '@renderer/components/ScoreRing'
import { AccountDialog } from '@renderer/components/AccountDialog'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { SkeletonRows } from '@renderer/components/ui/skeleton'

function StrengthBar({ value, hasPassword }: { value: number; hasPassword: boolean }): React.JSX.Element {
  if (!hasPassword) return <span className="text-xs text-muted-foreground">无密码</span>
  const { label, tone } = strengthLabel(value)
  const color =
    tone === 'success' ? 'hsl(var(--success))' : tone === 'warning' ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="w-5 text-xs tabular-nums" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

function Chip({
  label,
  count,
  tone
}: {
  label: string
  count: number
  tone: 'destructive' | 'warning' | 'muted'
}): React.JSX.Element {
  const color =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-warning'
        : 'text-muted-foreground'
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className={`text-2xl font-bold tabular-nums ${count > 0 ? color : 'text-foreground'}`}>{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export default function Security(): React.JSX.Element {
  const report = useSecurityStore((s) => s.report)
  const loading = useSecurityStore((s) => s.loading)
  const load = useSecurityStore((s) => s.load)
  const breaches = useSecurityStore((s) => s.breaches)
  const breachChecked = useSecurityStore((s) => s.breachChecked)
  const checkingBreaches = useSecurityStore((s) => s.checkingBreaches)
  const checkBreaches = useSecurityStore((s) => s.checkBreaches)
  const accounts = useAccountsStore((s) => s.accounts)
  const loadAccounts = useAccountsStore((s) => s.load)
  const updateAccount = useAccountsStore((s) => s.update)
  const enqueue = useTasksStore((s) => s.enqueue)
  const setPage = useAppStore((s) => s.setPage)

  const [edit, setEdit] = useState<{ open: boolean; account: Account | null }>({
    open: false,
    account: null
  })

  useEffect(() => {
    void load()
    void loadAccounts()
  }, [load, loadAccounts])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const openEdit = (audit: AccountAudit): void => {
    const acc = accountById.get(audit.accountId)
    if (acc) setEdit({ open: true, account: acc })
    else toast.error('找不到该账号，请先到账号管理刷新列表')
  }

  const rerunCheckup = async (): Promise<void> => {
    try {
      await load()
      const n = useSecurityStore.getState().report?.accounts.length ?? 0
      toast.success(`体检完成，共 ${n} 个账号`)
    } catch (e) {
      toast.error('体检失败：' + (e as Error).message)
    }
  }

  const runLeakCheck = async (): Promise<void> => {
    try {
      await checkBreaches()
      toast.success('泄露检测完成')
    } catch (e) {
      toast.error('泄露检测失败：' + (e as Error).message)
    }
  }

  const runCheck = async (audit: AccountAudit): Promise<void> => {
    let acc = accountById.get(audit.accountId)
    if (!acc) {
      await loadAccounts()
      acc = useAccountsStore.getState().accounts.find((x) => x.id === audit.accountId)
    }
    if (!acc) {
      toast.error('找不到该账号，请先到账号管理刷新列表')
      return
    }
    try {
      await enqueue({ accountIds: [acc.id], type: 'check_login', params: {} })
      toast.success(`已提交「${acc.label}」登录检测`)
      setPage('automation')
    } catch (e) {
      toast.error('提交失败：' + (e as Error).message)
    }
  }

  const quickFix = async (audit: AccountAudit): Promise<void> => {
    const pw = genPassword(18)
    await updateAccount(audit.accountId, { password: pw })
    await navigator.clipboard.writeText(pw)
    toast.success('已生成强密码并复制，请到对应站点粘贴更新（旧密码已记入历史）')
    await Promise.all([load(), loadAccounts()])
  }

  const onDialogChange = (v: boolean): void => {
    setEdit((e) => ({ ...e, open: v }))
    if (!v) {
      // password / recovery may have changed → refresh audit + list
      void load()
      void loadAccounts()
    }
  }

  const t = report?.totals
  const flagged =
    report?.accounts.filter((a) => a.issues.length > 0 || (breaches[a.accountId] ?? 0) > 0) ?? []
  const healthy = (report?.accounts.length ?? 0) - flagged.length
  const breachedCount = Object.keys(breaches).length

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center gap-6 p-6">
          <ScoreRing score={report?.score ?? 100} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {(report?.score ?? 100) >= 75 ? (
                <ShieldCheck className="h-5 w-5 text-success" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-warning" />
              )}
              <h2 className="text-lg font-semibold">账号安全体检</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              扫描弱密码、重复密码、缺失两步验证与恢复信息等风险。凭据仅在本机内存中临时解密分析，绝不上传或明文返回。
            </p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                共 <span className="font-semibold text-foreground">{t?.accounts ?? 0}</span> 个账号
              </span>
              <span className="text-success">{healthy} 个健康</span>
              <span className="text-warning">{flagged.length} 个待处理</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => void rerunCheckup()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 重新体检
            </Button>
            <Button variant="outline" onClick={() => void runLeakCheck()} disabled={checkingBreaches}>
              <AlertTriangle className={`h-4 w-4 ${checkingBreaches ? 'animate-pulse' : ''}`} />
              {checkingBreaches ? '检测中…' : '泄露检测'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Chip label="无密码" count={t?.noPassword ?? 0} tone="destructive" />
        <Chip label="弱密码" count={t?.weakPassword ?? 0} tone="destructive" />
        <Chip label={breachChecked ? '已泄露' : '已泄露(未检)'} count={breachedCount} tone="destructive" />
        <Chip label="密码重复" count={t?.reusedPassword ?? 0} tone="warning" />
        <Chip label="未开两步验证" count={t?.no2fa ?? 0} tone="warning" />
        <Chip label="无恢复信息" count={t?.noRecovery ?? 0} tone="warning" />
        <Chip label="密码超期" count={t?.stalePassword ?? 0} tone="muted" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && !report && (
            <div className="p-4">
              <SkeletonRows rows={5} />
            </div>
          )}
          {!loading && (report?.accounts.length ?? 0) === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              还没有账号可供体检。到「账号管理」添加账号后再回来查看。
            </div>
          )}
          {report && report.accounts.length > 0 && flagged.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShieldCheck className="h-10 w-10 text-success" />
              <p className="text-sm font-medium">太棒了，未发现明显风险</p>
              <p className="text-xs text-muted-foreground">所有账号都设置了较强密码、两步验证与恢复信息。</p>
            </div>
          )}
          <div className="divide-y">
            {flagged.map((a) => (
              <div key={a.accountId} className="flex items-center gap-4 px-5 py-3.5">
                <PlatformGlyph platform={a.platform} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {(breaches[a.accountId] ?? 0) > 0 && (
                      <Badge variant="destructive" title="该密码出现在已知数据泄露中">
                        已泄露 {breaches[a.accountId]} 次
                      </Badge>
                    )}
                    {a.issues.map((i: SecurityIssueKind) => {
                      const meta = ISSUE_META[i]
                      return (
                        <Badge key={i} variant={meta.tone} title={meta.hint}>
                          {meta.label}
                        </Badge>
                      )
                    })}
                    {a.reusedWith.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        与 {a.reusedWith.slice(0, 3).join('、')}
                        {a.reusedWith.length > 3 ? ' 等' : ''} 重复
                      </span>
                    )}
                  </div>
                </div>
                <StrengthBar value={a.passwordStrength} hasPassword={a.hasPassword} />
                {(a.issues.includes('no_password') ||
                  a.issues.includes('weak_password') ||
                  a.issues.includes('reused_password') ||
                  (breaches[a.accountId] ?? 0) > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void quickFix(a)}
                    title="生成强密码并复制（旧密码记入历史，可回滚）"
                  >
                    <KeyRound className="h-4 w-4" /> 生成强密码
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => void runCheck(a)} title="运行登录检测">
                  <Play className="h-4 w-4" /> 检测
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                  <Pencil className="h-4 w-4" /> 修复
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AccountDialog open={edit.open} account={edit.account} onOpenChange={onDialogChange} />
    </div>
  )
}
