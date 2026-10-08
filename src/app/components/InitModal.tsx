import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/app/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Button } from '@/app/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { ArrowLeft } from 'lucide-react'
import { useAppStore } from '@/app/store/useAppStore'
import {
  momentCurvatureTemplate,
  cantileverTemplate,
  frameTemplate,
  frame3dTemplate,
  type CantileverParams,
  type FrameParams,
} from '@/app/lib/templates'

type Choice = 'new' | 'load' | 'momentCurvature' | 'cantilever' | 'frame' | 'frame3d'

interface CardProps {
  title: string
  description: string
  onClick?: () => void
  disabled?: boolean
}

function Card({ title, description, onClick, disabled }: CardProps) {
  return (
    <button
      className={[
        'group border rounded-sm p-2 text-left w-full transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent hover:text-accent-foreground cursor-pointer',
      ].join(' ')}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <div className="bg-muted rounded-sm aspect-video w-full mb-2" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground leading-snug group-hover:text-accent-foreground">{description}</p>
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

  const [step, setStep] = useState<1 | 2>(1)
  const [choice, setChoice] = useState<Choice | null>(null)

  // New model
  const [ndm, setNdm] = useState<2 | 3>(3)
  const [ndf, setNdf] = useState(6)

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

  function select(c: Choice) {
    setChoice(c)
    setStep(2)
  }

  function handleCreate() {
    if (choice === 'new') {
      initModel(ndm, ndf)
    } else if (choice === 'momentCurvature') {
      const t = momentCurvatureTemplate()
      initModel(t.ndm, t.ndf, { writes: t.writes, analysisCommands: t.analysisCommands })
    } else if (choice === 'cantilever') {
      const t = cantileverTemplate({ n: cantN, h: cantH, eleType: cantEle })
      initModel(t.ndm, t.ndf, { writes: t.writes, analysisCommands: t.analysisCommands })
    } else if (choice === 'frame') {
      const t = frameTemplate({ stories, storyH, bays, bayW, eleType: frameEle, base: frameBase })
      initModel(t.ndm, t.ndf, { writes: t.writes, analysisCommands: t.analysisCommands, gridlines: t.gridlines, levels: t.levels })
    } else if (choice === 'frame3d') {
      const t = frame3dTemplate({ stories: stories3, storyH: storyH3, baysX, bayX, baysY, bayY })
      initModel(t.ndm, t.ndf, { writes: t.writes, analysisCommands: t.analysisCommands, levels: t.levels })
    }
  }

  const step2Title: Record<Exclude<Choice, 'load'>, string> = {
    new: 'New Model',
    momentCurvature: 'Moment-Curvature',
    cantilever: 'Cantilever Column',
    frame: '2D Frame',
    frame3d: '3D Frame',
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
              <Card title="New" description="Start from scratch with custom ndm/ndf." onClick={() => select('new')} />
              <Card title="Load" description="Open a previously saved project." disabled />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Templates</p>
            <div className="grid grid-cols-3 gap-2">
              <Card
                title="Moment-Curvature"
                description="Two-node zerolength with fiber section (300×500mm, 4 Ø20 bars)."
                onClick={() => select('momentCurvature')}
              />
              <Card
                title="Cantilever Column"
                description="Single column of n elements in y, fixed base."
                onClick={() => select('cantilever')}
              />
              <Card
                title="2D Frame"
                description="Story-bay grid with columns and beams."
                onClick={() => select('frame')}
              />
              <Card
                title="3D Frame"
                description="Story-bay grid in X and Y (Z up), elastic members, fixed base."
                onClick={() => select('frame3d')}
              />
            </div>
          </>
        )}

        {step === 2 && choice && choice !== 'load' && (
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

            <div className="flex justify-end">
              <Button onClick={handleCreate}>Create Model</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
