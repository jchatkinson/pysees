import type { SceneIndex } from './sceneIndex'

export interface NodeLabel {
  position: [number, number, number]
  /** Display text; may contain newlines. */
  text: string
}

export interface DiagramLabel {
  position: [number, number, number]
  value: number
}

/** What `fillDiagram` produced: counts of the compacted data written into the diagram buffers, and the value labels. */
export interface DiagramResult {
  fillVertices: number
  lineSegments: number
  labels: DiagramLabel[]
}

/**
 * Mutable per-scene buffers the results driver writes into and the node/element/diagram layers read in
 * `useFrame` — results change per step (and soon per animation frame), so they bypass React state.
 * Each family has a `version` that bumps whenever its contents change.
 */
export class DisplayBuffers {
  /** Node positions as displayed: the displaced shape while `active`, the undeformed coordinates otherwise. */
  readonly nodePositions: Float32Array
  /** Displaced element segments (`fillSegmentPositions` layout); only meaningful while `active`. */
  readonly deformedSegments: Float32Array
  /** Per-node displacement text for the deformed view (only filled when values are shown). */
  nodeLabels: NodeLabel[] = []
  active = false
  version = 0

  /** Shell contour: per-node rgb (`3 * nodeCount`), live while `contourActive`. */
  readonly contourColors: Float32Array
  contourActive = false

  /** Diagram fill triangles (xyz per vertex) and their per-vertex rgb; first `diagramFillVertices` vertices are live. */
  readonly diagramFill: Float32Array
  readonly diagramFillColor: Float32Array
  /** Diagram outline segments (`fillSegmentPositions` layout); first `diagramLineSegments` are live. */
  readonly diagramLines: Float32Array
  diagramFillVertices = 0
  diagramLineSegments = 0
  diagramLabels: DiagramLabel[] = []
  diagramActive = false
  diagramVersion = 0

  private readonly undeformed: Float32Array

  constructor(index: SceneIndex) {
    this.undeformed = index.nodeCoords
    this.nodePositions = new Float32Array(index.nodeCoords)
    this.contourColors = new Float32Array(index.nodeIds.length * 3)
    this.deformedSegments = new Float32Array(index.segmentCount * 6)
    this.diagramFill = new Float32Array(index.segmentCount * 18)
    this.diagramFillColor = new Float32Array(index.segmentCount * 18)
    // One outline segment per fill segment, plus two closing ties per element.
    this.diagramLines = new Float32Array((index.segmentCount + 2 * index.elementIds.length) * 6)
  }

  /** Call after writing `nodePositions` / `deformedSegments` (and `contourColors` when `contour`). */
  publish(nodeLabels: NodeLabel[] = [], contour = false): void {
    this.nodeLabels = nodeLabels
    this.active = true
    this.contourActive = contour
    this.version++
  }

  /** Back to the undeformed shape. */
  reset(): void {
    if (!this.active) return
    this.active = false
    this.contourActive = false
    this.nodeLabels = []
    this.nodePositions.set(this.undeformed)
    this.version++
  }

  /** Call after `fillDiagram` wrote the diagram arrays. */
  publishDiagram(result: DiagramResult): void {
    this.diagramFillVertices = result.fillVertices
    this.diagramLineSegments = result.lineSegments
    this.diagramLabels = result.labels
    this.diagramActive = true
    this.diagramVersion++
  }

  resetDiagram(): void {
    if (!this.diagramActive) return
    this.diagramActive = false
    this.diagramVersion++
  }
}
