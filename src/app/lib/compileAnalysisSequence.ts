import type { AnalysisCommand, AnalysisHistory } from '@/app/types/analysisCommands'
import type { Model } from '@/app/types/model'
import type { AnalysisSequence, AnalysisStage, RecorderSpec } from '@/app/types/analysisSequence'
import { getAnalysisBlock } from '@/app/lib/analysisBlocks'

export interface CompileDiagnostic { severity: 'error' | 'warning'; message: string; commandIndex: number }

export interface CompileAnalysisSequenceResult {
  sequence: AnalysisSequence
  diagnostics: CompileDiagnostic[]
}

function dedupeId(id: string, used: Set<string>): string {
  if (!used.has(id)) { used.add(id); return id }
  let i = 2
  while (used.has(`${id}-${i}`)) i++
  const deduped = `${id}-${i}`
  used.add(deduped)
  return deduped
}

/** Walks the active (commands[0..cursor]) analysis history and produces the structured AnalysisSequence
 * the future Carapace compiler consumes. Only ANALYSIS_BLOCK entries whose block defines toStage/toRecorders
 * contribute — raw ANALYSIS_OPS and blocks without a Carapace equivalent are reported as diagnostics and
 * excluded, never silently guessed at. Script export (exportScript.ts) is unaffected by this function. */
export function compileAnalysisSequence(history: AnalysisHistory, model: Model): CompileAnalysisSequenceResult {
  const stages: AnalysisStage[] = []
  const recorders: RecorderSpec[] = []
  const diagnostics: CompileDiagnostic[] = []
  const stageIds = new Set<string>()
  const recorderIds = new Set<string>()

  function visit(cmd: AnalysisCommand, index: number) {
    if (cmd.type === 'SCRIPT_GROUP') {
      cmd.commands.forEach((c) => visit(c, index))
      return
    }
    if (cmd.type === 'ANALYSIS_OPS') {
      diagnostics.push({
        severity: 'warning',
        message: `ops.${cmd.fn}(...) is script-export only and was not included in the Carapace analysis sequence`,
        commandIndex: index,
      })
      return
    }
    // ANALYSIS_BLOCK
    const block = getAnalysisBlock(cmd.blockId)
    if (!block) {
      diagnostics.push({ severity: 'error', message: `Unknown analysis block "${cmd.blockId}"`, commandIndex: index })
      return
    }
    if (block.toStage) {
      const stage = block.toStage(cmd.params, model)
      stages.push({ ...stage, id: dedupeId(stage.id, stageIds) })
    } else if (!block.toRecorders) {
      diagnostics.push({ severity: 'warning', message: `Block "${block.label}" has no Carapace equivalent and was skipped`, commandIndex: index })
    }
    if (block.toRecorders) {
      for (const rec of block.toRecorders(cmd.params, model)) {
        recorders.push({ ...rec, id: dedupeId(rec.id, recorderIds) })
      }
    }
  }

  history.commands.slice(0, history.cursor + 1).forEach((cmd, i) => visit(cmd, i))

  return { sequence: { version: 1, stages, recorders }, diagnostics }
}
