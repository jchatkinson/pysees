import { describe, expect, it } from 'vitest'
import { compileInputV1 } from '@/app/lib/carapace/compileInputV1'
import { applyModelWrite } from '@/app/lib/modelWrite'
import { exportScript } from '@/app/lib/exportScript'
import { constraintFixtures, type Fixture } from '@/app/lib/commands/testkit'
import type { MPConstraintEntity } from '@/app/types/model'

/** `f` with its constraints replaced by `constraints` (ids from 1). */
function withConstraints(f: Fixture, constraints: Omit<MPConstraintEntity, 'id'>[]) {
  let model = { ...f.model, mpConstraints: new Map() }
  constraints.forEach((c, i) => { model = applyModelWrite(model, { kind: 'mpConstraint', entity: { id: i + 1, ...c } }) })
  const c = compileInputV1(model, f.history)
  return { input: c.input, errors: c.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message) }
}

describe('compiling multi-point constraints', () => {
  it('lowers each 2D constraint to its Carapace table (node indices, 0-based dofs)', () => {
    const f = constraintFixtures()[0] // nodes 1..7 are indices 0..6
    const { input, errors } = withConstraints(f, [
      { kind: 'equalDOF', args: { rNodeTag: 2, cNodeTag: 4, dofs: [1, 3] } },
      { kind: 'rigidLink', args: { type: 'beam', rNodeTag: 2, cNodeTag: 5 } },
      { kind: 'rigidLink', args: { type: 'bar', rNodeTag: 4, cNodeTag: 7 } },
      { kind: 'equalDOF_Mixed', args: { rNodeTag: 2, cNodeTag: 7, numDOF: 2, rcdofs: [2, 3, 3, 1] } },
    ])
    expect(errors).toEqual([])
    expect(input?.equalDofs).toEqual({ retained: [1, 3], constrained: [3, 6], dofs: [[0, 0], [0, 2], [1, 0], [1, 1]] })
    expect(input?.rigidLinks).toEqual({ master: [1], slave: [4] })
    expect(input?.linearConstraints).toEqual({ slaveNode: [6, 6], slaveDof: [2, 0], termOffsets: [0, 1, 2], termNode: [1, 1], termDof: [1, 2], termCoeff: [1, 1] })
    expect(input).not.toHaveProperty('rigidDiaphragms')
  })

  it('gives a 3D diaphragm its normal and ties the rotation about it', () => {
    const { input, errors } = withConstraints(constraintFixtures()[1], [{ kind: 'rigidDiaphragm', args: { perpDirn: '3', rNodeTag: 9, cNodeTags: [5, 6] } }])
    expect(errors).toEqual([])
    expect(input?.rigidDiaphragms).toEqual({ retained: [8], normal: ['z'], constrained: [[0, 4], [0, 5]] })
    expect(input?.equalDofs).toEqual({ retained: [8, 8], constrained: [4, 5], dofs: [[0, 5], [1, 5]] })
  })

  it('compiles a model without constraints to no constraint tables', () => {
    const c = withConstraints(constraintFixtures()[1], [])
    for (const key of ['equalDofs', 'rigidDiaphragms', 'rigidLinks', 'linearConstraints']) { expect(c.input).not.toBeNull(); expect(c.input).not.toHaveProperty(key) }
  })

  it('refuses constraints it cannot represent, naming the kind and id', () => {
    const errors2d = (c: Omit<MPConstraintEntity, 'id'>) => withConstraints(constraintFixtures()[0], [c]).errors
    expect(errors2d({ kind: 'rigidDiaphragm', args: { perpDirn: 3, rNodeTag: 1, cNodeTags: [2] } })).toEqual(['Constraint 1 (rigidDiaphragm): OpenSees rigid diaphragms are 3D only; use equalDOF in a 2D model'])
    expect(errors2d({ kind: 'equalDOF', args: { rNodeTag: 1, cNodeTag: 2, dofs: [4] } })).toEqual(['Constraint 1 (equalDOF): dofs must list one or more of 1-3'])
    expect(errors2d({ kind: 'equalDOF', args: { rNodeTag: 1, cNodeTag: 2, dofs: [] } })).toEqual(['Constraint 1 (equalDOF): dofs must list one or more of 1-3'])
    expect(errors2d({ kind: 'equalDOF', args: { rNodeTag: 1, cNodeTag: 99, dofs: [1] } })).toEqual(['Constraint 1 (equalDOF) references unknown node 99'])
    expect(errors2d({ kind: 'equalDOF_Mixed', args: { rNodeTag: 1, cNodeTag: 2, numDOF: 2, rcdofs: [1, 2] } })[0]).toMatch(/^Constraint 1 \(equalDOF_Mixed\): rcdofs must be numDOF pairs/)
    expect(errors2d({ kind: 'rigidLink', args: { type: 'rod', rNodeTag: 1, cNodeTag: 2 } })).toEqual(['Constraint 1 (rigidLink): type must be beam or bar, got "rod"'])
    const errors3d = withConstraints(constraintFixtures()[1], [{ kind: 'rigidDiaphragm', args: { perpDirn: 4, rNodeTag: 9, cNodeTags: [5] } }]).errors
    expect(errors3d).toEqual(['Constraint 1 (rigidDiaphragm): perpDirn must be 1, 2 or 3, got 4'])
  })

  it('exports constraints with the Transformation handler, and Plain without them', () => {
    const [f] = constraintFixtures()
    expect(exportScript(f.model, f.history, 'py')).toContain("ops.constraints('Transformation')")
    expect(exportScript({ ...f.model, mpConstraints: new Map() }, f.history, 'py')).toContain("ops.constraints('Plain')")
  })
})
