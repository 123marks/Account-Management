import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ProviderSetting } from '@shared/types'
import { getDriver, type ProviderType } from '@shared/providers'
import { useProvidersStore } from '@renderer/store/providers'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { Switch } from '@renderer/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

type ConfigValue = string | number | boolean

export function ProviderConfigDialog({
  open,
  onOpenChange,
  type,
  driver,
  editing
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  type: ProviderType
  driver: string
  editing: ProviderSetting | null
}): React.JSX.Element | null {
  const save = useProvidersStore((s) => s.save)
  const def = getDriver(type, driver)

  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [config, setConfig] = useState<Record<string, ConfigValue>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !def) return
    if (editing) {
      setName(editing.name)
      setEnabled(editing.enabled)
      setIsDefault(editing.isDefault)
      setConfig({ ...editing.config })
    } else {
      setName(def.label)
      setEnabled(true)
      setIsDefault(false)
      const init: Record<string, ConfigValue> = {}
      def.fields.forEach((f) => {
        if (f.defaultValue !== undefined) init[f.key] = f.defaultValue
      })
      setConfig(init)
    }
  }, [open, def, editing])

  if (!def) return null

  const setField = (key: string, value: ConfigValue): void =>
    setConfig((c) => ({ ...c, [key]: value }))

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast.error('请填写名称')
      return
    }
    for (const f of def.fields) {
      // Secret fields come back masked (blank) when editing; blank means "keep".
      if (f.required && !String(config[f.key] ?? '').trim() && !(editing && f.secret)) {
        toast.error(`请填写：${f.label}`)
        return
      }
    }
    setSaving(true)
    try {
      await save({
        id: editing?.id,
        type,
        driver,
        name: name.trim(),
        enabled,
        isDefault,
        config
      })
      toast.success(editing ? '已保存' : '已添加服务')
      onOpenChange(false)
    } catch (e) {
      toast.error('保存失败: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑服务' : `添加服务 · ${def.label}`}</DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
          {def.unimplemented && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              该驱动尚未接入运行时，保存后不会生效。
            </p>
          )}
          {typeof editing?.config.poolRemaining === 'number' && (
            <p className="text-xs text-muted-foreground">
              当前库存剩余 {String(editing.config.poolRemaining)} 行。库存框留空表示不替换已保存的行。
            </p>
          )}
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="便于识别的名称" />
          </div>

          {def.noConfig && (
            <p className="rounded-lg border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              该服务无需额外配置。
            </p>
          )}

          {def.fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              {f.type === 'boolean' ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <Label className="cursor-pointer">{f.label}</Label>
                  <Switch
                    checked={Boolean(config[f.key])}
                    onCheckedChange={(v) => setField(f.key, v)}
                  />
                </div>
              ) : (
                <>
                  <Label>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  {f.type === 'textarea' ? (
                    <Textarea
                      value={String(config[f.key] ?? '')}
                      onChange={(e) => setField(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={f.key === 'stock' ? 8 : 3}
                      className="font-mono text-xs"
                    />
                  ) : (
                    <Input
                      type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                      value={String(config[f.key] ?? '')}
                      onChange={(e) =>
                        setField(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)
                      }
                      placeholder={editing && f.secret ? '已配置，留空表示不修改' : f.placeholder}
                      className={f.secret || f.type === 'password' ? 'font-mono' : undefined}
                    />
                  )}
                  {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                </>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label className="cursor-pointer">启用</Label>
              <p className="text-xs text-muted-foreground">关闭后注册/自动化时不会使用该服务。</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <Label className="cursor-pointer">设为默认</Label>
              <p className="text-xs text-muted-foreground">同类服务只会有一个默认项。</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
