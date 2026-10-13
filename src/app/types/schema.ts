/** `{ ref, times }`: as many values as an earlier count arg says (times its value), e.g. beamIntegration's `N, *secTags, *locs`. */
export type ArgLen = number | 'ndm' | 'ndf' | 'dynamic' | { ref: string; times?: number }
/** What a numeric arg measures, for unit labels and conversion. A category, or a rule resolved from context: `dofForce` / `dofMass` (translational for the first ndm entries of a per-DOF vec, rotational after), `dofValue` (an `sp` value: a length for translational DOFs, none for rotations),
 * `mStress` / `mStrain` / `mModulus` (a uniaxial material's stress, strain and stress/strain: F/L², 1, F/L² in a stress-strain material and F, L, F/L in a force-deformation one). A vec may list tags that repeat across its entries. Absent: dimensionless. */
export type QtyTag = import('@/app/lib/units/units').Category | 'dofForce' | 'dofMass' | 'dofValue' | 'mStress' | 'mStrain' | 'mModulus'
export type ArgQty = QtyTag | QtyTag[]

export type DefaultSource = 'signature' | 'doc_text' | 'curated'

export type ArgDef =
  | { kind: 'int' | 'float' | 'str'; name: string; label?: string; ndm?: ArgNdm; qty?: QtyTag; /** A string that is never a number (a response type, a flag word): what ends a preceding open-ended list. */ word?: boolean; defaultValue?: number | string; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'vec'; name: string; label?: string; ndm?: ArgNdm; qty?: ArgQty; length: ArgLen; defaultValue?: number[]; nodeSync?: boolean; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'flag'; flag: string; label?: string; ndm?: ArgNdm; args: ArgDef[]; defaultValue?: boolean; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'choice'; name: string; label?: string; ndm?: ArgNdm; options: string[]; yields: Record<string, ArgDef[]>; defaultValue?: string; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'idlist'; name: string; label?: string; ndm?: ArgNdm; defaultValue?: number[]; description?: string; required?: boolean; defaultSource?: DefaultSource }

/** Any arg may apply to one model dimension only (`ndm: 3` for a 3D-only field). `getAvailableSchemas(ndm)` resolves a schema to the layout for that ndm, so everything downstream sees a plain list. */
export type ArgNdm = 2 | 3

export interface SchemaContext {
  ndm: number
  ndf: number
}
