import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { useAppStore } from '@/app/store/useAppStore'
import { useSectionDraft } from '@/app/components/sections/useSectionDraft'
import { TemplatePicker } from '@/app/components/sections/TemplatePicker'
import { ChildRowList } from '@/app/components/sections/ChildRowList'
import { SectionPreview } from '@/app/components/sections/SectionPreview'
import { singleFiber } from '@/app/lib/sections/discretize'
import type { SectionEntity } from '@/app/types/model'

function SectionDialogBody({ editingId, onClose }: { editingId: number | null; onClose: () => void }) {
  const model = useAppStore((s) => s.model)
  const writeModelEntity = useAppStore((s) => s.writeModelEntity)
  const deleteModelEntity = useAppStore((s) => s.deleteModelEntity)
  const existing = editingId !== null ? (model.sections.get(editingId) ?? null) : null
  const { draft, applyTemplate, setTemplateParams, updateChild, removeChild, addChild } = useSectionDraft(existing)
  const [tab, setTab] = useState<'template' | 'children'>(draft.templateKind ? 'template' : 'children')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const missingMaterial = useMemo(
    () => draft.children.some((c) => !model.materials.has(Number(c.args.matTag))),
    [draft.children, model.materials],
  )

  function handleSave() {
    const id = existing?.id ?? model.nextIds.section
    const entity: SectionEntity = {
      id,
      secType: 'Fiber',
      args: { secTag: id, type: 'Fiber' },
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
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-80">
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
                onAddFiber={() => addChild(singleFiber(0, 0, 0, 0.0001))}
              />
            </TabsContent>
          </Tabs>
        </div>
        <SectionPreview children={draft.children} hoveredIndex={hoveredIndex} onHoverChild={setHoveredIndex} />
      </div>
      {missingMaterial && <p className="text-[11px] text-destructive">One or more fibers/patches reference a material that no longer exists — select a valid material for each.</p>}
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
        <Button size="sm" onClick={handleSave} disabled={missingMaterial || draft.children.length === 0}>Save</Button>
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
