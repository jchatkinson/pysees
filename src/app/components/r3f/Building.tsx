import type { BuildingEntity } from '@/app/types/model'
import { ArrowHelper, Vector3 } from 'three'

/** Carapace stores (x, y_up, z) with plan X-Z; the PySees scene uses (x, y_plan, z_up), so map to (x, z, y_up) here. */
function buildingScenePoint(x: number, yUp: number, z: number): [number, number, number] { return [x, z, yUp] }

export function Building({ entity }: { entity: BuildingEntity }) {
  const first = entity.spec.storeys[0]
  if (!first) return null
  const Lx = first.walls.find((w) => w.name === 'front')?.layout.length ?? 0
  const Lz = first.walls.find((w) => w.name === 'left')?.layout.length ?? 0
  const H = first.wallHeight, d = first.floorDepth
  const colors = ['#64748b', '#0f766e', '#2563eb', '#9333ea']
  return <group>
    {entity.spec.storeys.map((storey, si) => {
      const base = si * (H + d)
      return <group key={si}>
        {storey.walls.map((wall, wi) => {
          const [sx, sz] = wall.start, [dx, dz] = wall.direction, { length, height, openings = [] } = wall.layout
          const angle = Math.atan2(dz, dx), mid = buildingScenePoint(sx + dx * length / 2, base + height / 2, sz + dz * length / 2)
          const segments: [number, number, number, number][] = []
          if (!openings.length) segments.push([0, length, 0, height])
          else {
            let x = 0
            for (const o of openings) { if (o.x0 > x) segments.push([x, o.x0, 0, height]); if (o.headHeight < height) segments.push([o.x0, o.x1, o.headHeight, height]); x = o.x1 }
            if (x < length) segments.push([x, length, 0, height])
          }
          return <group key={wall.name} position={mid} rotation={[0, 0, angle]}>
            {segments.map(([a, b, low, high], i) => <mesh key={i} position={[a + (b - a) / 2 - length / 2, 0, (low + high - height) / 2]}><boxGeometry args={[b - a, 32, high - low]} /><meshStandardMaterial color={colors[wi % colors.length]} transparent opacity={0.35} /></mesh>)}
            {wall.layout.studs.flatMap((s) => {
              const opening = openings.find((o) => s.x > o.x0 && s.x < o.x1)
              const low = opening?.headHeight ?? 0
              return low < height ? [<mesh key={`s${s.x}`} position={[s.x - length / 2, 18, (low + height) / 2 - height / 2]}><boxGeometry args={[38, 38, height - low]} /><meshStandardMaterial color="#475569" /></mesh>] : []
            })}
            {openings.map((o, i) => <group key={`o${i}`}><mesh position={[(o.x0 + o.x1) / 2 - length / 2, 20, o.headHeight - height / 2]}><boxGeometry args={[o.x1 - o.x0, 40, 38]} /><meshStandardMaterial color="#b45309" /></mesh><mesh position={[o.x0 - length / 2, 20, o.headHeight / 2 - height / 2]}><boxGeometry args={[38, 38, o.headHeight]} /><meshStandardMaterial color="#475569" /></mesh><mesh position={[o.x1 - length / 2, 20, o.headHeight / 2 - height / 2]}><boxGeometry args={[38, 38, o.headHeight]} /><meshStandardMaterial color="#475569" /></mesh></group>)}
          </group>
        })}
        <mesh position={buildingScenePoint(Lx / 2, base + H + d / 2, Lz / 2)}><boxGeometry args={[Lx, Lz, d]} /><meshStandardMaterial color="#a8a29e" transparent opacity={0.22} /></mesh>
        <mesh position={buildingScenePoint(Lx / 2, base + H + d + 5, Lz / 2)}><planeGeometry args={[Lx, Lz]} /><meshStandardMaterial color="#60a5fa" transparent opacity={0.12} side={2} /></mesh>
        {(storey.lateral ?? []).map((load, li) => {
          const direction = new Vector3(load.fx, load.fz, 0).normalize()
          const origin = new Vector3(load.at[0], load.at[1], base + H + d + 80)
          return direction.length() ? <primitive key={`load${li}`} object={new ArrowHelper(direction, origin, 600, '#dc2626', 140, 70)} /> : null
        })}
      </group>
    })}
  </group>
}
