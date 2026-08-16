import React from 'react'
import { cn } from '@renderer/lib/utils'

/**
 * A teaching empty state: an icon tile, a short title, a one-line hint that tells
 * the user what to do next, and an optional primary action. Left-aligned copy in a
 * centered block reads as intentional rather than "nothing here".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border bg-secondary/50 text-muted-foreground">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
