import { useEffect, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { useAppStore } from '@/app/store/useAppStore'
import { useResultsSource } from '@/app/lib/resultsStorage/useResultsSource'
import { formatResult } from '@/app/lib/formatResult'
import { useUnits } from '@/app/lib/units/useUnits'
import type { FixEntity } from '@/app/types/model'
import type { SceneIndex } from './sceneIndex'
import { ScreenSize } from './ScreenSize'

const COLOR = '#16a34a'
/** Arrow length and head size, in screen pixels. */
const LEN = 42
const HEAD = 8
const FORCES = ['Fx', 'Fy', 'Fz'] as const
const MOMENTS = ['Mx', 'My', 'Mz'] as const

const LABEL_STYLE: React.CSSProperties = { fontSize: 10, color: '#166534', background: 'rgba(255,255,255,0.9)', border: '0.5px solid #86efac', borderRadius: 2, padding: '0 3px', lineHeight: '14px', whiteSpace: 'pre', userSelect: 'none', pointerEvents: 'none' }

interface Reaction { nodeId: number; position: [number, number, number]; forces: [number, number, number]; moments: [number, number, number] }

/** One force arrow per non-zero global component, pointing the way the support pushes on the structure, ending at the node. */
function ReactionGlyph({ r, tol, label }: { r: Reaction; tol: number; label: string }) {
  return (
    <ScreenSize position={r.position}>
      {r.forces.map((f, k) => {
        if (Math.abs(f) < tol) return null
        const d = [0, 0, 0]; d[k] = Math.sign(f)
        const tail: [number, number, number] = [-d[0] * LEN, -d[1] * LEN, -d[2] * LEN]
        // A head of two short strokes, splayed in a plane containing the arrow.
        const side = k === 2 ? [1, 0, 0] : [0, 0, 1]
        const h1: [number, number, number] = [0, 1, 2].map((i) => -d[i] * HEAD + side[i] * HEAD * 0.5) as [number, number, number]
        const h2: [number, number, number] = [0, 1, 2].map((i) => -d[i] * HEAD - side[i] * HEAD * 0.5) as [number, number, number]
        return <Line key={k} points={[tail, [0, 0, 0], h1, [0, 0, 0], h2]} segments={false} color={COLOR} lineWidth={2} />
      })}
      <Html position={[0, 0, 0]} style={{ ...LABEL_STYLE, transform: 'translate(6px, 6px)' }} zIndexRange={[11, 11]}>{label}</Html>
    </ScreenSize>
  )
}

/** Support reactions at the current step, read from the run's `reaction` columns for the fixed nodes in the scene. */
export function ReactionsLayer({ index, fixes }: { index: SceneIndex; fixes: FixEntity[] }) {
  const runId = useAppStore((s) => s.resultsView.runId)
  const step = useAppStore((s) => s.resultsView.step)
  const tol = useAppStore((s) => s.zeroTolerance)
  const units = useUnits()
  const source = useResultsSource(runId)
  const [reactions, setReactions] = useState<Reaction[]>([])

  useEffect(() => {
    if (!source) return
    let live = true
    source.get(step).then((frame) => {
      if (!live) return
      if (!frame) { setReactions([]); return }
      const out: Reaction[] = []
      for (const fix of fixes) {
        const row = index.nodeIndex.get(fix.nodeId)
        const entry = source.layout.columns.reaction.get(fix.nodeId)
        if (row === undefined || !entry) continue
        const read = (names: readonly string[]) => names.map((n) => { const c = entry.labels.indexOf(n); return c < 0 ? 0 : frame.row[entry.offset + c] }) as [number, number, number]
        out.push({ nodeId: fix.nodeId, position: [index.nodeCoords[row * 3], index.nodeCoords[row * 3 + 1], index.nodeCoords[row * 3 + 2]], forces: read(FORCES), moments: read(MOMENTS) })
      }
      setReactions(out)
    }).catch(() => { if (live) setReactions([]) })
    return () => { live = false }
  }, [source, step, fixes, index])

  if (!source) return null
  const fmt = (cat: 'force' | 'moment', v: number) => `${formatResult(units.toDisplay(cat, v), tol)}${units.active ? ` ${units.symbol(cat)}` : ''}`
  return (
    <>
      {reactions.map((r) => {
        const lines = [...FORCES.map((n, k) => [n, r.forces[k], 'force'] as const), ...MOMENTS.map((n, k) => [n, r.moments[k], 'moment'] as const)]
          .filter(([, v]) => Math.abs(v) >= tol).map(([n, v, cat]) => `${n} ${fmt(cat, v)}`)
        return lines.length ? <ReactionGlyph key={r.nodeId} r={r} tol={tol} label={lines.join('\n')} /> : null
      })}
    </>
  )
}
