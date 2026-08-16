import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { buildOtpauthUri } from '@renderer/lib/totp'

/** Render a scannable QR for a TOTP secret (otpauth:// URI). */
export function TotpQR({
  secret,
  issuer,
  account,
  size = 168
}: {
  secret: string
  issuer?: string
  account?: string
  size?: number
}): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!secret) {
      setDataUrl('')
      return
    }
    const uri = buildOtpauthUri({ secret, issuer, account })
    QRCode.toDataURL(uri, {
      width: size * 2,
      margin: 1,
      color: { dark: '#0b0f1a', light: '#ffffff' }
    })
      .then((url) => {
        if (active) {
          setDataUrl(url)
          setError('')
        }
      })
      .catch((e: unknown) => {
        if (active) setError((e as Error).message)
      })
    return () => {
      active = false
    }
  }, [secret, issuer, account, size])

  if (error) {
    return <div className="text-xs text-destructive">二维码生成失败：{error}</div>
  }
  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded-lg bg-muted"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="TOTP 二维码"
      className="rounded-lg bg-white p-1 shadow-sm"
    />
  )
}
