import type { SectionTemplateKind } from './types'

export interface AiscSection {
  Type: string; Name: string; AISC_Manual_Label: string
  d?: number; bf?: number; tw?: number; tf?: number; t?: number; b?: number
  Ht?: number; B?: number; OD?: number; tdes?: number
}
export type SectionLengthUnit = 'm' | 'mm' | 'in' | 'ft'
export const SECTION_LENGTH_UNITS: Record<SectionLengthUnit, number> = { m: 0.0254, mm: 25.4, in: 1, ft: 1 / 12 }

export function aiscTemplateKind(s: AiscSection): SectionTemplateKind | null {
  if (['W', 'M', 'S', 'HP'].includes(s.Type)) return 'i'
  if (['C', 'MC'].includes(s.Type)) return 'c'
  if (s.Type === 'L') return 'l'
  if (s.Type === 'HSS') return s.OD ? 'tube' : 'hss'
  if (s.Type === 'PIPE') return 'tube'
  return null
}

/** Source dimensions are inches. Use design wall thickness, not nominal HSS thickness. */
export function aiscGeometry(s: AiscSection, unit: SectionLengthUnit): Record<string, unknown> {
  const scale = SECTION_LENGTH_UNITS[unit]
  const value = (n: number | undefined) => {
    if (!n || !Number.isFinite(Number(n))) throw new Error(`Missing geometry for ${s.Name}`)
    return Number(n) * scale
  }
  switch (aiscTemplateKind(s)) {
    case 'i': case 'c': return { depth: value(s.d), flangeWidth: value(s.bf), flangeThick: value(s.tf), webThick: value(s.tw) }
    case 'l': return { legY: value(s.b), legZ: value(s.d), thickness: value(s.t) }
    case 'hss': return { depth: value(s.Ht), width: value(s.B), thickness: value(s.tdes) }
    case 'tube': return { diameter: value(s.OD), thickness: value(s.tdes) }
    default: throw new Error(`Unsupported section ${s.Name}`)
  }
}

let catalog: Promise<AiscSection[]> | undefined
export function loadAiscSections(): Promise<AiscSection[]> {
  return catalog ??= fetch(`${import.meta.env.BASE_URL}sections.v16.json`).then(async (response) => {
    if (!response.ok) throw new Error('Unable to load AISC sections.')
    const sections: AiscSection[] = await response.json()
    return sections.filter((s) => aiscTemplateKind(s) !== null)
  }).catch((error) => { catalog = undefined; throw error })
}
