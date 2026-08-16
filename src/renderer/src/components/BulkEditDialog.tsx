import React, { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import type { AccountStatus } from '@shared/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

export interface BulkEditSpec {
  setGroup: boolean
  group: string
  tagsMode: 'none' | 'append' | 'replace'
  tags: string[]
  setProxy: boolean
  proxy: string
  setStatus: boolean
  status: AccountStatus
  /** Assign each selected account a fresh, distinct browser identity (anti-detect). */
  randomizeIdentity: boolean
}

export function parseTags(s: string): string[] {
  return Array.from(
    new Set(
      s
        .split(/[,，、\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  )
}

export function BulkEditDialog({
  open,
  onOpenChange,
  count,
  onApply
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  count: number
  onApply: (spec: BulkEditSpec) => Promise<void> | void
}): React.JSX.Element {
  const [setGroup, setSetGroup] = useState(false)
  const [group, setGroupVal] = useState('')
  const [tagsMode, setTagsMode] = useState<'none' | 'append' | 'replace'>('none')
  const [tags, setTags] = useState('')
  const [setProxy, setSetProxy] = useState(false)
  const [proxy, setProxyVal] = useState('')
  const [setStatus, setSetStatus] = useState(false)
  const [status, setStatus2] = useState<AccountStatus>('active')
  const [randomizeIdentity, setRandomizeIdentity] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setSetGroup(false)
      setGroupVal('')
      setTagsMode('none')
      setTags('')
      setSetProxy(false)
      setProxyVal('')
      setSetStatus(false)
      setStatus2('active')
      setRandomizeIdentity(false)
      setBusy(false)
    }
  }, [open])

  const nothing = !setGroup && tagsMode === 'none' && !setProxy && !setStatus && !randomizeIdentity

  const apply = async (): Promise<void> => {
    setBusy(true)
    try {
      await onApply({
        setGroup,
        group,
        tagsMode,
        tags: parseTags(tags),
        setProxy,
        proxy,
        setStatus,
        status,
        randomizeIdentity
      })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" /> 批量编辑
          </DialogTitle>
          <DialogDescription>
            将修改应用到所选 {count} 个账号。仅勾选 / 启用的字段会被覆盖，其它保持不变。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={setGroup} onCheckedChange={(v) => setSetGroup(!!v)} />
              设置分组
            </label>
            <Input
              value={group}
              onChange={(e) => setGroupVal(e.target.value)}
              placeholder="分组名称（留空表示清除分组）"
              disabled={!setGroup}
            />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">标签</Label>
              <Select value={tagsMode} onValueChange={(v) => setTagsMode(v as typeof tagsMode)}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不修改</SelectItem>
                  <SelectItem value="append">追加</SelectItem>
                  <SelectItem value="replace">替换</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="逗号或空格分隔，如：工作, 常用"
              disabled={tagsMode === 'none'}
            />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={setProxy} onCheckedChange={(v) => setSetProxy(!!v)} />
              设置代理
            </label>
            <Input
              value={proxy}
              onChange={(e) => setProxyVal(e.target.value)}
              placeholder="http://user:pass@host:port（留空表示清除）"
              className="font-mono text-xs"
              disabled={!setProxy}
            />
            <p className="text-xs text-muted-foreground">
              推荐 HTTP(S) 代理；Chromium 不支持带账号密码的 SOCKS5。
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={setStatus} onCheckedChange={(v) => setSetStatus(!!v)} />
              设置状态
            </label>
            <Select value={status} onValueChange={(v) => setStatus2(v as AccountStatus)} disabled={!setStatus}>
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

          <label className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
            <Checkbox
              checked={randomizeIdentity}
              onCheckedChange={(v) => setRandomizeIdentity(!!v)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">随机浏览器身份</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                为每个所选账号分配一套各不相同的 UA / 语言 / 时区，降低多账号被关联的风险。
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void apply()} disabled={nothing || busy}>
            {busy ? '应用中…' : '应用到所选'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
