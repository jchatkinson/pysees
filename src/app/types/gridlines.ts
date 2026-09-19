/** UI-only construct for orienting a model in space (bay/story reference lines, etc). No OpenSeesPy equivalent. */
export interface GridlineEntity {
  id: number
  label: string
  start: number[]
  end: number[]
}
