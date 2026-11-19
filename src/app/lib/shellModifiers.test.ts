import { describe, expect, it } from 'vitest'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { exportScript } from '@/app/lib/exportScript'
import { runCarapace } from '@/app/lib/commands/carapaceRunner'
import { compareRuns } from '@/app/lib/commands/comparison'
import { opensesAvailable, runOpenSees } from '@/app/lib/commands/opensesRunner'
import { shellModifiersExport } from '@/app/lib/shellModifiers'
import { shellFixtures } from '@/app/lib/commands/testkit'
import { DEFAULT_PLOT_VIEW } from '@/app/types/plotView'
import { DEFAULT_RESULTS_VIEW } from '@/app/types/resultsView'
import { captureProject } from '@/app/lib/project/types'
import { serializeProject } from '@/app/lib/project/serialize'
import { parseProject } from '@/app/lib/project/parse'
import type { Model } from '@/app/types/model'

/** The quad-only shell patch (no triangle), with section 1's args patched. */
function patch(args: Record<string, unknown>, mutate?: (model: Model) => void) {
  const f = shellFixtures().find((x) => x.name === 'shell-patch')!
  const section = f.model.sections.get(1)!
  f.model.sections.set(1, { ...section, args: { ...section.args, ...args } })
  mutate?.(f.model)
  return f
}

const compiled = (args: Record<string, unknown>) => {
  const f = patch(args)
  const c = compileInputV1(f.model, f.history)
  return { section: c.input?.shellSections?.[0], errors: c.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message) }
}

describe('compiling shell stiffness modifiers', () => {
  it('passes modifiers through and omits them when there are none', () => {
    expect(compiled({}).section).not.toHaveProperty('modifiers')
    expect(compiled({ modifiers: { m11: 0.5, v23: 0.25 } }).section).toMatchObject({ modifiers: { m11: 0.5, v23: 0.25 } })
    expect(compiled({ modifiers: {} }).section).not.toHaveProperty('modifiers')
  })

  it('maps the OpenSees plate modifier to bending and shear factors', () => {
    expect(compiled({ epModifier: 0.5 }).section).toMatchObject({ modifiers: { m11: 0.5, m22: 0.5, m12: 0.5, v13: 0.5, v23: 0.5 } })
    expect(compiled({ epModifier: 1 }).section).not.toHaveProperty('modifiers')
  })

  it('refuses both a plate modifier and modifiers, and bad factors', () => {
    expect(compiled({ epModifier: 0.5, modifiers: { f11: 0.8 } }).errors.join()).toMatch(/use one or the other/)
    expect(compiled({ epModifier: 0 }).errors.join()).toMatch(/positive number/)
    for (const bad of [0, -1, 'x']) expect(compiled({ modifiers: { f22: bad } }).errors.join()).toMatch(/f22 must be a positive number/)
  })
})

describe('writing shell stiffness modifiers to OpenSees', () => {
  const script = (args: Record<string, unknown>, mutate?: (m: Model) => void) => {
    const f = patch(args, mutate)
    return exportScript(f.model, f.history, 'py')
  }

  it('decides exactness: equal membrane factors, equal bending factors and, with a quad, shear equal to bending', () => {
    expect(shellModifiersExport({ f11: 0.8, f22: 0.8, f12: 0.8, m11: 0.4, m22: 0.4, m12: 0.4, v13: 0.4, v23: 0.4 }, true)).toEqual({ exact: true, factor: 0.8, epModifier: 0.5 })
    expect(shellModifiersExport({ m11: 0.4, m22: 0.4, m12: 0.4 }, true)).toMatchObject({ exact: false, reason: expect.stringMatching(/shear/) })
    expect(shellModifiersExport({ m11: 0.4, m22: 0.4, m12: 0.4 }, false)).toEqual({ exact: true, factor: 1, epModifier: 0.4 })
    expect(shellModifiersExport({ f11: 0.8 }, false)).toMatchObject({ exact: false, reason: expect.stringMatching(/membrane/) })
    expect(shellModifiersExport({ m11: 0.4, m22: 0.5 }, false)).toMatchObject({ exact: false, reason: expect.stringMatching(/bending/) })
  })

  it('folds representable modifiers into E and Ep_modifier', () => {
    const text = script({ modifiers: { f11: 0.5, f22: 0.5, f12: 0.5, m11: 0.25, m22: 0.25, m12: 0.25, v13: 0.25, v23: 0.25 } })
    expect(text).toContain('# Stiffness modifiers written as E and Ep_modifier.')
    expect(text).toMatch(/ElasticMembranePlateSection[^\n]*15000[^\n]*0\.5\)/) // E 3e4 * 0.5, Ep_modifier 0.25 / 0.5
    expect(text).not.toContain('WARNING')
  })

  it('warns, and writes the section unmodified, when OpenSees cannot represent them', () => {
    const text = script({ modifiers: { f11: 0.5 } })
    expect(text).toMatch(/# WARNING: this section has stiffness modifiers that OpenSees cannot represent \(the membrane factors/)
    expect(text).toMatch(/ElasticMembranePlateSection[^\n]*30000/)
  })

  it('needs no shear match when only triangles use the section', () => {
    const only = (m: Model) => { for (const e of m.elements.values()) m.elements.set(e.id, { ...e, eleType: 'ShellDKGT', nodes: e.nodes.slice(0, 3) }) }
    expect(script({ modifiers: { m11: 0.4, m22: 0.4, m12: 0.4 } }, only)).toContain('Stiffness modifiers written as E and Ep_modifier.')
    expect(script({ modifiers: { m11: 0.4, m22: 0.4, m12: 0.4 } })).toContain('WARNING')
  })

  it('does not combine modifiers with a plate modifier', () => {
    expect(script({ epModifier: 0.5, modifiers: { m11: 0.4, m22: 0.4, m12: 0.4, v13: 0.4, v23: 0.4 } })).toMatch(/WARNING[^\n]*also sets a plate modifier/)
  })
})

