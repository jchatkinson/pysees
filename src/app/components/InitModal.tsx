import { useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Button } from '@/app/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { ArrowLeft, FilePlus, FolderOpen, House } from 'lucide-react'
import { useAppStore } from '@/app/store/useAppStore'
import { UNIT_PRESETS, type BaseUnits, type UnitPrefs } from '@/app/lib/units/units'
import { canImport, readScriptFile } from '@/app/lib/project/open'
import { ImportPreviewBody, type ImportPreview } from '@/app/components/ImportScriptDialog'
import {
  momentCurvatureTemplate,
  cantileverTemplate,
  frameTemplate,
  frame3dTemplate,
  plateTemplate,
  precastWallTemplate,
  PRECAST_WALL_DEFAULTS,
  type CantileverParams,
  type FrameParams,
} from '@/app/lib/templates'

/** Templates are written in N, m, s; they show stress in MPa and force in kN. */
const TEMPLATE_UNITS: { units: BaseUnits; unitPrefs: UnitPrefs } = { units: { length: 'm', force: 'N', time: 's' }, unitPrefs: { stress: 'MPa', force: 'kN' } }
import momentCurvatureImg from '@/app/assets/templates/momentCurvature.png'
import cantileverImg from '@/app/assets/templates/cantilever.png'
import frame2dImg from '@/app/assets/templates/frame2d.png'
import frame3dImg from '@/app/assets/templates/frame3d.png'
import plateImg from '@/app/assets/templates/plate.png'
import precastWallImg from '@/app/assets/templates/precastWall.png'
import { StudBuildingForm } from '@/app/components/StudBuildingForm'
import { studBuildingModel } from '@/app/lib/studWalls'
import { loadCarapaceWasm } from '@/app/lib/carapace/wasm'
import type { StudBuildingParams } from '@/app/types/model'

const NO_UNITS = 'none'

type Choice = 'new' | 'load' | 'momentCurvature' | 'cantilever' | 'frame' | 'frame3d' | 'plate' | 'precastWall' | 'studBuilding'

interface CardProps {
  title: string
  description: string
  image?: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
}

function Card({ title, description, image, icon, onClick, disabled }: CardProps) {
  return (
    <button
      className={[
        'group border rounded-sm p-2 text-left w-full h-full flex transition-colors',
        icon ? 'flex-row items-center gap-3' : 'flex-col justify-start',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent hover:text-accent-foreground cursor-pointer',
      ].join(' ')}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {icon && <span className="shrink-0 text-muted-foreground group-hover:text-accent-foreground [&>svg]:size-10 [&>svg]:stroke-[1.25]">{icon}</span>}
      {image && <img src={image} alt="" className="bg-muted rounded-sm aspect-video w-full mb-2 object-cover" />}
      <span className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground leading-snug group-hover:text-accent-foreground">{description}</p>
      </span>
    </button>
  )
}

/** Mounted only while there's no model, so every "New Model" starts again at the first step with fresh template fields. */
export function InitModal() {
  const hasModel = useAppStore((s) => Boolean(s.model.config))
  return hasModel ? null : <InitDialog />
}

