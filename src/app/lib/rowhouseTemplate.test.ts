import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wasm from '@/app/carapace/wasm/carapace_wasm.js'
import { modelFromWrites } from '@/app/lib/commands/testkit'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { rowhouseAreas, rowhouseTemplate, ROWHOUSE_LOADS } from '@/app/lib/rowhouseTemplate'
import { studWallArgs, unanchoredPierEnds } from '@/app/lib/studWalls'
import { floorTakedown } from '@/app/lib/floors'
import { exportScript } from '@/app/lib/exportScript'
import type { Model } from '@/app/types/model'

wasm.initSync({ module: readFileSync(join(process.cwd(), 'src/app/carapace/wasm/carapace_wasm_bg.wasm')) })

function make() {
  const t = rowhouseTemplate()
  const m = modelFromWrites(3, 6, t.writes)
  const model: Model = { ...m, config: { ...m.config!, units: t.units } }
  return { t, model, history: { commands: t.analysisCommands, cursor: t.analysisCommands.length - 1 } }
}

describe('BC Rowhouse template', () => {
  it('draws both units: 20 walls with their openings, 8 joist floors, beams and cantilevered joists, 2 diaphragms', () => {
    const { model, t } = make()
    const walls = [...model.elements.values()].filter((e) => e.eleType === 'studWall')
    expect(walls).toHaveLength(20)
    expect(walls.reduce((n, e) => n + (studWallArgs(e.args).layout.openings?.length ?? 0), 0)).toBe(26)
    expect([...model.elements.values()].filter((e) => e.eleType === 'joistFloor')).toHaveLength(8)
    // Beams (5) 2x12 and (3) 2x12 per unit, split where joists land, and the (2) 2x12 cantilevers: 6 per unit, two spans each.
    const members = [...model.elements.values()].filter((e) => e.eleType === 'ElasticBeamColumn')
    const tips = members.filter((e) => e.nodes.some((n) => [-610, 1447].includes(model.nodes.get(n)!.coords[1])))
    expect(tips).toHaveLength(11)
    // The second-storey south walls stand on the joist tips.
    const s2south = walls.filter((e) => /S2 U\d south/.test(String(studWallArgs(e.args).label)))
    expect(s2south.map((e) => model.nodes.get(e.nodes[0])!.coords[1])).toEqual([-610, 1447])
    expect([...model.mpConstraints.values()].filter((c) => c.kind === 'rigidDiaphragm')).toHaveLength(2)
    // Every pier end is held down: to the ground on the main floor, to the wall below on the second.
    for (const e of walls) expect(unanchoredPierEnds(model, e), studWallArgs(e.args).label).toEqual([])
    expect(t.underlays('hash').map((u) => u.page)).toEqual([1, 2, 3, 4, 5, 6])
    expect(t.levels.map((l) => l.height)).toEqual([2858, 2806])
  })

  it('takes every floor load down to its bearing walls', () => {
    const { model } = make()
    for (const f of [...model.elements.values()].filter((e) => e.eleType === 'joistFloor')) {
      // One pattern at 1 N/mm²: the walls' share adds up to the floor's area.
      const shares = floorTakedown(model, f.id, new Map([[1, 1]]))
      const total = [...shares.values()].reduce((s, m) => s + [...m.values()].reduce((a, v) => a + v, 0), 0)
      const area = Math.abs(f.nodes.map((n) => model.nodes.get(n)!.coords).reduce((a, p, i, ps) => { const q = ps[(i + 1) % ps.length]; return a + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
      expect(total / area, String(f.args.label)).toBeCloseTo(1, 2)
    }
  })

  it('runs gravity then earthquake X in Carapace, with base reactions balancing the loads', () => {
    const { model, history } = make()
    const run = runCarapace(model, history)
    expect(run.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(run.error).toBeFalsy()
    // Gravity: floors (with the 610 mm cantilever) and roofs at their area loads.
    const L = ROWHOUSE_LOADS
    const { floor: floorArea, roof: roofArea } = rowhouseAreas()
    const gravity = floorArea * (L.floorDead + L.floorLive) + roofArea * (L.roofDead + L.snow)
    // Base reactions: every supported node's force components (DOFs 1–3 are the first three columns of each reaction target).
    // The diaphragm masters are also restrained (uz, rx, ry) and report their applied load: leave them out.
    const plans = run.compile.recorderPlans.filter((p) => p.kind === 'reaction' && model.fixes.get(p.targetTag)?.dofs.includes(1))
    const sum = (dof: number, step: number) => plans.reduce((s, p) => s + (run.columns[p.columnOffset + dof - 1][step] ?? 0), 0)
    const n = run.columns[0].length
    expect(run.compile.diagnostics.filter((d) => d.severity === 'warning')).toEqual([])
    expect(Math.abs(sum(3, 4)) / gravity).toBeCloseTo(1, 6) // end of the 5-step gravity stage
    expect(Math.abs(sum(1, 4))).toBeLessThan(1e-3)
    expect(Math.abs(sum(2, n - 1))).toBeLessThan(1e-3)
    expect(Math.abs(sum(3, n - 1)) / gravity).toBeCloseTo(1, 6)
    expect(Math.abs(sum(1, n - 1))).toBeCloseTo(L.eqFloor + L.eqRoof, -1)
    // The grid 3 party walls bear along their length on what is below them (offset studs included), so their tops hardly sag under
    // gravity: about 0.6 mm upstairs (178 mm when the upper wall stood only on its two pier ends).
    for (const label of ['S1 Party wall', 'S2 Party wall']) {
      const e = [...model.elements.values()].find((x) => studWallArgs(x.args).label === label)!
      const tops = [e.nodes[2], e.nodes[3], ...studWallArgs(e.args).stations.flatMap((st, i) => (st.chord === 'top' ? [e.nodes[4 + i]] : []))]
      const uz = run.compile.recorderPlans.filter((p) => p.kind === 'disp' && tops.includes(p.targetTag)).map((p) => run.columns[p.columnOffset + 2][4])
      expect(uz.length, label).toBe(tops.length)
      expect(Math.min(...uz), label).toBeGreaterThan(-1)
    }
  }, 120_000)

  it('exports a script with the Carapace-only parts approximated and flagged', () => {
    const { model, history } = make()
    const text = exportScript(model, history)
    expect(text).toMatch(/WARNING: stud wall \d+ \(S1 U1 north\) is Carapace-only/)
    expect(text).toContain("ops.element('ShellMITC4'")
    expect(text).not.toContain('joistFloor')
  })
})
