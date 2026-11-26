/**
 * UI-only construct (like grids and levels): one page of a PDF drawn as a plan background at a level. Never part of the Model, never exported.
 * Page coordinates are PDF points (1/72 in of paper) on the page as displayed (its /Rotate applied), origin at the bottom-left, y up.
 * World X–Y = `origin + scale · R(rotation) · page`.
 */
export interface UnderlayEntity {
  id: number
  name: string
  /** SHA-256 (hex) of the PDF bytes: the key in the underlay file store. */
  file: string
  /** File name it was imported from (shown when relinking). */
  fileName: string
  /** 1-based page number. */
  page: number
  /** Page size in points, kept so a missing file still draws as a placeholder. */
  pageSize: [number, number]
  /** LevelEntity id; null = base (z = 0). */
  level: number | null
  /** World X, Y of the page's bottom-left corner. */
  origin: [number, number]
  /** World length units per PDF point. */
  scale: number
  /** Radians, counter-clockwise about `origin`. */
  rotation: number
  opacity: number
  /** White paper drawn transparent so only the linework shows. */
  knockout: boolean
  visible: boolean
  /** Shown part of the page, [x0, y0, x1, y1] in page points; absent = the whole page. */
  crop?: [number, number, number, number]
}
