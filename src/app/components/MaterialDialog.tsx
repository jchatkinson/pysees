import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { useAppStore } from '@/app/store/useAppStore'
import { getSchemaForFn, initialValues, validateSchemaResult } from '@/app/lib/commandSchemas'
import type { SchemaResult } from '@/app/lib/commandSchemas'
import { CommandFormBody } from '@/app/components/CommandForm'

/** A focused "create a material" modal, openable mid-flow from anywhere (e.g. the Section Editor's material pickers) without disturbing whatever dialog opened it — it only ever writes a new material to the store and closes itself. */
export function MaterialDialog() {
  const open = useAppStore((s) => s.materialDialogOpen)
  const setOpen = useAppStore((s) => s.setMaterialDialogOpen)
  const model = useAppStore((s) => s.model)
  const writeModelEntity = useAppStore((s) => s.writeModelEntity)
  const setMaterialPreviewInputMaterial = useAppStore((s) => s.setMaterialPreviewInputMaterial)
  const setMaterialPreviewPanelOpen = useAppStore((s) => s.setMaterialPreviewPanelOpen)
  const ndm = model.config?.ndm ?? 3
  const ndf = model.config?.ndf ?? 6
  const ctx = { ndm, ndf }
  const schema = getSchemaForFn('uniaxialMaterial', ndm)

  if (!schema) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>New Material</DialogTitle>
        </DialogHeader>
        <CommandFormBody
          key={open ? 'open' : 'closed'}
          schema={schema}
          ctx={ctx}
          locked={false}
          actionLabel="Create"
          initial={initialValues(schema, ctx, model)}
          onCancel={() => setOpen(false)}
          onValuesChange={(values) => setMaterialPreviewInputMaterial({ matType: String(values.matType ?? ''), values })}
          previewAction={{ onClick: () => setMaterialPreviewPanelOpen(true) }}
          submitValues={(values) => {
            const result: SchemaResult = schema.create(values, model)
            if (result.target !== 'model') return 'Internal error: expected a model write.'
            const err = validateSchemaResult(result, model, ctx)
            if (err) return err
            writeModelEntity(result.write)
            setOpen(false)
            return null
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
