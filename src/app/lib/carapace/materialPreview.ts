import type { CarapaceInputV1, MaterialSpec, StageSpec } from '@/app/types/carapaceInputV1'

/** A unit zero-length spring probe. With a unit reference load, Carapace's load factor is the
 * material force (stress for the unit-area probe) at each imposed displacement/strain target. */
export function materialPreviewInput(material: MaterialSpec, protocol: number[]): CarapaceInputV1 {
  let previous = 0
  const stages: StageSpec[] = protocol.flatMap((target, index) => {
    const increment = target - previous
    previous = target
    // OpenSees prints the initial/repeated target without calling analyze(). A zero-increment
    // displacement-control step is singular in Carapace, so preserve that behavior here.
    if (increment === 0) return []
    return {
      kind: 'static', id: `material-probe-${index}`, steps: 1,
      integrator: { kind: 'displacementControl', node: 1, dof: 0, increment },
      // Keep the Linear unit-load pattern active: Carapace's displacement-control predictor
      // derives its reference-load sensitivity from non-frozen patterns on every protocol leg.
      algorithm: 'newtonRaphson', convergence: { kind: 'normUnbalance', tol: 1e-6, maxIter: 25 }, holdPatternsAfter: [],
    }
  })
  return {
    header: { schemaVersion: 1, space: 2, engineVersion: 'pysees-material-preview' },
    nodes: { coords: [0, 0, 0, 0], fixed: [7, 6], massNodeIndex: [], mass: [] }, materials: [material], fibers: { sectionOffsets: [], y: [], area: [], material: [] },
    trusses: { nodeI: [], nodeJ: [], area: [], material: [], density: [] }, elasticBeamColumns: { nodeI: [], nodeJ: [], e: [], a: [], iz: [], transform: [], density: [] },
    dispBeamColumns: { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] }, forceBeamColumns: { nodeI: [], nodeJ: [], fiberSection: [], integration: [], corotational: [], density: [] },
    zeroLengths: { nodeI: [0], nodeJ: [1], materials: [[0, 0, 0]], friction: [] }, zeroLengthSections: { nodeI: [], nodeJ: [], fiberSection: [], materials: [] },
    equalDofs: { retained: [], constrained: [], dofs: [] }, rigidDiaphragms: { retained: [], constrained: [] },
    // Same unit reference load and Linear time series as the original OpenSees probe. The load
    // remains active between stages, so its multiplier is the zero-length spring force.
    loadPatterns: { series: [{ kind: 'linear', slope: 1 }], scaleFactor: [1] },
    nodalLoads: { pattern: [0], node: [1], dof: [0], value: [1], stage: [0] },
    elementLoads: { pattern: [], elementKind: [], elementIndex: [], load: [], stage: [] }, sequence: { stages, recorders: [{ response: 'nodeDisp', node: 1, dof: 0 }] },
    nodes3: { coords: [], fixed: [], massNodeIndex: [], mass: [] }, fibers3: { sectionOffsets: [], y: [], z: [], area: [], material: [] }, trusses3: { nodeI: [], nodeJ: [], area: [], material: [], density: [] },
    elasticBeamColumns3: { nodeI: [], nodeJ: [], e: [], g: [], a: [], j: [], iy: [], iz: [], transform: [], density: [] }, dispBeamColumns3: { nodeI: [], nodeJ: [], g: [], j: [], vecXz: [], fiberSection: [], integration: [], density: [] },
    forceBeamColumns3: { nodeI: [], nodeJ: [], g: [], j: [], vecXz: [], fiberSection: [], integration: [], density: [] }, zeroLengths3: { nodeI: [], nodeJ: [], materials: [], friction: [] }, zeroLengthSections3: { nodeI: [], nodeJ: [], fiberSection: [], materials: [] },
    equalDofs3: { retained: [], constrained: [], dofs: [] }, rigidDiaphragms3: { retained: [], normal: [], constrained: [] }, nodalLoads3: { pattern: [], node: [], dof: [], value: [], stage: [] },
    elementLoads3: { pattern: [], elementKind: [], elementIndex: [], load: [], stage: [] }, sequence3: { stages: [], recorders: [] },
  }
}
