import React from 'react'

export interface DonutSegment {
  label: string
  value: number
  color: string
}

/** Lightweight multi-segment donut (no chart lib). */
export function Donut({
  segments,
  size = 148,
  thickness = 16,
  centerLabel,
  centerSub
}: {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: React.ReactNode
  centerSub?: React.ReactNode
}): React.JSX.Element {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let acc = 0

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={thickness} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => {
              const frac = s.value / total
              const len = c * frac
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-acc}
                />
              )
              acc += len
              return el
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerLabel !== undefined && <span className="text-2xl font-bold tabular-nums">{centerLabel}</span>}
        {centerSub !== undefined && <span className="text-[11px] text-muted-foreground">{centerSub}</span>}
      </div>
    </div>
  )
}

export function DonutLegend({ segments }: { segments: DonutSegment[] }): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
          <span className="flex-1 text-muted-foreground">{s.label}</span>
          <span className="tabular-nums font-medium">{s.value}</span>
        </div>
      ))}
    </div>
  )
}

export interface BarPoint {
  label: string
  value: number
}

/** Simple activity bar chart scaled to the max value. */
export function MiniBars({
  data,
  height = 120,
  color = 'hsl(var(--primary))'
}: {
  data: BarPoint[]
  height?: number
  color?: string
}): React.JSX.Element {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${d.value}`}>
          <div
            className="w-full rounded-t transition-all"
            style={{
              height: `${(d.value / max) * 100}%`,
              minHeight: d.value > 0 ? 4 : 0,
              backgroundColor: color,
              opacity: d.value > 0 ? 1 : 0.15
            }}
          />
        </div>
      ))}
    </div>
  )
}
