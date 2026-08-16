import React, { useCallback, useEffect, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { estimatePasswordStrength, strengthLabel } from '@shared/security'
import { generatePassword, generatePassphrase, type PwGenOptions } from '@renderer/lib/password'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

const DEFAULTS: PwGenOptions = {
  length: 16,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false
}

export function PasswordGeneratorDialog({
  open,
  onOpenChange,
  onUse
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onUse: (password: string) => void
}): React.JSX.Element {
  const [mode, setMode] = useState<'password' | 'passphrase'>('password')
  const [opts, setOpts] = useState<PwGenOptions>(DEFAULTS)
  const [words, setWords] = useState(4)
  const [value, setValue] = useState('')

  const regenerate = useCallback((): void => {
    setValue(mode === 'password' ? generatePassword(opts) : generatePassphrase(words))
  }, [mode, opts, words])

  useEffect(() => {
    if (open) regenerate()
  }, [open, regenerate])

  const setOpt = (patch: Partial<PwGenOptions>): void => setOpts((o) => ({ ...o, ...patch }))

  const score = estimatePasswordStrength(value)
  const { label: sLabel, tone } = strengthLabel(score)
  const color =
    tone === 'success' ? 'hsl(var(--success))' : tone === 'warning' ? 'hsl(var(--warning))' : 'hsl(var(--destructive))'

  const Toggle = ({
    checked,
    onChange,
    label
  }: {
    checked: boolean
    onChange: (v: boolean) => void
    label: string
  }): React.JSX.Element => (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <Label className="cursor-pointer">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>密码生成器</DialogTitle>
          <DialogDescription>本地 CSPRNG 生成，可配置强度；也支持易记的口令短语。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-secondary/40 p-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-sm">{value || '—'}</code>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={regenerate} title="换一个">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="复制"
                onClick={() => {
                  if (value) {
                    void navigator.clipboard.writeText(value)
                    toast.success('已复制')
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
              </div>
              <span className="w-8 text-right text-xs" style={{ color }}>
                {sLabel}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setMode('password')}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${mode === 'password' ? 'border-primary/40 bg-primary/15 text-primary' : 'text-muted-foreground'}`}
            >
              随机密码
            </button>
            <button
              onClick={() => setMode('passphrase')}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${mode === 'passphrase' ? 'border-primary/40 bg-primary/15 text-primary' : 'text-muted-foreground'}`}
            >
              口令短语
            </button>
          </div>

          {mode === 'password' ? (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <Label>长度：{opts.length}</Label>
                <input
                  type="range"
                  min={8}
                  max={64}
                  value={opts.length}
                  onChange={(e) => setOpt({ length: Number(e.target.value) })}
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Toggle checked={opts.upper} onChange={(v) => setOpt({ upper: v })} label="大写 A-Z" />
                <Toggle checked={opts.lower} onChange={(v) => setOpt({ lower: v })} label="小写 a-z" />
                <Toggle checked={opts.digits} onChange={(v) => setOpt({ digits: v })} label="数字 0-9" />
                <Toggle checked={opts.symbols} onChange={(v) => setOpt({ symbols: v })} label="符号 !@#" />
              </div>
              <Toggle
                checked={opts.excludeAmbiguous}
                onChange={(v) => setOpt({ excludeAmbiguous: v })}
                label="排除易混字符 (0O1lI|)"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>单词数：{words}</Label>
              <input
                type="range"
                min={3}
                max={8}
                value={words}
                onChange={(e) => setWords(Number(e.target.value))}
                className="w-full accent-[hsl(var(--primary))]"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => {
              if (!value) {
                toast.error('请至少选择一种字符类型')
                return
              }
              onUse(value)
              onOpenChange(false)
            }}
          >
            使用此密码
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
