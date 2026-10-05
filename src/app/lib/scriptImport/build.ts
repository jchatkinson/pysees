import { emptyModel, type Model } from '@/app/types/model'
import type { SchemaContext } from '@/app/types/schema'
import { applyModelWrite, entityExists, type ModelWrite } from '@/app/lib/modelWrite'
import { validateSchemaResult } from '@/app/lib/commandSchemas'
import { GENERATED_COMMAND_SCHEMAS } from '@/app/generated/commandSchemas.generated'
import { canonicalFn, decodeCommand, type DecodeSink } from '@/app/lib/commands/decode'
import { Skip, numsFrom, skip } from '@/app/lib/commands/tokens'
import { flatten } from '@/app/lib/scriptImport/expr'
import type { ImportDiagnostic, ImportResult, ParsedCall } from '@/app/lib/scriptImport/types'

/** Known OpenSees commands PySees has no model entity for: reported, not silently dropped. */
const UNSUPPORTED_MODEL = new Set(['fixX', 'fixY', 'fixZ', 'frictionModel', 'block2D', 'block3D', 'mesh', 'remesh', 'DiscretizeMember', 'groundMotion', 'imposedMotion', 'parameter', 'updateParameter', 'addToParameter'])
const OPENSEES_FNS = new Set(GENERATED_COMMAND_SCHEMAS.map((s) => s.fn))

/** Applies decoded writes to a growing model, validating each one and tracking the enclosing pattern / fiber section. */
class Builder implements DecodeSink {
  model: Model
  writes: ModelWrite[] = []
  diagnostics: ImportDiagnostic[] = []
  pattern: number | null = null
  fiberSection: number | null = null
  readonly ndm: 2 | 3
  readonly ndf: number
  private ctx: SchemaContext
  private ignored = new Map<string, number[]>()
  private line = 0
  private comment: string | undefined

  constructor(ndm: 2 | 3, ndf: number) {
    this.ndm = ndm
    this.ndf = ndf
    this.ctx = { ndm, ndf }
    this.model = { ...emptyModel(), config: { ndm, ndf } }
  }

  note(severity: ImportDiagnostic['severity'], message: string, line = this.line) { this.diagnostics.push({ severity, message, line }) }

  emit(w: ModelWrite) {
    const problem = validateSchemaResult({ target: 'model', write: w }, this.model, this.ctx)
    if (problem) skip(problem)
    if (entityExists(this.model, w)) this.note('warning', 'redefines a tag that already exists; the later definition wins.')
    // A comment directly above a pattern becomes its (UI-only) name; that is how the exporter writes it.
    if (w.kind === 'pattern' && this.comment) w = { ...w, entity: { ...w.entity, name: this.comment } }
    this.model = applyModelWrite(this.model, w)
    this.writes.push(w)
    if (w.kind === 'pattern') this.pattern = w.entity.id
    if (w.kind === 'section') this.fiberSection = /fiber/i.test(w.entity.secType) ? w.entity.id : null
  }

  run(call: ParsedCall) {
    this.line = call.line
    this.comment = call.comment
    const fn = canonicalFn(call.fn)
    if (!fn) return this.other(call)
    try {
      decodeCommand(fn, flatten(call.args), this)
    } catch (e) {
      if (!(e instanceof Skip)) throw e
      // A failed container must not leave its children attaching to the previous one.
      if (fn === 'pattern') this.pattern = null
      if (fn === 'section') this.fiberSection = null
      this.note('error', `${call.fn} skipped: ${e.message.replace(/\.$/, '')}.`)
    }
  }

  private other(call: ParsedCall) {
    if (UNSUPPORTED_MODEL.has(call.fn)) return this.note('warning', `"${call.fn}" has no PySees equivalent yet and was skipped.`)
    if (call.fn === 'wipe') return
    if (OPENSEES_FNS.has(call.fn) || /recorder/i.test(call.fn)) { // analysis / output commands: model building only
      const lines = this.ignored.get(call.fn) ?? []; lines.push(call.line); this.ignored.set(call.fn, lines); return
    }
    this.note('warning', `unknown command "${call.fn}" was skipped.`)
  }

  /** One info line per ignored analysis command, listing where it appeared. */
  finish() {
    for (const [fn, lines] of this.ignored) this.diagnostics.push({ severity: 'info', message: `"${fn}" ignored (analysis setup is not imported)${lines.length > 1 ? ` — ${lines.length} occurrences` : ''}.`, line: lines[0] })
  }
}

/** Turns parsed commands into model writes. Anything that cannot be represented is reported, never guessed at. */
export function buildModel(calls: ParsedCall[], language: 'tcl' | 'py', parseDiagnostics: ImportDiagnostic[]): ImportResult {
  const diagnostics = [...parseDiagnostics]
  const config = readConfig(calls)
  if (!config.explicit) diagnostics.push({ severity: 'warning', message: `No "model" command found; assuming ndm=${config.ndm}, ndf=${config.ndf} from the first node.` })
  const b = new Builder(config.ndm, config.ndf)
  for (const call of calls) b.run(call)
  b.finish()
  diagnostics.push(...b.diagnostics)
  diagnostics.sort((x, y) => (x.line ?? 0) - (y.line ?? 0))
  const m = b.model
  const counts = Object.fromEntries(Object.entries({
    Nodes: m.nodes.size, Elements: m.elements.size, Materials: m.materials.size, Sections: m.sections.size, Transformations: m.geomTransfs.size,
    Integrations: m.beamIntegrations.size, Supports: m.fixes.size, Masses: m.masses.size, Constraints: m.mpConstraints.size,
    'Time series': m.timeSeries.size, Patterns: m.patterns.size, Loads: [...m.patterns.values()].reduce((n, p) => n + p.children.length, 0),
  }).filter(([, n]) => n > 0))
  return { language, ndm: config.ndm, ndf: config.ndf, writes: b.writes, model: m, diagnostics, counts }
}

function readConfig(calls: ParsedCall[]): { ndm: 2 | 3; ndf: number; explicit: boolean } {
  const model = calls.find((c) => c.fn.toLowerCase() === 'model')
  if (model) {
    const t = flatten(model.args)
    const ndm = Number(t[t.indexOf('-ndm') + 1])
    if (t.includes('-ndm') && (ndm === 2 || ndm === 3)) {
      const ndf = Number(t[t.indexOf('-ndf') + 1])
      return { ndm, ndf: t.includes('-ndf') && Number.isInteger(ndf) && ndf > 0 ? ndf : ndm === 2 ? 3 : 6, explicit: true }
    }
  }
  const node = calls.find((c) => c.fn.toLowerCase() === 'node')
  const ndm = node && numsFrom(flatten(node.args), 1).length >= 3 ? 3 : 2
  return { ndm, ndf: ndm === 2 ? 3 : 6, explicit: false }
}