describe('saving a project with shell stiffness modifiers', () => {
  it('keeps the modifiers and the authored section across save and open', () => {
    const f = patch({ modifiers: { f11: 0.7, m22: 0.3, v13: 0.9 } })
    const doc = captureProject({
      model: f.model, analysisHistory: f.history, gridlines: [], levels: [], nextGridlineId: 1, nextLevelId: 1, savedPlots: [], nextSavedPlotId: 1, activeSavedPlotId: null,
      viewSettings: { showGrid: true }, unitPrefs: {}, hiddenLoadPatterns: [], resultsView: DEFAULT_RESULTS_VIEW, plotView: DEFAULT_PLOT_VIEW,
    })
    const text = serializeProject(doc)
    const result = parseProject(text)
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    const section = result.project!.model.sections.get(1)!
    expect(section.args.modifiers).toEqual({ f11: 0.7, m22: 0.3, v13: 0.9 })
    expect(section.args.eMod).toBe(3e4)
  })
})

describe('running shell stiffness modifiers in Carapace', () => {
  const run = (args: Record<string, unknown>) => {
    const f = patch(args)
    const r = runCarapace(f.model, f.history)
    expect(r.error).toBeNull()
    expect(r.compile.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    return r.columns.flat()
  }
  const close = (a: number[], b: number[], rtol: number) => {
    expect(a.length).toBe(b.length)
    const scale = Math.max(...b.map(Math.abs))
    a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(rtol * scale))
  }

  it('equals scaling E when every factor is the same', () => {
    const c = 0.4
    close(run({ modifiers: { f11: c, f22: c, f12: c, m11: c, m22: c, m12: c, v13: c, v23: c } }), run({ eMod: 3e4 * c }), 1e-9)
  })

  it('equals the OpenSees plate modifier on bending and shear', () => {
    close(run({ epModifier: 0.5 }), run({ modifiers: { m11: 0.5, m22: 0.5, m12: 0.5, v13: 0.5, v23: 0.5 } }), 1e-12)
  })

  it('changes the answer when the factors differ', () => {
    const base = run({})
    const soft = run({ modifiers: { f11: 0.3, m22: 0.2 } })
    expect(Math.max(...soft.map((v, i) => Math.abs(v - base[i])))).toBeGreaterThan(1e-3 * Math.max(...base.map(Math.abs)))
  })

  describe.skipIf(!opensesAvailable)('against OpenSees through the folded export', () => {
    it.each([
      ['uniform', { f11: 0.8, f22: 0.8, f12: 0.8, m11: 0.5, m22: 0.5, m12: 0.5, v13: 0.5, v23: 0.5 }],
      ['bending and shear only', { m11: 0.35, m22: 0.35, m12: 0.35, v13: 0.35, v23: 0.35 }],
    ])('%s', (_name, modifiers) => {
      const f = patch({ modifiers })
      const carapace = runCarapace(f.model, f.history)
      expect(carapace.error).toBeNull()
      const opensees = runOpenSees(exportScript(f.model, f.history, 'py'))
      expect(opensees.failures, opensees.stderr).toEqual([])
      const cmp = compareRuns(f.model, carapace, opensees.files)
      expect(cmp.steps.opensees).toBe(cmp.steps.carapace)
      for (const q of ['disp', 'reaction', 'force', 'shell'] as const) {
        expect(cmp.compared[q], `${q}: nothing was compared`).toBeGreaterThan(0)
        expect(cmp.maxRel[q], `${q}: max |diff| ${cmp.maxAbs[q]} against scale ${cmp.scale[q]}`).toBeLessThan(1e-5)
      }
    })
  })
})
