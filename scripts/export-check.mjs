// Iterative export verification loop:
//   build -> serve app -> export .drawio via the real UI -> open in local
//   draw.io webapp -> fit page -> screenshot to /tmp/export-check.png
// Run: node scripts/export-check.mjs [layout] [colour] [detail]
// Requires draw.io webapp served at :8899 (python3 -m http.server 8899 in drawio/src/main/webapp)
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { execSync, spawn } from 'child_process'

const layout = process.argv[2] ?? 'grouped'
const colour = process.argv[3] ?? 'mixed'
const detail = process.argv[4] ?? 'full'

execSync('npm run build', { stdio: 'inherit' })
const preview = spawn('npm', ['run', 'preview', '--', '--port', '4173'], { stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 3000))

const browser = await chromium.launch()

// 1. export from the app UI
const page = await browser.newPage()
await page.goto('http://localhost:4173/reactflow-topology/', { waitUntil: 'networkidle' })
await page.click('button.export-btn')
await page.waitForSelector('.export-dialog')
await page.selectOption('.export-dialog select >> nth=0', layout)
await page.selectOption('.export-dialog select >> nth=1', colour)
await page.selectOption('.export-dialog select >> nth=2', detail)
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.export-foot .tab.on')])
await dl.saveAs('/tmp/export-check.drawio')
await page.close()

// 2. open in local draw.io and screenshot fit-to-page
const d = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
d.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
d.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await d.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle', timeout: 60000 })
await d.waitForTimeout(4000)
const payload = { b64: readFileSync('/tmp/export-check.drawio').toString('base64'), name: 'export-check.drawio' }
await d.evaluate((p) => {
  const bytes = Uint8Array.from(atob(p.b64), (c) => c.charCodeAt(0))
  const f = new File([bytes], p.name, { type: 'application/xml' })
  const dt = new DataTransfer()
  dt.items.add(f)
  for (const type of ['dragenter', 'dragover', 'drop']) document.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
}, payload)
await d.waitForTimeout(9000)
await d.keyboard.press('Control+Shift+J')
await d.waitForTimeout(1500)
const shapes = await d.evaluate(() => document.querySelectorAll('.geDiagramContainer svg g[transform] > g').length)
await d.screenshot({ path: '/tmp/export-check.png' })
console.log(`layout=${layout} colour=${colour} detail=${detail} shapes=${shapes} errors=${errors.length ? errors.join(' || ') : 'none'}`)
console.log('screenshot: /tmp/export-check.png')
await browser.close()
preview.kill()
