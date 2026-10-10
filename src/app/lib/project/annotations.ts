import type { Call } from '@/app/lib/commands/tokens'

/** Version of the `# @pysees` annotation format. Opening refuses files from a newer version. */
export const PROJECT_VERSION = 1

/** JSON with sorted object keys, so saving the same project always prints the same text. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))
}

export type DirectiveName = 'project' | 'layout' | 'report' | 'display' | 'entity' | 'generated' | 'analysis'
export const DIRECTIVES: readonly DirectiveName[] = ['project', 'layout', 'report', 'display', 'entity', 'generated', 'analysis']

/** One `# @pysees <name> [begin|end] [json]` line as a verbatim comment call. */
export const directive = (name: DirectiveName, json?: unknown, mode?: 'begin' | 'end'): Call =>
  ({ fn: '#', args: [['@pysees', name, mode, json === undefined ? undefined : stableStringify(json)].filter(Boolean).join(' ')] })

/** Matches a directive line; group 1 is the name, 2 `begin`/`end`, 3 the JSON text. */
export const DIRECTIVE_LINE = /^\s*#\s*@pysees\s+(\w+)(?:\s+(begin|end)\b)?\s*(.*?)\s*$/
