export function toVec3(coords: number[]): [number, number, number] {
  return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0]
}
