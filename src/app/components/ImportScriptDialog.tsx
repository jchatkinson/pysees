import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { ScrollArea } from '@/app/components/ui/scroll-area'
import type { ImportResult } from '@/app/lib/scriptImport'

const ICON = { error: AlertCircle, warning: AlertTriangle, info: Info }
const TONE = { error: 'text-destructive', warning: 'text-amber-600 dark:text-amber-400', info: 'text-muted-foreground' }

export interface ImportPreview { fileName: string; result: ImportResult }

/** Preview of a parsed Tcl / OpenSeesPy script: what would be created and what was skipped. Importing replaces the current model. */
export function ImportScriptDialog({ preview, replacing, onCancel, onConfirm }: { preview: ImportPreview | null; replacing: boolean; onCancel: () => void; onConfirm: (result: ImportResult) => void }) {
  const result = preview?.result
  const counts = Object.entries(result?.counts ?? {})
  const errors = result?.diagnostics.filter((d) => d.severity === 'error').length ?? 0
  return (
    <Dialog open={!!preview} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import {preview?.fileName}</DialogTitle>
          <DialogDescription>
            Read as {result?.language === 'tcl' ? 'OpenSees Tcl' : 'OpenSeesPy'}, {result?.ndm}D with {result?.ndf} DOF per node. The script is read, not run: constants and arithmetic are substituted, loops and procedures are skipped.
          </DialogDescription>
        </DialogHeader>
        {counts.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {counts.map(([label, n]) => <span key={label}><span className="font-medium tabular-nums">{n}</span> <span className="text-muted-foreground">{label.toLowerCase()}</span></span>)}
          </div>
        ) : (
          <p className="text-sm text-destructive">Nothing importable was found in this script.</p>
        )}
        {result && result.diagnostics.length > 0 && (
          <ScrollArea className="h-56 border rounded-sm">
            <ul className="p-2 space-y-1.5 text-xs">
              {result.diagnostics.map((d, i) => {
                const Icon = ICON[d.severity]
                return (
                  <li key={i} className="flex gap-2">
                    <Icon className={`size-3.5 mt-px shrink-0 ${TONE[d.severity]}`} />
                    <span>{d.line ? <span className="text-muted-foreground tabular-nums">line {d.line} · </span> : null}{d.message}</span>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        )}
        {replacing && <p className="text-xs text-muted-foreground">Importing replaces the current model, analysis history and results.</p>}
        {errors > 0 && <p className="text-xs text-muted-foreground">{errors} command{errors === 1 ? '' : 's'} could not be imported; everything else will be.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!result || result.writes.length === 0} onClick={() => result && onConfirm(result)}>{replacing ? 'Replace model' : 'Import'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
