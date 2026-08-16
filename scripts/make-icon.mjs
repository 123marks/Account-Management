// Rasterize build/icon.svg -> build/icon.png (1024px) using the locally
// installed Chrome via playwright-core. Run: node scripts/make-icon.mjs
import { chromium } from 'playwright-core'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const svgPath = resolve(root, 'build/icon.svg')
const outPath = resolve(root, 'build/icon.png')

const svg = readFileSync(svgPath, 'utf8')
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`

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
    viewport: { width: 512, height: 512 },
    deviceScaleFactor: 2
  })
  await page.setContent(html, { waitUntil: 'networkidle' })
  const svgEl = await page.$('svg')
  const buf = await svgEl.screenshot({ omitBackground: true })
  writeFileSync(outPath, buf)
  console.log('wrote', outPath, buf.length, 'bytes')
} finally {
  await browser.close()
}
