import { describe, expect, it } from 'vitest'
import { importScript } from '@/app/lib/scriptImport'
import { plain } from '@/app/lib/commands/testkit'

const errors = (r: ReturnType<typeof importScript>) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line}: ${d.message}`)

describe('Tcl', () => {
  const tcl = `# frame
model BasicBuilder -ndm 2 -ndf 3; set L 6.0
set A [expr {0.3*0.5}]
node 1 0 0 ;# comment
node 2 $L 0 -mass 10 10 0
node 3 $nope 0
fix 1 1 1 1
geomTransf Linear 1
uniaxialMaterial Elastic 1 2e11
element elasticBeamColumn 1 1 2 $A 2e11 3.1e-3 1
element forceBeamColumn 2 1 2 1 1
timeSeries Linear 1
# Gravity
pattern Plain 1 1 {
  load 2 0 -1e3 0
  eleLoad -ele 1 -type -beamUniform -20e3
}
pattern Plain 2 Linear {
  load 2 1 0 0
}
for {set i 0} {$i < 3} {incr i} { node [expr 10+$i] $i 0 }
system BandGeneral
analyze 1
`
  const r = importScript(tcl, 'frame.tcl')
  it('substitutes constants and arithmetic', () => {
    expect(r.model.nodes.get(2)?.coords).toEqual([6, 0])
    expect(r.model.elements.get(1)?.args.A).toBeCloseTo(0.15)
    expect(r.model.masses.get(2)?.values).toEqual([10, 10, 0])
  })
  it('attaches body commands to their pattern and names it from the comment above', () => {
    expect(r.model.patterns.get(1)?.children).toHaveLength(2)
    expect(r.model.patterns.get(1)?.name).toBe('Gravity')
    expect(r.model.patterns.get(2)?.children).toHaveLength(1) // inline `Linear` series became a real one
    expect(r.model.timeSeries.size).toBe(2)
  })
  it('reports what it cannot read, with line numbers, and keeps the rest', () => {
    expect(errors(r)).toEqual([
      '6: "node" skipped: variable "$nope" has no known value.',
      '11: element skipped: element type "forceBeamColumn" is not supported by PySees yet.',
      '21: "for" is not supported — scripts are read, not executed. Commands inside it were skipped.',
    ])
    expect(r.model.nodes.size).toBe(2)
    expect(r.diagnostics.some((d) => d.severity === 'info' && /"analyze"/.test(d.message))).toBe(true)
  })
  it('never runs control flow: nothing inside a loop or proc is created', () => {
    const p = importScript('model basic -ndm 2 -ndf 3\nproc mk {} { node 9 0 0 }\nmk\nif {1} { node 8 0 0 }\n', 'x.tcl')
    expect(p.model.nodes.size).toBe(0)
    expect(errors(p)).toHaveLength(3)
  })
})

describe('OpenSeesPy', () => {
  const py = `from openseespy.opensees import *
import math
model('basic', '-ndm', 2, '-ndf', 3)
x0 = 1.5
b, h = 0.3, 0.5
coords = [(0, 0), (x0, 0)]
node(1, *coords[0])
node(2, 1.0,
     0.0)
node(3, math.sqrt(4.0), b*h)
fix(1, 1, 1, 1)
equalDOF(2, 3, 1, 2)
timeSeries('Path', 1, '-dt', 0.1, '-values', 0, 1, 0)
if True:
    node(50, 9, 9)
node(5, unknown_value, 0)
print("done")
`
  const r = importScript(py, 'm.py')
  it('reads statements, continuation lines, tuples, indexing and math', () => {
    expect([...r.model.nodes.values()].map((n) => n.coords)).toEqual([[0, 0], [1, 0], [2, 0.15]])
    expect(r.model.mpConstraints.size).toBe(1)
    expect(r.model.timeSeries.get(1)?.args.values).toEqual([0, 1, 0])
  })
  it('skips blocks and unknown values instead of guessing', () => {
    expect(errors(r)).toEqual([
      '14: "if" is not supported — scripts are read, not executed. Commands inside it were skipped.',
      '16: "node" skipped: "unknown_value" has no known value.',
    ])
  })
})

describe('both languages decode the same command to the same entity', () => {
  it('section with children', () => {
    const tcl = importScript('model basic -ndm 2 -ndf 3\nuniaxialMaterial Concrete01 1 -30e6 -0.002 -6e6 -0.006\nsection Fiber 1 {\n patch rect 1 4 4 -0.1 -0.1 0.1 0.1\n fiber 0 0 1e-4 1\n}\n', 'a.tcl')
    const py = importScript("import openseespy.opensees as ops\nops.model('basic','-ndm',2,'-ndf',3)\nops.uniaxialMaterial('Concrete01',1,-30e6,-0.002,-6e6,-0.006)\nops.section('Fiber',1)\nops.patch('rect',1,4,4,-0.1,-0.1,0.1,0.1)\nops.fiber(0,0,1e-4,1)\n", 'a.py')
    expect(plain(tcl.model)).toEqual(plain(py.model))
    expect(tcl.model.sections.get(1)?.children).toHaveLength(2)
  })
})
