import type { Model } from '@/app/types/model'

/** ETABS-style stiffness modifiers of an `ElasticMembranePlateSection`, a PySees-only `args.modifiers` object. Each factor is 1 when absent. */
export const SHELL_MODIFIER_KEYS = ['f11', 'f22', 'f12', 'm11', 'm22', 'm12', 'v13', 'v23'] as const
export type ShellModifierKey = (typeof SHELL_MODIFIER_KEYS)[number]
export type ShellModifiers = Partial<Record<ShellModifierKey, number>>

export const SHELL_MODIFIER_GROUPS: { title: string; keys: ShellModifierKey[]; hint: string }[] = [
  { title: 'Membrane', keys: ['f11', 'f22', 'f12'], hint: 'f11, f22: axial stiffness in local 1 and 2. f12: in-plane shear.' },
  { title: 'Bending', keys: ['m11', 'm22', 'm12'], hint: 'm11, m22: bending about local 2 and 1. m12: twisting.' },
  { title: 'Shear', keys: ['v13', 'v23'], hint: 'Transverse shear. No effect on ShellDKGT triangles.' },
]

/** The modifiers stored on a section's args, or `undefined` when there are none (an empty object counts as none). */
export function readShellModifiers(args: Record<string, unknown>): ShellModifiers | undefined {
  const raw = args.modifiers
  if (typeof raw !== 'object' || raw === null) return undefined
  const out: ShellModifiers = {}
  for (const key of SHELL_MODIFIER_KEYS) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
  }
  return Object.keys(out).length ? out : undefined
}

export type ShellModifiersExport =
  | { exact: true; factor: number; epModifier: number }
  | { exact: false; reason: string }

/**
 * Whether stiffness modifiers can be written as OpenSees' `E` and `Ep_modifier`. OpenSees takes the shear from the
 * membrane modulus and multiplies it by `Ep_modifier`, so `E' = E f` and `Ep_modifier = m / f` give membrane `f`, bending `m`
 * and shear `f (m / f) = m`. That is exact only when all membrane factors are equal (`f`), all bending factors are equal (`m`)
 * and, for any `ShellMITC4` element on the section, `v13 = v23 = m`. A `ShellDKGT` triangle has no shear, so its sections need not satisfy the last.
 */
export function shellModifiersExport(modifiers: ShellModifiers, needsShear: boolean): ShellModifiersExport {
  const get = (k: ShellModifierKey) => modifiers[k] ?? 1
  const f = get('f11'), m = get('m11')
  if (get('f22') !== f || get('f12') !== f) return { exact: false, reason: 'the membrane factors f11, f22 and f12 differ' }
  if (get('m22') !== m || get('m12') !== m) return { exact: false, reason: 'the bending factors m11, m22 and m12 differ' }
  if (needsShear && (get('v13') !== m || get('v23') !== m)) return { exact: false, reason: 'the shear factors v13 and v23 differ from the bending factor m' }
  return { exact: true, factor: f, epModifier: m / f }
}

/** Whether any element that is not a `ShellDKGT` triangle uses the section (an unused section counts as needing shear, the stricter reading). */
export function sectionNeedsShear(model: Model, sectionId: number): boolean {
  const users = [...model.elements.values()].filter((e) => Number(e.args.secTag) === sectionId)
  return users.length === 0 || users.some((e) => e.eleType !== 'ShellDKGT')
}
