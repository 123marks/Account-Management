import React from 'react'

/**
 * The app brand mark: a secure "vault" shield with a keyhole on an
 * indigo→violet tile. Rendered as inline SVG so it stays crisp at any size and
 * matches the packaged window/taskbar icon (build/icon.png) exactly.
 */
export function Logo({
  size = 36,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="AI Account Manager"
    >
      <defs>
        <linearGradient id="aamTile" x1="64" y1="40" x2="452" y2="472" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7B6CFF" />
          <stop offset="1" stopColor="#3B2ED6" />
        </linearGradient>
        <linearGradient id="aamShield" x1="256" y1="112" x2="256" y2="432" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E4E7FF" />
        </linearGradient>
      </defs>
      <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#aamTile)" />
      <path
        d="M256 116 L390 164 V286 C390 358 331 405 256 434 C181 405 122 358 122 286 V164 Z"
        fill="url(#aamShield)"
      />
      <circle cx="256" cy="252" r="30" fill="#4A3BE6" />
      <path
        d="M243 271 H269 L261 332 C260.5 336 258.7 338 256 338 C253.3 338 251.5 336 251 332 Z"
        fill="#4A3BE6"
      />
      <circle cx="331" cy="181" r="12" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="181" cy="181" r="8" fill="#FFFFFF" fillOpacity="0.6" />
    </svg>
  )
}
