// Captures the verification page's screenshots (public/verification/<case>-model.webp and -result.webp) from a running dev server
// (default http://localhost:5173), in headless Chromium. Each case is opened from its saved project (/studio?open=...), shown before the
// run, then run in Carapace and shown with the result its `shot` names. Run after the generator (VERIFY=1 npx vitest run
// src/app/lib/verification/generate.test.ts), which writes the projects and index.json.
// Usage: node scripts/verification-screenshots.mjs [baseUrl] [only,ids | --missing]
// Don't edit watched source files while it runs: a hot reload drops the studio back to an empty model.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const MISSING = process.argv[3] === '--missing'
const ONLY = MISSING ? null : process.argv[3]?.split(',')
const OUT = new URL('../public/verification/', import.meta.url).pathname
const index = JSON.parse(readFileSync(new URL('../src/marketing/verification/data/index.json', import.meta.url), 'utf8'))
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

const RESULT_LABEL = { deformed: 'Deformed', N: 'N', V: 'V', M: 'M', contour: 'Contour', mode: 'Modes' }
const ribbon = (page, name) => page.locator('header button').filter({ has: page.getByText(name, { exact: true }) }).first()
const tab = async (page, name) => { await page.locator('header').getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(200) }
const settle = (page, ms = 1200) => page.waitForTimeout(ms)
const viewport = (page) => page.locator('canvas').first().locator('xpath=../..')

/** A PNG of `target`, re-encoded as WebP by the browser itself (no image tools needed). */
async function save(page, target, name) {
  const png = await target.screenshot({ type: 'png' })
  const dataUrl = await page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height })
    canvas.getContext('2d').drawImage(img, 0, 0)
    return canvas.toDataURL('image/webp', 0.82)
  }, png.toString('base64'))
  writeFileSync(`${OUT}${name}.webp`, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log('saved', name)
}

async function run(page) {
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  const blocks = page.getByText('Blocks', { exact: true }).first()
  if (await blocks.isVisible().catch(() => false) && !(await page.getByText('[block]').first().isVisible().catch(() => false))) await blocks.click()
  await page.getByRole('button', { name: 'Run in Carapace' }).click()
  await page.getByText(/Run complete|Run failed/).waitFor({ timeout: 300_000 })
}

async function capture(c) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(c.id, 'pageerror:', e.message.slice(0, 200)))
  page.on('dialog', (d) => { console.log(c.id, 'dialog:', d.message().slice(0, 200)); void d.accept() })
  await page.goto(`${BASE}/studio?open=/verification/${c.id}.pysees.py`)
  await page.locator('canvas').first().waitFor({ timeout: 60_000 })
  await settle(page, 2500)
  if (await page.getByRole('button', { name: 'Create Model' }).isVisible().catch(() => false)) { await ctx.close(); throw new Error('the project did not open') }
  const shot = c.shot ?? {}
  if (shot.extruded) { await ribbon(page, 'Extrude').click(); await settle(page, 600) }
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.mouse.move(5, 895)
  await page.keyboard.press('f'); await settle(page)
  await save(page, viewport(page), `${c.id}-model`)

  await run(page); await settle(page)
  await tab(page, 'Results')
  const label = RESULT_LABEL[shot.result ?? 'deformed']
  if (label) { await ribbon(page, label).click().catch(() => console.log(c.id, `no "${label}" result button`)); await settle(page, 600) }
  // The run opens the Display Results panel over the viewport; close it for the picture.
  if (await page.getByText('Display Results').isVisible().catch(() => false)) await ribbon(page, 'Display').click()
  await page.mouse.move(5, 895)
  await page.keyboard.press('f'); await settle(page)
  await save(page, viewport(page), `${c.id}-result`)
  await ctx.close()
}

const failed = []
for (const c of index.cases) {
  if (ONLY && !ONLY.includes(c.id)) continue
  if (MISSING && existsSync(`${OUT}${c.id}-model.webp`) && existsSync(`${OUT}${c.id}-result.webp`)) continue
  try { await capture(c) } catch (e) {
    console.log(c.id, 'failed, retrying:', e.message.split('\n')[0])
    try { await capture(c) } catch (e2) { console.log(c.id, 'failed:', e2.message.split('\n')[0]); failed.push(c.id) }
  }
}
await browser.close()
if (failed.length) { console.log('failed:', failed.join(',')); process.exitCode = 1 }
