import { describe, expect, it } from 'vitest'
import { DEFAULT_PLOT_VIEW, type SeriesSpec } from '@/app/types/plotView'
import type { SavedPlot } from '@/app/types/savedPlot'
import { plotNameFor, restorePlot, samePlot, snapshotPlot, uniqueName } from './savedPlots'

const series = (id: string): SeriesSpec => ({ id, label: '', color: '#000', visible: true, x: { type: 'step' }, y: { type: 'response', kind: 'disp', component: 'dx', mode: 'single', tags: [3], scale: 1 } })
const view = { ...DEFAULT_PLOT_VIEW, open: true, pos: { x: 5, y: 5 }, series: [series('s1'), series('s4')], nextSeriesId: 5 }

describe('saved plots', () => {
  it('snapshots config only and restores it as an independent copy', () => {
    const cfg = snapshotPlot(view)
    expect(cfg).not.toHaveProperty('pos')
    expect(cfg.series).not.toBe(view.series)
    const r = restorePlot(cfg)
    expect(r.open).toBe(true)
    expect(r.nextSeriesId).toBe(5)
    expect(r.series).not.toBe(cfg.series)
  })
  it('detects edits', () => {
    const cfg = snapshotPlot(view)
    expect(samePlot(cfg, snapshotPlot(view))).toBe(true)
    expect(samePlot(cfg, snapshotPlot({ ...view, sharedX: false }))).toBe(false)
  })
  it('names plots and keeps names unique', () => {
    expect(plotNameFor(snapshotPlot(view))).toBe('dx N3 +1')
    const plots: SavedPlot[] = [{ kind: 'plot', id: 1, name: 'A', config: snapshotPlot(view) }, { kind: 'plot', id: 2, name: 'A (2)', config: snapshotPlot(view) }]
    expect(uniqueName('A', plots)).toBe('A (3)')
    expect(uniqueName('A', plots, 1)).toBe('A')
    expect(uniqueName('A (2)', plots, 2)).toBe('A (2)')
    expect(uniqueName('B', plots)).toBe('B')
  })
})
