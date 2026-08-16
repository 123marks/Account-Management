import React, { useMemo, useState } from 'react'
import { Ban, Bot, Eraser, Eye, Info, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AutomationTask, TaskStatus, TaskType } from '@shared/types'
import { useTasksStore } from '@renderer/store/tasks'
import { useLogsStore } from '@renderer/store/logs'
import { useAppStore } from '@renderer/store/app'
import { platformMeta } from '@renderer/lib/platforms'
import { formatTime } from '@renderer/lib/utils'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { TaskStatusBadge } from '@renderer/components/status'
import { AutomationTaskDrawer } from '@renderer/components/AutomationTaskDrawer'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'

const TASK_LABELS: Record<TaskType, string> = {
  check_login: '登录检测',
  change_password: '修改密码',
  change_recovery: '修改恢复信息',
  manage_2fa: '两步验证',
  register: '注册账号'
}

type FilterKey = 'all' | 'active' | 'success' | 'failed' | 'canceled'

function isActive(s: TaskStatus): boolean {
  return s === 'running' || s === 'queued'
}

export default function Automation(): React.JSX.Element {
  const tasks = useTasksStore((s) => s.tasks)
  const cancel = useTasksStore((s) => s.cancel)
  const remove = useTasksStore((s) => s.remove)
  const clearFinished = useTasksStore((s) => s.clearFinished)
  const retry = useTasksStore((s) => s.retry)
  const setFilter = useLogsStore((s) => s.setFilter)
  const queryLogs = useLogsStore((s) => s.query)
  const setPage = useAppStore((s) => s.setPage)

  const [filter, setFilterKey] = useState<FilterKey>('all')
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailTask = useMemo<AutomationTask | null>(
    () => tasks.find((t) => t.id === detailId) ?? null,
    [tasks, detailId]
  )

  const counts = useMemo(() => {
    let active = 0
    let success = 0
    let failed = 0
    let canceled = 0
    for (const t of tasks) {
      if (isActive(t.status)) active += 1
      else if (t.status === 'success') success += 1
      else if (t.status === 'failed') failed += 1
      else if (t.status === 'canceled') canceled += 1
    }
    return { all: tasks.length, active, success, failed, canceled }
  }, [tasks])

  const filtered = useMemo(() => {
    if (filter === 'all') return tasks
    if (filter === 'active') return tasks.filter((t) => isActive(t.status))
    return tasks.filter((t) => t.status === filter)
  }, [tasks, filter])

  const chips: { key: FilterKey; label: string; n: number }[] = [
    { key: 'all', label: '全部', n: counts.all },
    { key: 'active', label: '进行中', n: counts.active },
    { key: 'success', label: '成功', n: counts.success },
    { key: 'failed', label: '失败', n: counts.failed },
    { key: 'canceled', label: '已取消', n: counts.canceled }
  ]

  const finishedCount = counts.success + counts.failed + counts.canceled

  const viewLogs = async (taskId: string): Promise<void> => {
    setFilter({ taskId, level: undefined, category: 'automation', search: undefined })
    await queryLogs()
    setPage('logs')
  }
  const onCancel = async (taskId: string): Promise<void> => {
    await cancel(taskId)
    toast.message('已请求取消任务')
  }
  const onRetry = async (taskId: string): Promise<void> => {
    await retry(taskId)
    toast.success('已重新提交任务')
  }
  const onDelete = async (taskId: string): Promise<void> => {
    await remove(taskId)
  }
  const onClear = async (): Promise<void> => {
    if (finishedCount === 0) return
    if (!window.confirm(`确认清除 ${finishedCount} 条已完成/失败/取消的任务记录？`)) return
    await clearFinished()
    toast.success('已清除完成记录')
  }
  const onRetryFailed = async (): Promise<void> => {
    const failedTasks = tasks.filter((t) => t.status === 'failed')
    if (failedTasks.length === 0) return
    for (const t of failedTasks) await retry(t.id)
    toast.success(`已重新提交 ${failedTasks.length} 个失败任务`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1 text-muted-foreground">
          <p>
            自动化按固定四步执行：<span className="text-foreground">①登录/授权</span> →{' '}
            <span className="text-foreground">②监控页面、遇人机验证先自动跳过，不行则弹出浏览器转人工</span> →{' '}
            <span className="text-foreground">③执行所选操作</span>（改密码可预先填好新密码，留空则自动生成强密码）→{' '}
            <span className="text-foreground">④记录「自动化前 / 后」结果</span>。
          </p>
          <p>
            <span className="text-foreground">点任意任务行可查看详情</span>
            ：分步骤时间线、前后对比、结果一键复制。同一账号的多个任务自动排队、依次执行，避免冲突。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilterKey(c.key)}
            aria-pressed={filter === c.key}
            className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === c.key
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {c.label} <span className="tabular-nums">{c.n}</span>
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void onRetryFailed()} disabled={counts.failed === 0}>
          <RotateCcw className="h-4 w-4" /> 重试全部失败{counts.failed > 0 ? ` (${counts.failed})` : ''}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void onClear()} disabled={finishedCount === 0}>
          <Eraser className="h-4 w-4" /> 清除已完成
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>账号</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-52">进度</TableHead>
              <TableHead>结果 / 错误</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  {tasks.length === 0 ? (
                    <EmptyState
                      icon={Bot}
                      title="还没有任务"
                      description="到「账号管理」选择账号并运行自动化，会先登录授权，再执行你选择的操作。"
                    />
                  ) : (
                    <EmptyState title="当前筛选下没有任务" description="切换上方筛选查看其它状态的任务。" />
                  )}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((t) => {
              const active = isActive(t.status)
              const resultMsg =
                t.error ??
                (t.result && typeof t.result.message === 'string' ? (t.result.message as string) : '') ??
                ''
              return (
                <TableRow
                  key={t.id}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  role="button"
                  tabIndex={0}
                  aria-label={`查看任务详情：${t.accountLabel}`}
                  onClick={() => setDetailId(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setDetailId(t.id)
                    }
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <PlatformGlyph platform={t.platform} size={26} />
                      <div>
                        <div className="text-sm font-medium">{t.accountLabel}</div>
                        <div className="text-xs text-muted-foreground">
                          {platformMeta(t.platform).label}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{TASK_LABELS[t.type] ?? t.type}</TableCell>
                  <TableCell>
                    <TaskStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={t.progress} className="w-32" />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {t.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <span
                      className={`line-clamp-2 text-xs ${t.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      {resultMsg || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatTime(t.createdAt)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="查看详情"
                        aria-label="查看详情"
                        onClick={() => setDetailId(t.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {active ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          title="取消"
                          aria-label="取消任务"
                          onClick={() => void onCancel(t.id)}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="重试"
                            aria-label="重试任务"
                            onClick={() => void onRetry(t.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            title="删除记录"
                            aria-label="删除任务记录"
                            onClick={() => void onDelete(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AutomationTaskDrawer
        task={detailTask}
        onOpenChange={(v) => !v && setDetailId(null)}
        onRetry={(id) => void onRetry(id)}
        onCancel={(id) => void onCancel(id)}
        onViewLogs={(id) => {
          setDetailId(null)
          void viewLogs(id)
        }}
      />
    </div>
  )
}
