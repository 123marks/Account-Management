import React from 'react'
import { Ban, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import type { AccountStatus, TaskStatus } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'

const ACCOUNT_MAP: Record<AccountStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' }> = {
  active: { label: '正常', variant: 'success' },
  disabled: { label: '停用', variant: 'secondary' },
  error: { label: '异常', variant: 'destructive' }
}

export function AccountStatusBadge({ status }: { status: AccountStatus }): React.JSX.Element {
  const m = ACCOUNT_MAP[status] ?? ACCOUNT_MAP.active
  return <Badge variant={m.variant}>{m.label}</Badge>
}

const TASK_MAP: Record<
  TaskStatus,
  { label: string; variant: 'default' | 'success' | 'secondary' | 'destructive'; icon: React.ReactNode }
> = {
  queued: { label: '排队中', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  running: { label: '运行中', variant: 'default', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  success: { label: '成功', variant: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  failed: { label: '失败', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
  canceled: { label: '已取消', variant: 'secondary', icon: <Ban className="h-3 w-3" /> }
}

export function TaskStatusBadge({ status }: { status: TaskStatus }): React.JSX.Element {
  const m = TASK_MAP[status] ?? TASK_MAP.queued
  return (
    <Badge variant={m.variant} className="gap-1">
      {m.icon}
      {m.label}
    </Badge>
  )
}
