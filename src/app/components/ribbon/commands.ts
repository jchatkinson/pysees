import type { LucideIcon } from 'lucide-react'
import {
  Undo2, Redo2, SquareDashedMousePointer, SquareDashed, Grid3x3, Ruler, ZoomIn, ZoomOut, Maximize2, CircleDot, Minus, Anchor, ArrowDown, ArrowDownToLine, Hash, Tag, Tags,
  Grid2x2, Layers, Rows3, Box, LayoutGrid, Building2, Square, ChevronUp, ChevronDown, Ghost, CircleOff, Spline, MoveHorizontal, Activity, RotateCw, Waves, Palette,
  BarChart3, ChartLine, Sigma, Trash2, Layers3, Cuboid, MousePointer2, PenLine, GripHorizontal, Columns2,
} from 'lucide-react'
import { useAppStore, type AppStore } from '@/app/store/useAppStore'
import { stepView, validViewMode } from '@/app/lib/editor/viewCamera'
import type { ViewMode } from '@/app/lib/editor/viewSlice'
import type { ResultType } from '@/app/types/resultsView'
import { isShell } from '@/app/lib/commands/tables'
import type { ToolId } from '@/app/store/useAppStore'

/**
 * Every toolbar command in one table: the ribbon and the hotkeys read from here, so a command is defined once.
 * `run` and the predicates take the store state; `hotkey` is `mod+key` style (`mod` = Ctrl, or Cmd on macOS).
 */
export interface RibbonCommand {
  id: string
  label: string
  icon: LucideIcon
  /** Longer text for the tooltip; defaults to `label`. */
  tip?: string
  hotkey?: string[]
  /** Present for on/off commands (drawn as toggles). */
  isActive?: (s: AppStore) => boolean
  enabled?: (s: AppStore) => boolean
  /** Hidden (not just disabled) when false, e.g. 3D-only result types in a 2D model. */
  visible?: (s: AppStore) => boolean
  run: (s: AppStore) => void
}

type ViewKey = keyof AppStore['viewSettings']
const viewToggle = (key: ViewKey, label: string, icon: LucideIcon, tip?: string): RibbonCommand => ({
  id: key, label, icon, tip,
  isActive: (s) => s.viewSettings[key],
  run: (s) => s.setViewSetting(key, !s.viewSettings[key]),
})

const modelUndoable = (s: AppStore) => s.activePanel === 'model'
const hasModel = (s: AppStore) => !!s.model.config
const ndmOf = (s: AppStore): 2 | 3 => (s.model.config?.ndm === 2 ? 2 : 3)
/** The view actually shown (a stale level or grid falls back to 3D). */
export const currentView = (s: AppStore): ViewMode => validViewMode(s.viewMode, s.levels, s.gridlines, ndmOf(s))
const step = (s: AppStore, delta: 1 | -1) => stepView(currentView(s), s.levels, s.gridlines, delta)

const hasRun = (s: AppStore) => s.resultsView.runId !== null
const resultType = (type: ResultType, label: string, icon: LucideIcon, tip: string, extra: Partial<RibbonCommand> = {}): RibbonCommand => ({
  id: `result.${type}`, label, icon, tip,
  isActive: (s) => hasRun(s) && s.resultsView.type === type,
  enabled: (s) => hasRun(s) && !s.model.building,
  run: (s) => s.setResultsView({ type }),
  ...extra,
})
const only3d = (s: AppStore) => ndmOf(s) === 3

/** Quick beams need a plan, a grid elevation or a 2D model; quick columns the same but a plan above the base. */
const quickOk = (s: AppStore, tool: 'quickBeam' | 'quickColumn') => {
  if (!hasModel(s) || s.gridlines.length === 0) return false
  const m = currentView(s)
  if (ndmOf(s) === 2) return true
  if (m.kind === 'plan') return tool === 'quickBeam' || m.level >= 0
  return m.kind === 'elevation' && m.gridId !== null
}
const tool = (id: ToolId, label: string, icon: LucideIcon, tip: string, enabled: (s: AppStore) => boolean = hasModel): RibbonCommand => ({
  id: `tool.${id}`, label, icon, tip, enabled, isActive: (s) => s.activeTool === id,
  run: (s) => s.setActiveTool(s.activeTool === id && id !== 'select' ? 'select' : id),
})

