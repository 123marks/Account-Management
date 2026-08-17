import React, { useEffect, useState } from 'react'
import { Copy, Inbox, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { GeneratedInbox } from '@shared/types'
import { api } from '@renderer/lib/api'
import { relativeTime } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'

export function InboxHistoryPanel({
  refreshToken = 0,
  onPeek
}: {
  refreshToken?: number
  onPeek: (id: string) => void
}): React.JSX.Element {
  const [items, setItems] = useState<GeneratedInbox[]>([])
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">已生成邮箱</div>
          <p className="text-xs text-muted-foreground">测试或批量注册申请过的地址会留在这里，可复制、读信。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">还没有记录。点上方「测试」或走批量注册即可生成并入库。</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {items.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{r.email}</div>
                <div className="text-[11px] text-muted-foreground">
                  {r.driver} · {relativeTime(r.createdAt)}
                </div>
              </div>
              <Badge variant={r.source === 'register' ? 'success' : 'secondary'}>
                {r.source === 'register' ? '注册' : '测试'}
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="读信"
                onClick={() => onPeek(r.id)}
              >
                <Inbox className="h-3.5 w-3.5" />
              </Button>
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