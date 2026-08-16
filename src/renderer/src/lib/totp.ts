/** Build a standard otpauth:// URI so a stored TOTP secret can be re-enrolled
 *  (e.g. scanned into a phone authenticator). Pure/string-only. */
export function buildOtpauthUri(opts: {
  secret: string
  issuer?: string
  account?: string
  digits?: number
  period?: number
}): string {
  const issuer = (opts.issuer ?? '').trim()
  const account = (opts.account ?? 'account').trim() || 'account'
  const name = issuer ? `${issuer}:${account}` : account
  const params = new URLSearchParams()
  params.set('secret', opts.secret.replace(/\s+/g, '').toUpperCase())
  if (issuer) params.set('issuer', issuer)
  params.set('algorithm', 'SHA1')
  params.set('digits', String(opts.digits ?? 6))
  params.set('period', String(opts.period ?? 30))
  return `otpauth://totp/${encodeURIComponent(name)}?${params.toString()}`
}
