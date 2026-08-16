import React, { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2, Trash } from 'lucide-react'
import { toast } from 'sonner'
import type { Account } from '@shared/types'
import { api } from '@renderer/lib/api'
import { platformMeta } from '@renderer/lib/platforms'
import { PlatformGlyph } from '@renderer/components/PlatformBadge'
import { EmptyState } from '@renderer/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

export function TrashDialog({
  open,
  onOpenChange,
  onChanged
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onChanged: () => void | Promise<void>
}): React.JSX.Element {
  const [items, setItems] = useState<Account[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await api.accounts.listDeleted())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const restore = async (a: Account): Promise<void> => {
    await api.accounts.restore(a.id)
    toast.success(`已恢复「${a.label}」`)
    await Promise.all([load(), onChanged()])
  }

  const purge = async (a: Account): Promise<void> => {
    if (!window.confirm(`永久删除「${a.label}」？此操作不可撤销。`)) return
    await api.accounts.purge(a.id)
    toast.success('已永久删除')
    await load()
  }

  const purgeAll = async (): Promise<void> => {
    if (items.length === 0) return
    if (!window.confirm(`清空回收站，永久删除 ${items.length} 个账号？此操作不可撤销。`)) return
    const { purged } = await api.accounts.purgeDeleted()
    toast.success(`已永久删除 ${purged} 个账号`)
    await load()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash className="h-5 w-5 text-primary" /> 回收站
          </DialogTitle>
          <DialogDescription>
            已删除的账号在这里可恢复。永久删除会连同其密码历史一并清除，不可撤销。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState
              icon={Trash}
              title={loading ? '加载中…' : '回收站是空的'}
              description="删除账号后会先移到这里，可随时恢复。"
            />
          ) : (
            <div className="divide-y">
              {items.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2.5">
                  <PlatformGlyph platform={a.platform} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.label}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.email || a.username || platformMeta(a.platform).label}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void restore(a)}>
                    <RotateCcw className="h-4 w-4" /> 恢复
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="永久删除"
                    aria-label="永久删除"
                    onClick={() => void purge(a)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={items.length === 0}
            onClick={() => void purgeAll()}
          >
            <Trash2 className="h-4 w-4" /> 清空回收站
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
