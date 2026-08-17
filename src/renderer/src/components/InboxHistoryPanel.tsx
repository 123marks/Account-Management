import React, { useEffect, useMemo, useState } from 'react'
import { Copy, Inbox, RefreshCw, Rocket, Tags, Trash2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import type { GeneratedInbox } from '@shared/types'
import { emailDomain } from '@shared/accountDisplay'
import { api } from '@renderer/lib/api'
import { relativeTime } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'

export function InboxHistoryPanel({
  refreshToken = 0,
  onPeek,
  onRegister
}: {
  refreshToken?: number
  onPeek: (id: string) => void
  onRegister: (ids: string[]) => void
}): React.JSX.Element {
  const [items, setItems] = useState<GeneratedInbox[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [genCount, setGenCount] = useState(1)
  const [tagText, setTagText] = useState('')

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await api.providers.listInboxes())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [refreshToken])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter(
      (r) =>
        r.email.toLowerCase().includes(s) ||
        r.driver.toLowerCase().includes(s) ||
        r.notes.toLowerCase().includes(s) ||
        r.tags.join(' ').toLowerCase().includes(s)
    )
  }, [items, q])

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const unusedSelected = filtered.filter((r) => selected.has(r.id) && !r.accountId)

  const batchDelete = async (): Promise<void> => {
    const ids = [...selected]
    if (ids.length === 0) return
    await api.providers.removeInboxes(ids)
    setSelected(new Set())
    toast.success(`已删除 ${ids.length} 条邮箱记录`)
    void load()
  }

  const batchTag = async (): Promise<void> => {
    const tag = tagText.trim()
    if (!tag || selected.size === 0) return
    const ids = [...selected]
    const map = new Map(items.map((x) => [x.id, x]))
    for (const id of ids) {
      const cur = map.get(id)
      if (!cur) continue
      await api.providers.updateInboxes([id], { tags: Array.from(new Set([...cur.tags, tag])) })
    }
    setTagText('')
    toast.success('已添加标签')
    void load()
  }

  const generate = async (): Promise<void> => {
    setLoading(true)
    try {
      const rows = await api.providers.generateInboxes(genCount)
      toast.success(`已生成 ${rows.length} 个邮箱`)
      void load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">已生成邮箱</div>
          <p className="text-xs text-muted-foreground">
            可批量删除、打标签、读信，空闲邮箱可直接拿去注册，和账号库闭环。
          </p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索邮箱 / 标签"
          className="h-8 w-44"
        />
        <Input
          type="number"
          min={1}
          max={20}
          value={genCount}
          onChange={(e) => setGenCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          className="h-8 w-16"
        />
        <Button size="sm" variant="outline" onClick={() => void generate()} disabled={loading}>
          <Wand2 className="h-3.5 w-3.5" /> 生成
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </Button>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-secondary/40 px-3 py-2">
          <span className="text-xs">已选 {selected.size}</span>
          <Input
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="批量标签"
            className="h-7 w-28"
          />
          <Button size="sm" variant="outline" onClick={() => void batchTag()} disabled={!tagText.trim()}>
            <Tags className="h-3.5 w-3.5" /> 打标签
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={unusedSelected.length === 0}
            onClick={() => onRegister(unusedSelected.map((x) => x.id))}
          >
            <Rocket className="h-3.5 w-3.5" /> 用所选注册 ({unusedSelected.length})
          </Button>
          <Button size="sm" variant="destructive" onClick={() => void batchDelete()}>
            <Trash2 className="h-3.5 w-3.5" /> 批量删除
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            清除
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">还没有记录。点「生成」或「测试」即可入库。</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Checkbox
              checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
              onCheckedChange={() => {
                if (filtered.every((r) => selected.has(r.id))) setSelected(new Set())
                else setSelected(new Set(filtered.map((r) => r.id)))
              }}
            />
            全选当前
          </label>
          {filtered.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{r.email}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.driver} · {emailDomain(r.email)} · {relativeTime(r.createdAt)}
                  {r.notes ? ` · ${r.notes}` : ''}
                </div>
                {r.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <Badge key={t} variant="outline" className="h-5 text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Badge variant={r.accountId ? 'success' : r.source === 'register' ? 'success' : 'secondary'}>
                {r.accountId ? '已入库' : '空闲'}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="复制邮箱"
                onClick={() => {
                  void navigator.clipboard.writeText(r.email)
                  toast.success('邮箱已复制')
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="读信" onClick={() => onPeek(r.id)}>
                <Inbox className="h-3.5 w-3.5" />
              </Button>
              {!r.accountId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="用此邮箱注册"
                  onClick={() => onRegister([r.id])}
                >
                  <Rocket className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                title="删除记录"
                onClick={async () => {
                  await api.providers.removeInbox(r.id)
                  toast.success('已删除记录')
                  void load()
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
