/**
 * UI-only construct (no OpenSeesPy equivalent) for the vertical axis (Y).
 * Levels are ordered bottom-to-top; `height` is the story height above the level
 * below (or above Y=0 for the lowest level). Elevation is always derived from the
 * cumulative sum of heights — never stored — so editing one level's height (or an
 * elevation, translated back to a height) naturally cascades to every level above it.
 */
export interface LevelEntity {
  id: number
  label: string
  height: number
}