export const COMMANDS = {
  undo: { id: 'undo', label: 'Undo', icon: Undo2, hotkey: ['mod+z'], enabled: (s) => (modelUndoable(s) ? s.modelPast.length > 0 : s.analysisHistory.cursor > -1), run: (s) => (modelUndoable(s) ? s.modelUndo() : s.analysisUndo()) },
  redo: { id: 'redo', label: 'Redo', icon: Redo2, hotkey: ['mod+y', 'mod+shift+z'], enabled: (s) => (modelUndoable(s) ? s.modelFuture.length > 0 : s.analysisHistory.cursor < s.analysisHistory.commands.length - 1), run: (s) => (modelUndoable(s) ? s.modelRedo() : s.analysisRedo()) },
  selectAll: { id: 'selectAll', label: 'Select all', icon: SquareDashedMousePointer, tip: 'Select every node and element', hotkey: ['mod+a'], enabled: (s) => hasModel(s) && s.nodePickMode === 'none', run: (s) => s.selectAll() },
  deleteSelection: { id: 'deleteSelection', label: 'Delete', icon: Trash2, tip: 'Delete the selected nodes and elements', hotkey: ['delete'], enabled: (s) => s.activePanel === 'model' && s.activeTool === 'select' && s.nodePickMode === 'none' && s.selectedNodeIds.length + s.selectedElementIds.length > 0, run: (s) => s.deleteSelection() },
  clearSelection: { id: 'clearSelection', label: 'Clear', icon: SquareDashed, tip: 'Clear the selection', enabled: (s) => s.selectedNodeIds.length + s.selectedElementIds.length > 0, run: (s) => s.clearSceneSelection() },
  gridsLevels: { id: 'gridsLevels', label: 'Grids & levels', icon: Grid3x3, tip: 'Edit grid lines and story levels', run: (s) => s.setGridlinesDialogOpen(true) },
  units: { id: 'units', label: 'Units', icon: Ruler, tip: 'Model and display units', enabled: hasModel, run: (s) => s.setUnitsDialogOpen(true) },

  toolSelect: tool('select', 'Select', MousePointer2, 'Select objects (Esc)'),
  toolFrame: tool('frame', 'Frame', PenLine, 'Draw members point to point; right-click or Esc ends the chain, Shift locks to an axis'),
  toolBeam: tool('quickBeam', 'Beams', GripHorizontal, 'Quick beams: click a grid bay (plan or elevation)', (s) => quickOk(s, 'quickBeam')),
  toolColumn: tool('quickColumn', 'Columns', Columns2, 'Quick columns: click a grid intersection (plan) or a bay (elevation)', (s) => quickOk(s, 'quickColumn')),
  drawAllStories: { id: 'drawAllStories', label: 'All stories', icon: Layers3, tip: 'Draw on every story at once (plan views)', visible: only3d, isActive: (s) => s.drawAllStories, run: (s) => s.setDrawAllStories(!s.drawAllStories) },
  toolSupport: tool('support', 'Support', Anchor, 'Assign a support to the clicked node'),
  view3d: { id: 'view3d', label: '3D', icon: Box, tip: '3D view', isActive: (s) => currentView(s).kind === '3d', run: (s) => s.setViewMode({ kind: '3d' }) },
  viewPlan: {
    id: 'viewPlan', label: 'Plan', icon: LayoutGrid, tip: 'Story plan (top story first)', visible: only3d,
    isActive: (s) => currentView(s).kind === 'plan',
    run: (s) => { if (currentView(s).kind !== 'plan') s.setViewMode({ kind: 'plan', level: s.levels.length - 1 }) },
  },
  viewElevation: {
    id: 'viewElevation', label: 'Elevation', icon: Building2, tip: 'Elevation on a grid line',
    isActive: (s) => currentView(s).kind === 'elevation',
    run: (s) => { if (currentView(s).kind !== 'elevation') s.setViewMode({ kind: 'elevation', gridId: ndmOf(s) === 3 ? s.gridlines[0]?.id ?? null : null }) },
  },
  orthographic: { id: 'orthographic', label: 'Ortho', icon: Square, tip: 'Orthographic 3D view', isActive: (s) => s.orthographic, enabled: (s) => currentView(s).kind === '3d', run: (s) => s.setOrthographic(!s.orthographic) },
  viewNext: { id: 'viewNext', label: 'Up / next', icon: ChevronUp, tip: 'Story above, or the next grid', hotkey: ['pageup'], enabled: (s) => step(s, 1) !== null, run: (s) => { const m = step(s, 1); if (m) s.setViewMode(m) } },
  viewPrev: { id: 'viewPrev', label: 'Down / prev', icon: ChevronDown, tip: 'Story below, or the previous grid', hotkey: ['pagedown'], enabled: (s) => step(s, -1) !== null, run: (s) => { const m = step(s, -1); if (m) s.setViewMode(m) } },
  showStoryAbove: { ...viewToggle('showStoryAbove', 'Above', Ghost, 'Show the story above a plan as dashed outlines'), visible: only3d },

  zoomIn: { id: 'zoomIn', label: 'Zoom in', icon: ZoomIn, run: (s) => s.requestViewportAction('zoomIn') },
  zoomOut: { id: 'zoomOut', label: 'Zoom out', icon: ZoomOut, run: (s) => s.requestViewportAction('zoomOut') },
  fit: { id: 'fit', label: 'Fit', icon: Maximize2, tip: 'Zoom to fit the view', hotkey: ['f'], run: (s) => s.requestViewportAction('fit') },
  showExtruded: viewToggle('extruded', 'Extrude', Cuboid, 'Extruded view: members at their section shape, shells at their thickness'),
  showNodes: viewToggle('showNodes', 'Nodes', CircleDot),
  showElements: viewToggle('showElements', 'Elements', Minus),
  showSupports: viewToggle('showSupports', 'Supports', Anchor),
  showNodalLoads: viewToggle('showNodalLoads', 'Nodal', ArrowDown, 'Nodal loads'),
  showElementLoads: viewToggle('showElementLoads', 'Element', ArrowDownToLine, 'Element loads'),
  showLoadValues: viewToggle('showLoadValues', 'Values', Hash, 'Load values'),
  showNodeIds: viewToggle('showNodeIds', 'Node IDs', Tag),
  showElementIds: viewToggle('showElementIds', 'Element IDs', Tags),
  showGrid: viewToggle('showGrid', 'Ground', Grid2x2, 'Ground grid'),
  showGridlines: viewToggle('showGridlines', 'Grids', Rows3, 'Grid lines'),
  showLevels: viewToggle('showLevels', 'Levels', Layers, 'Story levels'),

  resultNone: resultType('none', 'None', CircleOff, 'Show no results'),
  resultDeformed: resultType('deformed', 'Deformed', Spline, 'Deformed shape'),
  resultAxial: resultType('axial', 'N', MoveHorizontal, 'Axial force'),
  resultShear: resultType('shear', 'V', Activity, 'Shear force (Vy in 3D)'),
  resultShearZ: resultType('shearZ', 'Vz', Activity, 'Shear force Vz', { visible: only3d }),
  resultMoment: resultType('moment', 'M', Sigma, 'Bending moment (Mz in 3D)'),
  resultMomentY: resultType('momentY', 'My', Sigma, 'Bending moment My', { visible: only3d }),
  resultTorsion: resultType('torsion', 'T', RotateCw, 'Torsion', { visible: only3d }),
  resultContour: resultType('contour', 'Contour', Palette, 'Shell stress resultants', { visible: (s) => only3d(s) && [...s.model.elements.values()].some((e) => isShell(e.eleType)) }),
  resultMode: resultType('mode', 'Modes', Waves, 'Mode shapes (modal case)'),
  resultReactions: { id: 'resultReactions', label: 'Reactions', icon: Anchor, tip: 'Support reactions at the current step', isActive: (s) => s.resultsView.showReactions, enabled: (s) => hasRun(s) && !s.model.building, run: (s) => s.setResultsView({ showReactions: !s.resultsView.showReactions }) },
  resultValues: { id: 'resultValues', label: 'Values', icon: Hash, tip: 'Value labels on results', isActive: (s) => s.resultsView.showValues, enabled: hasRun, run: (s) => s.setResultsView({ showValues: !s.resultsView.showValues }) },
  resultPanel: { id: 'resultPanel', label: 'Display', icon: BarChart3, tip: 'Display Results panel (case, scale, details)', isActive: (s) => s.resultsView.open, enabled: hasRun, run: (s) => s.setResultsView({ open: !s.resultsView.open }) },
  resultPlot: { id: 'resultPlot', label: 'Plot', icon: ChartLine, tip: 'Plot results', isActive: (s) => s.plotView.open, enabled: hasRun, run: (s) => s.setPlotView({ open: !s.plotView.open }) },
} satisfies Record<string, RibbonCommand>

