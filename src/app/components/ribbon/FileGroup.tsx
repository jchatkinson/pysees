import { useRef, useState } from 'react'
import { FileInput, FileOutput, FilePlus, FolderOpen, Save } from 'lucide-react'
import { Separator } from '@/app/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/app/components/ui/alert-dialog'
import { useAppStore } from '@/app/store/useAppStore'
import { downloadScript } from '@/app/lib/exportScript'
import { readScriptFile } from '@/app/lib/project/open'
import { downloadProject } from '@/app/lib/project/save'
import { ImportScriptDialog, type ImportPreview } from '@/app/components/ImportScriptDialog'
import { RibbonAction } from './parts'

const MAX_IMPORT_BYTES = 5_000_000

/** The File tab's buttons: new / open / save / import / export, with the confirm and import dialogs they need. */
export function FileGroup({ compact }: { compact: boolean }) {
  const model = useAppStore((s) => s.model)
  const analysisHistory = useAppStore((s) => s.analysisHistory)
  const newModel = useAppStore((s) => s.newModel)
  const initModel = useAppStore((s) => s.initModel)
  const loadProject = useAppStore((s) => s.loadProject)
  const projectFileName = useAppStore((s) => s.projectFileName)
  const [newModelConfirmOpen, setNewModelConfirmOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const openInput = useRef<HTMLInputElement>(null)
  const pickScript = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) return window.alert(`${file.name} is too large to import (limit ${MAX_IMPORT_BYTES / 1e6} MB).`)
    setImportPreview({ fileName: file.name, result: readScriptFile(await file.text(), file.name) })
  }

  return (
    <>
      <div className={compact ? 'flex items-center gap-0.5' : 'flex items-center gap-0.5 h-11'}>
        <RibbonAction compact={compact} label="New" tip="New model" icon={FilePlus} onClick={() => (model.config ? setNewModelConfirmOpen(true) : newModel())} />
        <RibbonAction compact={compact} label="Open" tip="Open a saved project (.py)" icon={FolderOpen} onClick={() => openInput.current?.click()} />
        <RibbonAction compact={compact} label="Save" tip="Save the project (.py)" icon={Save} disabled={!model.config} onClick={() => downloadProject(useAppStore.getState(), projectFileName)} />
        <Separator orientation="vertical" className="mx-1 self-stretch" />
        <RibbonAction compact={compact} label="Import" tip="Import an OpenSees .tcl / .py script" icon={FileInput} onClick={() => fileInput.current?.click()} />
        <RibbonAction compact={compact} label="Export .tcl" tip={model.building ? 'Export unavailable (Carapace only)' : 'Export an OpenSees .tcl script'} icon={FileOutput} disabled={!model.config || !!model.building} onClick={() => downloadScript(model, analysisHistory, 'tcl')} />
      </div>
      <input ref={openInput} type="file" accept=".py,.txt" className="hidden" onChange={(e) => { void pickScript(e.target.files?.[0]); e.target.value = '' }} />
      <input ref={fileInput} type="file" accept=".tcl,.py,.txt" className="hidden" onChange={(e) => { void pickScript(e.target.files?.[0]); e.target.value = '' }} />
      <ImportScriptDialog
        preview={importPreview}
        replacing={!!model.config && (model.nodes.size > 0 || model.elements.size > 0)}
        onCancel={() => setImportPreview(null)}
        onConfirm={(r) => { if (r.project) loadProject(r.project, importPreview?.fileName); else initModel(r.ndm, r.ndf, { writes: r.writes }); setImportPreview(null) }}
      />
      <AlertDialog open={newModelConfirmOpen} onOpenChange={setNewModelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new model?</AlertDialogTitle>
            <AlertDialogDescription>This clears the current model, history, and results. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { newModel(); setNewModelConfirmOpen(false) }}>New Model</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
