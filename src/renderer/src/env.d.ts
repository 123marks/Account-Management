/// <reference types="vite/client" />
import type { Api } from '@shared/types'

declare global {
  interface Window {
    api: Api
  }
  /** Injected at build time from package.json (see electron.vite.config.ts). */
  const __APP_VERSION__: string
}

export {}
