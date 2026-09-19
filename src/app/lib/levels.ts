import type { LevelEntity } from '@/app/types/levels'
import { alphaLabel } from '@/app/lib/gridlines'

/** Cumulative elevation of each level, bottom-to-top (elevation[i] = sum of heights[0..i]). */
export function levelElevations(levels: LevelEntity[]): number[] {
  let running = 0
  return levels.map((l) => {
    running += l.height
    return running
  })
}

/**
 * Convert an edit to a level's absolute elevation back into a height, given the
 * elevation of the level below (0 if this is the lowest level). The cascade to
 * levels above happens for free: their elevations are re-derived from cumulative
 * heights on every render, so only this one level's height needs to change.
 */
export function heightFromElevation(elevation: number, belowElevation: number): number {
  return elevation - belowElevation
}

export interface EvenlySpacedLevelsParams {
  count: number
  height: number
  labelStyle: 'numeric' | 'alpha'
  labelPrefix: string
  startIndex: number
}

export function evenlySpacedLevels(params: EvenlySpacedLevelsParams, startId: number): LevelEntity[] {
  const { count, height, labelStyle, labelPrefix, startIndex } = params
  const levels: LevelEntity[] = []
  for (let i = 0; i < count; i++) {
    const label = labelStyle === 'alpha' ? alphaLabel(startIndex + i) : String(startIndex + i)
    levels.push({ id: startId + i, label: `${labelPrefix}${label}`, height })
  }
  return levels
}
