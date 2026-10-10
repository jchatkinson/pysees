import type { FiberSectionItem } from '@/app/types/model'
import type { HssParams, SectionOutline } from '../types'
import { platePatch } from '../plateMesh'

export const defaultHssParams: HssParams = { matId: 0, width: 0.2, depth: 0.3, thickness: 0.01, depthAxis: 'y', nWebY: 12, nWebZ: 2, nFlangeY: 2, nFlangeZ: 8 }
export function hssOutline(p: HssParams): SectionOutline {
  const d = p.depth / 2, b = p.width / 2, t = p.thickness
  const rect = (y: number, z: number) => [{ y: -y, z: -z }, { y, z: -z }, { y, z }, { y: -y, z }]
  return p.depthAxis === 'y' ? { outer: rect(d, b), holes: [rect(d - t, b - t)] } : { outer: rect(b, d), holes: [rect(b - t, d - t)] }
}
export function hssChildren(p: HssParams): FiberSectionItem[] {
  const d = p.depth / 2, b = p.width / 2, t = p.thickness
  return [platePatch(p, -b, d - t, b, d, 'flange'), platePatch(p, -b, -d, b, -d + t, 'flange'),
    platePatch(p, -b, -d + t, -b + t, d - t, 'web'), platePatch(p, b - t, -d + t, b, d - t, 'web')]
}
