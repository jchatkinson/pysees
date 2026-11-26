import { importScript, detectLanguage } from '@/app/lib/scriptImport'
import { isProjectText, parseProject } from '@/app/lib/project/parse'
import type { ImportResult } from '@/app/lib/scriptImport/types'

/** Reads a file chosen to open or import: a saved PySees project restores fully, any other script goes through the model-only importer. */
export function readScriptFile(text: string, filename = ''): ImportResult {
  return detectLanguage(text, filename) === 'py' && isProjectText(text) ? parseProject(text) : importScript(text, filename)
}

/** Whether a read file has anything to open. */
export const canImport = (result: ImportResult) => !!result.project || result.writes.length > 0

/** A same-origin path to a script (`/verification/plate.pysees.py`), or null for anything else: no other sites, no protocols. */
export function openPath(search: string): string | null {
  const path = new URLSearchParams(search).get('open')
  return path && /^\/(?!\/)[\w./-]+\.(py|tcl)$/.test(path) && !path.includes('..') ? path : null
}
