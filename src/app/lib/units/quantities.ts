import type { ArgDef, ArgQty, QtyTag } from '@/app/types/schema'
import type { Category } from '@/app/lib/units/units'

/** How a uniaxial material is used: a stress-strain law (fibers, trusses) or a force-deformation spring (zero-length). Fixed when the material is created. */
export type MaterialUsage = 'stress-strain' | 'force-deformation'
export const MATERIAL_USAGES: readonly MaterialUsage[] = ['stress-strain', 'force-deformation']
export const USAGE_LABEL: Record<MaterialUsage, string> = { 'stress-strain': 'Stress–strain', 'force-deformation': 'Force–deformation' }
/** Form-only key carrying a material's usage; stripped before the entity is built. */
export const USAGE_KEY = '__usage'

export interface QtyContext { ndm: number; usage?: MaterialUsage; /** For `dofValue`: the DOF the value applies to. */ dof?: number }

const M_ROLES: Record<MaterialUsage, { mStress: Category | null; mStrain: Category | null; mModulus: Category | null }> = {
  'stress-strain': { mStress: 'stress', mStrain: null, mModulus: 'stress' },
  'force-deformation': { mStress: 'force', mStrain: 'length', mModulus: 'forcePerLength' },
}

/** The category an arg's tag means in this context (and, for a vec, at this index); null when it is dimensionless. */
export function resolveQty(tag: ArgQty | undefined, ctx: QtyContext, index = 0): Category | null {
  if (tag === undefined) return null
  const t: QtyTag = Array.isArray(tag) ? tag[index % tag.length] : tag
  switch (t) {
    case 'dofForce': return index < ctx.ndm ? 'force' : 'moment'
    case 'dofMass': return index < ctx.ndm ? 'mass' : 'massInertia'
    case 'dofValue': return ctx.dof !== undefined && ctx.dof >= 1 && ctx.dof <= ctx.ndm ? 'length' : null
    case 'mStress': case 'mStrain': case 'mModulus': return M_ROLES[ctx.usage ?? 'stress-strain'][t]
    default: return t
  }
}

type Rules = Record<string, ArgQty>
const E: Rules = { e: 'mModulus' }

/**
 * Quantity tags for args the schemas cannot express, keyed `fn` or `fn/Type` and then arg name (the schema names). An arg that is not listed is dimensionless
 * and shows no unit, so tagging is safe to grow. `units.test.ts` checks every name here exists in a schema.
 */
