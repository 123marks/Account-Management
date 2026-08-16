import React from 'react'
import { cn } from '@renderer/lib/utils'

/** A pulsing placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

/** A few stacked skeleton rows, e.g. for list/table loading. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }): React.JSX.Element {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
