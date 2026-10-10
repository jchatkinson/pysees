/** Declarative layouts for the commands the generated schemas can't describe, shared by decode.ts and encode.ts so the two directions can't drift. */

export interface ElementSpec {
  eleType: string
  /** Name OpenSees accepts (case matters in OpenSeesPy: `ElasticBeamColumn` is unknown, `elasticBeamColumn` is not). */
  opsName: string
  /** Node tags the element connects (2 when omitted). */
  nodeCount?: number
  /** Positional args after the node tags, in order (the 2D layout when `args3d` is given). */
  args: string[]
  /** The 3D layout, for elements whose arguments differ with the model dimension. */
  args3d?: string[]
  /** Fewer or more numbers means a different form of the command (section-based, 3D…), which is not supported. */
  exact?: boolean
  /** `-flag` → args key; `vec` flags take a run of numbers, others take one. */
  flags?: Record<string, { key: string; vec?: boolean }>
}

export const ELEMENTS: ElementSpec[] = [
  { eleType: 'Truss', opsName: 'Truss', args: ['A', 'matTag'], flags: { '-rho': { key: 'rho' } } },
  { eleType: 'ElasticBeamColumn', opsName: 'elasticBeamColumn', args: ['A', 'E', 'Iz', 'transfTag'], args3d: ['A', 'E', 'G', 'J', 'Iy', 'Iz', 'transfTag'], exact: true },
  { eleType: 'DispBeamColumn', opsName: 'dispBeamColumn', args: ['transfTag', 'integrationTag'] },
  { eleType: 'ShellMITC4', opsName: 'ShellMITC4', nodeCount: 4, args: ['secTag'], exact: true },
  { eleType: 'ShellDKGT', opsName: 'ShellDKGT', nodeCount: 3, args: ['secTag'], exact: true },
  { eleType: 'zeroLengthSection', opsName: 'zeroLengthSection', args: ['secTag'], flags: { '-orient': { key: 'orient', vec: true } } },
]
/** Number of nodes an element type connects. */
export const elementNodeCount = (spec: ElementSpec | undefined) => spec?.nodeCount ?? 2
/** Shell elements (3D only), which carry a section and take pressure and self-weight. */
export const isShell = (eleType: string) => eleType === 'ShellMITC4' || eleType === 'ShellDKGT'
/** An element's positional args for a model dimension. */
export const elementArgs = (spec: ElementSpec, ndm: number) => (ndm === 3 && spec.args3d ? spec.args3d : spec.args)
export const elementByOpsName = (name: string) => ELEMENTS.find((e) => e.opsName.toLowerCase() === name.toLowerCase())
export const elementByType = (eleType: string) => ELEMENTS.find((e) => e.eleType === eleType)

/** Fiber-section children: positional args after the sub-type, in OpenSees order. */
export const CHILD_SHAPES: Record<string, string[]> = {
  fiber: ['yloc', 'zloc', 'A', 'matTag'],
  'patch:rect': ['matTag', 'numSubdivY', 'numSubdivZ', 'y1', 'z1', 'y2', 'z2'],
  'patch:circ': ['matTag', 'numSubdivCirc', 'numSubdivRad', 'yCenter', 'zCenter', 'intRad', 'extRad', 'startAng', 'endAng'],
  'patch:quad': ['matTag', 'numSubdivIJ', 'numSubdivJK', 'yI', 'zI', 'yJ', 'zJ', 'yK', 'zK', 'yL', 'zL'],
  'layer:straight': ['matTag', 'numFiber', 'areaFiber', 'yStart', 'zStart', 'yEnd', 'zEnd'],
  'layer:circ': ['matTag', 'numFiber', 'areaFiber', 'yCenter', 'zCenter', 'radius', 'startAng', 'endAng'],
}
export const childShapeKey = (kind: string, subType: string) => (kind === 'fiber' ? 'fiber' : `${kind}:${subType}`)

/** Plain-pattern time series that can be named inline (`pattern Plain 1 Linear {…}`). */
export const INLINE_SERIES = ['Constant', 'Linear', 'Trig', 'Triangle', 'Rectangular', 'Pulse']

/** `eleLoad -type -beamUniform` takes local-axis components positionally: 2D is `Wy [Wx]`, 3D is `Wy Wz [Wx]`. */
export const beamUniformOrder = (ndm: number) => (ndm === 2 ? (['wy', 'wx'] as const) : (['wy', 'wz', 'wx'] as const))
