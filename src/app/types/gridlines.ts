/**
 * UI-only construct (no OpenSeesPy equivalent) for horizontal reference lines on
 * the ground plane — bay/column lines, e.g. "Grid 1", "Grid A".
 *
 * `start`/`end` hold PLAN coordinates only (the vertical axis, Y, is never part of
 * a grid — see LevelEntity for that): length 2 as `[x, z]` for a 3D model (ndm=3),
 * length 1 as `[x]` for a 2D model (ndm=2), where a grid is just a column position
 * and its vertical extent is derived from the model's Levels instead of stored.
 */
export interface GridlineEntity {
  id: number
  label: string
  start: number[]
  end: number[]
}
