import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { PIER_QUANTITIES, wallPiers } from '@/app/lib/studBuilding'
import { isStudWall, studWallArgs } from '@/app/lib/studWalls'
import type { StepFrameSource } from '@/app/lib/resultsStorage/stepFrames'
import { useAppStore } from '@/app/store/useAppStore'

const fmt = (n: number) => (Number.isFinite(n) ? Number(n.toPrecision(4)).toString() : '—')
const Head = ({ cols }: { cols: string[] }) => <TableHeader><TableRow>{cols.map((c) => <TableHead key={c} className="h-6 px-1">{c}</TableHead>)}</TableRow></TableHeader>
const Row = ({ cells, onClick, active }: { cells: (string | number)[]; onClick?: () => void; active?: boolean }) => <TableRow className={onClick ? `cursor-pointer ${active ? 'bg-accent' : ''}` : ''} onClick={onClick}>{cells.map((c, i) => <TableCell key={i} className="px-1 py-0.5 tabular-nums">{typeof c === 'number' ? fmt(c) : c}</TableCell>)}</TableRow>

/** Stud-wall results at the current step (model units N, mm; shown in kN, kN·m): every wall's base reaction, and the piers of the
 * selected wall. Columns are the `studWall` recorder groups the compiler planned (`studWallRecorders`). */
export function StudWallResults({ source, row }: { source: StepFrameSource; row: Float64Array }) {
  const elements = useAppStore((s) => s.model.elements)
  const selected = useAppStore((s) => s.selectedElementIds)
  const select = useAppStore((s) => s.setSceneSelection)
  const columns = source.layout.columns.studWall
  if (!columns.size) return null
  const walls = [...elements.values()].filter((e) => isStudWall(e.eleType) && columns.has(e.id))
  const v = (id: number, label: string) => { const c = columns.get(id)!; const k = c.labels.indexOf(label); return k < 0 ? NaN : row[c.offset + k] }
  const focus = walls.find((w) => selected.includes(w.id))
  const piers = focus ? wallPiers(studWallArgs(focus.args).layout) : []
  return <section className="grid gap-1.5 rounded border p-1.5 text-[11px]">
    <div className="text-[10px] text-muted-foreground">Wall base reactions (local axes; N up positive = gravity takedown). Click a wall for its piers.</div>
    <div className="max-h-48 overflow-auto"><Table><Head cols={['Wall', 'V kN', 'N kN', 'M kN·m']} /><TableBody>{walls.map((w) => <Row key={w.id} active={w === focus} onClick={() => select({ nodes: [], elements: [w.id] })} cells={[studWallArgs(w.args).label ?? `Wall ${w.id}`, v(w.id, 'shear') / 1e3, v(w.id, 'axial') / 1e3, v(w.id, 'moment') / 1e6]} />)}</TableBody></Table></div>
    {focus && piers.length > 0 && <>
      <div className="text-[10px] text-muted-foreground">{studWallArgs(focus.args).label ?? `Wall ${focus.id}`} piers: shear flow q, base moment, chord (hold-down) forces, tension positive</div>
      <Table><Head cols={['Pier', 'b m', 'q kN/m', 'M kN·m', 'L kN', 'R kN']} /><TableBody>{piers.map((p, i) => {
        const q = (k: (typeof PIER_QUANTITIES)[number]) => v(focus.id, `p${i + 1}.${k}`)
        return <Row key={i} cells={[i + 1, p.width / 1e3, q('q'), q('momentBase') / 1e6, q('chordLeft') / 1e3, q('chordRight') / 1e3]} />
      })}</TableBody></Table>
    </>}
  </section>
}
