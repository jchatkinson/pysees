/** `{ ref, times }`: as many values as an earlier count arg says (times its value), e.g. beamIntegration's `N, *secTags, *locs`. */
export type ArgLen = number | 'ndm' | 'ndf' | 'dynamic' | { ref: string; times?: number }
export type DefaultSource = 'signature' | 'doc_text' | 'curated'

export type ArgDef =
  | { kind: 'int' | 'float' | 'str'; name: string; label?: string; ndm?: ArgNdm; /** A string that is never a number (a response type, a flag word): what ends a preceding open-ended list. */ word?: boolean; defaultValue?: number | string; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'vec'; name: string; label?: string; ndm?: ArgNdm; length: ArgLen; defaultValue?: number[]; nodeSync?: boolean; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'flag'; flag: string; label?: string; ndm?: ArgNdm; args: ArgDef[]; defaultValue?: boolean; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'choice'; name: string; label?: string; ndm?: ArgNdm; options: string[]; yields: Record<string, ArgDef[]>; defaultValue?: string; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'idlist'; name: string; label?: string; ndm?: ArgNdm; defaultValue?: number[]; description?: string; required?: boolean; defaultSource?: DefaultSource }

/** Any arg may apply to one model dimension only (`ndm: 3` for a 3D-only field). `getAvailableSchemas(ndm)` resolves a schema to the layout for that ndm, so everything downstream sees a plain list. */
export type ArgNdm = 2 | 3

export interface SchemaContext {
  ndm: number
  ndf: number
}
