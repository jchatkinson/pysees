import { useEffect, useMemo } from 'react'
import { useAppStore } from '@/app/store/useAppStore'
import { useResultsSource } from '@/app/lib/resultsStorage/useResultsSource'
import { useModalResults } from '@/app/lib/resultsStorage/useModalResults'
import { useCurrentCase } from '@/app/lib/resultsStorage/useCases'
import { modeTranslationPeak, nodeRows, readModeShape } from '@/app/lib/modal'
import { autoModeScale, autoScale, modelMetrics } from '@/app/lib/resultsScale'
import type { DisplayBuffers } from './displayBuffers'
import { createNodeDisplacements, displaceNodes, fillDeformedSegments, nodeValueLabels, readNodeDisplacements } from './displaced'
import { fillDiagram } from './diagrams'
import type { SceneIndex } from './sceneIndex'

/** `out = a + t (b - a)`, element-wise. */
function blendRows(a: Float64Array, b: Float64Array, t: number, out: Float64Array): Float64Array {
  for (let i = 0; i < out.length; i++) out[i] = a[i] + t * (b[i] - a[i])
  return out
}

/**
 * Renders nothing: watches the results view (run, step, type, scale) and writes the displayed
 * result into `buffers`. Lives in its own component so per-step changes re-render only this, not the scene.
 */
export function ResultsDriver({ index, buffers }: { index: SceneIndex; buffers: DisplayBuffers }) {
  const runId = useAppStore((s) => s.resultsView.runId)
  const step = useAppStore((s) => s.resultsView.step)
  const stepFrac = useAppStore((s) => s.resultsView.stepFrac)
  const type = useAppStore((s) => s.resultsView.type)
  const manualScale = useAppStore((s) => (s.resultsView.type === 'none' ? null : s.resultsView.scales[s.resultsView.type]))
  const modeIndex = useAppStore((s) => s.resultsView.mode)
  const phase = useAppStore((s) => s.resultsView.phase)
  const showValues = useAppStore((s) => s.resultsView.showValues)
  const model = useAppStore((s) => s.model)
  const source = useResultsSource(runId)
  const modal = useModalResults(type === 'mode' ? runId : null)
  const { current, series } = useCurrentCase()
  // Autoscale from the selected case alone: a gravity case and a pushover case differ by orders of magnitude.
  const first = series?.first
  const last = series ? series.first + series.count - 1 : undefined
  const rows = useMemo(() => nodeRows(modal?.nodeTags ?? []), [modal])
  const metrics = useMemo(() => modelMetrics(model), [model])
  const planar = model.config?.ndm === 2
  const nodeDisplacements = useMemo(() => createNodeDisplacements(index.nodeIds.length), [index])

  const blendedRow = useMemo(() => (source ? new Float64Array(source.layout.stride) : null), [source])
  const diagramArrays = useMemo(() => ({ fill: buffers.diagramFill, fillColor: buffers.diagramFillColor, lines: buffers.diagramLines }), [buffers])

  useEffect(() => {
    if (type === 'mode') return // drawn by the mode-shape effect below
    if (type === 'none' || !source) { buffers.reset(); buffers.resetDiagram(); return }
    let live = true
    // Smooth playback sits between two steps: blend their rows (linear in every recorded column).
    const next = stepFrac > 0 && blendedRow ? source.get(step + 1) : Promise.resolve(null)
    Promise.all([source.get(step), next, source.extents(first === undefined || last === undefined ? undefined : { first, last })]).then(([frame, nextFrame, extents]) => {
      if (!live) return
      if (!frame) { buffers.reset(); buffers.resetDiagram(); return }
      const row = nextFrame && blendedRow ? blendRows(frame.row, nextFrame.row, stepFrac, blendedRow) : frame.row
      const scale = manualScale ?? autoScale(type, extents, metrics)
      if (type === 'deformed') {
        readNodeDisplacements(index, source.layout, row, nodeDisplacements)
        displaceNodes(index, nodeDisplacements, scale, buffers.nodePositions)
        fillDeformedSegments(index, nodeDisplacements, scale, planar, buffers.deformedSegments)
        buffers.publish(showValues ? nodeValueLabels(index, source.layout, row, buffers.nodePositions) : [])
        buffers.resetDiagram()
      } else {
        // Diagrams sit on the undeformed shape.
        buffers.reset()
        buffers.publishDiagram(planar ? fillDiagram(index, source.layout, row, type, scale, diagramArrays) : { fillVertices: 0, lineSegments: 0, labels: [] })
      }
    }).catch(() => { if (live) { buffers.reset(); buffers.resetDiagram() } })
    return () => { live = false }
  }, [index, buffers, source, type, step, stepFrac, blendedRow, manualScale, showValues, metrics, planar, nodeDisplacements, diagramArrays, first, last])

  // Mode shapes: the stored shape scaled by cos(phase), through the same deformed-shape drawing as a step's displacements.
  useEffect(() => {
    if (type !== 'mode') return
    const stage = current?.kind === 'modal' ? modal?.stages.find((s) => s.stageIndex === current.stageIndex) : undefined
    const mode = stage?.modes[modeIndex]
    if (!stage || !mode) { buffers.reset(); buffers.resetDiagram(); return }
    const scale = (manualScale ?? autoModeScale(modeTranslationPeak(stage, mode), metrics)) * Math.cos(phase)
    readModeShape(index, rows, stage, mode, nodeDisplacements)
    displaceNodes(index, nodeDisplacements, scale, buffers.nodePositions)
    fillDeformedSegments(index, nodeDisplacements, scale, planar, buffers.deformedSegments)
    buffers.publish([])
    buffers.resetDiagram()
  }, [index, buffers, type, modal, rows, current, modeIndex, phase, manualScale, metrics, planar, nodeDisplacements])

  // Leaving the scene (or a new index) must not leave stale displaced nodes behind.
  useEffect(() => () => { buffers.reset(); buffers.resetDiagram() }, [buffers])

  return null
}