export type CommandId = keyof typeof COMMANDS

/** A group is a row of commands, or a custom control (see `Ribbon.tsx`) for things a button can't express (pickers, playback). */
export interface RibbonGroupDef { label: string; commands?: CommandId[]; custom?: 'stories' | 'loadPatterns' | 'playback' | 'file' }
export interface RibbonTabDef { id: string; label: string; groups: RibbonGroupDef[] }

export const RIBBON_TABS: RibbonTabDef[] = [
  { id: 'file', label: 'File', groups: [{ label: 'Project', custom: 'file' }] },
  { id: 'model', label: 'Model', groups: [
    { label: 'Edit', commands: ['undo', 'redo'] },
    { label: 'Draw', commands: ['toolSelect', 'toolFrame', 'toolBeam', 'toolColumn', 'toolSupport', 'drawAllStories'] },
    { label: 'View', commands: ['view3d', 'viewPlan', 'viewElevation', 'showExtruded'], custom: 'stories' },
    { label: 'Select', commands: ['selectAll', 'clearSelection', 'deleteSelection'] },
    { label: 'Define', commands: ['gridsLevels', 'units'] },
  ] },
  { id: 'view', label: 'View', groups: [
    { label: 'View', commands: ['view3d', 'viewPlan', 'viewElevation', 'orthographic'] },
    { label: 'Stories', custom: 'stories' },
    { label: 'Zoom', commands: ['zoomIn', 'zoomOut', 'fit'] },
    { label: 'Show', commands: ['showExtruded', 'showNodes', 'showElements', 'showSupports'] },
    { label: 'Loads', commands: ['showNodalLoads', 'showElementLoads', 'showLoadValues'], custom: 'loadPatterns' },
    { label: 'Labels', commands: ['showNodeIds', 'showElementIds'] },
    { label: 'Reference', commands: ['showGrid', 'showGridlines', 'showLevels'] },
  ] },
  { id: 'results', label: 'Results', groups: [
    { label: 'Show', commands: ['resultNone', 'resultDeformed', 'resultAxial', 'resultShear', 'resultShearZ', 'resultMoment', 'resultMomentY', 'resultTorsion', 'resultContour', 'resultMode'] },
    { label: 'Step', custom: 'playback' },
    { label: 'Display', commands: ['resultReactions', 'resultValues', 'resultPanel', 'resultPlot'] },
    { label: 'View', commands: ['view3d', 'viewPlan', 'viewElevation'], custom: 'stories' },
  ] },
]

const state = () => useAppStore.getState()
export const runCommand = (id: CommandId) => { const s = state(); const c: RibbonCommand = COMMANDS[id]; if (c.enabled?.(s) ?? true) c.run(s) }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Display form of a hotkey, e.g. `Ctrl+Shift+Z` / `⌘⇧Z`. */
export function formatHotkey(hk: string): string {
  const parts = hk.split('+')
  const raw = parts.pop()!
  const key = raw.length === 1 ? raw.toUpperCase() : raw[0].toUpperCase() + raw.slice(1)
  if (isMac) return parts.map((p) => (p === 'mod' ? '⌘' : p === 'shift' ? '⇧' : p === 'alt' ? '⌥' : p)).join('') + key
  return [...parts.map((p) => (p === 'mod' ? 'Ctrl' : p[0].toUpperCase() + p.slice(1))), key].join('+')
}
export const parseHotkey = (hk: string) => {
  const parts = hk.split('+')
  return { key: parts[parts.length - 1], mod: parts.includes('mod'), shift: parts.includes('shift'), alt: parts.includes('alt'), isMac }
}
