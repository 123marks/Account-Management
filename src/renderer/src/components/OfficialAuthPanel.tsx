import React, { useEffect, useState } from 'react'
import { Check, Copy, Globe, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AccountInput, OfficialOAuthStart, Platform } from '@shared/types'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'

const NAMES: Partial<Record<Platform, string>> = {
  cursor: 'Cursor',
  openai: 'OpenAI',
  kiro: 'Kiro',
  windsurf: 'Windsurf'
}

export function OfficialAuthPanel({
  platform,
  onDone
}: {
  platform: Platform
  onDone: (input: AccountInput) => void
}): React.JSX.Element {
  const [session, setSession] = useState<OfficialOAuthStart | null>(null)
  const [status, setStatus] = useState('正在创建授权会话…')
  const [waiting, setWaiting] = useState(false)
  const [callback, setCallback] = useState('')
  const [busy, setBusy] = useState(false)
  const name = NAMES[platform] || platform

  useEffect(() => {
    let dead = false
    setSession(null)
    setCallback('')
    setWaiting(false)
    setStatus('正在创建授权会话…')
    void (async () => {
      try {
        const started = await api.oauth.start(platform)
        if (dead) {
          await api.oauth.cancel(started.loginId)
          return
        }
        setSession(started)
        setStatus('等待授权完成…')
        setWaiting(true)
        const input = await api.oauth.wait(started.loginId)
        if (dead) return
        setWaiting(false)
        setStatus('授权成功')
        onDone(input)
      } catch (e) {
        if (dead) return
        setWaiting(false)
        setStatus((e as Error).message)
      }
    })()
    return () => {
      dead = true
      void api.oauth.cancel()
    }
  }, [platform, onDone])

  const openBrowser = async (): Promise<void> => {
    if (!session?.authUrl) return
    await api.oauth.openUrl(session.authUrl)
    toast.success('已在浏览器打开授权页')
  }

  const copyUrl = async (): Promise<void> => {
    if (!session?.authUrl) return
    await navigator.clipboard.writeText(session.authUrl)
    toast.success('授权链接已复制')
  }

  const submit = async (): Promise<void> => {
    if (!session || !callback.trim()) return
    setBusy(true)
    try {
      const input = await api.oauth.submitCallback(session.loginId, callback.trim())
      setWaiting(false)
      setStatus('授权成功')
      onDone(input)
    } catch (e) {
      toast.error((e as Error).message)
      setStatus((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        点击下方按钮，在浏览器中完成 {name} 授权登录。
      </p>
      <div className="space-y-1.5">
        <Label>授权链接</Label>
        <div className="flex gap-2">
          <Input readOnly value={session?.authUrl || ''} className="font-mono text-xs" />
          <Button type="button" variant="outline" size="icon" onClick={() => void copyUrl()} disabled={!session?.authUrl}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        {session && (
          <p className="text-[11px] text-muted-foreground">
            授权有效期: {session.expiresIn}s；轮询间隔: {session.intervalSeconds}s
          </p>
        )}
      </div>
      <Button type="button" className="w-full" size="lg" onClick={() => void openBrowser()} disabled={!session?.authUrl}>
        <Globe className="h-4 w-4" /> 在浏览器中打开
      </Button>
      {session?.needsCallback && (
        <div className="space-y-1.5">
          <Label>手动输入回调地址</Label>
          <div className="flex gap-2">
            <Input
              value={callback}
              onChange={(e) => setCallback(e.target.value)}
              placeholder="粘贴完整回调地址，例如：http://localhost:1455/auth/callback?code=…"
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={() => void submit()} disabled={busy || !callback.trim()}>
              <Check className="h-4 w-4" /> 我已授权，继续
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-md border bg-secondary/40 px-3 py-2 text-sm">
        {waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4 text-muted-foreground" />}
        <span>{status}</span>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">完成授权后，此窗口将自动更新</p>
    </div>
  )
}
