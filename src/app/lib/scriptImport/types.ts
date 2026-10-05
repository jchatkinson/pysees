import type { Val } from '@/app/lib/scriptImport/expr'
import type { ModelWrite } from '@/app/lib/modelWrite'
import type { Model } from '@/app/types/model'

/** One OpenSees command found in a script, with constants already substituted. */
/** `comment` is a full-line `#` comment directly above the command (the exporter writes a pattern's name that way). */
export interface ParsedCall { fn: string; args: Val[]; line: number; comment?: string }

export interface ImportDiagnostic { severity: 'error' | 'warning' | 'info'; message: string; line?: number }

export interface ParseResult { calls: ParsedCall[]; diagnostics: ImportDiagnostic[] }

export interface ImportResult {
  language: 'tcl' | 'py'
  ndm: 2 | 3
  ndf: number
  writes: ModelWrite[]
  /** The model those writes build, for callers that want it without replaying them. */
  model: Model
  diagnostics: ImportDiagnostic[]
  /** Entity counts for the preview, e.g. `{ Nodes: 12, Elements: 11 }`. */
  counts: Record<string, number>
}
