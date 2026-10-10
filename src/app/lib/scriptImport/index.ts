import { buildModel } from '@/app/lib/scriptImport/build'
import { parsePython } from '@/app/lib/scriptImport/python'
import { parseTcl } from '@/app/lib/scriptImport/tcl'
import type { ImportDiagnostic, ImportResult } from '@/app/lib/scriptImport/types'

export type { ImportDiagnostic, ImportResult } from '@/app/lib/scriptImport/types'

/** `.tcl` / `.py` by extension, otherwise by content (OpenSeesPy scripts import `openseespy` or call `ops.`). */
export function detectLanguage(text: string, filename = ''): 'tcl' | 'py' {
  if (/\.tcl$/i.test(filename)) return 'tcl'
  if (/\.py$/i.test(filename)) return 'py'
  return /^\s*(import|from)\s+openseespy|\bops\.\w+\(/m.test(text) ? 'py' : 'tcl'
}

/**
 * Reads an OpenSees Tcl or OpenSeesPy script into PySees model writes. The script is parsed, never executed: constants
 * and arithmetic are substituted, but loops, conditionals and procedures are reported and skipped.
 */
export function importScript(text: string, filename = ''): ImportResult {
  const language = detectLanguage(text, filename)
  const skipped: ImportDiagnostic[] = []
  // Exported runtime calculations are analysis only. Preserve line numbers while skipping
  // the explicitly delimited block; model import never executes an eigensolve.
  const modelText = text.replace(/^[ \t]*# PySees: modal damping begin\r?\n[\s\S]*?^[ \t]*# PySees: modal damping end[ \t]*\r?$/gm, (block, offset: number) => {
    skipped.push({ severity: 'info', message: 'Modal damping calculation skipped (model import only).', line: text.slice(0, offset).split('\n').length })
    return block.replace(/[^\r\n]/g, ' ')
  })
  const { calls, diagnostics } = language === 'tcl' ? parseTcl(modelText) : parsePython(modelText)
  return buildModel(calls, language, [...skipped, ...diagnostics])
}
