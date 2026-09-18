import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import { useAppStore } from '@/app/store/useAppStore'
import type { ModelDeletableKind } from '@/app/lib/modelWrite'
import type { Model } from '@/app/types/model'

interface Row { kind: ModelDeletableKind; id: number; summary: string }

function rowsFor(model: Model): { label: string; rows: Row[] }[] {
  const groups: { label: string; rows: Row[] }[] = []
  const nodes: Row[] = [...model.nodes.values()].sort((a, b) => a.id - b.id)
    .map((n) => ({ kind: 'node' as const, id: n.id, summary: `node ${n.id}  [${n.coords.join(', ')}]` }))
  if (nodes.length) groups.push({ label: 'Nodes', rows: nodes })

  const masses: Row[] = [...model.masses.values()].sort((a, b) => a.nodeId - b.nodeId)
    .map((m) => ({ kind: 'mass' as const, id: m.nodeId, summary: `mass  node ${m.nodeId}` }))
  if (masses.length) groups.push({ label: 'Masses', rows: masses })

  const materials: Row[] = [...model.materials.values()].sort((a, b) => a.id - b.id)
    .map((m) => ({ kind: 'material' as const, id: m.id, summary: `${m.matType}  #${m.id}` }))
  if (materials.length) groups.push({ label: 'Materials', rows: materials })

  const sections: Row[] = [...model.sections.values()].sort((a, b) => a.id - b.id)
    .map((s) => ({ kind: 'section' as const, id: s.id, summary: `${s.secType}  #${s.id}${s.children.length ? ` (${s.children.length} fibers)` : ''}` }))
  if (sections.length) groups.push({ label: 'Sections', rows: sections })

  const elements: Row[] = [...model.elements.values()].sort((a, b) => a.id - b.id)
    .map((e) => ({ kind: 'element' as const, id: e.id, summary: `${e.eleType}  #${e.id}  [${e.nodes.join(', ')}]` }))
  if (elements.length) groups.push({ label: 'Elements', rows: elements })

  const transforms: Row[] = [...model.geomTransfs.values()].sort((a, b) => a.id - b.id)
    .map((g) => ({ kind: 'geomTransf' as const, id: g.id, summary: `${g.transfType}  #${g.id}` }))
  if (transforms.length) groups.push({ label: 'Transforms', rows: transforms })

  const integrations: Row[] = [...model.beamIntegrations.values()].sort((a, b) => a.id - b.id)
    .map((b) => ({ kind: 'beamIntegration' as const, id: b.id, summary: `${b.intType}  #${b.id}` }))
  if (integrations.length) groups.push({ label: 'Beam Integrations', rows: integrations })

  const fixes: Row[] = [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId)
    .map((f) => ({ kind: 'fix' as const, id: f.nodeId, summary: `fix  node ${f.nodeId}` }))
  if (fixes.length) groups.push({ label: 'Constraints (fix)', rows: fixes })

  const mps: Row[] = [...model.mpConstraints.values()].sort((a, b) => a.id - b.id)
    .map((m) => ({ kind: 'mpConstraint' as const, id: m.id, summary: `${m.kind}  #${m.id}` }))
  if (mps.length) groups.push({ label: 'MP Constraints', rows: mps })

  const regions: Row[] = [...model.regions.values()].sort((a, b) => a.id - b.id)
    .map((r) => ({ kind: 'region' as const, id: r.id, summary: `region #${r.id}` }))
  if (regions.length) groups.push({ label: 'Regions', rows: regions })

  const ts: Row[] = [...model.timeSeries.values()].sort((a, b) => a.id - b.id)
    .map((t) => ({ kind: 'timeSeries' as const, id: t.id, summary: `${t.tsType}  #${t.id}` }))
  if (ts.length) groups.push({ label: 'Time Series', rows: ts })

  const patterns: Row[] = [...model.patterns.values()].sort((a, b) => a.id - b.id)
    .map((p) => ({ kind: 'pattern' as const, id: p.id, summary: `${p.patternType}  #${p.id}${p.children.length ? ` (${p.children.length} loads)` : ''}` }))
  if (patterns.length) groups.push({ label: 'Load Patterns', rows: patterns })

  const misc: Row[] = [...model.misc.values()].sort((a, b) => a.id - b.id)
    .map((m) => ({ kind: 'misc' as const, id: m.id, summary: `${m.fn}  #${m.id}` }))
  if (misc.length) groups.push({ label: 'Other', rows: misc })

  return groups
}

export function ModelPanel() {
  const model = useAppStore((s) => s.model)
  const selectedModelEntity = useAppStore((s) => s.selectedModelEntity)
  const setSelectedModelEntity = useAppStore((s) => s.setSelectedModelEntity)
  const modelUndo = useAppStore((s) => s.modelUndo)
  const modelRedo = useAppStore((s) => s.modelRedo)
  const canUndo = useAppStore((s) => s.modelPast.length > 0)
  const canRedo = useAppStore((s) => s.modelFuture.length > 0)

  const groups = rowsFor(model)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (label: string) => setCollapsed((prev) => {
    const next = new Set(prev)
    if (next.has(label)) next.delete(label); else next.add(label)
    return next
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1 flex items-center justify-between border-b shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Model</span>
        <div className="flex items-center gap-1">
          <button className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={!canUndo} onClick={modelUndo}>Undo</button>
          <button className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={!canRedo} onClick={modelRedo}>Redo</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="py-0.5 px-0.5">
            {groups.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-6">No model entities yet.</p>
            )}
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.label)
              return (
                <div key={group.label}>
                  <button
                    className="w-full flex items-center gap-1 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded transition-colors"
                    onClick={() => toggle(group.label)}
                  >
                    <ChevronRight className={`w-2.5 h-2.5 shrink-0 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} />
                    <span>{group.label}</span>
                    <span className="ml-auto tabular-nums opacity-50">{group.rows.length}</span>
                  </button>
                  {!isCollapsed && group.rows.map((row) => {
                    const isSelected = selectedModelEntity?.kind === row.kind && selectedModelEntity.id === row.id
                    return (
                      <button
                        key={`${row.kind}-${row.id}`}
                        className={[
                          'w-full text-left px-1.5 py-px pl-3 rounded text-[10px] font-mono truncate transition-colors hover:bg-accent',
                          isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : '',
                        ].join(' ')}
                        onClick={() => setSelectedModelEntity({ kind: row.kind, id: row.id })}
                      >
                        {row.summary}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
