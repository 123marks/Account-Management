import type { AppSettings } from '@shared/types'

type Theme = AppSettings['theme']

/** Apply the theme by toggling the `dark` class on <html>. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
}
