import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog'
import { Input } from '@/app/components/ui/input'
import { Field, FieldLabel } from '@/app/components/ui/field'
import { Button } from '@/app/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { useAppStore } from '@/app/store/useAppStore'
import { useSectionDraft } from '@/app/components/sections/useSectionDraft'
import { TemplatePicker } from '@/app/components/sections/TemplatePicker'
import { ChildRowList } from '@/app/components/sections/ChildRowList'
import { SectionPreview } from '@/app/components/sections/SectionPreview'
import { sectionGeometryError } from '@/app/lib/sections/validate'
import { defaultMaterialId } from '@/app/lib/sections/templates'
import { circPatch, rectPatch, singleFiber } from '@/app/lib/sections/discretize'
import type { SectionEntity } from '@/app/types/model'

function SectionDialogBody({ editingId, onClose }: { editingId: number | null; onClose: () => void }) {
  const model = useAppStore((s) => s.model)
  const writeModelEntity = useAppStore((s) => s.writeModelEntity)
  const deleteModelEntity = useAppStore((s) => s.deleteModelEntity)
  const existing = editingId !== null ? (model.sections.get(editingId) ?? null) : null
  const { draft, applyTemplate, setTemplateParams, updateChild, removeChild, addChild } = useSectionDraft(existing, model.materials, model.config?.ndm ?? 2)
  const [tab, setTab] = useState<'template' | 'children'>(draft.templateKind ? 'template' : 'children')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [gj, setGj] = useState(String(existing?.args.gJ ?? ''))
  const needsTorsion = model.config?.ndm === 3 && !existing?.args.torsionMatTag
  const invalidTorsion = needsTorsion && !(Number(gj) > 0 && Number.isFinite(Number(gj)))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const missingMaterial = useMemo(
    () => draft.children.some((c) => model.materials.get(Number(c.args.matTag))?.kind !== 'uniaxial'),
    [draft.children, model.materials],
  )

  const geometryError = sectionGeometryError(draft.children, draft.templateParams)

  function handleSave() {
    const id = existing?.id ?? model.nextIds.section
    const entity: SectionEntity = {
      id,
      secType: 'Fiber',
      args: { ...existing?.args, secTag: id, type: 'Fiber', ...(needsTorsion ? { gJ: Number(gj) } : {}) },
      children: draft.children,
      template: draft.templateKind && draft.templateParams ? { kind: draft.templateKind, params: draft.templateParams } : undefined,
    }
    writeModelEntity({ kind: 'section', entity })
    onClose()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? `Edit Section #${existing.id}` : 'New Fiber Section'}</DialogTitle>
      </DialogHeader>
      <div className="flex h-[min(640px,calc(100dvh-12rem))] min-h-[260px] gap-4 items-stretch">
        <div className="flex-1 min-w-80 min-h-0 overflow-y-auto pr-1">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'template' | 'children')}>
            <TabsList>
              <TabsTrigger value="template">Template</TabsTrigger>
              <TabsTrigger value="children">Fibers & Patches ({draft.children.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="template">
              <TemplatePicker
                kind={draft.templateKind}
                params={draft.templateParams}
                onSelectKind={applyTemplate}
                onChangeParams={setTemplateParams}
              />
            </TabsContent>
            <TabsContent value="children">
              <ChildRowList
                children={draft.children}
                hoveredIndex={hoveredIndex}
                onHoverChild={setHoveredIndex}
                onUpdateChild={updateChild}
                onRemoveChild={removeChild}
                onAdd={(k) => addChild(k === 'fiber' ? singleFiber(defaultMaterialId(model.materials, 'steel'), 0, 0, 0.0001) : k === 'rect' ? rectPatch(defaultMaterialId(model.materials, 'concrete'), -0.1, -0.1, 0.1, 0.1, 4, 4) : circPatch(defaultMaterialId(model.materials, 'concrete'), 0, 0, 0, 0.1, 8, 4))}
              />
            </TabsContent>
          </Tabs>
        </div>
        <SectionPreview children={draft.children} hoveredIndex={hoveredIndex} onHoverChild={setHoveredIndex} />
      </div>
      {needsTorsion && <Field data-invalid={invalidTorsion}>
        <FieldLabel htmlFor="section-gj">Torsional stiffness GJ</FieldLabel>
        <Input id="section-gj" type="number" min={0} value={gj} onChange={(e) => setGj(e.target.value)} aria-invalid={invalidTorsion} placeholder="Required for 3D fiber sections" />
      </Field>}
      {missingMaterial && <p className="text-[11px] text-destructive">Select a defined uniaxial material for every concrete patch, steel patch, and reinforcing bar.</p>}
      {geometryError && <p role="alert" className="text-xs text-destructive">{geometryError}</p>}
      <DialogFooter>
        {existing && !confirmDelete && (
          <Button variant="destructive" size="sm" className="mr-auto" onClick={() => setConfirmDelete(true)}>Delete</Button>
        )}
        {existing && confirmDelete && (
          <div className="mr-auto flex items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">Delete this section?</span>
            <Button variant="destructive" size="sm" onClick={() => { deleteModelEntity('section', existing.id); onClose() }}>Confirm</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={invalidTorsion || !!geometryError || missingMaterial || draft.children.length === 0}>Save</Button>
      </DialogFooter>
    </>
  )
}

export function SectionDialog() {
  const open = useAppStore((s) => s.sectionDialog.open)
  const editingId = useAppStore((s) => s.sectionDialog.editingId)
  const closeSectionDialog = useAppStore((s) => s.closeSectionDialog)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) closeSectionDialog() }}>
      <DialogContent className="sm:max-w-4xl">
        {open && <SectionDialogBody key={editingId ?? 'new'} editingId={editingId} onClose={closeSectionDialog} />}
      </DialogContent>
    </Dialog>
  )
}
