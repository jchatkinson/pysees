import { hideFromDevTools, type SceneIndex } from './sceneIndex'
import type { WallMemberForce } from '@/app/lib/studBuilding'

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

  /** Stud-wall member forces at the shown step (axial view, members mode), by wall element id; the extruded view colours the framing by them. */
  wallMembers: Map<number, WallMemberForce[]> | null = null
  wallMembersVersion = 0

  private readonly undeformed: Float32Array
  /** Called after every change, so an on-demand canvas draws the new contents. */
  onChange: (() => void) | null = null

  constructor(index: SceneIndex) {
    this.undeformed = index.nodeCoords
    this.nodePositions = new Float32Array(index.nodeCoords)
    this.contourColors = new Float32Array(index.nodeIds.length * 3)
    this.deformedSegments = new Float32Array(index.segmentCount * 6)
    // Stud walls add bars of their own (a pier's or every member's): room for 64 per wall beyond the line segments.
    const extra = 64 * index.studWalls.length
    this.diagramFill = new Float32Array((index.segmentCount + extra) * 18)
    this.diagramFillColor = new Float32Array((index.segmentCount + extra) * 18)
    // One outline segment per fill segment, plus two closing ties per element (three per wall bar).
    this.diagramLines = new Float32Array((index.segmentCount + 2 * index.elementIds.length + 3 * extra) * 6)
    hideFromDevTools(this)
  }

  /** Call after writing `nodePositions` / `deformedSegments` (and `contourColors` when `contour`). */
  publish(nodeLabels: NodeLabel[] = [], contour = false): void {
    this.nodeLabels = nodeLabels
    this.active = true
    this.contourActive = contour
    this.version++
    this.onChange?.()
  }

  /** Back to the undeformed shape. */
  reset(): void {
    if (!this.active) return
    this.active = false
    this.contourActive = false
    this.nodeLabels = []
    this.nodePositions.set(this.undeformed)
    this.version++
    this.onChange?.()
  }

  /** Call after `fillDiagram` wrote the diagram arrays. */
  publishDiagram(result: DiagramResult): void {
    this.diagramFillVertices = result.fillVertices
    this.diagramLineSegments = result.lineSegments
    this.diagramLabels = result.labels
    this.diagramActive = true
    this.diagramVersion++
    this.onChange?.()
  }

  publishWallMembers(members: Map<number, WallMemberForce[]> | null): void {
    if (!members && !this.wallMembers) return
    this.wallMembers = members
    this.wallMembersVersion++
    this.onChange?.()
  }

  resetDiagram(): void {
    if (!this.diagramActive) return
    this.diagramActive = false
    this.diagramVersion++
    this.onChange?.()
  }
}
