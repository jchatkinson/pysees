// Captures the docs screenshots in public/docs from a running dev server (default http://localhost:5173), in headless Chromium.
// Usage: node scripts/docs-screenshots.mjs [baseUrl] [only,names]
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const ONLY = process.argv[3]?.split(',')
const OUT = new URL('../public/docs/', import.meta.url).pathname
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })

/** A fresh studio (empty storage) with a template created. `dpr` 2 for dialogs and panels, 1 for whole-window shots. */
async function studio(template, dpr = 1, size = { width: 1600, height: 900 }) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: dpr })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)))
  await page.goto(`${BASE}/studio`)
  await page.getByText(template, { exact: true }).click()
  await page.getByRole('button', { name: 'Create Model' }).click()
  await page.waitForTimeout(template === 'BC Rowhouse' ? 6000 : 2000)
  // The node list is long; keep the Model panel to its groups.
  for (const group of ['Nodes', 'Masses']) {
    const g = page.getByText(group, { exact: true }).first()
    if (await g.isVisible().catch(() => false)) await g.click()
  }
  await page.evaluate(() => (document.activeElement)?.blur?.())
  await page.mouse.move(800, 880)
  return { ctx, page }
}
const ribbon = (page, name) => page.locator('header button').filter({ has: page.getByText(name, { exact: true }) }).first()
const tab = async (page, name) => { await page.locator('header').getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(200) }
const settle = (page, ms = 1500) => page.waitForTimeout(ms)
const want = (name) => !ONLY || ONLY.includes(name)
async function save(target, name, opts = {}) { await target.screenshot({ path: `${OUT}${name}.png`, ...opts }); console.log('saved', name) }
async function run(page) {
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  const blocks = page.getByText('Blocks', { exact: true }).first()
  if (await blocks.isVisible().catch(() => false) && !(await page.getByText('[block]').first().isVisible().catch(() => false))) await blocks.click()
  await page.getByRole('button', { name: 'Run in Carapace' }).click()
  await page.getByText(/Run complete|Run failed/).waitFor({ timeout: 300_000 })
}
const rightPanel = (page) => page.locator('[data-slot=resizable-panel]').last()
const leftPanel = (page) => page.locator('[data-slot=resizable-panel]').first()
const viewport = (page) => page.locator('canvas').first().locator('xpath=../..')

// Whole window on the 3D Frame template.
if (want('interface-tour')) {
  const { ctx, page } = await studio('3D Frame')
  await settle(page)
  await save(page, 'interface-tour')
  await ctx.close()
}

// Dialogs (2x).
if (want('grids-dialog') || want('levels-dialog') || want('units-dialog')) {
  const { ctx, page } = await studio('Grid only', 2)
  await ribbon(page, 'Grids & levels').click(); await settle(page, 600)
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Add evenly spaced grids').click(); await settle(page, 400)
  if (want('grids-dialog')) await save(dialog, 'grids-dialog')
  if (want('levels-dialog')) { await dialog.getByRole('tab', { name: 'Levels' }).click(); await settle(page, 400); await save(dialog, 'levels-dialog') }
  await page.keyboard.press('Escape'); await settle(page, 400)
  if (want('units-dialog')) { await ribbon(page, 'Units').click(); await settle(page, 600); await save(page.getByRole('dialog'), 'units-dialog'); await page.keyboard.press('Escape') }
  await ctx.close()
}

// 2D frame run: the analysis panel and a moment diagram.
if (want('analysis-panel') || want('results-moment-diagram')) {
  const { ctx, page } = await studio('2D Frame')
  await run(page); await settle(page)
  if (want('analysis-panel')) await save(leftPanel(page), 'analysis-panel')
  if (want('results-moment-diagram')) {
    await tab(page, 'Results')
    await ribbon(page, 'M').click()
    if (!(await page.getByText('Display Results').isVisible().catch(() => false))) await ribbon(page, 'Display').click()
    await settle(page)
    await save(viewport(page), 'results-moment-diagram')
  }
  await ctx.close()
}

// BC Rowhouse: views, underlays, wall and floor cards, drawing, selection, wall results.
if (['rowhouse-3d', 'rowhouse-plan', 'underlays-dialog', 'stud-wall-card', 'floor-card', 'drawing-tools', 'selection-panel', 'stud-wall-results'].some(want)) {
  const { ctx, page } = await studio('BC Rowhouse')
  if (want('rowhouse-3d')) { await ribbon(page, 'Extrude').click(); await settle(page, 2500); await save(page, 'rowhouse-3d'); await ribbon(page, 'Extrude').click() }
  if (want('stud-wall-card')) { await page.locator('[data-row=element-1]').click(); await settle(page); await save(rightPanel(page), 'stud-wall-card') }
  if (want('floor-card')) { await page.locator('[data-row^=element-]', { hasText: /^joistFloor/ }).first().click(); await settle(page); await save(rightPanel(page), 'floor-card') }
  await page.keyboard.press('Escape')
  if (want('rowhouse-plan') || want('drawing-tools') || want('selection-panel')) {
    await ribbon(page, 'Plan').click(); await settle(page)
    await page.keyboard.press('PageDown'); await settle(page, 2500) // roof → second floor
    if (want('rowhouse-plan')) await save(page, 'rowhouse-plan')
    if (want('drawing-tools')) { await ribbon(page, 'Stud wall').click(); await settle(page); await save(page, 'drawing-tools'); await ribbon(page, 'Select').click() }
    if (want('selection-panel')) { await page.keyboard.press('Control+a'); await settle(page); await save(rightPanel(page), 'selection-panel'); await page.keyboard.press('Escape') }
    await ribbon(page, '3D').click(); await settle(page)
  }
  if (want('underlays-dialog')) { await ribbon(page, 'Underlays').click(); await settle(page, 800); await save(page.getByRole('dialog'), 'underlays-dialog'); await page.keyboard.press('Escape') }
  if (want('stud-wall-results')) {
    await run(page); await settle(page)
    await tab(page, 'Results')
    await ribbon(page, 'N').click()
    if (!(await page.getByText('Display Results').isVisible().catch(() => false))) await ribbon(page, 'Display').click()
    await settle(page, 800)
    await page.getByText('Piers (chord forces)').click(); await page.getByRole('option', { name: /Members/ }).click()
    await tab(page, 'View'); await ribbon(page, 'Extrude').click(); await settle(page, 2500)
    await save(page, 'stud-wall-results')
  }
  await ctx.close()
}

// The BC Rowhouse card in the New Model dialog: the extruded model alone, 16:9. Saved full size; scale it to 640×360 into
// src/app/assets/templates/rowhouse.png (the script prints the path).
if (want('rowhouse-card')) {
  const { ctx, page } = await studio('BC Rowhouse')
  await tab(page, 'View')
  for (const name of ['Nodes', 'Supports', 'Ground', 'Grids', 'Levels', 'Sheets']) await ribbon(page, name).click()
  await ribbon(page, 'Extrude').click()
  await page.keyboard.press('f'); await settle(page, 1500); await ribbon(page, 'Zoom out').click(); await settle(page, 2500)
  const box = await page.locator('canvas').first().boundingBox()
  const w = Math.min(box.width, box.height * 16 / 9) * 0.92, h = w * 9 / 16
  const path = `${process.env.TMPDIR ?? '/tmp'}/rowhouse-card.png`
  await page.screenshot({ path, clip: { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h } })
  console.log('saved', path)
  await ctx.close()
}

await browser.close()
