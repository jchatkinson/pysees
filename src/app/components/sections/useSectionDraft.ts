import { useCallback, useState } from 'react'
import type { FiberSectionItem, SectionEntity, MaterialEntity } from '@/app/types/model'
import type { SectionTemplateKind } from '@/app/lib/sections/types'
import { SECTION_TEMPLATES, templateDefaults, normalizeTemplateParams } from '@/app/lib/sections/templates'

export interface SectionDraft {
  templateKind: SectionTemplateKind | null
  templateParams: Record<string, unknown> | null
  children: FiberSectionItem[]
}

function initialDraft(existing: SectionEntity | null, materials: Map<number, MaterialEntity>, ndm: 2 | 3): SectionDraft {
  if (existing?.template) {
    const params = normalizeTemplateParams(existing.template.kind, existing.template.params)
    return { templateKind: existing.template.kind, templateParams: params, children: ['concreteC', 'concreteI', 'concreteL'].includes(existing.template.kind) ? SECTION_TEMPLATES[existing.template.kind].children(params) : existing.children }
  }
  if (existing) return { templateKind: null, templateParams: null, children: existing.children }
  const tpl = SECTION_TEMPLATES.rect
  const params = templateDefaults('rect', materials, ndm)
  return { templateKind: 'rect', templateParams: params, children: tpl.children(params) }
}

/** Owns the section being built/edited entirely in local state — nothing is written to the store until the dialog's Save button fires, so Cancel is free and undo/redo sees exactly one entry per save. */
export function useSectionDraft(existing: SectionEntity | null, materials: Map<number, MaterialEntity>, ndm: 2 | 3) {
  const [draft, setDraft] = useState<SectionDraft>(() => initialDraft(existing, materials, ndm))

  const applyTemplate = useCallback((kind: SectionTemplateKind, geometry?: Record<string, unknown>) => {
    const tpl = SECTION_TEMPLATES[kind]
    setDraft((prev) => {
      const defaults = templateDefaults(kind, materials, ndm)
      const retained = geometry && prev.templateKind && SECTION_TEMPLATES[prev.templateKind].family === 'steel' ? prev.templateParams : null
      const params = { ...defaults, ...(prev.templateKind === kind && geometry ? retained : {}), ...geometry }
      if (retained) for (const key of ['matId', 'nWebY', 'nWebZ', 'nFlangeY', 'nFlangeZ', 'nSubdivCirc', 'nSubdivRad']) {
        if (key in defaults && key in retained) params[key] = retained[key]
      }
      if (geometry) params.depthAxis = 'y'
      return { templateKind: kind, templateParams: params, children: tpl.children(params) }
    })
  }, [materials, ndm])

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
