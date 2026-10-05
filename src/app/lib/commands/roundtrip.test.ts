import { describe, expect, it } from 'vitest'
import { exportScript } from '@/app/lib/exportScript'
import { importScript } from '@/app/lib/scriptImport'
import { ALL_FIXTURES, plain } from '@/app/lib/commands/testkit'

const fixtures = ALL_FIXTURES()

describe.each(['py', 'tcl'] as const)('export .%s then import', (lang) => {
  it.each(fixtures)('$name rebuilds the same model', ({ model, history }) => {
    const script = exportScript(model, history, lang)
    const result = importScript(script, `model.${lang}`)
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    expect(plain(result.model)).toEqual(plain(model))
  })
})

describe('Tcl and OpenSeesPy agree', () => {
  it.each(fixtures)('$name imports identically from both languages', ({ model, history }) => {
    const py = importScript(exportScript(model, history, 'py'), 'm.py')
    const tcl = importScript(exportScript(model, history, 'tcl'), 'm.tcl')
    expect(plain(tcl.model)).toEqual(plain(py.model))
  })
})

describe('export is deterministic', () => {
  it.each(fixtures)('$name prints the same text twice and after a round trip', ({ model, history }) => {
    for (const lang of ['py', 'tcl'] as const) {
      const once = exportScript(model, history, lang)
      expect(exportScript(model, history, lang)).toBe(once)
      const again = exportScript(importScript(once, `m.${lang}`).model, history, lang)
      expect(again).toBe(once)
    }
  })
})
