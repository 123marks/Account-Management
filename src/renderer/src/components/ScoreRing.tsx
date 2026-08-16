import React from 'react'

export function ScoreRing({
  score,
  size = 120,
  stroke = 10
}: {
  score: number
  size?: number
  stroke?: number
}): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color =
    clamped >= 75
      ? 'hsl(var(--success))'
      : clamped >= 50
        ? 'hsl(var(--warning))'
        : 'hsl(var(--destructive))'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>
          {clamped}
        </span>
        <span className="text-[11px] text-muted-foreground">安全分</span>
      </div>
    </div>
  )
}
