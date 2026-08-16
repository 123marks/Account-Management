// Configurable, CSPRNG-backed password / passphrase generator (renderer-side,
// uses window.crypto). No dependencies.

export interface PwGenOptions {
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
}

const SETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*-_=+?'
}
const AMBIGUOUS = /[0O1lI|`]/g

function rand(n: number): Uint32Array {
  const a = new Uint32Array(n)
  crypto.getRandomValues(a)
  return a
}

export function generatePassword(o: PwGenOptions): string {
  let classes = [
    o.upper ? SETS.upper : '',
    o.lower ? SETS.lower : '',
    o.digits ? SETS.digits : '',
    o.symbols ? SETS.symbols : ''
  ].filter(Boolean)
  if (o.excludeAmbiguous) classes = classes.map((c) => c.replace(AMBIGUOUS, ''))
  const pool = classes.join('')
  if (!pool) return ''

  const len = Math.max(4, Math.min(128, Math.floor(o.length) || 16))
  const out: string[] = []
  // Guarantee at least one char from each selected class.
  const seed = rand(classes.length)
  classes.forEach((c, i) => {
    if (c) out.push(c[seed[i] % c.length])
  })
  const fill = rand(len)
  for (let i = out.length; i < len; i++) out.push(pool[fill[i] % pool.length])
  // Fisher-Yates shuffle so the guaranteed chars aren't at fixed positions.
  const sh = rand(out.length)
  for (let i = out.length - 1; i > 0; i--) {
    const j = sh[i] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.slice(0, len).join('')
}

// A compact word list for memorable passphrases (not a full EFF list, but
// enough entropy at 4+ words for a strong, typeable secret).
const WORDS =
  'apple river maple cedar amber cloud stone tiger otter raven eagle comet lunar solar delta fjord glide harbor ivory jade knoll lotus meadow nectar oasis pebble quartz ripple summit thistle umber violet willow zephyr anchor beacon canyon dapper ember frost garnet hazel indigo jaguar kettle lantern mellow nimble opal prairie quiver rustic saffron topaz upland vivid walnut yonder cobalt driftwood elm flint grove harvest island jasmine kelp lilac marsh noble orchid plume ridge sage timber velvet wren onyx breeze cactus dawn echo falcon gorge heron iris juniper koala ledge moss'
    .split(' ')

export function generatePassphrase(words = 4, separator = '-', addNumber = true): string {
  const n = Math.max(3, Math.min(8, words))
  const r = rand(n + 1)
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const w = WORDS[r[i] % WORDS.length]
    parts.push(w.charAt(0).toUpperCase() + w.slice(1))
  }
  let out = parts.join(separator)
  if (addNumber) out += separator + ((r[n] % 90) + 10)
  return out
}
