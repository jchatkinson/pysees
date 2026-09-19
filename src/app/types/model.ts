export interface ModelConfig { ndm: 2 | 3; ndf: number }

export interface NodeEntity { id: number; coords: number[] }
export interface MassEntity { nodeId: number; values: number[] }
export interface MaterialEntity { id: number; kind: 'uniaxial' | 'nD'; matType: string; args: Record<string, unknown> }
export interface FiberSectionItem { kind: 'fiber' | 'patch' | 'layer'; subType: string; args: Record<string, unknown> }
/** Present when a Fiber section's children were last (re)generated from the Section Editor's parametric templates — lets the dialog reopen straight into the template form. Cleared once a user hand-edits a child. */
export interface SectionTemplateMeta { kind: 'rect' | 'circle' | 'i' | 'c' | 'l' | 'tube'; params: Record<string, unknown> }
export interface SectionEntity { id: number; secType: string; args: Record<string, unknown>; children: FiberSectionItem[]; template?: SectionTemplateMeta } // children only meaningful for 'Fiber'/'NDFiber' secType
export interface GeomTransfEntity { id: number; transfType: string; args: Record<string, unknown> }
export interface BeamIntegrationEntity { id: number; intType: string; args: Record<string, unknown> }
export interface ElementEntity { id: number; eleType: string; nodes: number[]; args: Record<string, unknown> }
export interface FixEntity { nodeId: number; dofs: number[] }
export interface MPConstraintEntity { id: number; kind: 'equalDOF' | 'equalDOF_Mixed' | 'rigidDiaphragm' | 'rigidLink'; args: Record<string, unknown> }
export interface RegionEntity { id: number; args: Record<string, unknown> }
export interface TimeSeriesEntity { id: number; tsType: string; args: Record<string, unknown> }
export interface LoadAssignment { kind: 'load' | 'eleLoad' | 'sp'; args: Record<string, unknown> }
export interface PatternEntity { id: number; patternType: string; args: Record<string, unknown>; children: LoadAssignment[] }
/** Catch-all for model-domain OpenSeesPy functions without a dedicated typed map (frictionModel, block2D/3D, mesh, groundMotion, ...) */
export interface MiscEntity { id: number; fn: string; args: Record<string, unknown> }

export interface Model {
  config: ModelConfig | null
  nodes: Map<number, NodeEntity>
  masses: Map<number, MassEntity>
  materials: Map<number, MaterialEntity>
  sections: Map<number, SectionEntity>
  geomTransfs: Map<number, GeomTransfEntity>
  beamIntegrations: Map<number, BeamIntegrationEntity>
  elements: Map<number, ElementEntity>
  fixes: Map<number, FixEntity>
  mpConstraints: Map<number, MPConstraintEntity>
  regions: Map<number, RegionEntity>
  timeSeries: Map<number, TimeSeriesEntity>
  patterns: Map<number, PatternEntity>
  misc: Map<number, MiscEntity>
  nextIds: Record<ModelEntityKind, number>
}

export type ModelEntityKind =
  | 'node' | 'material' | 'section' | 'geomTransf' | 'beamIntegration' | 'element'
  | 'mpConstraint' | 'region' | 'timeSeries' | 'pattern' | 'misc'

export function emptyModel(): Model {
  return {
    config: null,
    nodes: new Map(),
    masses: new Map(),
    materials: new Map(),
    sections: new Map(),
    geomTransfs: new Map(),
    beamIntegrations: new Map(),
    elements: new Map(),
    fixes: new Map(),
    mpConstraints: new Map(),
    regions: new Map(),
    timeSeries: new Map(),
    patterns: new Map(),
    misc: new Map(),
    nextIds: {
      node: 1, material: 1, section: 1, geomTransf: 1, beamIntegration: 1, element: 1,
      mpConstraint: 1, region: 1, timeSeries: 1, pattern: 1, misc: 1,
    },
  }
}

export interface ResultsState {
  files: { name: string; data: string }[]
}

export type AppMode = 'model' | 'results'
