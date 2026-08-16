import React from 'react'
import { Globe, KeyRound, Pencil, Play, Star, Trash2 } from 'lucide-react'
import type { Account } from '@shared/types'
import { relativeTime } from '@renderer/lib/utils'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { AccountStatusBadge } from '@renderer/components/status'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'

function Indicator({ label, ok }: { label: string; ok: boolean }): React.JSX.Element {
  return (
    <div className="rounded-md border bg-secondary/30 py-1">
      <div
        className={`mx-auto mb-0.5 h-1.5 w-1.5 rounded-full ${ok ? 'bg-success' : 'bg-muted-foreground/25'}`}
      />
      <div className={ok ? 'text-foreground/80' : 'text-muted-foreground'}>{label}</div>
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
  onDelete: () => void
}

export function AccountCard({
  account,
  selected,
  onToggleSelect,
  onOpenDetail,
  onToggleFavorite,
  onEdit,
  onRun,
  onLaunch,
  onCopyPassword,
  onDelete
}: { account: Account } & AccountCardHandlers): React.JSX.Element {
  const a = account
  return (
    <div
      data-state={selected ? 'selected' : undefined}
      className="group flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 data-[state=selected]:border-primary/60 data-[state=selected]:ring-1 data-[state=selected]:ring-primary/30"
    >
      <div className="flex items-start gap-2.5">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-1 shrink-0" />
        <PlatformGlyph platform={a.platform} size={34} />
        <button className="min-w-0 flex-1 text-left" onClick={onOpenDetail} title="查看详情">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium group-hover:text-primary">{a.label}</span>
            <AccountStatusBadge status={a.status} />
          </div>
          <div className="truncate text-xs text-muted-foreground">{a.email || a.username || '—'}</div>
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

      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
        <Indicator label="密码" ok={a.hasPassword} />
        <Indicator label="2FA" ok={a.hasTotp} />
        <Indicator label="代理" ok={!!a.proxyUrl} />
        <Indicator label="恢复" ok={!!a.recoveryEmail || !!a.recoveryPhone} />
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
