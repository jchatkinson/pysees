import { emptyAnalysisHistory, type AnalysisCommand } from '@/app/types/analysisCommands'
import { emptyModel, type LoadAssignment, type Model, type SectionTemplateMeta } from '@/app/types/model'
import type { ModelWrite } from '@/app/lib/modelWrite'
import { getAnalysisBlock } from '@/app/lib/analysisBlocks'
import { buildModel, PROJECT_HOOK, type Builder } from '@/app/lib/scriptImport/build'
import { parsePython } from '@/app/lib/scriptImport/python'
import { skip } from '@/app/lib/commands/tokens'
import { DIRECTIVES, DIRECTIVE_LINE, PROJECT_VERSION } from '@/app/lib/project/annotations'
import type { ImportDiagnostic, ImportResult } from '@/app/lib/scriptImport/types'
import type { ProjectDocument } from '@/app/lib/project/types'
import { parseBaseUnits, parseUnitPrefs } from '@/app/lib/units/units'
import { MATERIAL_USAGES, type MaterialUsage } from '@/app/lib/units/quantities'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)
const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const WRITE_KINDS = new Set(['node', 'mass', 'material', 'section', 'geomTransf', 'beamIntegration', 'element', 'fix', 'mpConstraint', 'region', 'timeSeries', 'pattern', 'misc'])
type Single = 'project' | 'layout' | 'report' | 'display'

/** True when the text is a saved PySees project (it carries the `# @pysees project` header). */
export const isProjectText = (text: string) => /^[ \t]*#[ \t]*@pysees[ \t]+project\b/m.test(text)

function checkCommand(c: unknown, where: string): string | null {
  if (!isRec(c)) return `${where}: not an object`
  if (c.disabled !== undefined && typeof c.disabled !== 'boolean') return `${where}: "disabled" must be true or false`
  if (c.type === 'ANALYSIS_BLOCK') {
    if (typeof c.blockId !== 'string' || !getAnalysisBlock(c.blockId)) return `${where}: unknown analysis block "${String(c.blockId)}"`
    return isRec(c.params) ? null : `${where}: missing params`
  }
  if (c.type === 'ANALYSIS_OPS') return typeof c.fn === 'string' && isRec(c.values) ? null : `${where}: needs "fn" and "values"`
  if (c.type === 'SCRIPT_GROUP') {
    if (typeof c.source !== 'string' || !Array.isArray(c.commands)) return `${where}: a script group needs "source" and "commands"`
    for (const [i, sub] of c.commands.entries()) { const e = checkCommand(sub, `${where}[${i}]`); if (e) return e }
    return null
  }
  return `${where}: unknown command type "${String(c.type)}"`
}

/** Applies a generated block's authored definition to the builder: `writes` are model writes; `shellLoads` re-inserts a pattern's shell loads at their original positions. */
function applyGenerated(header: Rec, b: Builder) {
  if (header.kind === 'shellLoads') {
    const id = header.patternId
    const pattern = isInt(id) ? b.model.patterns.get(id) : undefined
    if (!pattern) return skip(`pattern ${String(id)} is not defined before its shell loads`)
    if (!Array.isArray(header.children)) return skip('missing "children"')
    const children = [...pattern.children]
    const items = (header.children as Rec[]).map((c) => (isRec(c) && Number.isInteger(c.index) && isRec(c.child) && ['load', 'eleLoad', 'sp'].includes(String(c.child.kind)) && isRec(c.child.args) ? { index: c.index as number, child: c.child as unknown as LoadAssignment } : skip('bad shell load entry')))
    for (const { index, child } of items.sort((x, y) => x.index - y.index)) children.splice(Math.max(0, Math.min(index, children.length)), 0, child)
    b.model = { ...b.model, patterns: new Map(b.model.patterns).set(pattern.id, { ...pattern, children }) }
    return
  }
  if (!Array.isArray(header.writes)) return skip('missing "writes"')
  for (const w of header.writes as unknown[]) {
    if (!isRec(w) || !WRITE_KINDS.has(String(w.kind)) || !isRec(w.entity)) return skip('a write needs a known "kind" and an "entity"')
    b.emit(w as unknown as ModelWrite)
  }
}

/**
 * Reads a saved project statically (nothing is executed). Directives are validated first, their lines and the executable lines they
 * enclose are blanked (keeping line numbers), the rest goes through the ordinary script importer, and the annotations are applied on
 * top. Any error leaves `project` unset, so opening never replaces the current state with a partial one.
 */
