import { buildModel } from '@/app/lib/scriptImport/build'
import { parsePython } from '@/app/lib/scriptImport/python'
import { parseTcl } from '@/app/lib/scriptImport/tcl'
import type { ImportResult } from '@/app/lib/scriptImport/types'

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
  const { calls, diagnostics } = language === 'tcl' ? parseTcl(text) : parsePython(text)
  return buildModel(calls, language, diagnostics)
}
