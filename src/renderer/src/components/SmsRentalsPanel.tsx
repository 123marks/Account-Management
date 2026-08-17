import React, { useEffect, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { SmsRental } from '@shared/types'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { SecretCell } from '@renderer/components/SecretCell'

export function SmsRentalsPanel(): React.JSX.Element {
  const [items, setItems] = useState<SmsRental[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setItems(await api.sms.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (items.length === 0) return <></>

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">当前租用</div>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> 刷新
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs">{r.phone}</div>
              <div className="text-xs text-muted-foreground">
                {r.driver} · {r.service}
              </div>
            </div>
            <Badge variant={r.status === 'finished' || r.status === 'code_received' ? 'success' : 'secondary'}>
              {r.status}
            </Badge>
            <SecretCell value={r.code} copyLabel="验证码已复制" />
            {(r.status === 'pending' || r.status === 'code_received') && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                title="取消释放"
                onClick={async () => {
                  await api.sms.cancel(r.id)
                  toast.success('已取消租用')
                  void load()
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