export function parseProject(text: string): ImportResult {
  const diagnostics: ImportDiagnostic[] = []
  const error = (message: string, line?: number) => diagnostics.push({ severity: 'error', message, line })
  const single: Partial<Record<Single, { data: Rec; line: number }>> = {}
  const entities: { data: Rec; line: number }[] = []
  const blocks: { header: Rec; line: number }[] = []
  const commands: AnalysisCommand[] = []
  let open: { kind: string; line: number } | null = null
  const out: string[] = []

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const m = raw.match(DIRECTIVE_LINE)
    if (!m) { out.push(open ? '' : raw); return }
    out.push('')
    const [, name, mode, json] = m
    if (!(DIRECTIVES as readonly string[]).includes(name)) return error(`Unknown directive "@pysees ${name}".`, line)
    if (open) {
      if (mode === 'end' && name === open.kind) open = null
      else error(`"@pysees ${name}${mode ? ' ' + mode : ''}" inside the ${open.kind} block that began on line ${open.line}.`, line)
      return
    }
    if (mode === 'end') return error(`"@pysees ${name} end" has no matching begin.`, line)
    const block = name === 'generated' || name === 'analysis'
    if (block !== (mode === 'begin')) return error(block ? `"@pysees ${name}" must be written as "@pysees ${name} begin {…}".` : `"@pysees ${name}" takes no begin/end.`, line)
    let data: unknown
    try { data = JSON.parse(json) } catch (e) { return error(`Malformed @pysees ${name} JSON: ${(e as Error).message}.`, line) }
    if (!isRec(data)) return error(`@pysees ${name} must hold a JSON object.`, line)
    if (name === 'analysis') {
      const problem = checkCommand(data.command, 'command')
      if (problem) error(`Invalid analysis command (${problem}).`, line)
      else commands.push(data.command as AnalysisCommand)
      open = { kind: name, line }
    } else if (name === 'generated') {
      out[out.length - 1] = `ops.${PROJECT_HOOK}(${blocks.length})`
      blocks.push({ header: data, line })
      open = { kind: name, line }
    } else if (name === 'entity') entities.push({ data, line })
    else if (single[name as Single]) error(`Duplicate "@pysees ${name}" directive.`, line)
    else single[name as Single] = { data, line }
  })
  if (open) error(`The ${(open as { kind: string }).kind} block that began here is never closed.`, (open as { line: number }).line)

  const fail = (): ImportResult => ({ language: 'py', ndm: 3, ndf: 6, writes: [], model: emptyModel(), diagnostics, counts: {} })
  const header = single.project
  if (!header) error('Not a saved PySees project: the "@pysees project" header is missing.')
  else if (!Number.isInteger(header.data.version) || (header.data.version as number) < 1) error('The project header has no valid version.', header.line)
  else if ((header.data.version as number) > PROJECT_VERSION) error(`This file was saved by a newer PySees (project format ${header.data.version}; this version reads up to ${PROJECT_VERSION}).`, header.line)
  if (diagnostics.length) return fail()

  const { calls, diagnostics: parseDiagnostics } = parsePython(out.join('\n'))
  const built = buildModel(calls, 'py', parseDiagnostics, (index, b) => applyGenerated(blocks[index].header, b))
  diagnostics.push(...built.diagnostics)
  if (diagnostics.some((d) => d.severity === 'error')) return { ...fail(), ndm: built.ndm, ndf: built.ndf }

  let model: Model = built.model
  const h = header!.data
  if (model.config?.ndm !== h.ndm || model.config?.ndf !== h.ndf) error(`The project header says ndm=${String(h.ndm)}, ndf=${String(h.ndf)} but the model command says ndm=${model.config?.ndm}, ndf=${model.config?.ndf}.`, header!.line)

  const units = parseBaseUnits(h.units)
  if (units === null) error('The project header has invalid "units".', header!.line)
  else if (units && model.config) model = { ...model, config: { ...model.config, units } }

  // Entity annotations: app-only fields, and the ids of constraints (their commands carry none).
  const constraintIds: { id: number; line: number }[] = []
  for (const { data, line } of entities) {
    if (data.kind === 'pattern') {
      const pattern = isInt(data.id) ? model.patterns.get(data.id) : undefined
      if (!pattern || typeof data.name !== 'string') error(`Pattern annotation does not match a pattern (id ${String(data.id)}).`, line)
      else model = { ...model, patterns: new Map(model.patterns).set(pattern.id, { ...pattern, name: data.name }) }
    } else if (data.kind === 'section') {
      const section = isInt(data.id) ? model.sections.get(data.id) : undefined
      if (!section || !isRec(data.template) || typeof data.template.kind !== 'string' || !isRec(data.template.params)) error(`Section annotation does not match a section (id ${String(data.id)}).`, line)
      else model = { ...model, sections: new Map(model.sections).set(section.id, { ...section, template: data.template as unknown as SectionTemplateMeta }) }
    } else if (data.kind === 'material') {
      const material = isInt(data.id) ? model.materials.get(data.id) : undefined
      if (!material || material.kind !== 'uniaxial' || !(MATERIAL_USAGES as readonly unknown[]).includes(data.usage)) error(`Material annotation does not match a uniaxial material (id ${String(data.id)}).`, line)
      else model = { ...model, materials: new Map(model.materials).set(material.id, { ...material, usage: data.usage as MaterialUsage }) }
    } else if (data.kind === 'mpConstraint') {
      if (isInt(data.id)) constraintIds.push({ id: data.id, line }); else error('Constraint annotation needs a positive integer id.', line)
    } else error(`Unknown entity annotation kind "${String(data.kind)}".`, line)
  }
  if (constraintIds.length || model.mpConstraints.size) {
    const decoded = [...model.mpConstraints.values()].sort((a, b) => a.id - b.id)
    if (decoded.length !== constraintIds.length || new Set(constraintIds.map((c) => c.id)).size !== constraintIds.length) error(`${decoded.length} constraint commands but ${constraintIds.length} distinct constraint ids were annotated.`)
    else model = { ...model, mpConstraints: new Map(decoded.map((c, i) => [constraintIds[i].id, { ...c, id: constraintIds[i].id }])) }
  }

  // Counters: the saved ones win, but never below what the entities already use.
  const saved = isRec(h.nextIds) ? h.nextIds : {}
  const nextIds = { ...model.nextIds }
  for (const k of Object.keys(nextIds) as (keyof typeof nextIds)[]) {
    const mine = k === 'mpConstraint' ? Math.max(1, ...[...model.mpConstraints.keys()].map((x) => x + 1)) : nextIds[k]
    nextIds[k] = isInt(saved[k]) ? Math.max(saved[k] as number, mine) : mine
  }
  model = { ...model, nextIds }

  const layout = single.layout?.data ?? {}
  const gridlines = (Array.isArray(layout.gridlines) ? layout.gridlines : []) as Rec[]
  const levels = (Array.isArray(layout.levels) ? layout.levels : []) as Rec[]
  if (!gridlines.every((g) => isRec(g) && isInt(g.id) && typeof g.label === 'string' && Array.isArray(g.start) && Array.isArray(g.end))) error('Invalid grid line in the "layout" annotation.', single.layout?.line)
  if (!levels.every((l) => isRec(l) && isInt(l.id) && typeof l.label === 'string' && isNum(l.height))) error('Invalid level in the "layout" annotation.', single.layout?.line)
  const report = single.report?.data ?? {}
  const savedPlots = (Array.isArray(report.savedPlots) ? report.savedPlots : []) as Rec[]
  if (!savedPlots.every((p) => isRec(p) && p.kind === 'plot' && isInt(p.id) && typeof p.name === 'string' && isRec(p.config) && Array.isArray(p.config.series))) error('Invalid saved plot in the "report" annotation.', single.report?.line)
  const display = (single.display?.data ?? {}) as Rec
  if (diagnostics.some((d) => d.severity === 'error')) return { ...fail(), ndm: built.ndm, ndf: built.ndf }

  const nextId = (given: unknown, ids: Rec[]) => Math.max(isInt(given) ? given : 1, ...ids.map((x) => (x.id as number) + 1))
  const project: ProjectDocument = {
    model, analysis: { ...emptyAnalysisHistory(), commands, cursor: commands.length - 1 },
    gridlines: gridlines as never, levels: levels as never, nextGridlineId: nextId(layout.nextGridlineId, gridlines), nextLevelId: nextId(layout.nextLevelId, levels),
    savedPlots: savedPlots as never, nextSavedPlotId: nextId(report.nextSavedPlotId, savedPlots),
    activeSavedPlotId: isInt(report.activeSavedPlotId) && savedPlots.some((p) => p.id === report.activeSavedPlotId) ? report.activeSavedPlotId : null,
    display: {
      viewSettings: isRec(display.viewSettings) ? Object.fromEntries(Object.entries(display.viewSettings).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean> : {},
      unitPrefs: parseUnitPrefs(display.unitPrefs),
      hiddenLoadPatterns: Array.isArray(display.hiddenLoadPatterns) ? display.hiddenLoadPatterns.filter(isInt) : [],
      resultsView: isRec(display.resultsView) ? display.resultsView : {}, plotView: isRec(display.plotView) ? display.plotView : {},
    },
  }
  const counts = { ...built.counts, ...(commands.length ? { 'Analysis commands': commands.length } : {}), ...(gridlines.length ? { 'Grid lines': gridlines.length } : {}), ...(levels.length ? { Levels: levels.length } : {}), ...(savedPlots.length ? { 'Saved plots': savedPlots.length } : {}) }
  return { ...built, model, diagnostics, counts, writes: built.writes, project }
}
