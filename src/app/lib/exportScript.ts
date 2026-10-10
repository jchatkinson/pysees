import type { Model } from '@/app/types/model'
import type { AnalysisHistory } from '@/app/types/analysisCommands'
import type { SchemaContext } from '@/app/types/schema'
import { withLumpedBeamMass } from '@/app/lib/beamMass'
import { blockPatternTags, resolveAnalysisCommand } from '@/app/lib/analysisBlocks'
import { encodeModel, encodeOps, encodePattern } from '@/app/lib/commands/encode'
import { printScript, type ScriptLanguage } from '@/app/lib/commands/print'
import type { Call } from '@/app/lib/commands/tokens'

/** Pattern tag -> index of the first analysis command whose stage claims it (its `patterns` param). A claimed pattern is
 * declared just before that stage instead of up front, because OpenSees ramps every pattern that exists when a stage
 * runs: the push pattern must not exist yet while gravity ramps (and `loadConst` must already have frozen gravity). */
function claimingCommand(analysisHistory: AnalysisHistory): Map<number, number> {
  const claimed = new Map<number, number>()
  analysisHistory.commands.forEach((cmd, i) => {
    if (cmd.type !== 'ANALYSIS_BLOCK' || cmd.blockId === 'run-earthquake-analysis') return
    for (const tag of blockPatternTags(cmd.params)) if (!claimed.has(tag)) claimed.set(tag, i)
  })
  return claimed
}

function encodeAnalysis(analysisHistory: AnalysisHistory, model: Model, ctx: SchemaContext): Call[] {
  const calls: Call[] = []
  const claimed = claimingCommand(analysisHistory)
  analysisHistory.commands.forEach((cmd, i) => {
    // Declare the patterns this stage claims first, so the stage's own commands (e.g. DisplacementControl) can see them.
    for (const [tag, at] of claimed) {
      const pattern = model.patterns.get(tag)
      if (at === i && pattern) calls.push(encodePattern(pattern, ctx, model))
    }
    const earthquake = cmd.type === 'ANALYSIS_BLOCK' && cmd.blockId === 'run-earthquake-analysis'
    const groundTags = earthquake ? [...new Set(blockPatternTags(cmd.params).length ? blockPatternTags(cmd.params) : [...model.patterns.values()].filter((p) => p.patternType === 'UniformExcitation').map((p) => p.id))] : []
    for (const tag of groundTags) {
      const pattern = model.patterns.get(tag)
      if (pattern) calls.push(encodePattern(pattern, ctx, model))
    }
    for (const resolved of resolveAnalysisCommand(cmd, model)) {
      if (resolved.type === 'ANALYSIS_OPS') calls.push(encodeOps(resolved.fn, resolved.values, ctx))
    }
    for (const tag of groundTags) calls.push({ fn: 'remove', args: ['loadPattern', tag] })
  })
  return calls
}

/** Renders the full Model + Analysis state as an executable OpenSeesPy (default) or OpenSees Tcl script. */
export function exportScript(model: Model, fullHistory: AnalysisHistory, lang: ScriptLanguage = 'py'): string {
  // A disabled command is as good as removed: it neither runs nor claims load patterns.
  const analysisHistory = { ...fullHistory, commands: fullHistory.commands.filter((c) => !c.disabled) }
  if (analysisHistory.commands.some((c) => c.type === 'ANALYSIS_BLOCK' && c.blockId === 'run-earthquake-analysis')) model = withLumpedBeamMass(model)
  const ctx: SchemaContext = { ndm: model.config?.ndm ?? 3, ndf: model.config?.ndf ?? 6 }
  const deferred = new Set(claimingCommand(analysisHistory).keys())
  if (analysisHistory.commands.some((c) => c.type === 'ANALYSIS_BLOCK' && c.blockId === 'run-earthquake-analysis')) for (const p of model.patterns.values()) if (p.patternType === 'UniformExcitation') deferred.add(p.id)
  return printScript([{ fn: 'wipe', args: [] }, ...encodeModel(model, deferred), ...encodeAnalysis(analysisHistory, model, ctx)], lang)
}

export function downloadScript(model: Model, analysisHistory: AnalysisHistory, lang: ScriptLanguage = 'py', filename = `model.${lang}`) {
  const content = exportScript(model, analysisHistory, lang)
  const blob = new Blob([content], { type: lang === 'py' ? 'text/x-python' : 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
