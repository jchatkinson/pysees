import type { Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { SchemaContext } from '@/app/types/schema'
import { fnForModelEntity, renderOpsCall } from '@/app/lib/commandSchemas'
import { resolveAnalysisCommand } from '@/app/lib/analysisBlocks'

function pyList(nums: number[]): string {
  return `[${nums.join(', ')}]`
}

function renderModel(model: Model): string[] {
  const lines: string[] = []
  const ctx: SchemaContext = { ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }
  lines.push(`ops.model('basic', '-ndm', ${ctx.ndm}, '-ndf', ${ctx.ndf})`)

  for (const node of [...model.nodes.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.node(${node.id}, ${node.coords.join(', ')})`)
  }
  for (const mass of [...model.masses.values()].sort((a, b) => a.nodeId - b.nodeId)) {
    lines.push(`ops.mass(${mass.nodeId}, ${mass.values.join(', ')})`)
  }
  for (const mat of [...model.materials.values()].sort((a, b) => a.id - b.id)) {
    const fn = fnForModelEntity('material', mat)
    lines.push(`ops.${renderOpsCall(fn, mat.args, ctx)}`)
  }
  for (const sec of [...model.sections.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.${renderOpsCall('section', sec.args, ctx)}`)
    for (const child of sec.children) {
      lines.push(`ops.${child.kind}(${Object.values(child.args).map((v) => v).join(', ')})`)
    }
  }
  for (const gt of [...model.geomTransfs.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.${renderOpsCall('geomTransf', gt.args, ctx)}`)
  }
  for (const bi of [...model.beamIntegrations.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.${renderOpsCall('beamIntegration', bi.args, ctx)}`)
  }
  for (const ele of [...model.elements.values()].sort((a, b) => a.id - b.id)) {
    if (ele.eleType === 'Truss') {
      lines.push(`ops.element('Truss', ${ele.id}, ${ele.nodes.join(', ')}, ${ele.args.matTag})`)
    } else if (ele.eleType === 'ElasticBeamColumn') {
      lines.push(`ops.element('ElasticBeamColumn', ${ele.id}, ${ele.nodes.join(', ')}, ${ele.args.A}, ${ele.args.E}, ${ele.args.Iz}, ${ele.args.transfTag})`)
    } else {
      lines.push(`ops.element('${ele.eleType}', ${ele.id}, ${ele.nodes.join(', ')})`)
    }
  }
  for (const region of [...model.regions.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.${renderOpsCall('region', region.args, ctx)}`)
  }
  for (const misc of [...model.misc.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.${renderOpsCall(misc.fn, misc.args, ctx)}`)
  }
  for (const mp of [...model.mpConstraints.values()].sort((a, b) => a.id - b.id)) {
    const fn = fnForModelEntity('mpConstraint', mp)
    lines.push(`ops.${renderOpsCall(fn, mp.args, ctx)}`)
  }
  for (const fix of [...model.fixes.values()].sort((a, b) => a.nodeId - b.nodeId)) {
    const flags = Array.from({ length: ctx.ndf }, (_, i) => (fix.dofs.includes(i + 1) ? 1 : 0))
    lines.push(`ops.fix(${fix.nodeId}, ${flags.join(', ')})`)
  }
  for (const ts of [...model.timeSeries.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.${renderOpsCall('timeSeries', ts.args, ctx)}`)
  }
  for (const pattern of [...model.patterns.values()].sort((a, b) => a.id - b.id)) {
    lines.push(`ops.${renderOpsCall('pattern', pattern.args, ctx)}`)
    for (const child of pattern.children) {
      if (child.kind === 'load') {
        const a = child.args as { nodeTag: number; values: number[] }
        lines.push(`ops.load(${a.nodeTag}, ${a.values.join(', ')})`)
      } else if (child.kind === 'sp') {
        const a = child.args as { nodeTag: number; dof: number; value: number }
        lines.push(`ops.sp(${a.nodeTag}, ${a.dof}, ${a.value})`)
      } else if (child.kind === 'eleLoad') {
        const a = child.args as { eleTags: number[]; wy: number; wz: number }
        lines.push(`ops.eleLoad('-ele', ${pyList(a.eleTags)}, '-type', '-beamUniform', ${a.wy}, ${a.wz})`)
      }
    }
  }
  return lines
}

function renderAnalysis(analysisHistory: AnalysisHistory, model: Model, ctx: SchemaContext): string[] {
  const lines: string[] = []
  for (const cmd of analysisHistory.commands) {
    for (const resolved of resolveAnalysisCommand(cmd, model)) {
      if (resolved.type !== 'ANALYSIS_OPS') continue
      lines.push(`ops.${renderOpsCall(resolved.fn, resolved.values, ctx)}`)
    }
  }
  return lines
}

/** Renders the full Model + Analysis state as an executable OpenSeesPy script. */
export function exportScript(model: Model, analysisHistory: AnalysisHistory): string {
  const ctx: SchemaContext = { ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }
  const lines: string[] = [
    'import openseespy.opensees as ops',
    '',
    'ops.wipe()',
    ...renderModel(model),
    '',
    ...renderAnalysis(analysisHistory, model, ctx),
    '',
  ]
  return lines.join('\n')
}

export function downloadScript(model: Model, analysisHistory: AnalysisHistory, filename = 'model.py') {
  const content = exportScript(model, analysisHistory)
  const blob = new Blob([content], { type: 'text/x-python' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
