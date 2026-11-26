import type { ShellResultant } from '@/app/lib/shellContour'
import type { DiagramType, ResultType } from '@/app/types/resultsView'
import type { UnitContext } from './units'

/** A displayed result quantity: base value → display value, and its unit symbol ('' when the context is inactive or the value is dimensionless). */
export interface ResultUnit { toDisplay: (v: number) => number; symbol: string }

const NONE: ResultUnit = { toDisplay: (v) => v, symbol: '' }

export const diagramCategory = (t: DiagramType): 'force' | 'moment' => (t === 'moment' || t === 'momentY' || t === 'torsion' ? 'moment' : 'force')

const unitOf = (u: UnitContext, cat: 'length' | 'force' | 'moment' | 'forcePerLength'): ResultUnit => ({ toDisplay: (v) => u.toDisplay(cat, v), symbol: u.active ? u.symbol(cat) : '' })

/** The unit a result type's values are shown in: |u| a length, diagrams a force or moment, shell membrane/shear resultants a force per length
 * and plate moments a moment per length (shown as `kN·m/m`, not reduced to a force). */
export function resultUnit(u: UnitContext, type: ResultType, contour: ShellResultant): ResultUnit {
  if (type === 'deformed') return unitOf(u, 'length')
  if (type === 'contour') {
    if (!contour.startsWith('M')) return unitOf(u, 'forcePerLength')
    const perLength = u.toDisplay('length', 1)
    return { toDisplay: (v) => u.toDisplay('moment', v) / perLength, symbol: u.active ? `${u.symbol('moment')}/${u.symbol('length')}` : '' }
  }
  if (type === 'none' || type === 'mode') return NONE
  return unitOf(u, diagramCategory(type))
}

/** `value unit`, or the bare value when there is no symbol. */
export const withUnit = (text: string, symbol: string) => (symbol ? `${text} ${symbol}` : text)
