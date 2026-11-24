import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { buildingRecorders } from '@/app/lib/studBuilding'
import type { StepFrameSource } from '@/app/lib/resultsStorage/stepFrames'
import type { BuildingEntity } from '@/app/types/model'

const fmt = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(4)).toString() : '—')
const Head = ({ cols }: { cols: string[] }) => <TableHeader><TableRow>{cols.map((c) => <TableHead key={c} className="h-7 px-1.5">{c}</TableHead>)}</TableRow></TableHeader>
const Row = ({ cells }: { cells: (string | number)[] }) => <TableRow>{cells.map((c, i) => <TableCell key={i} className="px-1.5 py-1 tabular-nums">{typeof c === 'number' ? fmt(c) : c}</TableCell>)}</TableRow>

/** A building run's results at one step (model units N, mm; shown in kN, kN/m, kN·m, mm), top storey first.
 * Column groups come from `buildingRecorders`, the same list the compiler recorded. */
export function BuildingResults({ entity, source, row }: { entity: BuildingEntity; source: StepFrameSource; row: Float64Array }) {
  const groups = buildingRecorders(entity.spec).map((g, i) => {
    const column = source.layout.columns.building.get(i)
    return { ...g, v: (label: string) => (column ? row[column.offset + column.labels.indexOf(label)] : NaN) }
  })
  const storeys = entity.spec.storeys.map((_, si) => si).reverse()
  const h = (si: number) => entity.spec.storeys[si].wallHeight + entity.spec.storeys[si].floorDepth
  const drifts = groups.flatMap((g) => (g.target.type === 'drift' ? [{ storey: g.target.storey, x: g.v('x'), z: g.v('z'), r: g.v('rotation') }] : []))
  return <section className="grid gap-2 rounded border p-2 text-xs">
    <h3 className="font-medium">Building results · current step</h3>
    {drifts.length > 0 && <div>
      <div className="text-[10px] text-muted-foreground">Inter-storey drift at the rigid diaphragm (mm, rad); h = wall height + floor depth</div>
      <Table><Head cols={['Storey', 'Δx', 'Δz', 'θ', 'Δ/h']} /><TableBody>{storeys.map((si) => { const d = drifts.find((x) => x.storey === si)!; return <Row key={si} cells={[si + 1, d.x, d.z, d.r, Math.hypot(d.x, d.z) / h(si)]} /> })}</TableBody></Table>
    </div>}
    <div>
      <div className="text-[10px] text-muted-foreground">Wall base reactions (local axes): shear V and moment M along the wall, axial N up positive, so N is the gravity takedown</div>
      <Table><Head cols={['Storey', 'Wall', 'V (kN)', 'N (kN)', 'M (kN·m)']} /><TableBody>{storeys.flatMap((si) => groups.flatMap((g) => (g.target.type === 'wall' && g.target.storey === si ? [<Row key={`${si}${g.target.wall}`} cells={[si + 1, g.target.wall, g.v('shear') / 1e3, g.v('axial') / 1e3, g.v('moment') / 1e6]} />] : [])))}</TableBody></Table>
    </div>
    <div>
      <div className="text-[10px] text-muted-foreground">Piers: shear flow q, pier shear q·b, base moment, and the M/jd chord (hold-down) forces, tension positive</div>
      <Table><Head cols={['Storey', 'Wall', 'Pier', 'b (m)', 'q (kN/m)', 'q·b (kN)', 'M (kN·m)', 'Chord L (kN)', 'Chord R (kN)']} /><TableBody>{storeys.flatMap((si) => groups.flatMap((g) => {
        const t = g.target
        return t.type === 'pier' && t.storey === si ? [<Row key={`${si}${t.wall}${t.pier}`} cells={[si + 1, t.wall, t.pier + 1, t.width / 1e3, g.v('q'), g.v('q') * t.width / 1e3, g.v('momentBase') / 1e6, g.v('chordLeft') / 1e3, g.v('chordRight') / 1e3]} />] : []
      }))}</TableBody></Table>
    </div>
  </section>
}
