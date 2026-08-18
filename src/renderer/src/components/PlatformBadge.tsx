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
    const bare = brand.tile === 'transparent'
    const inner = bare ? size : Math.round(size * 0.86)
    return (
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{
          width: size,
          height: size,
          backgroundColor: bare ? 'transparent' : brand.tile
        }}
      >
        <svg viewBox="0 0 24 24" width={inner} height={inner} className="block">
          {brand.node}
        </svg>
      </div>
    )
  }

  const m = platformMeta(platform)
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: m.color,
        fontSize: Math.round(size * (m.letter.length > 1 ? 0.32 : 0.42))
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
      <PlatformGlyph platform={platform} size={18} />
      <span className="font-medium">{m.label}</span>
    </div>
  )
}
