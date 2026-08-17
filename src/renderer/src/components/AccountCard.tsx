import React from 'react'
import { Globe, Inbox, KeyRound, Pencil, Play, Star, Trash2 } from 'lucide-react'
import type { Account } from '@shared/types'
import { accountSubtitle, accountTitle, emailDomain } from '@shared/accountDisplay'
import { platformMeta } from '@renderer/lib/platforms'
import { relativeTime } from '@renderer/lib/utils'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { AccountStatusBadge } from '@renderer/components/status'
import { usePrivacyStore } from '@renderer/store/privacy'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'

function Indicator({
  label,
  ok,
  title,
  onClick
}: {
  label: string
  ok: boolean
  title: string
  onClick?: () => void
}): React.JSX.Element {
  const cls = `rounded-md border bg-secondary/30 py-1 ${onClick ? 'cursor-pointer hover:border-primary/50' : 'cursor-default'}`
  const inner = (
    <>
      <div
        className={`mx-auto mb-0.5 h-1.5 w-1.5 rounded-full ${ok ? 'bg-success' : 'bg-muted-foreground/25'}`}
      />
      <div className={ok ? 'text-foreground/80' : 'text-muted-foreground'}>{label}</div>
    </>
  )
  if (onClick) {
    return (
      <button type="button" title={title} onClick={onClick} className={cls}>
        {inner}
      </button>
    )
  }
  return (
    <div title={title} className={cls}>
      {inner}
    </div>
  )
}

export interface AccountCardHandlers {
  selected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  onToggleFavorite: () => void
  onEdit: () => void
  onRun: () => void
  onLaunch: () => void
  onCopyPassword: () => void
  onCopyTotp: () => void
  onCopyRecovery: () => void
  onEditProxy: () => void
  onPeekMail: () => void
  onDelete: () => void
}

export function AccountCard({
  account,
  selected,
  running = false,
  onToggleSelect,
  onOpenDetail,
  onToggleFavorite,
  onEdit,
  onRun,
  onLaunch,
  onCopyPassword,
  onCopyTotp,
  onCopyRecovery,
  onEditProxy,
  onPeekMail,
  onDelete
}: { account: Account; running?: boolean } & AccountCardHandlers): React.JSX.Element {
  const a = account
  const revealed = usePrivacyStore((s) => s.revealed)
  const title = accountTitle(a)
  const subtitle = accountSubtitle(a, revealed)
  const frame = running ? 'account-card-running' : a.favorite ? 'account-card-main' : 'border'
  return (
    <div
      data-state={selected ? 'selected' : undefined}
      className={`${frame} group flex flex-col rounded-xl bg-card p-4 data-[state=selected]:ring-2 data-[state=selected]:ring-primary/40`}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-1 shrink-0" />
        <PlatformGlyph platform={a.platform} size={34} />
        <button className="min-w-0 flex-1 text-left" onClick={onOpenDetail} title="查看详情">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium group-hover:text-primary">{title}</span>
            <AccountStatusBadge status={a.status} />
            {a.favorite && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                主号
              </Badge>
            )}
            {running && (
              <Badge className="h-5 px-1.5 text-[10px]">执行中</Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{platformMeta(a.platform).label}</span>
            {emailDomain(a.email) && (
              <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
                {emailDomain(a.email)}
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </button>
        <button
          onClick={onToggleFavorite}
          title={a.favorite ? '取消收藏' : '收藏'}
          className="shrink-0 text-muted-foreground/40 transition-colors hover:text-warning"
        >
          <Star className={`h-4 w-4 ${a.favorite ? 'fill-warning text-warning' : ''}`} />
        </button>
      </div>

      {(a.groupName || a.tags.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.groupName && <Badge variant="secondary">{a.groupName}</Badge>}
          {a.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-5 gap-1.5 text-center text-[11px]">
        <Indicator
          label="密码"
          ok={a.hasPassword}
          title={a.hasPassword ? '复制密码' : '未设置密码'}
          onClick={a.hasPassword ? onCopyPassword : undefined}
        />
        <Indicator
          label="2FA"
          ok={a.hasTotp}
          title={a.hasTotp ? '复制验证码' : '未配置 2FA'}
          onClick={a.hasTotp ? onCopyTotp : undefined}
        />
        <Indicator
          label="代理"
          ok={!!a.proxyUrl}
          title={a.proxyUrl ? '编辑代理' : '配置代理'}
          onClick={onEditProxy}
        />
        <Indicator
          label="收信"
          ok={a.hasMailboxPass || a.hasRefreshToken}
          title={a.hasMailboxPass || a.hasRefreshToken ? '读取最近邮件' : '未配置收信凭证'}
          onClick={onPeekMail}
        />
        <Indicator
          label="恢复"
          ok={!!a.recoveryEmail || !!a.recoveryPhone}
          title={a.recoveryEmail || a.recoveryPhone ? '复制恢复信息' : '未设置恢复信息'}
          onClick={a.recoveryEmail || a.recoveryPhone ? onCopyRecovery : undefined}
        />
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-2.5">
        <span className="text-[11px] text-muted-foreground">{relativeTime(a.lastUsedAt)}</span>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="复制密码" onClick={onCopyPassword}>
            <KeyRound className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="运行自动化" onClick={onRun}>
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="打开浏览器" onClick={onLaunch}>
            <Globe className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="读取最近邮件" onClick={onPeekMail}>
            <Inbox className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            title="删除"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
