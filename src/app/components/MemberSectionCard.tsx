import { Button } from '@/app/components/ui/button'
import { SectionPreview } from '@/app/components/sections/SectionPreview'
import { useAppStore } from '@/app/store/useAppStore'
import type { ElementEntity } from '@/app/types/model'
import { memberSection } from '@/app/lib/editor/memberShape'
import { sectionName } from '@/app/lib/editor/properties'

/** For a selected fiber member: its section's fibers, patches and layers (the detail the extruded view leaves out), and a way to edit it. */
export function MemberSectionCard({ element }: { element: ElementEntity }) {
  const model = useAppStore((s) => s.model)
  const openSectionDialog = useAppStore((s) => s.openSectionDialog)
  const sec = memberSection(model, element)
  if (!sec || sec.children.length === 0) return null
  return (
    <div className="grid gap-1.5 border-b px-3 py-2 shrink-0">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{sectionName(model, sec.id)}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => openSectionDialog(sec.id)}>Edit section…</Button>
      </div>
      <div className="h-40"><SectionPreview children={sec.children} /></div>
    </div>
  )
}
