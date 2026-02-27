export type ArgLen = number | 'ndm' | 'ndf'

export type ArgDef =
  | { kind: 'int' | 'float' | 'str'; name: string; label?: string; defaultValue?: number | string }
  | { kind: 'vec'; name: string; label?: string; length: ArgLen; defaultValue?: number[] }
  | { kind: 'flag'; flag: string; label?: string; args: ArgDef[]; defaultValue?: boolean }
  | { kind: 'choice'; name: string; label?: string; options: string[]; yields: Record<string, ArgDef[]>; defaultValue?: string }

export interface SchemaContext {
  ndm: number
  ndf: number
}

