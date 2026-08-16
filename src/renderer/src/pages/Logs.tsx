import React, { useEffect, useRef } from 'react'
import { Copy, Download, Eraser, RefreshCw, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import type { LogEntry, LogLevel } from '@shared/types'
import { useLogsStore } from '@renderer/store/logs'
import { api } from '@renderer/lib/api'
import { formatTime } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { EmptyState } from '@renderer/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: 'text-muted-foreground',
  info: 'text-sky-400',
  warn: 'text-warning',
  error: 'text-destructive'
}

const CATEGORIES = ['app', 'db', 'automation', 'crypto', 'ipc']

function fmtLine(l: LogEntry): string {
  return `[${formatTime(l.ts)}] ${l.level.toUpperCase()} [${l.category}] ${l.message}`
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export default function Logs(): React.JSX.Element {
  const { logs, filter, live, setFilter, setLive, query, clear } = useLogsStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void query()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.level, filter.category, filter.taskId, filter.search])

  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, live])

  const copyAll = (): void => {
    if (logs.length === 0) return
    void navigator.clipboard.writeText(logs.map(fmtLine).join('\n'))
    toast.success(`已复制 ${logs.length} 条日志`)
  }

  const exportLogs = async (): Promise<void> => {
    if (logs.length === 0) return
    const path = await api.system.saveFile(`aam-logs-${stamp()}.log`, logs.map(fmtLine).join('\n'))
    if (path) toast.success(`已导出 ${logs.length} 条日志到 ${path}`)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filter.level ?? 'all'}
          onValueChange={(v) => setFilter({ level: v === 'all' ? undefined : (v as LogLevel) })}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="级别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部级别</SelectItem>
            <SelectItem value="debug">debug</SelectItem>
            <SelectItem value="info">info</SelectItem>
            <SelectItem value="warn">warn</SelectItem>
            <SelectItem value="error">error</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.category ?? 'all'}
          onValueChange={(v) => setFilter({ category: v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={filter.search ?? ''}
          onChange={(e) => setFilter({ search: e.target.value || undefined })}
          placeholder="搜索日志内容"
          className="w-64"
        />

        {filter.taskId && (
          <Button variant="secondary" size="sm" onClick={() => setFilter({ taskId: undefined })}>
            清除任务过滤
          </Button>
        )}

        <span className="text-xs tabular-nums text-muted-foreground">{logs.length} 条</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Label htmlFor="logs-live" className="text-xs text-muted-foreground">
            实时
          </Label>
          <Switch id="logs-live" checked={live} onCheckedChange={setLive} />
        </div>
        <Button variant="outline" size="sm" onClick={copyAll} disabled={logs.length === 0}>
          <Copy className="h-4 w-4" /> 复制
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportLogs()} disabled={logs.length === 0}>
          <Download className="h-4 w-4" /> 导出
        </Button>
        <Button variant="outline" size="sm" onClick={() => void query()}>
          <RefreshCw className="h-4 w-4" /> 刷新
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => void clear()}
        >
          <Eraser className="h-4 w-4" /> 清空
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border bg-[hsl(222_30%_5%)] p-3 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="暂无日志"
            description="运行自动化、打开浏览器或触发操作后，这里会出现全链路结构化日志。调整上方筛选可缩小范围。"
          />
        ) : (
          logs.map((l) => (
            <div key={l.id} className="group flex gap-2 px-1 py-0.5 hover:bg-white/5">
              <span className="shrink-0 text-muted-foreground/70">{formatTime(l.ts)}</span>
              <span className={`w-12 shrink-0 font-semibold uppercase ${LEVEL_COLOR[l.level]}`}>
                {l.level}
              </span>
              <span className="w-24 shrink-0 text-muted-foreground">[{l.category}]</span>
              <span className="flex-1 whitespace-pre-wrap break-all text-foreground/90">{l.message}</span>
              <button
                className="shrink-0 self-start text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                title="复制此行"
                onClick={() => {
                  void navigator.clipboard.writeText(fmtLine(l))
                  toast.success('已复制')
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
