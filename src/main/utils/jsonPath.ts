/** Read a dotted path from a JSON-like object. `text` returns the raw string. */
export function pick(obj: unknown, path: string): unknown {
  if (!path || path === 'text') return obj
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function pickString(obj: unknown, path: string): string {
  const v = pick(obj, path)
  if (v == null) return ''
  return String(v)
}

export function fillTemplate(
  tpl: string,
  vars: Record<string, string | number | boolean | undefined>
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(String(vars[k] ?? '')))
}
