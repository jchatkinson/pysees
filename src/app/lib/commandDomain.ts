export type CommandDomain = 'model' | 'analysis' | 'output' | 'misc'

const MODEL_FNS = new Set([
  'node', 'fix', 'fixX', 'fixY', 'fixZ', 'mass', 'element',
  'uniaxialMaterial', 'nDMaterial',
  'section', 'fiber', 'layer', 'patch',
  'geomTransf', 'beamIntegration', 'frictionModel',
  'equalDOF', 'equalDOF_Mixed', 'rigidDiaphragm', 'rigidLink',
  'region', 'block2D', 'block3D', 'mesh', 'remesh', 'DiscretizeMember',
  'timeSeries', 'pattern', 'groundMotion', 'imposedMotion',
])

/** load/eleLoad/sp are model-domain, but only ever addable as children of a PatternEntity, never top-level */
export const PATTERN_CHILD_FNS = new Set(['load', 'eleLoad', 'sp'])

/** fiber/patch/layer are model-domain, but only ever addable as children of a Fiber SectionEntity */
export const SECTION_CHILD_FNS = new Set(['fiber', 'patch', 'layer'])

const ANALYSIS_FNS = new Set([
  'constraints', 'numberer', 'system', 'test', 'testIter', 'testNorm',
  'algorithm', 'integrator', 'analysis', 'analyze', 'eigen', 'rayleigh',
  'modalDamping', 'modalProperties', 'responseSpectrumAnalysis',
  'loadConst', 'wipeAnalysis', 'remove', 'InitialStateAnalysis',
  // procedural/session commands — sequential, so they live alongside the solver procedure
  'wipe', 'version', 'logFile', 'printModel', 'database', 'save', 'restore',
  'record', 'start', 'stop', 'domainChange', 'setStartNodeTag', 'setPrecision', 'stripXML',
  'convertBinaryToText', 'convertTextToBinary', 'updateElementDomain', 'updateMaterialStage',
  'setElementRayleighDampingFactors',
])

export function domainForFn(fn: string): CommandDomain {
  if (fn === 'recorder' || fn.toLowerCase().includes('recorder')) return 'output'
  if (MODEL_FNS.has(fn)) return 'model'
  if (ANALYSIS_FNS.has(fn)) return 'analysis'
  return 'analysis' // unrecognized generated fns default to analysis (procedural) rather than being unreachable
}
