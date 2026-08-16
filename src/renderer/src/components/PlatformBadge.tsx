import React from 'react'
import type { Platform } from '@shared/types'
import { platformMeta } from '@renderer/lib/platforms'
import { BRAND } from '@renderer/components/brand-icons'
import { cn } from '@renderer/lib/utils'

export function PlatformGlyph({
  platform,
  size = 28
}: {
  platform: Platform
  size?: number
}): React.JSX.Element {
  const brand = BRAND[platform]
  if (brand) {
    const pad = Math.round(size * 0.2)
    return (
      <div
        className="flex items-center justify-center rounded-lg shadow-sm ring-1 ring-black/5"
        style={{ width: size, height: size, backgroundColor: brand.tile, padding: pad }}
      >
        <svg viewBox="0 0 24 24" width={size - pad * 2} height={size - pad * 2}>
          {brand.node}
        </svg>
      </div>
    )
  }

  const m = platformMeta(platform)
  return (
    <div
      className="flex items-center justify-center rounded-lg font-bold text-white shadow-sm"
      style={{
        width: size,
        height: size,
        backgroundColor: m.color,
        fontSize: size * (m.letter.length > 1 ? 0.34 : 0.5)
      }}
    >
      {m.letter || m.label.slice(0, 1)}
    </div>
  )
}

export function PlatformBadge({
  platform,
  className
}: {
  platform: Platform
  className?: string
}): React.JSX.Element {
  const m = platformMeta(platform)
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <PlatformGlyph platform={platform} />
      <span className="font-medium">{m.label}</span>
    </div>
  )
}
