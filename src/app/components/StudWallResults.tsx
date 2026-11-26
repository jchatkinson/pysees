import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table'
import { PIER_QUANTITIES, readWallMembers, wallPiers, type WallMemberForce } from '@/app/lib/studBuilding'
import { useUnits } from '@/app/lib/units/useUnits'
import { useResultFormat } from '@/app/lib/useResultFormat'
import type { Category } from '@/app/lib/units/units'
import { isStudWall, studWallArgs } from '@/app/lib/studWalls'
import type { StepFrameSource } from '@/app/lib/resultsStorage/stepFrames'
import { useAppStore } from '@/app/store/useAppStore'

const Head = ({ cols }: { cols: string[] }) => <TableHeader><TableRow>{cols.map((c) => <TableHead key={c} className="h-6 px-1">{c}</TableHead>)}</TableRow></TableHeader>
const Row = ({ cells, fmt, onClick, active }: { cells: (string | number)[]; fmt: (v: number) => string; onClick?: () => void; active?: boolean }) => <TableRow className={onClick ? `cursor-pointer ${active ? 'bg-accent' : ''}` : ''} onClick={onClick}>{cells.map((c, i) => <TableCell key={i} className="px-1 py-0.5 tabular-nums">{typeof c === 'number' ? fmt(c) : c}</TableCell>)}</TableRow>

/** Stud-wall results at the current step, in the display units: every wall's base reaction; for the selected wall its piers, or in the
 * members view (axial, `wallResults: members`) every framing member's force. Columns are the `studWall` recorder groups the compiler
 * planned (`studWallRecorders`, `studWallMemberLabels`). */
export function StudWallResults({ source, row }: { source: StepFrameSource; row: Float64Array }) {
  const elements = useAppStore((s) => s.model.elements)
  const selected = useAppStore((s) => s.selectedElementIds)
  const select = useAppStore((s) => s.setSceneSelection)
  const membersView = useAppStore((s) => s.resultsView.type === 'axial' && s.resultsView.wallResults === 'members')
  const u = useUnits()
  const rf = useResultFormat()
  const fmt = (n: number) => rf.value(n, 0, false)
  const columns = source.layout.columns.studWall
  if (!columns.size) return null
  const walls = [...elements.values()].filter((e) => isStudWall(e.eleType) && columns.has(e.id))
  const v = (id: number, label: string) => { const c = columns.get(id)!; const k = c.labels.indexOf(label); return k < 0 ? NaN : row[c.offset + k] }
  const d = (cat: Category, x: number) => u.toDisplay(cat, x)
  const sym = (cat: Category) => (u.symbol(cat) ? ` ${u.symbol(cat)}` : '')
  const focus = walls.find((w) => selected.includes(w.id))
  const piers = focus ? wallPiers(studWallArgs(focus.args).layout) : []
  const members = focus ? (() => { const c = columns.get(focus.id)!; return readWallMembers(c.labels, (k) => row[c.offset + k]) })() : []
  const L = focus ? studWallArgs(focus.args).layout.length : 0
  const memberName = (m: WallMemberForce) => (m.kind === 'stud' ? (m.x <= 1e-9 * L || m.x >= L * (1 - 1e-9) ? 'End post' : 'Stud') : m.kind === 'jack' ? 'Jack' : 'Cripple')
  return <section className="grid gap-1.5 rounded border p-1.5 text-[11px]">
    <div className="text-[10px] text-muted-foreground">Wall base reactions (local axes; N up positive = gravity takedown). Click a wall for its {membersView ? 'members' : 'piers'}.</div>
    <div className="max-h-48 overflow-auto"><Table><Head cols={['Wall', `V${sym('force')}`, `N${sym('force')}`, `M${sym('moment')}`]} /><TableBody>{walls.map((w) => <Row key={w.id} fmt={fmt} active={w === focus} onClick={() => select({ nodes: [], elements: [w.id] })} cells={[studWallArgs(w.args).label ?? `Wall ${w.id}`, d('force', v(w.id, 'shear')), d('force', v(w.id, 'axial')), d('moment', v(w.id, 'moment'))]} />)}</TableBody></Table></div>
    {focus && membersView && members.length > 0 && <>
      <div className="text-[10px] text-muted-foreground">{studWallArgs(focus.args).label ?? `Wall ${focus.id}`} members: axial force, tension positive (a stud's ends differ by the sheathing's shear lag)</div>
      <div className="max-h-64 overflow-auto"><Table><Head cols={['Member', `x${sym('length')}`, `Bottom${sym('force')}`, `Top${sym('force')}`]} /><TableBody>
        {[...members].sort((a, b) => a.x - b.x).map((m, i) => <Row key={i} fmt={fmt} cells={[memberName(m), d('length', m.x), d('force', m.bottom), d('force', m.top)]} />)}
      </TableBody></Table></div>
    </>}
    {focus && !membersView && piers.length > 0 && <>
      <div className="text-[10px] text-muted-foreground">{studWallArgs(focus.args).label ?? `Wall ${focus.id}`} piers: shear flow q, base moment, chord (hold-down) forces, tension positive</div>
      <Table><Head cols={['Pier', `b${sym('length')}`, `q${sym('forcePerLength')}`, `M${sym('moment')}`, `L${sym('force')}`, `R${sym('force')}`]} /><TableBody>{piers.map((p, i) => {
        const q = (k: (typeof PIER_QUANTITIES)[number]) => v(focus.id, `p${i + 1}.${k}`)
        return <Row key={i} fmt={fmt} cells={[i + 1, d('length', p.width), d('forcePerLength', q('q')), d('moment', q('momentBase')), d('force', q('chordLeft')), d('force', q('chordRight'))]} />
      })}</TableBody></Table>
    </>}
  </section>
}
