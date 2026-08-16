// Decode Google Authenticator export links (`otpauth-migration://offline?data=...`).
// The data param is base64 of a protobuf MigrationPayload:
//   field 1 (repeated message) OtpParameters:
//     1 secret (bytes) · 2 name (string) · 3 issuer (string)
//     4 algorithm (enum) · 5 digits (enum: 1=SIX,2=EIGHT) · 6 type (enum: 1=HOTP,2=TOTP)
// Fully offline; no dependency beyond built-ins.

export interface GAuthEntry {
  secret: string // base32
  issuer: string
  label: string
  digits: number
  type: 'totp' | 'hotp'
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function b64ToBytes(b64: string): Uint8Array {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0
  let shift = 0
  let p = pos
  while (p < buf.length) {
    const b = buf[p++]
    result |= (b & 0x7f) << shift
    if (!(b & 0x80)) return [result >>> 0, p]
    shift += 7
  }
  throw new Error('protobuf varint 截断')
}

interface Field {
  field: number
  wire: number
  val: number | Uint8Array
}

function parseFields(buf: Uint8Array): Field[] {
  const out: Field[] = []
  let pos = 0
  while (pos < buf.length) {
    const [key, np] = readVarint(buf, pos)
    pos = np
    const field = key >>> 3
    const wire = key & 7
    if (wire === 0) {
      const [v, n2] = readVarint(buf, pos)
      pos = n2
      out.push({ field, wire, val: v })
    } else if (wire === 2) {
      const [len, n2] = readVarint(buf, pos)
      pos = n2
      out.push({ field, wire, val: buf.slice(pos, pos + len) })
      pos += len
    } else if (wire === 1) {
      pos += 8
      out.push({ field, wire, val: 0 })
    } else if (wire === 5) {
      pos += 4
      out.push({ field, wire, val: 0 })
    } else {
      throw new Error('不支持的 protobuf wire type: ' + wire)
    }
  }
  return out
}

export function decodeMigration(uri: string): GAuthEntry[] {
  const trimmed = uri.trim()
  if (!/^otpauth-migration:\/\//i.test(trimmed)) {
    throw new Error('不是有效的 Google Authenticator 迁移链接（应以 otpauth-migration:// 开头）')
  }
  const url = new URL(trimmed)
  const data = url.searchParams.get('data')
  if (!data) throw new Error('迁移链接缺少 data 参数')

  const bytes = b64ToBytes(data)
  const decoder = new TextDecoder()
  const entries: GAuthEntry[] = []
  for (const f of parseFields(bytes)) {
    if (f.field !== 1 || !(f.val instanceof Uint8Array)) continue
    let secret: Uint8Array | null = null
    let name = ''
    let issuer = ''
    let digits = 6
    let type: 'totp' | 'hotp' = 'totp'
    for (const sf of parseFields(f.val)) {
      if (sf.field === 1 && sf.val instanceof Uint8Array) secret = sf.val
      else if (sf.field === 2 && sf.val instanceof Uint8Array) name = decoder.decode(sf.val)
      else if (sf.field === 3 && sf.val instanceof Uint8Array) issuer = decoder.decode(sf.val)
      else if (sf.field === 5 && typeof sf.val === 'number') digits = sf.val === 2 ? 8 : 6
      else if (sf.field === 6 && typeof sf.val === 'number') type = sf.val === 1 ? 'hotp' : 'totp'
    }
    if (secret && secret.length > 0) {
      entries.push({ secret: base32Encode(secret), issuer, label: name, digits, type })
    }
  }
  if (entries.length === 0) throw new Error('未从迁移数据中解析出任何 2FA 条目')
  return entries
}

// ── Encoder (symmetric to the decoder above) ─────────────────────────────────

function base32Decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z2-7]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >>> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function writeVarint(n: number): number[] {
  const out: number[] = []
  let v = n >>> 0
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v = v >>> 7
  }
  out.push(v)
  return out
}

function fieldLenDelim(field: number, payload: Uint8Array): number[] {
  return [...writeVarint((field << 3) | 2), ...writeVarint(payload.length), ...payload]
}

function fieldVarint(field: number, value: number): number[] {
  return [...writeVarint((field << 3) | 0), ...writeVarint(value)]
}

/**
 * Encode entries into a single `otpauth-migration://` link (the format Google
 * Authenticator produces on "export accounts" and consumes on import).
 */
export function encodeMigration(
  entries: GAuthEntry[],
  opts: { batchIndex?: number; batchSize?: number; batchId?: number } = {}
): string {
  const enc = new TextEncoder()
  const top: number[] = []
  for (const e of entries) {
    const p: number[] = []
    p.push(...fieldLenDelim(1, base32Decode(e.secret)))
    if (e.label) p.push(...fieldLenDelim(2, enc.encode(e.label)))
    if (e.issuer) p.push(...fieldLenDelim(3, enc.encode(e.issuer)))
    p.push(...fieldVarint(4, 1)) // algorithm: SHA1
    p.push(...fieldVarint(5, e.digits === 8 ? 2 : 1)) // digits: SIX/EIGHT
    p.push(...fieldVarint(6, e.type === 'hotp' ? 1 : 2)) // type: HOTP/TOTP
    if (e.type === 'hotp') p.push(...fieldVarint(7, 0)) // counter
    top.push(...fieldLenDelim(1, Uint8Array.from(p)))
  }
  top.push(...fieldVarint(2, 1)) // version
  top.push(...fieldVarint(3, opts.batchSize ?? 1)) // batch_size
  top.push(...fieldVarint(4, opts.batchIndex ?? 0)) // batch_index
  top.push(...fieldVarint(5, opts.batchId ?? 0)) // batch_id
  return `otpauth-migration://offline?data=${encodeURIComponent(bytesToB64(Uint8Array.from(top)))}`
}

/**
 * Split entries across multiple migration links (Google caps how many fit in
 * one QR). All share a batch id; each carries its batch index/size.
 */
export function encodeMigrationBatches(entries: GAuthEntry[], perBatch = 10): string[] {
  if (entries.length === 0) return []
  const batchId = Math.floor(Math.random() * 0x7fffffff)
  const chunks: GAuthEntry[][] = []
  for (let i = 0; i < entries.length; i += perBatch) chunks.push(entries.slice(i, i + perBatch))
  return chunks.map((c, i) =>
    encodeMigration(c, { batchIndex: i, batchSize: chunks.length, batchId })
  )
}