function InitDialog() {
  const initModel = useAppStore((s) => s.initModel)
  const loadProject = useAppStore((s) => s.loadProject)
  const fileInput = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const pickFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 5_000_000) return window.alert(`${file.name} is too large to open (limit 5 MB).`)
    setPreview({ fileName: file.name, result: readScriptFile(await file.text(), file.name) })
    select('load')
  }

  const [step, setStep] = useState<1 | 2>(1)
  const [choice, setChoice] = useState<Choice | null>(null)

  // New model
  const [ndm, setNdm] = useState<2 | 3>(3)
  const [ndf, setNdf] = useState(6)
  const [unitPreset, setUnitPreset] = useState<string>('kip-in-s')

  // Cantilever
  const [cantN, setCantN] = useState(10)
  const [cantH, setCantH] = useState(5.0)
  const [cantEle, setCantEle] = useState<CantileverParams['eleType']>('elasticBeamColumn')

  // 2D Frame
  const [stories, setStories] = useState(3)
  const [storyH, setStoryH] = useState(3.0)
  const [bays, setBays] = useState(2)
  const [bayW, setBayW] = useState(5.0)
  const [frameEle, setFrameEle] = useState<FrameParams['eleType']>('elasticBeamColumn')
  const [frameBase, setFrameBase] = useState<FrameParams['base']>('fixed')

  // 3D Frame
  const [stories3, setStories3] = useState(3)
  const [storyH3, setStoryH3] = useState(3.0)
  const [baysX, setBaysX] = useState(2)
  const [bayX, setBayX] = useState(5.0)
  const [baysY, setBaysY] = useState(2)
  const [bayY, setBayY] = useState(5.0)

  // Plate
  const [plateNx, setPlateNx] = useState(8)
  const [plateNy, setPlateNy] = useState(4)
  const [plateLx, setPlateLx] = useState(4.0)
  const [plateLy, setPlateLy] = useState(2.0)
  const [plateH, setPlateH] = useState(0.2)

  // Precast wall (the form shows kN and kN/mm; the template takes N and N/m)
  const [wallPanels, setWallPanels] = useState(PRECAST_WALL_DEFAULTS.panels)
  const [wallWidth, setWallWidth] = useState(PRECAST_WALL_DEFAULTS.panelWidth)
  const [wallHeight, setWallHeight] = useState(PRECAST_WALL_DEFAULTS.panelHeight)
  const [wallThickness, setWallThickness] = useState(PRECAST_WALL_DEFAULTS.thickness)
  const [wallStories, setWallStories] = useState(PRECAST_WALL_DEFAULTS.storyHeights.map((h) => Number(h.toFixed(3))).join(', '))
  const [wallConnectors, setWallConnectors] = useState(PRECAST_WALL_DEFAULTS.connectorsPerJoint)
  const [wallKv, setWallKv] = useState(PRECAST_WALL_DEFAULTS.Kv / 1e6) // kN/mm
  const [wallFy, setWallFy] = useState(PRECAST_WALL_DEFAULTS.Fy / 1e3) // kN
  const [wallB, setWallB] = useState(PRECAST_WALL_DEFAULTS.b)
  const [wallFriction, setWallFriction] = useState(PRECAST_WALL_DEFAULTS.friction)
  const [wallMu, setWallMu] = useState(PRECAST_WALL_DEFAULTS.mu)
  // Reinforcement (percent of the gross area) and the base dowels (kN, kN/mm): the two bars at an end of the assembly, and at an interior edge.
  const [wallWebRho, setWallWebRho] = useState(PRECAST_WALL_DEFAULTS.wallRho * 100)
  const [wallBoundaryRho, setWallBoundaryRho] = useState(PRECAST_WALL_DEFAULTS.boundaryRho * 100)
  const [wallSpliceRho, setWallSpliceRho] = useState(PRECAST_WALL_DEFAULTS.spliceRho * 100)
  const [wallBoundaryRatio, setWallBoundaryRatio] = useState(PRECAST_WALL_DEFAULTS.boundaryRatio * 100)
  const [dowelEnd, setDowelEnd] = useState({ Fy: PRECAST_WALL_DEFAULTS.dowelEnd.Fy / 1e3, K: PRECAST_WALL_DEFAULTS.dowelEnd.K / 1e6, b: PRECAST_WALL_DEFAULTS.dowelEnd.b })
  const [dowelJoint, setDowelJoint] = useState({ Fy: PRECAST_WALL_DEFAULTS.dowelJoint.Fy / 1e3, K: PRECAST_WALL_DEFAULTS.dowelJoint.K / 1e6, b: PRECAST_WALL_DEFAULTS.dowelJoint.b })

  const [studBusy, setStudBusy] = useState(false)
  const [studError, setStudError] = useState('')
  async function createStudBuilding(params: StudBuildingParams) {
    setStudBusy(true); setStudError('')
    try {
      const wasm = await loadCarapaceWasm()
      const t = studBuildingModel((spec, up) => wasm.expandBuilding(spec as never, up), params)
      initModel(3, 6, { units: { length: 'mm', force: 'N', time: 's' }, unitPrefs: { force: 'kN', stress: 'MPa' }, writes: t.writes, analysisCommands: t.analysisCommands, levels: t.levels, gridlines: t.gridlines })
    } catch (e) { setStudError(e instanceof Error ? e.message : typeof e === 'object' && e && 'reason' in e ? String((e as { reason: unknown }).reason) : String(e)) } finally { setStudBusy(false) }
  }

  function select(c: Choice) {
    setChoice(c)
    setStep(2)
  }

  function handleCreate() {
    if (choice === 'new') {
      initModel(ndm, ndf, { units: UNIT_PRESETS.find((p) => p.id === unitPreset)?.units })
    } else if (choice === 'momentCurvature') {
      const t = momentCurvatureTemplate()
      initModel(t.ndm, t.ndf, { ...TEMPLATE_UNITS, writes: t.writes, analysisCommands: t.analysisCommands })
    } else if (choice === 'cantilever') {
      const t = cantileverTemplate({ n: cantN, h: cantH, eleType: cantEle })
      initModel(t.ndm, t.ndf, { ...TEMPLATE_UNITS, writes: t.writes, analysisCommands: t.analysisCommands })
    } else if (choice === 'frame') {
      const t = frameTemplate({ stories, storyH, bays, bayW, eleType: frameEle, base: frameBase })
      initModel(t.ndm, t.ndf, { ...TEMPLATE_UNITS, writes: t.writes, analysisCommands: t.analysisCommands, gridlines: t.gridlines, levels: t.levels })
    } else if (choice === 'frame3d') {
      const t = frame3dTemplate({ stories: stories3, storyH: storyH3, baysX, bayX, baysY, bayY })
      initModel(t.ndm, t.ndf, { ...TEMPLATE_UNITS, writes: t.writes, analysisCommands: t.analysisCommands, levels: t.levels })
    } else if (choice === 'plate') {
      const t = plateTemplate({ nx: plateNx, ny: plateNy, lx: plateLx, ly: plateLy, h: plateH })
      initModel(t.ndm, t.ndf, { ...TEMPLATE_UNITS, writes: t.writes, analysisCommands: t.analysisCommands })
    } else if (choice === 'precastWall') {
      const storyHeights = wallStories.split(/[\s,;]+/).map(Number).filter((h) => Number.isFinite(h) && h > 0)
      const t = precastWallTemplate({
        panels: wallPanels, panelWidth: wallWidth, panelHeight: wallHeight, thickness: wallThickness, ...(storyHeights.length ? { storyHeights } : {}),
        connectorsPerJoint: wallConnectors, Kv: wallKv * 1e6, Fy: wallFy * 1e3, b: wallB, friction: wallFriction, mu: wallMu,
        wallRho: wallWebRho / 100, boundaryRho: wallBoundaryRho / 100, spliceRho: wallSpliceRho / 100, boundaryRatio: wallBoundaryRatio / 100,
        dowelEnd: { Fy: dowelEnd.Fy * 1e3, K: dowelEnd.K * 1e6, b: dowelEnd.b }, dowelJoint: { Fy: dowelJoint.Fy * 1e3, K: dowelJoint.K * 1e6, b: dowelJoint.b },
      })
      initModel(t.ndm, t.ndf, { ...TEMPLATE_UNITS, writes: t.writes, analysisCommands: t.analysisCommands, levels: t.levels })
    }
  }

  function handleLoad() {
    const r = preview?.result
    if (!r) return
    if (r.project) loadProject(r.project, preview.fileName)
    else initModel(r.ndm, r.ndf, { writes: r.writes })
  }

  const step2Title: Record<Choice, string> = {
    load: 'Open Project',
    new: 'New Model',
    momentCurvature: 'Moment-Curvature',
    cantilever: 'Cantilever Column',
    frame: '2D Frame',
    frame3d: '3D Frame',
    plate: 'Plate',
    precastWall: 'Precast Wall',
    studBuilding: 'Stud-wall building',
  }

  return (
    <Dialog
      open
      onOpenChange={(_open, eventDetails) => {
        if (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out') eventDetails.cancel()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>PySees</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              <Card title="New" description="Start from scratch with custom ndm/ndf." icon={<FilePlus />} onClick={() => select('new')} />
              <Card title="Load" description="Open a saved project (.py)." icon={<FolderOpen />} onClick={() => fileInput.current?.click()} />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Templates</p>
            <div className="grid grid-cols-3 gap-2">
              <Card
                title="Moment-Curvature"
                description="Two-node zerolength with fiber section (300×500mm, 4 Ø20 bars)."
                image={momentCurvatureImg}
                onClick={() => select('momentCurvature')}
              />
              <Card
                title="Cantilever Column"
                description="Single column of n elements in y, fixed base."
                image={cantileverImg}
                onClick={() => select('cantilever')}
              />
              <Card
                title="2D Frame"
                description="Story-bay grid with columns and beams."
                image={frame2dImg}
                onClick={() => select('frame')}
              />
              <Card
                title="3D Frame"
                description="Story-bay grid in X and Y (Z up), elastic members, fixed base."
                image={frame3dImg}
                onClick={() => select('frame3d')}
              />
              <Card
                title="Plate"
                description="Cantilever slab of shell elements (Z up) under self-weight and pressure."
                image={plateImg}
                onClick={() => select('plate')}
              />
              <Card
                title="Precast Wall"
                description="Panels joined by vertical connectors, on a bearing, dowel and friction base."
                image={precastWallImg}
                onClick={() => select('precastWall')}
              />
              <Card title="Stud-wall building" description="Multistorey light-frame box with floors, openings, anchorage and lateral loads." icon={<House />} onClick={() => select('studBuilding')} />
            </div>
          </>
        )}

        {step === 2 && choice && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={() => setStep(1)}>
                        <ArrowLeft />
                      </Button>
                    }
                  />
                  <TooltipContent>Back</TooltipContent>
                </Tooltip>
                <DialogTitle>{step2Title[choice]}</DialogTitle>
              </div>
            </DialogHeader>

            {choice === 'load' && preview && (
              <div className="grid gap-3 py-2">
                <p className="text-sm font-medium">{preview.fileName}</p>
                <ImportPreviewBody preview={preview} replacing={false} />
              </div>
            )}

            {choice === 'new' && (
              <div className="grid gap-4 py-2">
                <div className="grid gap-1.5">
                  <Label>Dimensions (ndm)</Label>
                  <Select
                    value={String(ndm)}
                    onValueChange={(v) => { const n = Number(v) as 2 | 3; setNdm(n); setNdf(n === 2 ? 3 : 6) }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2D</SelectItem>
                      <SelectItem value="3">3D</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Units (fixed for the model)</Label>
                  <Select value={unitPreset} onValueChange={(v) => setUnitPreset(v ?? NO_UNITS)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_PRESETS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                      <SelectItem value={NO_UNITS}>None (plain numbers)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Analysis is unitless: every value you enter must be in this one consistent system. Display units can be changed later (Edit › Units).</p>
                </div>
                <div className="grid gap-1.5">
                  <Label>DOFs per node (ndf)</Label>
                  <Input
                    type="number"
                    value={ndf}
                    min={1}
                    max={6}
                    onChange={(e) => setNdf(Math.max(1, Math.min(6, Number(e.target.value))))}
                  />
                </div>
              </div>
            )}

            {choice === 'momentCurvature' && (
              <div className="py-2 text-sm text-muted-foreground space-y-1">
                <p>Creates a 2D model (ndm=2, ndf=3) with:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>2 nodes at the origin (zerolength element)</li>
                  <li>Fixed end at node 1</li>
                  <li>Steel01 — Fy=400 MPa, E=200 GPa, b=0.01</li>
                  <li>Concrete01 — fpc=−30 MPa, epsu=0.006</li>
                  <li>Fiber section: 300×500 mm, 4×Ø20 mm corner bars (40 mm cover)</li>
                </ul>
              </div>
            )}

            {choice === 'cantilever' && (
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Elements (n)</Label>
                    <Input type="number" value={cantN} min={1} onChange={(e) => setCantN(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Height (m)</Label>
                    <Input type="number" value={cantH} min={0.1} step={0.5} onChange={(e) => setCantH(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Element type</Label>
                  <Select value={cantEle} onValueChange={(v) => setCantEle(v as CantileverParams['eleType'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="elasticBeamColumn">elasticBeamColumn</SelectItem>
                      <SelectItem value="dispBeamColumn">dispBeamColumn (RC fiber)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {choice === 'frame' && (
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Stories</Label>
                    <Input type="number" value={stories} min={1} onChange={(e) => setStories(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Story height (m)</Label>
                    <Input type="number" value={storyH} min={0.1} step={0.5} onChange={(e) => setStoryH(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bays</Label>
                    <Input type="number" value={bays} min={1} onChange={(e) => setBays(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bay width (m)</Label>
                    <Input type="number" value={bayW} min={0.1} step={0.5} onChange={(e) => setBayW(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Element type</Label>
                    <Select value={frameEle} onValueChange={(v) => setFrameEle(v as FrameParams['eleType'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elasticBeamColumn">elasticBeamColumn</SelectItem>
                        <SelectItem value="dispBeamColumn">dispBeamColumn (RC fiber)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Base condition</Label>
                    <Select value={frameBase} onValueChange={(v) => setFrameBase(v as FrameParams['base'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="pinned">Pinned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {choice === 'frame3d' && (
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Stories</Label>
                    <Input type="number" value={stories3} min={1} onChange={(e) => setStories3(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Story height (m)</Label>
                    <Input type="number" value={storyH3} min={0.1} step={0.5} onChange={(e) => setStoryH3(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bays in X</Label>
                    <Input type="number" value={baysX} min={1} onChange={(e) => setBaysX(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bay width in X (m)</Label>
                    <Input type="number" value={bayX} min={0.1} step={0.5} onChange={(e) => setBayX(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bays in Y</Label>
                    <Input type="number" value={baysY} min={1} onChange={(e) => setBaysY(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Bay width in Y (m)</Label>
                    <Input type="number" value={bayY} min={0.1} step={0.5} onChange={(e) => setBayY(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">3D model (ndm=3, ndf=6), Z up.</p>
              </div>
            )}

            {choice === 'plate' && (
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Elements in X</Label>
                    <Input type="number" value={plateNx} min={1} onChange={(e) => setPlateNx(Math.max(1, Math.trunc(Number(e.target.value))))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Elements in Y</Label>
                    <Input type="number" value={plateNy} min={1} onChange={(e) => setPlateNy(Math.max(1, Math.trunc(Number(e.target.value))))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Length in X (m)</Label>
                    <Input type="number" value={plateLx} min={0.1} step={0.5} onChange={(e) => setPlateLx(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Width in Y (m)</Label>
                    <Input type="number" value={plateLy} min={0.1} step={0.5} onChange={(e) => setPlateLy(Math.max(0.1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Thickness (m)</Label>
                    <Input type="number" value={plateH} min={0.01} step={0.05} onChange={(e) => setPlateH(Math.max(0.01, Number(e.target.value)))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">3D model (ndm=3, ndf=6), Z up, clamped along x = 0. Four-node MITC4 shells.</p>
              </div>
            )}

            {choice === 'precastWall' && (
              <div className="grid gap-4 py-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Panels</Label>
                    <Input type="number" value={wallPanels} min={1} onChange={(e) => setWallPanels(Math.max(1, Math.trunc(Number(e.target.value))))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Panel width (m)</Label>
                    <Input type="number" value={wallWidth} min={0.5} step={0.1} onChange={(e) => setWallWidth(Math.max(0.5, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Panel height (m)</Label>
                    <Input type="number" value={wallHeight} min={2} step={0.5} onChange={(e) => setWallHeight(Math.max(2, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Thickness (m)</Label>
                    <Input type="number" value={wallThickness} min={0.05} step={0.01} onChange={(e) => setWallThickness(Math.max(0.05, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5 col-span-2">
                    <Label>Story heights (m), bottom up</Label>
                    <Input value={wallStories} onChange={(e) => setWallStories(e.target.value)} placeholder="4.27, 3.66, 3.66" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Connectors per joint</Label>
                    <Input type="number" value={wallConnectors} min={1} onChange={(e) => setWallConnectors(Math.max(1, Math.trunc(Number(e.target.value))))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Connector Kv (kN/mm)</Label>
                    <Input type="number" value={wallKv} min={0.001} step={10} onChange={(e) => setWallKv(Math.max(0.001, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Connector Fy (kN)</Label>
                    <Input type="number" value={wallFy} min={1} step={10} onChange={(e) => setWallFy(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Post-yield ratio</Label>
                    <Input type="number" value={wallB} min={0} max={1} step={0.001} onChange={(e) => setWallB(Math.min(1, Math.max(0, Number(e.target.value))))} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium">Reinforcement (% of gross area)</Label>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Web</Label>
                      <Input type="number" value={wallWebRho} min={0} max={20} step={0.05} onChange={(e) => setWallWebRho(Math.min(20, Math.max(0, Number(e.target.value))))} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Boundary</Label>
                      <Input type="number" value={wallBoundaryRho} min={0} max={20} step={0.1} onChange={(e) => setWallBoundaryRho(Math.min(20, Math.max(0, Number(e.target.value))))} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Splice extra</Label>
                      <Input type="number" value={wallSpliceRho} min={0} max={20} step={0.05} onChange={(e) => setWallSpliceRho(Math.min(20, Math.max(0, Number(e.target.value))))} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Boundary length (%)</Label>
                      <Input type="number" value={wallBoundaryRatio} min={1} max={50} step={1} onChange={(e) => setWallBoundaryRatio(Math.min(50, Math.max(1, Number(e.target.value))))} />
                    </div>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium">Base dowels, 1 ft from each panel edge</Label>
                  {([['End of the assembly', dowelEnd, setDowelEnd], ['Interior edge', dowelJoint, setDowelJoint]] as const).map(([name, dowel, set]) => (
                    <div key={name} className="grid grid-cols-4 gap-3 items-end">
                      <span className="text-xs text-muted-foreground pb-2">{name}</span>
                      <div className="grid gap-1.5">
                        <Label>Yield (kN)</Label>
                        <Input type="number" value={dowel.Fy} min={0.1} step={10} onChange={(e) => set({ ...dowel, Fy: Math.max(0.1, Number(e.target.value)) })} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Stiffness (kN/mm)</Label>
                        <Input type="number" value={dowel.K} min={0.1} step={10} onChange={(e) => set({ ...dowel, K: Math.max(0.1, Number(e.target.value)) })} />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Hardening</Label>
                        <Input type="number" value={dowel.b} min={0} max={1} step={0.005} onChange={(e) => set({ ...dowel, b: Math.min(1, Math.max(0, Number(e.target.value))) })} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <label className="flex items-center gap-2 text-sm col-span-2">
                    <input type="checkbox" checked={wallFriction} onChange={(e) => setWallFriction(e.target.checked)} />
                    Base shear by friction on the bearings
                  </label>
                  <div className="grid gap-1.5">
                    <Label>Friction coefficient</Label>
                    <Input type="number" value={wallMu} min={0} step={0.05} disabled={!wallFriction} onChange={(e) => setWallMu(Math.max(0, Number(e.target.value)))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  2D model (ndm=2, ndf=3), the paper's four-panel benchmark. Panels are fiber beam columns, joined by Steel02 shear connectors and standing on compression-only bearings, Steel02 dowels and a stabilizing shear spring. Other values (concrete and steel strengths, bearings, gravity, lateral pattern) take the paper's values and are editable in the model.
                  Friction runs in Carapace only; an exported script carries it as a warning, so turn it off for a model that runs the same in OpenSees.
                </p>
              </div>
            )}

            {choice === 'studBuilding' && <>{studError && <p className="text-xs text-destructive">{studError}</p>}<StudBuildingForm busy={studBusy} onCreate={(params) => void createStudBuilding(params)} /></>}

            {choice !== 'studBuilding' && <div className="flex justify-end">
              {choice === 'load'
                ? <Button disabled={!preview || !canImport(preview.result)} onClick={handleLoad}>Open</Button>
                : <Button onClick={handleCreate}>Create Model</Button>}
            </div>}
          </>
        )}
      </DialogContent>
      <input ref={fileInput} type="file" accept=".py,.tcl,.txt" className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = '' }} />
    </Dialog>
  )
}
