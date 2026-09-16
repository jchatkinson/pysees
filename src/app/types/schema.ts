export type ArgLen = number | 'ndm' | 'ndf' | 'dynamic'
export type DefaultSource = 'signature' | 'doc_text' | 'curated'

export type ArgDef =
  | { kind: 'int' | 'float' | 'str'; name: string; label?: string; defaultValue?: number | string; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'vec'; name: string; label?: string; length: ArgLen; defaultValue?: number[]; nodeSync?: boolean; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'flag'; flag: string; label?: string; args: ArgDef[]; defaultValue?: boolean; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'choice'; name: string; label?: string; options: string[]; yields: Record<string, ArgDef[]>; defaultValue?: string; description?: string; required?: boolean; defaultSource?: DefaultSource }
  | { kind: 'idlist'; name: string; label?: string; defaultValue?: number[]; description?: string; required?: boolean; defaultSource?: DefaultSource }

export interface SchemaContext {
  ndm: number
  ndf: number
}
