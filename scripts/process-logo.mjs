// Rasterize a source PNG into build/icon.png (1024px app icon).
// Usage: node scripts/process-logo.mjs [source.png]
import { chromium } from 'playwright-core'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const srcArg = process.argv[2] ?? 'ChatGPT Image 2026年8月16日 21_26_58.png'
const srcPath = resolve(root, srcArg)
const outPath = resolve(root, 'build/icon.png')

if (!existsSync(srcPath)) {
  console.error('Source not found:', srcPath)
  process.exit(1)
}

const b64 = readFileSync(srcPath).toString('base64')
const mime = srcPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1024px; height: 1024px; background: transparent; }
  .tile {
    width: 1024px; height: 1024px; border-radius: 224px; overflow: hidden;
    background: linear-gradient(145deg, #7B6CFF 0%, #3B2ED6 55%, #2A1FA8 100%);
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .tile::before {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    background: radial-gradient(circle at 22% 18%, rgba(255,255,255,.22), transparent 52%);
    pointer-events: none;
  }
  img {
    width: 78%; height: 78%; object-fit: contain;
    filter: drop-shadow(0 10px 28px rgba(0,0,0,.28));
  }
</style></head><body>
  <div class="tile"><img src="data:${mime};base64,${b64}" alt="logo"></div>
</body></html>`

function chromeCandidates() {
  const pf = process.env['ProgramFiles']
  const pf86 = process.env['ProgramFiles(x86)']
  const local = process.env['LOCALAPPDATA']
  return [
    pf && `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    pf86 && `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable'
  ].filter(Boolean)
}

async function launch() {
  try {
    return await chromium.launch({ channel: 'chrome' })
  } catch {
    const exe = chromeCandidates().find((p) => existsSync(p))
    if (!exe) throw new Error('未找到本地 Chrome，无法渲染图标')
    return await chromium.launch({ executablePath: exe })
  }
}

const browser = await launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1024, height: 1024 },
    deviceScaleFactor: 1
  })
  await page.setContent(html, { waitUntil: 'networkidle' })
  const tile = await page.$('.tile')
  const buf = await tile.screenshot({ omitBackground: true })
  writeFileSync(outPath, buf)
  console.log('wrote', outPath, buf.length, 'bytes')
} finally {
  await browser.close()
}
