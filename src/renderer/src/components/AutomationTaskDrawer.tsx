import React, { useCallback, useEffect, useState } from 'react'
import { Ban, Copy, Image as ImageIcon, RefreshCw, RotateCcw, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import type { AutomationTask, LogEntry, LogLevel, TaskType } from '@shared/types'
import { api } from '@renderer/lib/api'
import { platformMeta } from '@renderer/lib/platforms'
import { formatTime, relativeTime } from '@renderer/lib/utils'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { TaskStatusBadge } from '@renderer/components/status'
import { Sheet, SheetContent, SheetTitle } from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { ScrollArea } from '@renderer/components/ui/scroll-area'

const TASK_LABELS: Record<TaskType, string> = {
  check_login: '登录检测',
  change_password: '修改密码',
  change_recovery: '修改恢复信息',
  manage_2fa: '两步验证',
  register: '注册账号'
}

const AFTER_LABELS: Record<string, string> = {
  newPassword: '新密码',
  recoveryEmail: '新恢复邮箱',
  enabled: '两步验证状态',
  message: '说明'
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-muted-foreground',
  info: 'text-sky-400',
  warn: 'text-warning',
  error: 'text-destructive'
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  )
}

function isActive(s: string): boolean {
  return s === 'running' || s === 'queued'
}

export function AutomationTaskDrawer({
  task,
  onOpenChange,
  onRetry,
  onCancel,
  onViewLogs
}: {
  task: AutomationTask | null
  onOpenChange: (v: boolean) => void
  onRetry: (id: string) => void
  onCancel: (id: string) => void
  onViewLogs: (id: string) => void
}): React.JSX.Element {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const taskId = task?.id ?? null

  const loadLogs = useCallback(async (): Promise<void> => {
    if (!taskId) return
    setLogs(await api.logs.query({ taskId, limit: 500 }))
  }, [taskId])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs, task?.status, task?.progress])

  if (!task) return <Sheet open={false} onOpenChange={onOpenChange} />

  const result = (task.result ?? {}) as {
    message?: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
  }
  const before = result.before
  const after = result.after ?? {}
  const active = isActive(task.status)

  const copyAll = (): void => {
    const lines: string[] = [
      `账号: ${task.accountLabel} (${platformMeta(task.platform).label})`,
      `操作: ${TASK_LABELS[task.type] ?? task.type}`,
      `状态: ${task.status}`,
      task.error ? `错误: ${task.error}` : `结果: ${result.message ?? ''}`,
      ''
    ]
    if (before) {
      lines.push('【自动化前】')
      lines.push(`  状态: ${before.status}`)
      lines.push(`  密码: ${before.hasPassword ? '有' : '无'} · 2FA: ${before.hasTotp ? '有' : '无'}`)
      lines.push(`  恢复邮箱: ${before.recoveryEmail || '-'} · 恢复手机: ${before.recoveryPhone || '-'}`)
    }
    const afterEntries = Object.entries(after).filter(([k]) => k !== 'message')
    if (afterEntries.length) {
      lines.push('【自动化后】')
      for (const [k, v] of afterEntries) lines.push(`  ${AFTER_LABELS[k] ?? k}: ${String(v)}`)
    }
    lines.push('', '【步骤】')
    for (const l of logs) lines.push(`  [${formatTime(l.ts)}] ${l.message}`)
    void navigator.clipboard.writeText(lines.join('\n'))
    toast.success('已复制完整执行详情')
  }

  const copyText = (text: string, label: string): void => {
    void navigator.clipboard.writeText(text)
    toast.success(`${label}已复制`)
  }

  return (
    <Sheet open={!!task} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px]">
        <div className="flex items-center gap-3 border-b p-5 pr-12">
          <PlatformGlyph platform={task.platform} size={38} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base font-semibold">{task.accountLabel}</SheetTitle>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              {platformMeta(task.platform).label} · {TASK_LABELS[task.type] ?? task.type}
              <TaskStatusBadge status={task.status} />
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">进度</span>
                <span className="text-xs tabular-nums text-muted-foreground">{task.progress}%</span>
              </div>
              <Progress value={task.progress} />
              <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
                <span>创建 {relativeTime(task.createdAt)}</span>
                <span>{task.finishedAt ? `结束 ${relativeTime(task.finishedAt)}` : active ? '进行中…' : ''}</span>
              </div>
            </div>

            {task.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {task.error}
              </div>
            ) : result.message ? (
              <div className="rounded-lg border bg-secondary/40 px-3 py-2 text-sm">{result.message}</div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">自动化前</div>
                {before ? (
                  <div className="divide-y">
                    <Row label="状态" value={String(before.status)} />
                    <Row label="密码" value={before.hasPassword ? '有' : '无'} />
                    <Row label="2FA" value={before.hasTotp ? '有' : '无'} />
                    <Row label="恢复邮箱" value={(before.recoveryEmail as string) || '—'} />
                    <Row label="恢复手机" value={(before.recoveryPhone as string) || '—'} />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">无快照</div>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">自动化后</div>
                {Object.entries(after).filter(([k]) => k !== 'message').length ? (
                  <div className="divide-y">
                    {Object.entries(after)
                      .filter(([k]) => k !== 'message')
                      .map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-2 py-1 text-sm">
                          <span className="shrink-0 text-muted-foreground">{AFTER_LABELS[k] ?? k}</span>
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate font-mono text-xs">{String(v)}</span>
                            {typeof v === 'string' && v && (
                              <button
                                className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                title="复制"
                                aria-label={`复制${AFTER_LABELS[k] ?? k}`}
                                onClick={() => copyText(v, AFTER_LABELS[k] ?? k)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">{active ? '执行中…' : '无变更'}</div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  执行步骤 ({logs.length})
                </span>
                <button
                  className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="刷新步骤日志"
                  onClick={() => void loadLogs()}
                >
                  <RefreshCw className="inline h-3 w-3" /> 刷新
                </button>
              </div>
              <div className="max-h-[34vh] space-y-0.5 overflow-y-auto rounded-lg border bg-[hsl(222_30%_5%)] p-2 font-mono text-xs">
                {logs.length === 0 && (
                  <div className="p-4 text-center text-muted-foreground">
                    暂无步骤日志。任务开始执行后，这里会逐步显示每一步。
                  </div>
                )}
                {logs.map((l) => {
                  const shot =
                    l.meta && typeof l.meta.screenshot === 'string' ? l.meta.screenshot : null
                  return (
                    <div key={l.id} className="flex gap-2 px-1 py-0.5">
                      <span className="shrink-0 text-muted-foreground/60">{formatTime(l.ts).slice(11)}</span>
                      <span className={`w-10 shrink-0 uppercase ${LEVEL_COLOR[l.level]}`}>{l.level}</span>
                      <span className="flex-1 whitespace-pre-wrap break-all text-foreground/90">{l.message}</span>
                      {shot && (
                        <button
                          className="shrink-0 self-start rounded text-sky-400 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          title="打开失败时的截图"
                          aria-label="打开失败截图"
                          onClick={() => void api.system.openPath(shot)}
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex flex-wrap items-center gap-2 border-t p-4">
          {active ? (
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => onCancel(task.id)}>
              <Ban className="h-4 w-4" /> 取消
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onRetry(task.id)}>
              <RotateCcw className="h-4 w-4" /> 重试
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={copyAll}>
            <Copy className="h-4 w-4" /> 复制全部
          </Button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => onViewLogs(task.id)}>
            <ScrollText className="h-4 w-4" /> 完整日志
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
