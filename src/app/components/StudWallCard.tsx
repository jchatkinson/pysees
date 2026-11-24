import type { ElementEntity, MaterialEntity } from '@/app/types/model'
import { studWallArgs } from '@/app/lib/studWalls'
import { wallPiers } from '@/app/lib/studBuilding'
import { useUnits } from '@/app/lib/units/useUnits'

const Row = ({ k, v }: { k: string; v: string }) => <><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{v}</span></>

/** Read-only summary of a Carapace-only stud wall (layout editing is planned). */
export function StudWallCard({ element }: { element: ElementEntity }) {
  const u = useUnits()
  const a = studWallArgs(element.args)
  const l = a.layout
  if (!l) return null
  const len = (v: number) => `${Number(u.toDisplay('length', v).toPrecision(4))}${u.symbol('length') ? ` ${u.symbol('length')}` : ''}`
  const law = l.sheathing?.law
  const openings = l.openings ?? []
  return (
    <div className="grid gap-1.5 text-[11px]">
      <div className="font-medium">Stud wall {element.id}{a.label ? ` — ${a.label}` : ''}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <Row k="Length × height" v={`${len(l.length)} × ${len(l.height)}`} />
        {l.floor && <Row k="Floor zone" v={`${len(l.floor.depth)} deep`} />}
        <Row k="Studs" v={`${l.studs.length}`} />
        <Row k="Openings" v={openings.length ? openings.map((o) => `${o.door ? 'door' : 'window'} ${len(o.x1 - o.x0)}`).join(', ') : 'none'} />
        <Row k="Piers" v={wallPiers(l).map((p) => len(p.width)).join(', ') || 'none'} />
        <Row k="Sheathing" v={law?.kind === 'o86' ? `CSA O86, Bv ${law.bv}, nails ${law.nailDiameter} @ ${law.nailSpacing}` : law?.kind === 'linear' ? `linear, Ga ${law.ga}` : 'none'} />
        <Row k="Nodes" v={`4 corners, ${a.stations.filter((s) => s.chord === 'top').length} top / ${a.stations.filter((s) => s.chord === 'bottom').length} bottom stations`} />
      </div>
      <p className="text-[10px] text-muted-foreground">Carapace-only. OpenSees export writes this wall as elastic shells with a warning. Layout editing is not available yet.</p>
    </div>
  )
}

/** Read-only summary of the Carapace-only anchorage (hold-down) material. */
export function AnchorageCard({ material }: { material: MaterialEntity }) {
  const a = material.args
  return (
    <div className="grid gap-1.5 text-[11px]">
      <div className="font-medium">Anchorage {material.id}</div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <Row k="Tension stiffness" v={String(a.tension)} />
        <Row k="Slack" v={String(a.slack)} />
        <Row k="Bearing" v={a.bearing === 'linear' ? `linear, k ${String(a.k)}` : `O86 crush, qr ${String(a.qr)}`} />
      </div>
      <p className="text-[10px] text-muted-foreground">Carapace-only hold-down. OpenSees export writes an Elastic material with the tension and initial bearing stiffness, without slack or crushing.</p>
    </div>
  )
}