export const QTY_RULES: Record<string, Rules> = {
  node: { coords: 'length' },
  mass: { values: 'dofMass' },
  load: { values: 'dofForce' },
  sp: { value: 'dofValue' },
  eleLoad: { wx: 'forcePerLength', wy: 'forcePerLength', wz: 'forcePerLength', pressure: 'stress', bx: 'acceleration', by: 'acceleration', bz: 'acceleration' },
  'element/Truss': { A: 'area' },
  'element/ElasticBeamColumn': { A: 'area', E: 'stress', G: 'stress', J: 'inertia', Iy: 'inertia', Iz: 'inertia', mass: 'massPerLength' },
  'element/DispBeamColumn': { mass: 'massPerLength' },
  'section/Elastic': { eMod: 'stress', a: 'area', iz: 'inertia', iy: 'inertia', gMod: 'stress', jxx: 'inertia' },
  'section/ElasticMembranePlateSection': { eMod: 'stress', h: 'length', rho: 'density' },
  'geomTransf/Linear': { dI: 'length', dJ: 'length' },
  'geomTransf/PDelta': { dI: 'length', dJ: 'length' },
  'geomTransf/Corotational': { dI: 'length', dJ: 'length' },
  'timeSeries/Path': { dt: 'time', time: 'time', startTime: 'time' },
  'pattern/UniformExcitation': { vel0: 'velocity' },
  'nDMaterial/ElasticOrthotropic': { ex: 'stress', ey: 'stress', ez: 'stress', gxy: 'stress', gyz: 'stress', gzx: 'stress' },
  'uniaxialMaterial/Elastic': { ...E, eneg: 'mModulus' },
  'uniaxialMaterial/ElasticPP': { ...E, epsyP: 'mStrain', epsyN: 'mStrain', eps0: 'mStrain' },
  'uniaxialMaterial/ElasticPPGap': { ...E, fy: 'mStress', gap: 'mStrain' },
  'uniaxialMaterial/ElasticBilin': { eP1: 'mModulus', eP2: 'mModulus', epsP2: 'mStrain', eN1: 'mModulus', eN2: 'mModulus', epsN2: 'mStrain' },
  'uniaxialMaterial/ElasticMultiLinear': { strain: 'mStrain', stress: 'mStress' },
  'uniaxialMaterial/Hardening': { ...E, sigmaY: 'mStress', hIso: 'mModulus', hKin: 'mModulus' },
  'uniaxialMaterial/Steel01': { fy: 'mStress', e0: 'mModulus' },
  'uniaxialMaterial/Steel01Thermal': { fy: 'mStress', e0: 'mModulus' },
  'uniaxialMaterial/Steel02': { fy: 'mStress', e0: 'mModulus', sigInit: 'mStress' },
  'uniaxialMaterial/Steel4': { fy: 'mStress', e0: 'mModulus', sigInit: 'mStress' },
  'uniaxialMaterial/SteelMPF': { fyp: 'mStress', fyn: 'mStress', e0: 'mModulus' },
  'uniaxialMaterial/RambergOsgoodSteel': { fy: 'mStress', e0: 'mModulus' },
  'uniaxialMaterial/ReinforcingSteel': { fy: 'mStress', fu: 'mStress', es: 'mModulus', esh: 'mModulus', epsSh: 'mStrain', epsUlt: 'mStrain' },
  'uniaxialMaterial/Concrete01': { fpc: 'mStress', epsc0: 'mStrain', fpcu: 'mStress', epsU: 'mStrain' },
  'uniaxialMaterial/Concrete01WithSITC': { fpc: 'mStress', epsc0: 'mStrain', fpcu: 'mStress', epsU: 'mStrain', endStrainSITC: 'mStrain' },
  'uniaxialMaterial/Concrete02': { fpc: 'mStress', epsc0: 'mStrain', fpcu: 'mStress', epsU: 'mStrain', ft: 'mStress', ets: 'mModulus' },
  'uniaxialMaterial/Concrete04': { fc: 'mStress', epsc: 'mStrain', epscu: 'mStrain', ec: 'mModulus', fct: 'mStress', et: 'mStrain' },
  'uniaxialMaterial/Concrete06': { fc: 'mStress', e0: 'mModulus', fcr: 'mStress', ecr: 'mStrain' },
  'uniaxialMaterial/Concrete07': { fc: 'mStress', epsc: 'mStrain', ec: 'mModulus', ft: 'mStress', et: 'mStrain' },
  'uniaxialMaterial/ConcreteCM': { fpcc: 'mStress', epcc: 'mStrain', ec: 'mModulus', ft: 'mStress', et: 'mStrain' },
  'uniaxialMaterial/MinMax': { minStrain: 'mStrain', maxStrain: 'mStrain' },
  'uniaxialMaterial/InitStrainMaterial': { initStrain: 'mStrain' },
  'uniaxialMaterial/InitStressMaterial': { initStress: 'mStress' },
  'uniaxialMaterial/MultiLinear': { pts: ['mStrain', 'mStress'] },
  'uniaxialMaterial/Pinching4': { ePf1: 'mStress', ePd1: 'mStrain', ePf2: 'mStress', ePd2: 'mStrain', ePf3: 'mStress', ePd3: 'mStrain', ePf4: 'mStress', ePd4: 'mStrain', eNf1: 'mStress', eNd1: 'mStrain', eNf2: 'mStress', eNd2: 'mStrain', eNf3: 'mStress', eNd3: 'mStrain', eNf4: 'mStress', eNd4: 'mStrain' },
  'uniaxialMaterial/Hysteretic': { p1: ['mStress', 'mStrain'], p2: ['mStress', 'mStrain'], p3: ['mStress', 'mStrain'], n1: ['mStress', 'mStrain'], n2: ['mStress', 'mStrain'], n3: ['mStress', 'mStrain'] },
}

/** An arg tree with quantity tags applied from `QTY_RULES`. `path` is the command's fn, extended by the option of a choice. An explicit `qty` on the arg wins. */
export function tagQuantities(fn: string, args: ArgDef[], path = fn): ArgDef[] {
  return args.map((a) => {
    if (a.kind === 'choice') return { ...a, yields: Object.fromEntries(Object.entries(a.yields).map(([k, v]) => [k, tagQuantities(fn, v, `${fn}/${k}`)])) }
    if (a.kind === 'flag') return { ...a, args: tagQuantities(fn, a.args, path) }
    if (a.kind === 'int' || a.kind === 'float' || a.kind === 'vec') {
      const qty = a.qty ?? QTY_RULES[path]?.[a.name] ?? (path !== fn ? QTY_RULES[fn]?.[a.name] : undefined)
      return qty === undefined ? a : ({ ...a, qty } as ArgDef)
    }
    return a
  })
}
