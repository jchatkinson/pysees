import { useCallback, useState } from 'react'
import type { FiberSectionItem, SectionEntity } from '@/app/types/model'
import type { SectionTemplateKind } from '@/app/lib/sections/types'
import { SECTION_TEMPLATES } from '@/app/lib/sections/templates'

export interface SectionDraft {
  templateKind: SectionTemplateKind | null
  templateParams: Record<string, unknown> | null
  children: FiberSectionItem[]
}

function initialDraft(existing: SectionEntity | null): SectionDraft {
  if (existing?.template) {
    const tpl = SECTION_TEMPLATES[existing.template.kind]
    return { templateKind: existing.template.kind, templateParams: existing.template.params, children: tpl.children(existing.template.params) }
  }
  if (existing) return { templateKind: null, templateParams: null, children: existing.children }
  const tpl = SECTION_TEMPLATES.rect
  return { templateKind: 'rect', templateParams: tpl.defaultParams, children: tpl.children(tpl.defaultParams) }
}

/** Owns the section being built/edited entirely in local state — nothing is written to the store until the dialog's Save button fires, so Cancel is free and undo/redo sees exactly one entry per save. */
export function useSectionDraft(existing: SectionEntity | null) {
  const [draft, setDraft] = useState<SectionDraft>(() => initialDraft(existing))

  const applyTemplate = useCallback((kind: SectionTemplateKind) => {
    const tpl = SECTION_TEMPLATES[kind]
    setDraft({ templateKind: kind, templateParams: tpl.defaultParams, children: tpl.children(tpl.defaultParams) })
  }, [])

  const setTemplateParams = useCallback((params: Record<string, unknown>) => {
    setDraft((prev) => {
      if (!prev.templateKind) return prev
      const tpl = SECTION_TEMPLATES[prev.templateKind]
      return { templateKind: prev.templateKind, templateParams: params, children: tpl.children(params) }
    })
  }, [])

  const addChild = useCallback((child: FiberSectionItem) => {
    setDraft((prev) => ({ templateKind: null, templateParams: null, children: [...prev.children, child] }))
  }, [])

  const updateChild = useCallback((index: number, child: FiberSectionItem) => {
    setDraft((prev) => ({ templateKind: null, templateParams: null, children: prev.children.map((c, i) => (i === index ? child : c)) }))
  }, [])

  const removeChild = useCallback((index: number) => {
    setDraft((prev) => ({ templateKind: null, templateParams: null, children: prev.children.filter((_, i) => i !== index) }))
  }, [])

  return { draft, applyTemplate, setTemplateParams, addChild, updateChild, removeChild }
}
